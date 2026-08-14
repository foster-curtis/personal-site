-- Phase 06 item 2: feedback_responses has no INSERT policy for anon or authenticated, by
-- design (see the comment block at the bottom of 002_feedback_tables.sql) -- anonymous
-- feedback submission only works through the service-role admin client in
-- app/api/feedback/submit. This asserts that design holds: anon is rejected, the owning
-- authenticated user is *also* rejected (there's no owner-insert policy either, only
-- read/update/delete), and only service_role succeeds.
BEGIN;
SELECT plan(3);

SELECT tests.create_supabase_user('phase6_insert_owner');
SELECT tests.authenticate_as_service_role();

CREATE TEMP TABLE _insert_seed AS
WITH req AS (
  INSERT INTO feedback_requests (owner_id, title)
  VALUES (tests.get_supabase_uid('phase6_insert_owner'), 'Insert policy check')
  RETURNING id
), link AS (
  INSERT INTO feedback_links (request_id, token)
  SELECT id, 'phase6-insert-policy-token' FROM req
  RETURNING id, request_id
), responder AS (
  INSERT INTO feedback_responders (request_id, link_id)
  SELECT request_id, id FROM link
  RETURNING id, request_id
)
SELECT
  (SELECT id FROM responder) AS responder_id,
  (SELECT request_id FROM responder) AS request_id;

-- Roles other than the seeding service_role need to be able to read the seed values to
-- build their insert attempts below.
GRANT SELECT ON _insert_seed TO anon, authenticated;

SELECT tests.clear_authentication();
SELECT throws_ok(
  $$ insert into feedback_responses (responder_id, request_id, content)
     select responder_id, request_id, '{}'::jsonb from _insert_seed $$,
  '42501',
  'new row violates row-level security policy for table "feedback_responses"',
  'anon cannot insert into feedback_responses (no INSERT policy for anon)'
);

SELECT tests.authenticate_as('phase6_insert_owner');
SELECT throws_ok(
  $$ insert into feedback_responses (responder_id, request_id, content)
     select responder_id, request_id, '{}'::jsonb from _insert_seed $$,
  '42501',
  'new row violates row-level security policy for table "feedback_responses"',
  'the owning authenticated user cannot insert into feedback_responses either (no owner-insert policy exists)'
);

SELECT tests.authenticate_as_service_role();
SELECT lives_ok(
  $$ insert into feedback_responses (responder_id, request_id, content)
     select responder_id, request_id, '{}'::jsonb from _insert_seed $$,
  'service_role (the admin client used by app/api/feedback/submit) can insert into feedback_responses'
);

SELECT * FROM finish();
ROLLBACK;
