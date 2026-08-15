/**
 * Real, varied job descriptions for schema-conformance.eval.ts. Unlike retrieval-quality,
 * this eval runs against the real owner's real content_blocks (job-compare resolves the
 * owner via OWNER_EMAIL and reads their actual resume/story/qa blocks) — it's read-only, so
 * there's no fixture-seeding/cleanup story here, just varied inputs to the real route.
 */
export const JOB_DESCRIPTIONS: string[] = [
  `Senior Backend Engineer — Platform Team

We're looking for a Senior Backend Engineer to help scale our event-processing
infrastructure. You'll own services written in Go and Python, work extensively with Kafka
and PostgreSQL, and be a key voice in our on-call rotation. 5+ years of experience with
distributed systems required. Experience with Kubernetes and infrastructure-as-code tools
like Terraform is a strong plus. You'll partner closely with data science to make sure our
pipelines can handle 10x current volume over the next two years.`,

  `Frontend Engineer, Product

Join our product engineering team building the main customer dashboard used by thousands of
paying customers daily. Strong React and TypeScript skills required. You should be
comfortable owning a feature end-to-end, from design collaboration through shipping and
monitoring. Experience with data visualization libraries (D3, visx, or similar) is a plus.
We value engineers who can work independently and communicate clearly in writing, since much
of our team is distributed across time zones.`,

  `Site Reliability Engineer

We need an SRE to help us mature our incident response process and reduce toil. You'll be
responsible for on-call, writing and reviewing postmortems, and building tooling to catch
problems before they page anyone. Strong experience with Kubernetes, observability tooling
(Prometheus/Grafana or similar), and at least one major cloud provider (AWS, GCP, or Azure)
required. Bonus points for experience mentoring other engineers on reliability practices.`,

  `Engineering Manager, Backend Platform

We're hiring our first dedicated EM for the backend platform team (currently 5 engineers,
growing to 8-10 over the next year). You'll split your time between people management,
technical strategy, and staying hands-on enough to review architecture decisions credibly.
Prior experience as a senior or staff engineer before moving into management is required.
Experience running an on-call rotation and owning production incidents is a strong plus,
since this team owns latency-sensitive, high-volume infrastructure.`,

  `Data Engineer

Looking for a Data Engineer to build and maintain our core ELT pipelines. You'll work
primarily in Python and SQL, orchestrating pipelines with Airflow (or similar) and landing
data in a Postgres-based warehouse. Experience with streaming systems like Kafka is a plus
but not required — most of our workloads are batch today, though that may change. You should
be comfortable digging into a slow query and figuring out why, not just writing new
pipelines from scratch.`,
];
