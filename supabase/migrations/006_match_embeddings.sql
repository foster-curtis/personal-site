-- match_embeddings() — pgvector cosine-similarity search over content_embeddings.
-- Captured from the live Supabase project on 2026-08-14; the only call site is
-- lib/rag.ts:20 (retrieveRelevantChunks). Return shape matches EmbeddingMatch in
-- lib/db/types.ts:42.

CREATE OR REPLACE FUNCTION "public"."match_embeddings"(
    "query_embedding" extensions.vector,
    "match_threshold" double precision DEFAULT 0.5,
    "match_count" integer DEFAULT 5
) RETURNS TABLE (
    "id" uuid,
    "content_block_id" uuid,
    "chunk_index" integer,
    "chunk_text" text,
    "similarity" double precision
)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.id,
    ce.content_block_id,
    ce.chunk_index,
    ce.chunk_text,
    1 - (ce.embedding <=> query_embedding) AS similarity
  FROM content_embeddings ce
  WHERE 1 - (ce.embedding <=> query_embedding) > match_threshold
  ORDER BY ce.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
