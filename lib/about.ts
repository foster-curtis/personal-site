/**
 * About Page Helpers
 *
 * Functions for generating the AI-powered About page content.
 * Includes caching to avoid regenerating on every page view.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { generateJSON } from "@/lib/llm";
import { ContentBlock, AboutCache } from "@/lib/db/types";

export interface AboutSummary {
  /** Main summary paragraph (2-4 sentences) */
  summary: string;
  /** Professional headline/tagline */
  headline: string;
  /** Key highlights/achievements (3-5 bullet points) */
  highlights: string[];
  /** Core skills and areas of expertise */
  skills: string[];
  /** Areas of interest or passion */
  interests: string[];
  /** ISO timestamp of when this was generated */
  generatedAt: string;
  /** Whether this was served from cache */
  fromCache?: boolean;
}

/**
 * Fetch content blocks for the site owner (resume and story types)
 */
export async function fetchOwnerContentBlocks(): Promise<ContentBlock[]> {
  const supabase = createAdminClient();
  const ownerEmail = process.env.OWNER_EMAIL;

  if (!ownerEmail) {
    throw new Error("OWNER_EMAIL environment variable is not set");
  }

  // Find the owner by email
  const { data: users, error: userError } = await supabase
    .from("auth.users")
    .select("id")
    .eq("email", ownerEmail)
    .single();

  // If we can't find user in auth.users directly, try getting from content_blocks
  // by looking up via the owner's email pattern
  let ownerId: string | null = null;

  if (userError || !users) {
    // Alternative: Get owner_id from existing content_blocks
    // This works because we know the owner has content
    const { data: ownerBlocks } = await supabase
      .from("content_blocks")
      .select("owner_id")
      .limit(1);

    if (ownerBlocks && ownerBlocks.length > 0) {
      ownerId = ownerBlocks[0].owner_id;
    }
  } else {
    ownerId = users.id;
  }

  if (!ownerId) {
    throw new Error("Could not determine owner ID");
  }

  // Fetch resume and story content blocks
  const { data: blocks, error: blocksError } = await supabase
    .from("content_blocks")
    .select("*")
    .eq("owner_id", ownerId)
    .in("type", ["resume", "story"])
    .order("created_at", { ascending: false });

  if (blocksError) {
    console.error("Error fetching content blocks:", blocksError);
    throw new Error("Failed to fetch content blocks");
  }

  return blocks || [];
}

/**
 * Build the prompt for generating the About summary
 */
function buildAboutPrompt(blocks: ContentBlock[], ownerName: string): string {
  // Format the content blocks into context
  const context = blocks
    .map(
      (block) => `## ${block.title}\nType: ${block.type}\n\n${block.body_text}`
    )
    .join("\n\n---\n\n");

  return `Based on the following resume and story content about ${ownerName}, generate a professional About page summary.

The summary should:
- Be written in third person
- Sound professional but approachable
- Highlight key experiences and skills
- Be suitable for a personal portfolio website

Content about ${ownerName}:

${context}

Generate a JSON response with the following structure:
{
  "summary": "A 2-4 sentence professional summary paragraph",
  "headline": "A short professional headline/tagline (e.g., 'Full-Stack Engineer | Cloud Architecture | Team Leadership')",
  "highlights": ["3-5 key achievements or experiences as bullet points"],
  "skills": ["List of 5-8 core technical and professional skills"],
  "interests": ["2-4 areas of interest or passion related to their work"]
}`;
}

/**
 * Generate the About summary using the LLM
 */
export async function generateAboutSummary(
  ownerName: string = "Foster Curtis"
): Promise<AboutSummary> {
  // Fetch content blocks
  const blocks = await fetchOwnerContentBlocks();

  if (blocks.length === 0) {
    // Return a default summary if no content exists yet
    return {
      summary: `${ownerName} is a software professional. More details coming soon as content is added to the site.`,
      headline: "Software Professional",
      highlights: ["Building great software"],
      skills: ["Software Development"],
      interests: ["Technology"],
      generatedAt: new Date().toISOString(),
    };
  }

  // Build the prompt
  const prompt = buildAboutPrompt(blocks, ownerName);

  // Generate the summary using the LLM
  const result = await generateJSON<Omit<AboutSummary, "generatedAt">>({
    prompt,
    systemInstruction: `You are a professional copywriter creating content for a personal portfolio website. 
Generate compelling, accurate content based only on the provided information.
Always respond with valid JSON matching the requested structure.`,
  });

  return {
    ...result,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Get the most recent update timestamp from content blocks
 */
export async function getLastContentUpdate(): Promise<string | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("content_blocks")
    .select("updated_at")
    .in("type", ["resume", "story"])
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return null;
  }

  return data[0].updated_at;
}

