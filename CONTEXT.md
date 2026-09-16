# Project Management

A project-management workspace for a single project manager (PM), built as the structured foundation for a future AI "project intelligence" layer (health briefings, dependency and risk detection). The base app records project state; the future AI layer reads and proposes changes to it.

## Language

### Structure

**Project**:
A bounded piece of work a PM manages, with its own tasks, milestones, risks and evidence.
_Avoid_: Workstream, initiative, board

**Task**:
A unit of work inside a Project with an owner, status and dates.
_Avoid_: Issue, ticket, card, to-do

**Milestone**:
A dated checkpoint in a Project that Tasks roll up to (e.g. "UAT begins").
_Avoid_: Phase, deadline, gate

**Dependency**:
A directed relationship stating one item cannot proceed until another is done.
_Avoid_: Blocker (see Risk), link, relation

**Status**:
A named state an item (Task, Milestone, Risk, Project) can be in. Statuses are defined per Project and each maps to one fixed Status Category.
_Avoid_: State, stage, column

**Status Category**:
The fixed, system-defined meaning behind a Status (e.g. for Tasks: not started, in progress, blocked, done, cancelled). Users rename and add Statuses; they cannot add Categories.
_Avoid_: Status type, workflow

### People

**Person**:
Someone who owns or does work in one Project (team member, vendor contact, stakeholder). Defined per Project; may or may not be linked to a User account.
_Avoid_: Assignee, member, resource, contact

**Team**:
A named group of People within one Project (e.g. "Team B", "Vendor Acme") that can own work collectively.
_Avoid_: Group, squad, department

**Label**:
A per-Project free-form tag applied to Tasks for filtering.
_Avoid_: Tag, category

**User**:
An account that can sign in. Owns Projects. Distinct from Person.
_Avoid_: Account, login

### History

**Activity Event**:
An immutable record that a specific field of a specific item changed, from what to what, by whom, when.
_Avoid_: Audit log entry, history, change, revision

### Risk

**Risk**:
A recorded possibility that something may go wrong for a Project, with probability, impact and an owner.
_Avoid_: Issue, blocker, concern

**Risk Register**:
The list of all Risks in a Project.

### Evidence

**Evidence**:
A source artifact attached to a Project (plan, minutes, status update, export) from which project facts may be derived.
_Avoid_: Document, file, attachment, upload

### Discussion

**Comment**:
A short, plain-text, dated statement attached to one Task, Risk or Milestone, optionally attributed to the Person who said it ("said by") and dated to when it was said ("said on"). Immutable once posted; may be deleted, in which case the item's history keeps the body.
_Avoid_: Message, note, remark, update
