-- Content core tables
-- Captures schema that existed only in the hosted Supabase project (created manually,
-- predating supabase/migrations/). Source of truth: `supabase db dump --linked` against
-- the live project on 2026-08-14.
--
-- content_blocks, content_embeddings, prompts, and files together back the RAG pipeline
-- and owner content-management flows (see lib/db/types.ts, lib/rag.ts, app/api/data,
-- app/api/prompts, app/api/files).

CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "extensions";

-- content_blocks -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."content_blocks" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "owner_id" uuid NOT NULL,
    "type" text NOT NULL,
    "title" text NOT NULL,
    "body_text" text NOT NULL,
    "source_question_id" uuid,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL,
    "is_important" boolean DEFAULT false NOT NULL,
    CONSTRAINT "content_blocks_type_check" CHECK (("type" = ANY (ARRAY['resume'::text, 'story'::text, 'qa'::text, 'file_metadata'::text]))),
    CONSTRAINT "content_blocks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "content_blocks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE
);

COMMENT ON COLUMN "public"."content_blocks"."is_important" IS 'When true, this content block is prioritized in RAG/chat responses. Resume blocks are important by default.';

CREATE INDEX IF NOT EXISTS "content_blocks_owner_id_idx" ON "public"."content_blocks" USING btree ("owner_id");
CREATE INDEX IF NOT EXISTS "content_blocks_type_idx" ON "public"."content_blocks" USING btree ("type");

ALTER TABLE "public"."content_blocks" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own content blocks" ON "public"."content_blocks" FOR SELECT USING (("owner_id" = auth.uid()));
CREATE POLICY "Users can create their own content blocks" ON "public"."content_blocks" FOR INSERT WITH CHECK (("owner_id" = auth.uid()));
CREATE POLICY "Users can update their own content blocks" ON "public"."content_blocks" FOR UPDATE USING (("owner_id" = auth.uid())) WITH CHECK (("owner_id" = auth.uid()));
CREATE POLICY "Users can delete their own content blocks" ON "public"."content_blocks" FOR DELETE USING (("owner_id" = auth.uid()));

-- content_embeddings ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."content_embeddings" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "content_block_id" uuid NOT NULL,
    "chunk_index" integer NOT NULL,
    "chunk_text" text NOT NULL,
    "embedding" extensions.vector(768) NOT NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT "content_embeddings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "content_embeddings_content_block_id_fkey" FOREIGN KEY ("content_block_id") REFERENCES "public"."content_blocks"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "content_embeddings_block_id_idx" ON "public"."content_embeddings" USING btree ("content_block_id");
CREATE INDEX IF NOT EXISTS "content_embeddings_embedding_idx" ON "public"."content_embeddings" USING hnsw ("embedding" extensions.vector_cosine_ops);

ALTER TABLE "public"."content_embeddings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view embeddings for their content blocks" ON "public"."content_embeddings" FOR SELECT USING (("content_block_id" IN ( SELECT "content_blocks"."id" FROM "public"."content_blocks" WHERE ("content_blocks"."owner_id" = auth.uid()))));
CREATE POLICY "Users can create embeddings for their content blocks" ON "public"."content_embeddings" FOR INSERT WITH CHECK (("content_block_id" IN ( SELECT "content_blocks"."id" FROM "public"."content_blocks" WHERE ("content_blocks"."owner_id" = auth.uid()))));
CREATE POLICY "Users can delete embeddings for their content blocks" ON "public"."content_embeddings" FOR DELETE USING (("content_block_id" IN ( SELECT "content_blocks"."id" FROM "public"."content_blocks" WHERE ("content_blocks"."owner_id" = auth.uid()))));

-- prompts ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."prompts" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "owner_id" uuid NOT NULL,
    "prompt_text" text NOT NULL,
    "status" text NOT NULL,
    "answer_block_id" uuid,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "answered_at" timestamptz,
    CONSTRAINT "prompts_status_check" CHECK (("status" = ANY (ARRAY['pending'::text, 'answered'::text]))),
    CONSTRAINT "prompts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "prompts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    CONSTRAINT "prompts_answer_block_id_fkey" FOREIGN KEY ("answer_block_id") REFERENCES "public"."content_blocks"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "prompts_owner_id_idx" ON "public"."prompts" USING btree ("owner_id");
CREATE INDEX IF NOT EXISTS "prompts_status_idx" ON "public"."prompts" USING btree ("status");
CREATE INDEX IF NOT EXISTS "prompts_answer_block_id_idx" ON "public"."prompts" USING btree ("answer_block_id");

ALTER TABLE "public"."prompts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own prompts" ON "public"."prompts" FOR SELECT USING (("owner_id" = auth.uid()));
CREATE POLICY "Users can create their own prompts" ON "public"."prompts" FOR INSERT WITH CHECK (("owner_id" = auth.uid()));
CREATE POLICY "Users can update their own prompts" ON "public"."prompts" FOR UPDATE USING (("owner_id" = auth.uid())) WITH CHECK (("owner_id" = auth.uid()));
CREATE POLICY "Users can delete their own prompts" ON "public"."prompts" FOR DELETE USING (("owner_id" = auth.uid()));

-- files ------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."files" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "owner_id" uuid NOT NULL,
    "content_block_id" uuid,
    "name" text NOT NULL,
    "storage_path" text NOT NULL,
    "mime_type" text NOT NULL,
    "size_bytes" bigint,
    "created_at" timestamptz DEFAULT now(),
    CONSTRAINT "files_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "files_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    CONSTRAINT "files_content_block_id_fkey" FOREIGN KEY ("content_block_id") REFERENCES "public"."content_blocks"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_files_owner_id" ON "public"."files" USING btree ("owner_id");
CREATE INDEX IF NOT EXISTS "idx_files_content_block_id" ON "public"."files" USING btree ("content_block_id");

ALTER TABLE "public"."files" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view their own files" ON "public"."files" FOR SELECT USING ((auth.uid() = "owner_id"));
CREATE POLICY "Owner can insert their own files" ON "public"."files" FOR INSERT WITH CHECK ((auth.uid() = "owner_id"));
CREATE POLICY "Owner can update their own files" ON "public"."files" FOR UPDATE USING ((auth.uid() = "owner_id")) WITH CHECK ((auth.uid() = "owner_id"));
CREATE POLICY "Owner can delete their own files" ON "public"."files" FOR DELETE USING ((auth.uid() = "owner_id"));
