# PrismPM from a multi-project PM's perspective

Historical screenshots below predate the PrismPM rename and retain the former branding.

Reviewed on 19 September 2026 using Playwright Chromium at 1440 × 1000.
The evaluated checkout was `main`, commit `912d42d`; the changes in PR #50 were not present.
This is a simulated senior-PM workflow assessment based on direct use, not a claim of professional employment experience or a comparison against a live Jira installation.
No application code was changed during this review.

## Verdict

PrismPM is stronger at recording project context than helping a busy PM close the loop on it.
I could create and organise work, discover overdue items, and explain why a Decision needs revisiting.
I could not reliably get a portfolio briefing, see one person's commitments across projects, or turn a follow-up into a dated action from the attention queue.
Those gaps would keep a separate personal action list alive alongside PrismPM.

The product should optimise this sequence: capture a commitment, surface the exception, act on it, preserve the reasoning, communicate the result.
Its most distinctive capability is connecting changed facts to earlier Decisions.
That deserves investment, provided the PM does not have to maintain the underlying structure manually for every small change.

## What I actually exercised

I created three synthetic Projects: Payments cutover, Customer onboarding, and Data platform upgrade.
Together they contained 13 Tasks, three blocked Tasks, overlapping deadlines, one completed Task, one unassigned Task, and Alex Morgan as a separately entered Person in each Project.
I then posted and reloaded a follow-up Comment, searched across Projects, dragged a Task to In Progress and verified persistence, changed filters and views, created a Milestone and Dependency, inspected the portfolio Calendar and Timeline, recorded a Risk, added meeting Evidence, created a sourced Decision and date Assumption, and moved a Task date to trigger an impact alert.
I also requested a real Assistant portfolio briefing using this synthetic account.
Proposal extraction used the local heuristic configuration; the portfolio briefing used the configured OpenAI model.

The three evaluated Projects were deleted after capture; screenshots retain the evidence.
The supplied dates are scenario dates, not performance or scheduling benchmarks.
This was a focused workflow assessment, not a rerun of the full regression suite.

## Flows I would use

| Flow                                  | Direct observation                                                                                                               | PM judgement                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Morning exception scan                | Dashboard links opened the relevant Task; overdue and blocked reasons were visible.                                              | A useful starting point, once counts and follow-through are fixed.                                 |
| Find an item during a meeting         | Cmd+K found `Review migration checklist` in another Project and opened its Task dialog.                                          | High daily value; extend the same entry point to capture and more record types.                    |
| Update execution state                | Dragging `Update support FAQ` from Todo to In Progress survived reload.                                                          | Keep the board and compact list; their basic interaction is familiar and useful.                   |
| Record a commitment                   | A Comment attributed to Alex persisted after reopening the Task.                                                                 | Useful context, but the noon follow-up remained text rather than an actionable reminder.           |
| Review a release plan                 | Timeline showed Tasks, the Payments go-live Milestone, and a Dependency from sandbox access to load testing.                     | Useful in a planning or release discussion; not my default daily screen.                           |
| Review upcoming dates across Projects | Portfolio Calendar displayed overlapping deadlines and the go-live Milestone.                                                    | Keep the global view; add owner filtering and a compact agenda for fast scanning.                  |
| Track a material Risk                 | Risk Register displayed severity, owner, mitigation, and next review date.                                                       | Worth keeping for genuine uncertainty; do not duplicate every already-blocked Task as a Risk.      |
| Understand a changed Decision         | Moving sandbox access from 17 to 23 September broke the 21 September Assumption and identified its Decision and downstream Task. | The strongest differentiator in this review. Keep it and reduce the effort needed to configure it. |

[Timeline evidence](screenshots/16-timeline-loaded.png), [saved follow-up](screenshots/24-persisted-comment.png), and [impact alert](screenshots/27-broken-assumption-alert.png).

## Fix first: trust and completeness

### 1. The dashboard understates blocked work

Initially there were three blocked Tasks: Vendor sandbox credentials, Approve onboarding copy, and Investigate backup latency.
The dashboard displayed `Blocked: 1` while also visibly tagging the other two rows as Blocked.
The first two were overdue, so they were counted only in the higher-priority attention group.
Source inspection confirmed that `evaluateAttention` counts an item's winning rule, and the dashboard uses those group counts as its headline metrics.
Deduplicating the attention list is sensible; using mutually exclusive groups for independent metric labels is misleading.
Count all blocked Tasks for the Blocked metric, even if they also appear in Overdue.
Apply the same distinction to the Due in 7 days metric.

### 2. The Assistant mistakes unavailable detail for absent records

I asked for the most urgent blocker, the owner to chase, and the next Milestone at risk across all three Projects.
It gave blocked counts, could not identify Alex, and said `No milestones recorded` for Payments even while `Payments go-live` was visible on the dashboard.
Its closing qualification about limited records did not repair that false statement.
The workspace tool exposes Project summaries and category counts, not the detailed Tasks, People and Milestones needed for this answer.
Give the portfolio Assistant an authorised cross-project read model for this job and require it to distinguish unknown, unavailable, and genuinely absent data.
Until then, it should explain the scope limitation before attempting a briefing.
The reply also rendered Markdown headings and emphasis as literal punctuation.

[The contradiction is visible in one screenshot](screenshots/29-portfolio-assistant.png).

### 3. The attention queue silently stops at ten

The populated workspace had more eligible items than the ten displayed rows.
The source caps the list at ten; the tested UI offered no visible total, Show all control, or link from the headline metrics to a complete filtered queue.
A PM can reasonably mistake this for the full list of work needing attention.
Show `10 of N`, provide a complete view, and let metric cards open its relevant filter.

### 4. Health needs provenance

