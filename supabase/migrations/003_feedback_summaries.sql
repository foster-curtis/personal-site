-- =============================================================================
-- Phase 5: Feedback Summaries Table (AI analysis output)
-- Run this in Supabase SQL Editor before implementing Phase 5 analysis features.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- feedback_summaries
-- Stores AI-generated aggregated summaries per feedback request.
-- response_count_at_analysis: used to skip re-analysis when there's no new
-- feedback (if current response count equals this, do not re-run analysis).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES feedback_requests(id) ON DELETE CASCADE,
  summary_text TEXT NOT NULL,
  highlights JSONB NOT NULL DEFAULT '{}',
  response_count_at_analysis INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_summaries_request_id ON feedback_summaries(request_id);
CREATE INDEX IF NOT EXISTS idx_feedback_summaries_created_at ON feedback_summaries(created_at DESC);

COMMENT ON TABLE feedback_summaries IS 'AI-generated aggregated summaries per feedback request; one row per analysis run';
COMMENT ON COLUMN feedback_summaries.highlights IS 'e.g. { "strengths": [...], "growth_areas": [...] }';
COMMENT ON COLUMN feedback_summaries.response_count_at_analysis IS 'Number of feedback_responses at analysis time; used to skip re-analysis when unchanged';

-- =============================================================================
-- ROW LEVEL SECURITY
-- Owner can read summaries for their requests. Inserts/updates happen via
-- service role in API when running analysis.
-- =============================================================================
ALTER TABLE feedback_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can read own feedback_summaries"
  ON feedback_summaries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM feedback_requests fr
      WHERE fr.id = feedback_summaries.request_id AND fr.owner_id = auth.uid()
    )
  );

-- Service role (admin client) is used to INSERT/UPDATE when running analysis;
-- no policy needed for that as service role bypasses RLS.
