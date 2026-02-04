/**
 * Feedback Form Question Configuration
 *
 * These questions are displayed to anonymous respondents when they fill out
 * a feedback form. Stored statically for now; can be customized per-request later.
 */

export interface FeedbackQuestion {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "date_range";
  placeholder?: string;
  required: boolean;
  options?: { value: string; label: string }[];
  helpText?: string;
  category: "metadata" | "content";
}

export const FEEDBACK_QUESTIONS: FeedbackQuestion[] = [
  // Metadata questions (about the relationship)
  {
    id: "worked_from",
    label: "When did you start working with them?",
    type: "text",
    placeholder: "e.g., January 2022 or 2022",
    required: false,
    helpText: "Approximate date is fine",
    category: "metadata",
  },
  {
    id: "worked_to",
    label: "When did you stop working with them?",
    type: "text",
    placeholder: "e.g., December 2024 or Present",
    required: false,
    helpText: "Enter 'Present' if you still work together",
    category: "metadata",
  },
  {
    id: "relationship",
    label: "What was your working relationship?",
    type: "select",
    required: true,
    options: [
      { value: "manager", label: "I was their manager/supervisor" },
      { value: "direct_report", label: "I reported to them" },
      { value: "coworker", label: "We were coworkers/peers" },
      { value: "client", label: "I was their client" },
      { value: "mentor", label: "I was their mentor" },
      { value: "mentee", label: "They were my mentor" },
      { value: "collaborator", label: "We collaborated on projects" },
      { value: "other", label: "Other" },
    ],
    category: "metadata",
  },
  {
    id: "role",
    label: "What was your role/title at that time?",
    type: "text",
    placeholder: "e.g., Engineering Manager, Senior Developer",
    required: false,
    category: "metadata",
  },

  // Content questions (qualitative feedback)
  {
    id: "worker_description",
    label: "How would you describe them as a worker?",
    type: "textarea",
    placeholder:
      "What stands out about their work ethic, reliability, initiative, etc.?",
    required: true,
    helpText: "Be as specific as you can with examples if possible",
    category: "content",
  },
  {
    id: "character_comments",
    label: "What can you say about their character?",
    type: "textarea",
    placeholder:
      "Describe their personality, integrity, how they treat others, etc.",
    required: false,
    helpText: "This helps paint a picture of who they are beyond their skills",
    category: "content",
  },
  {
    id: "teamwork_comments",
    label: "How do they work with others?",
    type: "textarea",
    placeholder:
      "Describe their teamwork, collaboration, communication style, etc.",
    required: false,
    helpText: "Include examples of how they contributed to team dynamics",
    category: "content",
  },
  {
    id: "skills_comments",
    label: "What are their strongest skills or proficiencies?",
    type: "textarea",
    placeholder:
      "Technical skills, soft skills, areas where they particularly excel",
    required: false,
    helpText: "Be specific about what impressed you most",
    category: "content",
  },
  {
    id: "weaknesses",
    label: "Are there any areas where they could improve?",
    type: "textarea",
    placeholder: "Growth areas, skills to develop, or constructive feedback",
    required: false,
    helpText:
      "This is optional but helps provide a balanced perspective (and is kept strictly anonymous)",
    category: "content",
  },
  {
    id: "additional_comments",
    label: "Anything else you'd like to share?",
    type: "textarea",
    placeholder: "Any other observations, memorable experiences, or comments",
    required: false,
    category: "content",
  },
];

/**
 * Get questions by category
 */
export function getMetadataQuestions(): FeedbackQuestion[] {
  return FEEDBACK_QUESTIONS.filter((q) => q.category === "metadata");
}

export function getContentQuestions(): FeedbackQuestion[] {
  return FEEDBACK_QUESTIONS.filter((q) => q.category === "content");
}

/**
 * Get the owner name for display in the form
 */
export function getOwnerDisplayName(): string {
  return (
    process.env.OWNER_NAME ||
    process.env.NEXT_PUBLIC_OWNER_NAME ||
    "this person"
  );
}