All three Projects showed Green alongside overdue or blocked work.
After the date slip, Payments still showed Green alongside a broken Assumption, late Dependency and high Risk.
Manual health is legitimate: one overdue Task does not automatically make a Project Red.
But a default or manually selected colour needs an assessment date, author and rationale, clearly separated from detected warnings.
An unassessed Project should not look affirmatively healthy.

[Dashboard before the date slip](screenshots/23-final-dashboard.png).

## What I would remove or demote

| Surface or routine                                                         | What I would do                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Assistant acceptance: 0 of 1` on Decisions                                | Remove from the normal PM screen. This is product evaluation telemetry, not a delivery decision. Show pending Decisions that need my attention instead.                                                                                                            |
| Raw field-by-field Activity as a major dashboard section                   | Move detailed events behind History. The date-slip workflow produced separate state, reason and internal-reference events for the same incident. Summarise what changed, why it matters, and what needs action.                                                    |
| Maintaining Profile and Working Memory Markdown                            | Make this optional advanced control. I would state preferences once and correct the Assistant when needed; I would not curate its internal notes as a daily job. API-token setup also belongs under an explicit integrations/advanced section.                     |
| Filling every Task field at capture time                                   | Keep richer details available, but default to title, Project, owner and due date. Start date, hour estimate, Team, Milestone and Labels should not all compete for attention during rapid capture. Most fields are optional already; the problem is visual burden. |
| Manually modelling a Decision and typed Assumptions for every small choice | Use this for consequential Decisions only. Capture a quick note or draft first, then promote it into a confirmed sourced Decision. Preserve the source requirement for confirmed Decisions; do not make it a reason to lose an unstructured note.                  |
| Browsing the cause/consequence graph every morning                         | Keep it behind `Show why`, where it already belongs. I would use it for a changed premise, a disputed Decision or a handover, not for routine status updates.                                                                                                      |
| Switching between Project and portfolio Calendars routinely                | Make the global Calendar primary, with Project filters. The Project Calendar can remain a scoped convenience rather than a separate habit users must learn.                                                                                                        |

I would not remove Dependencies, Evidence, or Decision memory wholesale.
They pay off when a release slips or someone asks why an earlier choice was made.
The unnecessary work is maintaining the same information several times and navigating separate screens to act on it.

## Touch up the daily workflow

### An actionable portfolio queue

Each row should answer: what happened, which Project, who owns the next action, when to follow up, and what is at risk.
Offer inline owner/status/date changes, a follow-up date, snooze, and a short update without leaving the queue.
Opening a Task from the dashboard currently moves to its Project Tasks page; closing it leaves me there, requiring another navigation back to the portfolio.
Preserve the originating queue and position, for example with a contextual detail panel or return link.
Allow a few saved views such as Waiting on others, Due this week, Unassigned, and Decisions to revisit.

### A durable fast-capture and view system

Typing `New task` into Cmd+K produced `No tasks match` rather than a create action.
Add a global create command with Project selection and a lightweight default form.
Provide multi-select reassignment and rescheduling for batches of changes.
The tested Task view had owner and Milestone filters but no visible priority, label, due-date, or cross-project filter.
A short in-app navigation preserved my filter in this session, but a full reload cleared the text filter, restored Show done, and returned board view to list view.
Persist the selected view and filters in a shareable URL or saved view.

### One Person across the portfolio

Alex had 4 open Tasks in Payments, 3 in Onboarding, and 4 in Data, displayed on separate People pages.
The same Person had to be created three times.
There was no consolidated view of those 11 commitments.
Use a reusable workspace identity with Project-specific membership and roles, then show overlapping commitments and upcoming deadlines.
Task counts alone are not a capacity model; do not present them as utilisation percentages.

### Faster follow-through on Risks and meeting notes

My `chase at noon` Comment was saved correctly, but it was buried below the Task's fields, Dependencies and linked Evidence.
Bring the latest update and next action near the top.
Allow a commitment in a Comment or mitigation to become a linked Task or follow-up without retyping it.
The Evidence-to-Proposal direction is promising; avoid asking me to manually re-enter a Decision and then review a separate Proposal for the same meeting choice.
In this heuristic scenario, the similar pending Proposal remained visible after I created the sourced Decision manually.

### A status update I can actually send

The inspected screens had no dedicated copy/export/share flow for a concise portfolio status update.
Provide a reviewable update with changes since the last report, threatened Milestones, blockers and owners, Decisions needed, and dated next actions.
Include source links and a timestamp; let the PM edit before sharing.
This is a stronger immediate outcome for the Assistant than generic conversational summaries.

### Visual hierarchy

Project identity must survive badges and side panels.
At 1440 pixels, attention badges compressed Project names to fragments; opening the Assistant made the problem worse.
Put names on their own line or place counts underneath them.
The same long-reason layout truncated the broken-Assumption title almost completely in the compact attention row.
Prefer readable primary text and optional secondary detail over more badges.
Reduce duplicate signals: the Project overview showed the same broken Assumption in both a rich alert and a compact attention group.
Use plain-language phrasing such as `Sandbox delay threatens the cutover decision`, with the underlying Assumption type available in details.

## Recommended order

1. Correct independent metrics, prevent false Assistant absence claims, and expose the complete attention queue.
2. Make triage actionable with owner, next action, follow-up date and preserved navigation context.
3. Add global quick capture, durable saved views and batch updates.
4. Reuse People across Projects and surface their overlapping commitments.
5. Produce a reliable, editable portfolio briefing and status-update export.
6. Streamline Evidence-to-Decision capture and retain the impact graph as contextual explanation.

My desired morning would take one portfolio visit: scan exceptions, chase two People, move one commitment, record one Decision, and copy a short stakeholder update.
PrismPM already has much of the underlying information, but the workflow still asks the PM to assemble that morning manually.
