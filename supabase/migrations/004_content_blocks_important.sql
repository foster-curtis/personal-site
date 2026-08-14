-- Add is_important column to content_blocks table
-- This allows the owner to mark certain content blocks as "important" for RAG prioritization
-- Resume-type blocks are important by default
--
-- Guarded with a to_regclass() check: on a fresh database, migrations replay in filename
-- order (001, 002, 003, 004, 005, ...), so this runs before 005_content_core.sql creates
-- content_blocks. On the hosted project content_blocks already exists (created out-of-band,
-- before migrations existed), so this behaves exactly as it always did. See
-- plans/06-db-integration.md "Known issue" for the full story.
DO $$ BEGIN
  IF to_regclass('public.content_blocks') IS NOT NULL THEN
    -- Add the column with a default of false
    ALTER TABLE content_blocks
    ADD COLUMN IF NOT EXISTS is_important BOOLEAN NOT NULL DEFAULT false;

    -- Backfill: Set is_important = true for all existing resume blocks
    UPDATE content_blocks
    SET is_important = true
    WHERE type = 'resume';

    -- Add a comment for documentation
    COMMENT ON COLUMN content_blocks.is_important IS 'When true, this content block is prioritized in RAG/chat responses. Resume blocks are important by default.';
  END IF;
END $$;
