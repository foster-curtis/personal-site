-- Add is_important column to content_blocks table
-- This allows the owner to mark certain content blocks as "important" for RAG prioritization
-- Resume-type blocks are important by default

-- Add the column with a default of false
ALTER TABLE content_blocks 
ADD COLUMN IF NOT EXISTS is_important BOOLEAN NOT NULL DEFAULT false;

-- Backfill: Set is_important = true for all existing resume blocks
UPDATE content_blocks 
SET is_important = true 
WHERE type = 'resume';

-- Add a comment for documentation
COMMENT ON COLUMN content_blocks.is_important IS 'When true, this content block is prioritized in RAG/chat responses. Resume blocks are important by default.';