/**
 * Get cached about summary if it exists and is still valid
 */
async function getCachedAboutSummary(
  ownerId: string,
  lastContentUpdate: string | null
): Promise<AboutCache | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("about_cache")
    .select("*")
    .eq("owner_id", ownerId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  // If no content update timestamp, cache is valid
  if (!lastContentUpdate) {
    return data as AboutCache;
  }

  // Check if cache is still valid (generated after last content update)
  const cacheTime = new Date(data.content_updated_at).getTime();
  const contentTime = new Date(lastContentUpdate).getTime();

  if (cacheTime >= contentTime) {
    return data as AboutCache;
  }

  // Cache is stale
  return null;
}

/**
 * Save about summary to cache
 */
async function saveAboutCache(
  ownerId: string,
  summary: Omit<AboutSummary, "generatedAt" | "fromCache">,
  contentUpdatedAt: string | null
): Promise<void> {
  const supabase = createAdminClient();

  // Delete any existing cache for this owner
  await supabase.from("about_cache").delete().eq("owner_id", ownerId);

  // Insert new cache entry
  const { error } = await supabase.from("about_cache").insert({
    owner_id: ownerId,
    summary_json: summary,
    content_updated_at: contentUpdatedAt || new Date().toISOString(),
    generated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("Error saving about cache:", error);
    // Don't throw - caching failure shouldn't break the page
  }
}

/**
 * Get the owner ID (extracted to share between functions)
 */
async function getOwnerId(): Promise<string> {
  const supabase = createAdminClient();

  // Get owner_id from existing content_blocks
  const { data: ownerBlocks } = await supabase
    .from("content_blocks")
    .select("owner_id")
    .limit(1);

  if (ownerBlocks && ownerBlocks.length > 0) {
    return ownerBlocks[0].owner_id;
  }

  throw new Error("Could not determine owner ID - no content blocks exist");
}

/**
 * Get the About summary, using cache if available and valid
 */
export async function getAboutSummary(
  ownerName: string = "Foster Curtis"
): Promise<AboutSummary> {
  // Get the last content update time
  const lastContentUpdate = await getLastContentUpdate();

  // Try to get owner ID (needed for cache lookup)
  let ownerId: string | null = null;
  try {
    ownerId = await getOwnerId();
  } catch {
    // No content exists yet, return default
    return {
      summary: `${ownerName} is a software professional. More details coming soon as content is added to the site.`,
      headline: "Software Professional",
      highlights: ["Building great software"],
      skills: ["Software Development"],
      interests: ["Technology"],
      generatedAt: new Date().toISOString(),
      fromCache: false,
    };
  }

  // Check for valid cached summary
  const cached = await getCachedAboutSummary(ownerId, lastContentUpdate);

  if (cached) {
    return {
      ...cached.summary_json,
      generatedAt: cached.generated_at,
      fromCache: true,
    };
  }

  // No valid cache - generate fresh summary
  const freshSummary = await generateAboutSummary(ownerName);

  // Save to cache (don't await - fire and forget)
  saveAboutCache(
    ownerId,
    {
      summary: freshSummary.summary,
      headline: freshSummary.headline,
      highlights: freshSummary.highlights,
      skills: freshSummary.skills,
      interests: freshSummary.interests,
    },
    lastContentUpdate
  ).catch((err) => console.error("Failed to save about cache:", err));

  return {
    ...freshSummary,
    fromCache: false,
  };
}

/**
 * Force regenerate the about summary (for manual refresh from dashboard)
 */
export async function regenerateAboutSummary(
  ownerName: string = "Foster Curtis"
): Promise<AboutSummary> {
  const ownerId = await getOwnerId();
  const lastContentUpdate = await getLastContentUpdate();

  // Generate fresh summary
  const freshSummary = await generateAboutSummary(ownerName);

  // Save to cache
  await saveAboutCache(
    ownerId,
    {
      summary: freshSummary.summary,
      headline: freshSummary.headline,
      highlights: freshSummary.highlights,
      skills: freshSummary.skills,
      interests: freshSummary.interests,
    },
    lastContentUpdate
  );

  return {
    ...freshSummary,
    fromCache: false,
  };
}
