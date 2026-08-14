-- Phase 06 item 5: 002_feedback_tables.sql defines ON DELETE CASCADE down the whole chain
-- (feedback_requests -> feedback_links -> feedback_responders -> feedback_responses) and
-- 003_feedback_summaries.sql adds the same for feedback_summaries. Deleting a
-- feedback_requests row should cascade-delete everything under it. Runs and verifies as
-- service_role, bypassing RLS, so a passing test proves the rows are actually gone at the
-- storage layer -- not just hidden by a policy.
BEGIN;
SELECT plan(6);

SELECT tests.create_supabase_user('phase6_cascade_owner');
SELECT tests.authenticate_as_service_role();

CREATE TEMP TABLE _cascade_seed AS
WITH req AS (
  INSERT INTO feedback_requests (owner_id, title)
  VALUES (tests.get_supabase_uid('phase6_cascade_owner'), 'Cascade delete check')
  RETURNING id
), link AS (
  INSERT INTO feedback_links (request_id, token)
  SELECT id, 'phase6-cascade-token' FROM req
  RETURNING id, request_id
), responder AS (
  INSERT INTO feedback_responders (request_id, link_id)
  SELECT request_id, id FROM link
  RETURNING id, request_id
), response AS (
  INSERT INTO feedback_responses (responder_id, request_id, content)
  SELECT id, request_id, '{"q1": "answer"}'::jsonb FROM responder
  RETURNING id
), summary AS (
  INSERT INTO feedback_summaries (request_id, summary_text)
  SELECT id, 'Cascade delete check summary' FROM req
  RETURNING id
)
SELECT (SELECT id FROM req) AS request_id;

-- Sanity: everything actually got seeded before we delete anything.
SELECT ok(
  (SELECT count(*) FROM feedback_requests WHERE id = (SELECT request_id FROM _cascade_seed)) = 1
  AND (SELECT count(*) FROM feedback_links WHERE request_id = (SELECT request_id FROM _cascade_seed)) = 1
  AND (SELECT count(*) FROM feedback_responders WHERE request_id = (SELECT request_id FROM _cascade_seed)) = 1
  AND (SELECT count(*) FROM feedback_responses WHERE request_id = (SELECT request_id FROM _cascade_seed)) = 1
  AND (SELECT count(*) FROM feedback_summaries WHERE request_id = (SELECT request_id FROM _cascade_seed)) = 1,
  'fixture seeded one row in every table of the chain before the delete'
);

DELETE FROM feedback_requests WHERE id = (SELECT request_id FROM _cascade_seed);

SELECT results_eq(
  'select count(*) from feedback_requests where id = (select request_id from _cascade_seed)',
  ARRAY[0::bigint],
  'deleting feedback_requests removes the row itself'
);
SELECT results_eq(
  'select count(*) from feedback_links where request_id = (select request_id from _cascade_seed)',
  ARRAY[0::bigint],
  'deleting feedback_requests cascades to feedback_links'
);
SELECT results_eq(
  'select count(*) from feedback_responders where request_id = (select request_id from _cascade_seed)',
  ARRAY[0::bigint],
  'deleting feedback_requests cascades to feedback_responders'
);
SELECT results_eq(
  'select count(*) from feedback_responses where request_id = (select request_id from _cascade_seed)',
  ARRAY[0::bigint],
  'deleting feedback_requests cascades to feedback_responses'
);
SELECT results_eq(
  'select count(*) from feedback_summaries where request_id = (select request_id from _cascade_seed)',
  ARRAY[0::bigint],
  'deleting feedback_requests also cascades to feedback_summaries (003_feedback_summaries.sql)'
);

SELECT * FROM finish();
ROLLBACK;
