// Database types for Supabase tables

export type ContentBlockType = "resume" | "story" | "qa" | "file_metadata";

export interface ContentBlock {
  id: string;
  owner_id: string;
  type: ContentBlockType;
  title: string;
  body_text: string;
  source_question_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateContentBlockInput {
  type: ContentBlockType;
  title: string;
  body_text: string;
  source_question_id?: string | null;
}

export interface UpdateContentBlockInput {
  type?: ContentBlockType;
  title?: string;
  body_text?: string;
}

// Embedding types for Stage 3

export interface ContentEmbedding {
  id: string;
  content_block_id: string;
  chunk_index: number;
  chunk_text: string;
  embedding: number[];
  created_at: string;
}

export interface EmbeddingMatch {
  id: string;
  content_block_id: string;
  chunk_index: number;
  chunk_text: string;
  similarity: number;
}

// Prompt types for Stage 6

export type PromptStatus = "pending" | "answered";

export interface Prompt {
  id: string;
  owner_id: string;
  prompt_text: string;
  status: PromptStatus;
  answer_block_id: string | null;
  created_at: string;
  answered_at: string | null;
}

// File types for Stage 7

export interface FileRecord {
  id: string;
  owner_id: string;
  content_block_id: string | null;
  name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number | null;
  created_at: string;
}

// Extended content block with prompt info for Q&A display
export interface ContentBlockWithPrompt extends ContentBlock {
  prompt?: Prompt | null;
}

// About page cache types
export interface AboutCache {
  id: string;
  owner_id: string;
  summary_json: {
    summary: string;
    headline: string;
    highlights: string[];
    skills: string[];
    interests: string[];
  };
  content_updated_at: string;
  generated_at: string;
  created_at: string;
}

// Feedback types for Phase 3
export interface FeedbackRequest {
  id: string;
  owner_id: string;
  created_at: string;
  expires_at: string | null;
  title: string | null;
  notes: string | null;
  is_active: boolean;
}

export interface CreateFeedbackRequestInput {
  title?: string | null;
  notes?: string | null;
  expires_at?: string | null;
  is_active?: boolean;
}

export interface FeedbackLink {
  id: string;
  request_id: string;
  token: string;
  created_at: string;
  expires_at: string | null;
  max_submissions: number | null;
  submission_count: number;
}

export interface FeedbackResponder {
  id: string;
  request_id: string;
  link_id: string;
  created_at: string;
}

export interface FeedbackResponse {
  id: string;
  responder_id: string;
  request_id: string;
  created_at: string;
  metadata: Record<string, any>;
  content: Record<string, any>;
  sentiment_score: number | null;
  is_flagged: boolean;
  flag_reason: string | null;
}

export interface FeedbackFormSubmission {
  token: string;
  metadata: {
    relationship?: string;
    worked_from?: string;
    worked_to?: string;
    role?: string;
  };
  content: {
    worker_description?: string;
    character_comments?: string;
    teamwork_comments?: string;
    skills_comments?: string;
    weaknesses?: string;
  };
}

// Extended types with relations
export interface FeedbackRequestWithStats extends FeedbackRequest {
  links: FeedbackLink[];
  response_count: number;
  responder_count: number;
}

// Feedback Summary types for Phase 5
export interface FeedbackSummary {
  id: string;
  request_id: string;
  summary_text: string;
  highlights: {
    strengths: string[];
    growth_areas: string[];
    themes: string[];
  };
  response_count_at_analysis: number;
  created_at: string;
}

export interface FeedbackAnalysisResult {
  summary: FeedbackSummary | null;
  stats: {
    response_count: number;
    responder_count: number;
    flagged_count: number;
    average_sentiment: number | null;
  };
  responses_summary: {
    id: string;
    created_at: string;
    is_flagged: boolean;
    sentiment_score: number | null;
    relationship: string | null;
  }[];
  skipped: boolean;
  message?: string;
}

export interface PublicFeedbackSummary {
  summary_text: string;
  highlights: {
    strengths: string[];
    growth_areas: string[];
    themes: string[];
  };
  responder_count: number;
  generated_at: string;
}
