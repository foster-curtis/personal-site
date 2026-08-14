-- Phase 06 item 4: about_cache's RLS policy is `FOR ALL USING (true) WITH CHECK (true)`
-- (001_about_cache.sql) -- effectively open to any role that can reach the table at all.
-- The migration's own comment claims this is "intentional" (service-role-only, managed
-- server-side), but a USING(true)/WITH CHECK(true) policy doesn't actually enforce that --
-- it does not check the calling role at all, let alone require service_role specifically.
--
-- This test does NOT assert this is a bug -- it documents the *current* behavior so a
-- change to the policy shows up as an intentional decision instead of a silent regression.
-- FLAG FOR REVIEW: confirm this is intentional. As written, any authenticated user (not
-- just the cache's owner) and even an anonymous client can read and write every row in
-- this table, including rows belonging to other owners.
BEGIN;
SELECT plan(3);

SELECT tests.create_supabase_user('phase6_cache_owner');
SELECT tests.create_supabase_user('phase6_cache_stranger');

SELECT tests.authenticate_as_service_role();

CREATE TEMP TABLE _cache_seed AS
WITH cache AS (
  INSERT INTO about_cache (owner_id, summary_json, content_updated_at)
  VALUES (
    tests.get_supabase_uid('phase6_cache_owner'),
    '{"headline": "test"}'::jsonb,
    now()
  )
  RETURNING id
)
SELECT id FROM cache;

GRANT SELECT ON _cache_seed TO anon, authenticated;

-- A completely unrelated authenticated user -- not the cache's owner -- can read it.
SELECT tests.authenticate_as('phase6_cache_stranger');
SELECT results_eq(
  'select count(*) from about_cache where id = (select id from _cache_seed)',
  ARRAY[1::bigint],
  'FLAG FOR REVIEW: a non-owner authenticated user can read another owner''s about_cache row (USING (true) does not check ownership)'
);

-- The same unrelated user can also write to it.
SELECT lives_ok(
  $$ update about_cache set summary_json = '{"headline": "overwritten by a stranger"}'::jsonb
     where id = (select id from _cache_seed) $$,
  'FLAG FOR REVIEW: a non-owner authenticated user can update another owner''s about_cache row (WITH CHECK (true) does not check ownership)'
);

-- Even an anonymous (unauthenticated) client can read it -- the policy has no role clause.
SELECT tests.clear_authentication();
SELECT results_eq(
  'select count(*) from about_cache where id = (select id from _cache_seed)',
  ARRAY[1::bigint],
  'FLAG FOR REVIEW: an anonymous client can read about_cache rows (policy applies to every role, not just service_role)'
);

SELECT * FROM finish();
ROLLBACK;
