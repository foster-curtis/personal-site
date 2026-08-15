import type { ContentBlockType } from "../../lib/db/types";

/**
 * A small, self-contained "resume" for a fictional persona, used only by the eval suite.
 *
 * This is fixture data, not the real owner's content, on purpose: the real knowledge base
 * lives only in the hosted Supabase project (see docs/data-model.md), changes whenever the
 * owner edits their resume, and isn't accessible to whoever's running these evals. A golden
 * question set built against a fixed, version-controlled corpus stays meaningful over time —
 * one built against production content would silently go stale on the next resume edit.
 *
 * `evals/helpers/knowledge-base-seed.ts` writes these as real `content_blocks` +
 * `content_embeddings` rows (under the real OWNER_EMAIL user, tagged with a title prefix)
 * before retrieval-quality/answer-grounding run, and deletes them afterward.
 */
export interface FixtureBlock {
  key: string;
  type: ContentBlockType;
  isImportant?: boolean;
  bodyText: string;
}

export const EVAL_KNOWLEDGE_BASE: FixtureBlock[] = [
  {
    key: "resume-summary",
    type: "resume",
    isImportant: true,
    bodyText:
      "Alex Rivera is a backend-leaning software engineer with 9 years of experience " +
      "building distributed systems, developer tooling, and data pipelines. Alex has shipped " +
      "production services in Go, Python, and TypeScript, led migrations from monoliths to " +
      "service-oriented architectures, and mentored several engineers into senior roles. Alex " +
      "is based in Portland, Oregon and currently looking for staff-level backend or platform " +
      "engineering roles.",
  },
  {
    key: "resume-backend-role",
    type: "resume",
    isImportant: true,
    bodyText:
      "Senior Backend Engineer, Nimbus Data (2021-2024). Owned the ingestion pipeline that " +
      "processed 40TB/day of clickstream events, rewriting it from a single Python monolith " +
      "into a set of Go services communicating over Kafka. Reduced p99 ingestion latency from " +
      "12 minutes to 45 seconds and cut infrastructure spend by 30% by right-sizing " +
      "autoscaling policies. Also introduced the team's first on-call rotation and incident " +
      "postmortem process.",
  },
  {
    key: "resume-frontend-role",
    type: "resume",
    isImportant: true,
    bodyText:
      "Frontend Engineer, Beacon Labs (2018-2021). Built and maintained the customer-facing " +
      "React dashboard used by roughly 20,000 monthly active users, including a real-time " +
      "charting library built on top of D3 and WebSockets. Partnered closely with design to " +
      "establish the company's first component library, which cut new-feature UI build time " +
      "by roughly half across the frontend team.",
  },
  {
    key: "resume-early-career",
    type: "resume",
    isImportant: true,
    bodyText:
      "Junior Developer, Vertex Systems (2016-2018). First engineering role out of college. " +
      "Worked on an internal inventory-management tool used by warehouse staff, written in " +
      "Ruby on Rails with a jQuery frontend. Learned the fundamentals of relational database " +
      "design, SQL query optimization, and working directly with non-technical stakeholders " +
      "to turn vague requirements into shipped features.",
  },
  {
    key: "resume-education",
    type: "resume",
    isImportant: true,
    bodyText:
      "B.S. in Computer Science, State University, graduated 2016. Coursework emphasized " +
      "distributed systems, databases, and algorithms. Senior capstone project was a " +
      "peer-to-peer file synchronization tool built in C++, which placed first in the " +
      "department's annual capstone showcase.",
  },
  {
    key: "resume-skills",
    type: "resume",
    isImportant: true,
    bodyText:
      "Technical skills: Go, Python, TypeScript, PostgreSQL, Kafka, Docker, Kubernetes, " +
      "Terraform, AWS (EC2, RDS, S3, Lambda), React, GraphQL. Comfortable owning a service " +
      "from design doc through production on-call. Strongest in backend systems design and " +
      "data-intensive applications; conversational but not expert in frontend performance " +
      "tuning.",
  },
  {
    key: "resume-certifications",
    type: "resume",
    isImportant: false,
    bodyText:
      "AWS Certified Solutions Architect - Associate, obtained 2022. Certified Kubernetes " +
      "Application Developer (CKAD), obtained 2023. Both maintained current through annual " +
      "recertification.",
  },
  {
    key: "story-open-source",
    type: "story",
    isImportant: false,
    bodyText:
      "In 2020, Alex started maintaining an open-source Go library for structured logging " +
      "after the original maintainer stepped away. The project had about 200 open issues and " +
      "no CI at the time. Alex set up automated testing and release tooling, triaged the " +
      "backlog down to a handful of active issues over six months, and grew the library to " +
      "roughly 3,000 GitHub stars and adoption by a few mid-size companies. Alex still reviews " +
      "pull requests for it most weekends.",
  },
  {
    key: "story-mentoring",
    type: "story",
    isImportant: false,
    bodyText:
      "At Nimbus Data, Alex informally mentored three junior engineers over two years, one of " +
      "whom was promoted to mid-level within a year and another who moved into a tech-lead " +
      "role on a different team. Alex's approach was mostly pairing on real production work " +
      "rather than abstract exercises, plus a standing weekly 30-minute 1:1 focused on " +
      "whatever the mentee was stuck on that week.",
  },
  {
    key: "story-outage",
    type: "story",
    isImportant: false,
    bodyText:
      "During a Black Friday traffic spike at Nimbus Data, the ingestion pipeline Alex owned " +
      "started dropping events due to a misconfigured Kafka consumer group that wasn't " +
      "scaling with partition count. Alex led the incident response, temporarily rerouted " +
      "traffic to a backup queue to stop data loss, fixed the consumer group configuration, " +
      "and wrote a public postmortem afterward that led to the team adding automated alerts " +
      "for consumer lag as a standard part of every new Kafka topic.",
  },
  {
    key: "story-hackathon",
    type: "story",
    isImportant: false,
    bodyText:
      "Alex's team won first place at Beacon Labs' 2019 internal hackathon with a tool that " +
      "auto-generated changelog entries from merged pull requests using commit message " +
      "conventions. The prototype was built in about 30 hours and was later polished into a " +
      "small internal tool that the whole engineering org adopted for release notes.",
  },
  {
    key: "qa-remote-work",
    type: "qa",
    isImportant: false,
    bodyText:
      "Alex has worked fully remote since 2020 and prefers it, with a strong preference for " +
      "asynchronous communication — detailed written design docs over meetings wherever " +
      "possible, and a personal rule of not scheduling recurring meetings before 10am to " +
      "protect focus time. Alex still travels to in-person team offsites about twice a year " +
      "and finds those valuable for relationship-building even while preferring remote " +
      "day-to-day work.",
  },
  {
    key: "qa-conflict-resolution",
    type: "qa",
    isImportant: false,
    bodyText:
      "When Alex disagrees with a teammate on a technical decision, the first step is usually " +
      "writing down both options with their tradeoffs in a shared doc rather than arguing " +
      "live, since that tends to surface that both people are optimizing for different things " +
      "(e.g. short-term velocity vs. long-term maintainability). If the disagreement persists, " +
      "Alex prefers picking a reversible option and revisiting it after real usage data comes " +
      "in, rather than escalating to a manager to arbitrate.",
  },
  {
    key: "qa-favorite-project",
    type: "qa",
    isImportant: false,
    bodyText:
      "Alex's favorite side project is a command-line tool called 'tidepool' that diffs " +
      "Terraform plan output in a more human-readable way, highlighting only resources that " +
      "will actually be destroyed or replaced. Alex built it after one too many nerve-wracking " +
      "'apply' reviews on a 400-line plan diff, and now uses it on every infrastructure change " +
      "at work.",
  },
];
