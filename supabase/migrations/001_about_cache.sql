-- About Cache Table
-- Stores the AI-generated About page summary to avoid regenerating on every page view.
-- The cache is invalidated when content_blocks are updated.

CREATE TABLE IF NOT EXISTS about_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_json JSONB NOT NULL,
  content_updated_at TIMESTAMPTZ NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster lookups by owner
CREATE INDEX IF NOT EXISTS idx_about_cache_owner_id ON about_cache(owner_id);

-- RLS Policies
ALTER TABLE about_cache ENABLE ROW LEVEL SECURITY;

-- Only allow the service role (admin client) to read/write
-- This is intentional: the cache is managed server-side only
CREATE POLICY "Service role can manage about_cache"
  ON about_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Comment on the table
COMMENT ON TABLE about_cache IS 'Caches AI-generated About page summaries to avoid regeneration on every page view';
COMMENT ON COLUMN about_cache.summary_json IS 'The generated summary containing headline, summary text, highlights, skills, and interests';
COMMENT ON COLUMN about_cache.content_updated_at IS 'Timestamp of when content_blocks were last updated when this cache was generated';
COMMENT ON COLUMN about_cache.generated_at IS 'Timestamp of when this cache entry was generated';
