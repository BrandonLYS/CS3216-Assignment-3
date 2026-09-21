# M10 - Architecture Evidence

The complete implementation guide is [PrismPM architecture](../architecture.md).
It is audited against main commit `5880bc9` and distinguishes implemented behavior from planned capabilities.

## Diagram and implementation evidence

| Area                      | Evidence                                                                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete application      | [System map](../architecture.md#complete-system-map) connects UI, Next.js, authentication, AI/MCP, services, repositories, PostgreSQL, storage, events, and analytics                          |
| UI to database            | [Read and write flows](../architecture.md#read-and-write-flows) includes the Task-edit sequence, transaction boundaries, Activity recording, and revalidation                                  |
| Authentication            | [Authentication and authorization](../architecture.md#authentication-and-authorization) separates PM sessions, Participant cookies, and MCP bearer tokens                                      |
| Data model                | [PostgreSQL and the domain model](../architecture.md#postgresql-and-the-domain-model) maps table families and key relationships                                                                |
| AI and external tools     | [AI and MCP](../architecture.md#ai-and-mcp) includes separate Assistant and MCP sequences, approval boundaries, Proposals, and Reflection                                                      |
| Files and source material | [Evidence and storage](../architecture.md#evidence-and-storage) includes ingestion, extraction, private downloads, and cleanup behavior                                                        |
| Events and analytics      | [Events and consistency](../architecture.md#events-and-consistency) and [Analytics](../architecture.md#analytics) distinguish durable history, in-process notifications, and PostHog telemetry |
| Deployment and limits     | [Deployment](../architecture.md#deployment-and-configuration), [verification](../architecture.md#verification-and-change-guide), and [current limits](../architecture.md#current-limits)       |

The [AI system guide](../ai-system-guide.md) provides the detailed tool catalogue and reasoning workflows.
The [ADRs](../adr/) record the design decisions behind these boundaries.
