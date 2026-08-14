-- Phase 06 item 1: RLS actually isolates owners across the feedback_requests ->
-- feedback_links -> feedback_responders -> feedback_responses chain (all four use the
-- EXISTS-subquery-back-to-owner_id pattern from 002_feedback_tables.sql). Two authenticated
-- owners, one seeds data, the other should see zero rows -- not an error, just correctly
-- empty rows. Also asserts the seeding owner *can* see their own rows, so a passing test
-- means "isolation is working," not "the tables happen to be empty."
BEGIN;
SELECT plan(8);

SELECT tests.create_supabase_user('phase6_owner_a');
SELECT tests.create_supabase_user('phase6_owner_b');

SELECT tests.authenticate_as_service_role();

-- Seed one row per table in the chain, all owned by owner_a.
CREATE TEMP TABLE _rls_seed AS
WITH req AS (
  INSERT INTO feedback_requests (owner_id, title)
  VALUES (tests.get_supabase_uid('phase6_owner_a'), 'Owner A isolation check')
  RETURNING id
), link AS (
  INSERT INTO feedback_links (request_id, token)
  SELECT id, 'phase6-isolation-token' FROM req
  RETURNING id, request_id
), responder AS (
  INSERT INTO feedback_responders (request_id, link_id)
  SELECT request_id, id FROM link
  RETURNING id, request_id
), response AS (
  INSERT INTO feedback_responses (responder_id, request_id, content)
  SELECT id, request_id, '{"q1": "answer"}'::jsonb FROM responder
  RETURNING id
)
SELECT
  (SELECT id FROM req) AS request_id,
  (SELECT id FROM link) AS link_id,
  (SELECT id FROM responder) AS responder_id,
  (SELECT id FROM response) AS response_id;

-- Positive control: owner_a sees exactly their own row in every table.
SELECT tests.authenticate_as('phase6_owner_a');

SELECT results_eq(
  'select count(*) from feedback_requests',
  ARRAY[1::bigint],
  'Owner A sees their own feedback_requests row'
);
SELECT results_eq(
  'select count(*) from feedback_links',
  ARRAY[1::bigint],
  'Owner A sees their own feedback_links row'
);
SELECT results_eq(
  'select count(*) from feedback_responders',
  ARRAY[1::bigint],
  'Owner A sees their own feedback_responders row'
);
SELECT results_eq(
  'select count(*) from feedback_responses',
  ARRAY[1::bigint],
  'Owner A sees their own feedback_responses row'
);

-- The actual isolation check: owner_b, a completely different authenticated user, sees
-- zero rows across all four tables -- not an error, just correctly empty.
SELECT tests.authenticate_as('phase6_owner_b');

SELECT results_eq(
  'select count(*) from feedback_requests',
  ARRAY[0::bigint],
  'Owner B cannot see Owner A''s feedback_requests row'
);
SELECT results_eq(
  'select count(*) from feedback_links',
  ARRAY[0::bigint],
  'Owner B cannot see Owner A''s feedback_links row'
);
SELECT results_eq(
  'select count(*) from feedback_responders',
  ARRAY[0::bigint],
  'Owner B cannot see Owner A''s feedback_responders row'
);
SELECT results_eq(
  'select count(*) from feedback_responses',
  ARRAY[0::bigint],
  'Owner B cannot see Owner A''s feedback_responses row'
);

SELECT * FROM finish();
ROLLBACK;
