import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../../lib/supabase/admin";
import { chunkText, embedText } from "../../lib/gemini/client";
import { assertLocalSupabase } from "./local-db-guard";
import { EVAL_KNOWLEDGE_BASE } from "../fixtures/knowledge-base";

// Every seeded row's title starts with this, so seed/teardown can find "our" rows without
// keeping any in-memory state — needed because Vitest's globalSetup teardown runs in a
// separate process from the eval files that seed the data (see helpers/global-setup.ts).
const FIXTURE_TITLE_PREFIX = "[EVAL FIXTURE]";

async function resolveOwnerId(supabase: SupabaseClient): Promise<string> {
  const ownerEmail = process.env.OWNER_EMAIL!;
  const { data } = await supabase.auth.admin.listUsers();
  const owner = data?.users?.find(
    (u) => u.email?.toLowerCase() === ownerEmail.toLowerCase()
  );
  if (!owner) {
    throw new Error(
      `evals/: no auth user found for OWNER_EMAIL (${ownerEmail}) on this Supabase project. ` +
        `content_blocks.owner_id has a NOT NULL foreign key to auth.users, so fixture content ` +
        `needs an existing user to attach to — sign up that account on the target project first.`
    );
  }
  return owner.id;
}

async function fetchFixtureBlocks(supabase: SupabaseClient, ownerId: string) {
  const { data, error } = await supabase
    .from("content_blocks")
    .select("id, title")
    .eq("owner_id", ownerId)
    .like("title", `${FIXTURE_TITLE_PREFIX}%`);

  if (error) {
    throw new Error(`evals/: failed to look up existing fixture blocks: ${error.message}`);
  }
  return data ?? [];
}

/**
 * Seeds the fixture knowledge base (idempotent — safe to call from multiple eval files;
 * reuses existing fixture rows from a prior run instead of duplicating them). Returns a map
 * from fixture `key` (see fixtures/knowledge-base.ts) to the real `content_block_id` each
 * one was inserted under, since golden questions reference fixtures by key, not by an ID
 * that only exists after seeding.
 */
export async function seedKnowledgeBase(): Promise<Map<string, string>> {
  assertLocalSupabase();
  const supabase = createAdminClient();
  const ownerId = await resolveOwnerId(supabase);

  const existing = await fetchFixtureBlocks(supabase, ownerId);
  if (existing.length === EVAL_KNOWLEDGE_BASE.length) {
    return new Map(
      existing.map((b) => [b.title.slice(FIXTURE_TITLE_PREFIX.length + 1), b.id])
    );
  }
  if (existing.length > 0) {
    // Partial leftovers from an interrupted prior run — reseed from scratch rather than
    // trying to reconcile which fixtures are missing.
    await supabase.from("content_blocks").delete().in("id", existing.map((b) => b.id));
  }

  const keyToBlockId = new Map<string, string>();

  for (const fixture of EVAL_KNOWLEDGE_BASE) {
    const { data: block, error } = await supabase
      .from("content_blocks")
      .insert({
        owner_id: ownerId,
        type: fixture.type,
        title: `${FIXTURE_TITLE_PREFIX} ${fixture.key}`,
        body_text: fixture.bodyText,
        is_important: fixture.isImportant ?? false,
      })
      .select()
      .single();

    if (error || !block) {
      throw new Error(
        `evals/: failed to insert fixture content_block "${fixture.key}": ${error?.message}`
      );
    }
    keyToBlockId.set(fixture.key, block.id);

    const chunks = chunkText(fixture.bodyText);
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const embedding = await embedText(chunks[chunkIndex]);
      const { error: embedError } = await supabase.from("content_embeddings").insert({
        content_block_id: block.id,
        chunk_index: chunkIndex,
        chunk_text: chunks[chunkIndex],
        embedding,
      });
      if (embedError) {
        throw new Error(
          `evals/: failed to embed chunk ${chunkIndex} of "${fixture.key}": ${embedError.message}`
        );
      }
    }
  }

  return keyToBlockId;
}

/** Deletes every fixture row (content_embeddings cascade-delete with their content_blocks). */
export async function teardownKnowledgeBase(): Promise<void> {
  assertLocalSupabase();
  const supabase = createAdminClient();
  const ownerId = await resolveOwnerId(supabase);
  const existing = await fetchFixtureBlocks(supabase, ownerId);
  if (existing.length === 0) return;

  const { error } = await supabase
    .from("content_blocks")
    .delete()
    .in("id", existing.map((b) => b.id));

  if (error) {
    throw new Error(`evals/: failed to delete fixture content_blocks: ${error.message}`);
  }
}
