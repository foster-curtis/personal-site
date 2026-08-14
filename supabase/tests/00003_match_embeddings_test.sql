-- Phase 06 item 3: match_embeddings() (006_match_embeddings.sql) returns the shape
-- EmbeddingMatch expects (lib/db/types.ts:42), and match_threshold/match_count actually
-- filter and limit results. This is currently unverifiable from source alone -- the function
-- only exists in migrations because Phase 00 captured it from the live project.
--
-- Fixture: three embeddings built so their cosine similarity to the query vector is exactly
-- 1, 0, and -1 (a vector of all 1.0s vs. one of all 1.0s / half-and-half 1.0/-1.0 / all
-- -1.0s), so thresholds can be asserted precisely instead of against noisy real embeddings.
--
-- content_embeddings.embedding uses an HNSW index (approximate nearest neighbor), so per
-- the phase plan this test doesn't rely on ANN ranking: `enable_indexscan`/
-- `enable_bitmapscan` are turned off for this transaction to force an exact sequential
-- scan, and the multi-row assertion below uses set_eq (membership, not order) as a second,
-- independent guard against relying on ANN approximation.
BEGIN;
SELECT plan(4);

SELECT tests.authenticate_as_service_role();
SET LOCAL enable_indexscan = off;
SET LOCAL enable_bitmapscan = off;

SELECT tests.create_supabase_user('phase6_embed_owner');

CREATE TEMP TABLE _mb_seed AS
WITH block AS (
  INSERT INTO content_blocks (owner_id, type, title, body_text)
  VALUES (tests.get_supabase_uid('phase6_embed_owner'), 'qa', 'match_embeddings fixture', 'fixture body')
  RETURNING id
), high AS (
  INSERT INTO content_embeddings (content_block_id, chunk_index, chunk_text, embedding)
  SELECT id, 0, 'chunk high text', (SELECT array_agg(1.0)::vector FROM generate_series(1,768)) FROM block
  RETURNING id
), mid AS (
  INSERT INTO content_embeddings (content_block_id, chunk_index, chunk_text, embedding)
  SELECT id, 1, 'chunk mid text',
    (SELECT array_agg(CASE WHEN g <= 384 THEN 1.0 ELSE -1.0 END)::vector FROM generate_series(1,768) g)
  FROM block
  RETURNING id
), low AS (
  INSERT INTO content_embeddings (content_block_id, chunk_index, chunk_text, embedding)
  SELECT id, 2, 'chunk low text', (SELECT array_agg(-1.0)::vector FROM generate_series(1,768)) FROM block
  RETURNING id
)
SELECT
  (SELECT id FROM block) AS content_block_id,
  (SELECT id FROM high) AS high_id,
  (SELECT id FROM mid) AS mid_id,
  (SELECT id FROM low) AS low_id,
  (SELECT array_agg(1.0)::vector FROM generate_series(1,768)) AS query_embedding;

-- match_threshold filters: only the identical-direction chunk (similarity 1.0) clears a
-- 0.5 threshold; the orthogonal (0.0) and opposite (-1.0) chunks don't.
SELECT results_eq(
  $$ select count(*) from match_embeddings(
       (select query_embedding from _mb_seed), 0.5, 10
     ) $$,
  ARRAY[1::bigint],
  'match_threshold excludes the orthogonal and opposite-direction chunks'
);

-- With a threshold low enough to admit everything, all three chunks come back --
-- membership only (set_eq), not order, since the underlying index is ANN.
SELECT set_eq(
  $$ select chunk_text from match_embeddings(
       (select query_embedding from _mb_seed), -2, 10
     ) $$,
  ARRAY['chunk high text', 'chunk mid text', 'chunk low text'],
  'all three seeded chunks are returned when match_threshold admits everything'
);

-- match_count limits: same permissive threshold, but only 2 rows requested back.
SELECT results_eq(
  $$ select count(*) from match_embeddings(
       (select query_embedding from _mb_seed), -2, 2
     ) $$,
  ARRAY[2::bigint],
  'match_count limits the number of rows returned'
);

-- Shape: the single match at a high threshold matches EmbeddingMatch exactly --
-- id, content_block_id, chunk_index, chunk_text, similarity.
SELECT results_eq(
  $$ select id, content_block_id, chunk_index, chunk_text, round(similarity::numeric, 4)
     from match_embeddings((select query_embedding from _mb_seed), 0.5, 10) $$,
  $$ select high_id, content_block_id, 0, 'chunk high text', 1.0000
    from _mb_seed $$,
  'match_embeddings returns rows shaped like EmbeddingMatch (id, content_block_id, chunk_index, chunk_text, similarity)'
);

SELECT * FROM finish();
ROLLBACK;
