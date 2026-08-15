/**
 * Golden retrieval set: question -> the fixture block (see fixtures/knowledge-base.ts) that
 * should be among the top-5 chunks `retrieveRelevantChunks` + `prioritizeChunks` return.
 *
 * Phrased the way a recruiter, former colleague, or curious site visitor would actually ask
 * — not synthetic keyword-matching filler — since that's the population this eval is meant
 * to represent (see plans/07-rag-evals.md). 38 pairs, comfortably above the 30 minimum the
 * field considers a noise floor for a meaningful golden set.
 */
export interface GoldenQuestion {
  question: string;
  expectedBlockKey: string;
}

export const GOLDEN_QUESTIONS: GoldenQuestion[] = [
  { question: "What kind of engineer is Alex?", expectedBlockKey: "resume-summary" },
  { question: "Where is Alex based, and what roles are they looking for right now?", expectedBlockKey: "resume-summary" },
  { question: "How many years of professional experience does Alex have?", expectedBlockKey: "resume-summary" },

  { question: "What did Alex work on at Nimbus Data?", expectedBlockKey: "resume-backend-role" },
  { question: "Does Alex have experience with Kafka or event streaming pipelines?", expectedBlockKey: "resume-backend-role" },
  { question: "How did Alex reduce infrastructure spend in a previous role?", expectedBlockKey: "resume-backend-role" },
  { question: "Has Alex ever set up an on-call rotation for a team?", expectedBlockKey: "resume-backend-role" },

  { question: "What frontend engineering experience does Alex have?", expectedBlockKey: "resume-frontend-role" },
  { question: "Has Alex worked with React or D3.js?", expectedBlockKey: "resume-frontend-role" },
  { question: "What did Alex build at Beacon Labs?", expectedBlockKey: "resume-frontend-role" },

  { question: "What was Alex's very first engineering job?", expectedBlockKey: "resume-early-career" },
  { question: "Does Alex have any Ruby on Rails experience?", expectedBlockKey: "resume-early-career" },

  { question: "What's Alex's educational background?", expectedBlockKey: "resume-education" },
  { question: "Did Alex study computer science in college?", expectedBlockKey: "resume-education" },
  { question: "What was Alex's senior capstone project about?", expectedBlockKey: "resume-education" },

  { question: "What programming languages does Alex know?", expectedBlockKey: "resume-skills" },
  { question: "Is Alex more of a backend or a frontend engineer?", expectedBlockKey: "resume-skills" },
  { question: "Does Alex have experience with Kubernetes or Terraform?", expectedBlockKey: "resume-skills" },
  { question: "What cloud platforms has Alex worked with?", expectedBlockKey: "resume-skills" },

  { question: "Does Alex have any professional certifications?", expectedBlockKey: "resume-certifications" },
  { question: "Is Alex AWS certified?", expectedBlockKey: "resume-certifications" },

  { question: "Has Alex contributed to any open-source projects?", expectedBlockKey: "story-open-source" },
  { question: "Does Alex maintain any open-source libraries?", expectedBlockKey: "story-open-source" },

  { question: "Has Alex mentored other engineers before?", expectedBlockKey: "story-mentoring" },
  { question: "What's Alex's approach to mentoring junior developers?", expectedBlockKey: "story-mentoring" },

  { question: "Can you tell me about a time Alex handled a production incident?", expectedBlockKey: "story-outage" },
  { question: "Has Alex ever dealt with a major outage?", expectedBlockKey: "story-outage" },
  { question: "What happened during the Black Friday traffic spike Alex worked on?", expectedBlockKey: "story-outage" },

  { question: "Has Alex participated in any hackathons?", expectedBlockKey: "story-hackathon" },
  { question: "What did Alex build at a company hackathon?", expectedBlockKey: "story-hackathon" },

  { question: "How does Alex feel about remote work?", expectedBlockKey: "qa-remote-work" },
  { question: "Does Alex prefer synchronous or asynchronous communication?", expectedBlockKey: "qa-remote-work" },

  { question: "How does Alex handle disagreements with teammates?", expectedBlockKey: "qa-conflict-resolution" },
  { question: "What's Alex's approach to resolving technical disagreements on a team?", expectedBlockKey: "qa-conflict-resolution" },

  { question: "What's Alex's favorite side project?", expectedBlockKey: "qa-favorite-project" },
  { question: "Has Alex built any personal tools outside of work?", expectedBlockKey: "qa-favorite-project" },
  { question: "What is tidepool and why did Alex build it?", expectedBlockKey: "qa-favorite-project" },
];
