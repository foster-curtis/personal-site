-- =============================================================================
-- Phase 3: Anonymous Feedback System – Tables and RLS
-- Run this in Supabase SQL Editor before implementing Phase 3 API routes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. feedback_requests
-- Owner-created requests for feedback (e.g. "General feedback 2026 job search").
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  title TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_feedback_requests_owner_id ON feedback_requests(owner_id);

COMMENT ON TABLE feedback_requests IS 'Owner-created feedback campaigns; one owner can have many requests';

-- -----------------------------------------------------------------------------
-- 2. feedback_links
-- Shareable link for a request. Token is used in URL; one link per request
-- (or you can add multiple links per request later).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES feedback_requests(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  max_submissions INTEGER DEFAULT 1,
  submission_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_feedback_links_request_id ON feedback_links(request_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_links_token ON feedback_links(token);

COMMENT ON TABLE feedback_links IS 'Shareable link per feedback request; token used in URL for anonymous access';
COMMENT ON COLUMN feedback_links.token IS 'Secure random string in URL; no PII';
COMMENT ON COLUMN feedback_links.submission_count IS 'Number of responses submitted via this link';

-- -----------------------------------------------------------------------------
-- 3. feedback_responders
-- Anonymous correlation handle: one row per person per request, no PII.
-- Used to correlate multiple responses from the same person.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback_responders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES feedback_requests(id) ON DELETE CASCADE,
  link_id UUID NOT NULL REFERENCES feedback_links(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_responders_request_id ON feedback_responders(request_id);
CREATE INDEX IF NOT EXISTS idx_feedback_responders_link_id ON feedback_responders(link_id);

COMMENT ON TABLE feedback_responders IS 'One row per anonymous respondent per request; no email/IP stored';

-- -----------------------------------------------------------------------------
-- 4. feedback_responses
-- One row per submission. metadata = relationship, dates; content = answers.
-- sentiment_score and is_flagged/flag_reason for Phase 5 analysis.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  responder_id UUID NOT NULL REFERENCES feedback_responders(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES feedback_requests(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}',
  content JSONB NOT NULL DEFAULT '{}',
  sentiment_score NUMERIC,
  is_flagged BOOLEAN NOT NULL DEFAULT false,
  flag_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_feedback_responses_responder_id ON feedback_responses(responder_id);
CREATE INDEX IF NOT EXISTS idx_feedback_responses_request_id ON feedback_responses(request_id);
CREATE INDEX IF NOT EXISTS idx_feedback_responses_is_flagged ON feedback_responses(is_flagged) WHERE is_flagged = true;

COMMENT ON TABLE feedback_responses IS 'One row per feedback form submission; content and metadata are JSONB';
COMMENT ON COLUMN feedback_responses.metadata IS 'e.g. relationship, worked_from, worked_to';
COMMENT ON COLUMN feedback_responses.content IS 'Answers keyed by question id';
COMMENT ON COLUMN feedback_responses.sentiment_score IS 'Set by AI in Phase 5';
COMMENT ON COLUMN feedback_responses.is_flagged IS 'Set by AI in Phase 5 for extreme negative/abusive';
COMMENT ON COLUMN feedback_responses.flag_reason IS 'Optional reason for flagging';

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- Owner can manage their requests/links and read (and later update/delete) responses.
-- Anonymous submissions are done via service_role (admin client) in API routes,
-- so no direct anon/authenticated insert policies needed for responders/responses.
-- =============================================================================

ALTER TABLE feedback_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_responders ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_responses ENABLE ROW LEVEL SECURITY;

-- feedback_requests: only owner can do anything
CREATE POLICY "Owner can manage own feedback_requests"
  ON feedback_requests
  FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- feedback_links: only owner of the parent request can do anything
CREATE POLICY "Owner can manage own feedback_links"
  ON feedback_links
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM feedback_requests fr
      WHERE fr.id = feedback_links.request_id AND fr.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM feedback_requests fr
      WHERE fr.id = feedback_links.request_id AND fr.owner_id = auth.uid()
    )
  );

-- feedback_responders: owner can only read (to see counts/correlation)
CREATE POLICY "Owner can read own feedback_responders"
  ON feedback_responders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM feedback_requests fr
      WHERE fr.id = feedback_responders.request_id AND fr.owner_id = auth.uid()
    )
  );

-- feedback_responses: owner can read, update (flag), delete (e.g. remove flagged)
CREATE POLICY "Owner can read own feedback_responses"
  ON feedback_responses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM feedback_requests fr
      WHERE fr.id = feedback_responses.request_id AND fr.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owner can update own feedback_responses"
  ON feedback_responses
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM feedback_requests fr
      WHERE fr.id = feedback_responses.request_id AND fr.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM feedback_requests fr
      WHERE fr.id = feedback_responses.request_id AND fr.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owner can delete own feedback_responses"
  ON feedback_responses
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM feedback_requests fr
      WHERE fr.id = feedback_responses.request_id AND fr.owner_id = auth.uid()
    )
  );

-- =============================================================================
-- Service role (admin client) bypasses RLS, so:
-- - GET /api/feedback/form/[token]: admin reads feedback_links + feedback_requests by token
-- - POST /api/feedback/submit: admin inserts feedback_responders and feedback_responses
--   after validating token and incrementing submission_count on feedback_links
-- =============================================================================
