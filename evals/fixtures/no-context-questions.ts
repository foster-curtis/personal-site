/**
 * Questions with no supporting answer anywhere in fixtures/knowledge-base.ts. Used by
 * answer-grounding.eval.ts to check that the chat pipeline declines or hedges instead of
 * confabulating, per buildSystemPrompt's "say so politely" instruction (lib/rag.ts).
 */
export const NO_CONTEXT_QUESTIONS: string[] = [
  "What's Alex's favorite pizza topping?",
  "Does Alex have any pets?",
  "What's Alex's astrological sign?",
  "Is Alex married, and does Alex have kids?",
  "What car does Alex drive?",
  "Does Alex speak any languages other than English?",
  "What's Alex's favorite movie?",
  "Has Alex ever run a marathon?",
  "What's Alex's blood type?",
  "Where did Alex go on their last vacation?",
];
