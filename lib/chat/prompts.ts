/**
 * Curated prompts for the chat page marquee.
 * Organized into categories for variety and easy maintenance.
 */

export const CHAT_PROMPTS = {
  // Experience & Background
  experience: [
    "What is Foster's professional background?",
    "Tell me about Foster's career journey",
    "What companies has Foster worked at?",
    "How many years of experience does Foster have?",
  ],

  // Skills & Technologies
  skills: [
    "What programming languages does Foster know?",
    "What technologies does Foster specialize in?",
    "What are Foster's strongest technical skills?",
    "Does Foster have experience with cloud platforms?",
    "What frameworks has Foster worked with?",
  ],

  // Projects & Accomplishments
  projects: [
    "Tell me about Foster's most interesting project",
    "What has Foster built?",
    "What are some of Foster's accomplishments?",
    "Has Foster worked on any open source projects?",
  ],

  // Work Style & Collaboration
  workStyle: [
    "How does Foster approach problem-solving?",
    "What is Foster's work style?",
    "How does Foster handle deadlines and pressure?",
    "What kind of teams has Foster worked on?",
  ],

  // Peer Feedback
  peerFeedback: [
    "What do other people say about Foster?",
    "How do colleagues describe Foster as a coworker?",
    "What are Foster's strengths according to peers?",
    "What do managers say about Foster?",
    "How is Foster described as a team member?",
  ],

  // Education & Learning
  education: [
    "What is Foster's educational background?",
    "How does Foster stay current with technology?",
  ],

  // General
  general: [
    "Why should I hire Foster?",
    "What makes Foster unique?",
    "What is Foster passionate about?",
  ],
};

/**
 * Get all prompts as a flat array
 */
export function getAllPrompts(): string[] {
  return Object.values(CHAT_PROMPTS).flat();
}

/**
 * Get prompts organized into rows for the marquee display.
 * Returns 3 rows with prompts distributed evenly.
 */
export function getPromptsForMarquee(): string[][] {
  const allPrompts = getAllPrompts();
  const rowCount = 3;
  const rows: string[][] = [[], [], []];

  allPrompts.forEach((prompt, index) => {
    rows[index % rowCount].push(prompt);
  });

  return rows;
}
