"use client";

import { Trash2 } from "lucide-react";
import * as React from "react";
import { createCommentAction, deleteCommentAction, listCommentsAction } from "@/server/modules/comments/actions";
import type { CommentListItem } from "@/server/modules/comments/repository";
import type { ProjectRefs } from "@/server/modules/projects/refs";
import type { CommentableEntityType } from "@/shared/domain";
import { fmtDate, fmtDateTime, relative, today } from "@/shared/lib/dates";
import { Button, Field, Input, Select, Textarea } from "@/shared/ui";
import { Avatar } from "@/entities/person/avatar";
import { CommentBody } from "@/entities/comment/comment-body";

/**
 * List + composer for the Comments on one Task, Risk or Milestone.
 *
 * Not a <form>: it renders inside the item dialog's ActionForm and nested forms would bubble
 * submit into the parent save handler. Controls carry no `name` so the parent's FormData never
 * sees them, and Enter in the single-line controls is intercepted to stop implicit submission.
 */
export function CommentThread({
  projectId,
  entityType,
  entityId,
  people,
}: {
  projectId: string;
  entityType: CommentableEntityType;
  entityId: string;
  people: ProjectRefs["people"];
}) {
  const [comments, setComments] = React.useState<CommentListItem[] | null>(null);
  const [body, setBody] = React.useState("");
  const [saidById, setSaidById] = React.useState("");
  const [saidOn, setSaidOn] = React.useState(today);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  async function refresh() {
    const res = await listCommentsAction({ projectId, entityType, entityId });
    if (res.ok) setComments(res.data);
    else setError(res.error);
  }

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await listCommentsAction({ projectId, entityType, entityId });
      if (cancelled) return;
      if (res.ok) setComments(res.data);
      else setError(res.error);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId, entityType, entityId]);

  async function post() {
    if (!body.trim() || pending) return;
    setPending(true);
    setError(null);
    setFieldErrors({});
    const res = await createCommentAction({
      projectId,
      entityType,
      entityId,
      body,
      saidById: saidById || null,
      saidOn: saidOn || null,
    });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      setFieldErrors(res.fieldErrors ?? {});
      return;
    }
    setBody("");
    await refresh();
    textareaRef.current?.focus();
  }

  async function remove(id: string) {
    setPending(true);
    setError(null);
    const res = await deleteCommentAction({ id });
    setPending(false);
    setConfirmId(null);
    if (!res.ok) return setError(res.error);
    await refresh();
  }

  const stopEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void post();
    }
  };

  const count = comments?.length ?? 0;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-hairline bg-surface-1 p-3">
      <div className="flex items-center gap-1.5">
        <span className="text-caption font-medium text-ink-subtle">Comments</span>
        {comments !== null && <span className="text-caption text-ink-tertiary">{count}</span>}
      </div>

      {comments === null ? (
        <p className="px-2 py-1 text-caption text-ink-tertiary">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="px-2 py-1 text-caption text-ink-tertiary">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {comments.map((c) => (
            <CommentRow
              key={c.comment.id}
              item={c}
              confirming={confirmId === c.comment.id}
              pending={pending}
              onAskDelete={() => setConfirmId(c.comment.id)}
              onCancelDelete={() => setConfirmId(null)}
              onConfirmDelete={() => remove(c.comment.id)}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 border-t border-hairline pt-3">
        <Field label="Comment" hint="⌘/Ctrl+Enter to post" error={fieldErrors.body?.[0]}>
          <Textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void post();
              }
            }}
            placeholder="Jason said integration lands next week unless infra blocks us…"
            className="min-h-16"
          />
        </Field>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Said by" className="min-w-40 flex-1" error={fieldErrors.saidById?.[0]}>
            <Select value={saidById} onChange={(e) => setSaidById(e.target.value)} onKeyDown={stopEnter}>
              <option value="">You (unattributed)</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Said on" className="min-w-36" error={fieldErrors.saidOn?.[0]}>
            <Input type="date" value={saidOn} onChange={(e) => setSaidOn(e.target.value)} onKeyDown={stopEnter} />
          </Field>
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="mb-0.5 h-8"
            loading={pending}
            disabled={!body.trim()}
            onClick={post}
          >
            Post
          </Button>
        </div>
        {error && <p className="text-caption text-tag-red">{error}</p>}
      </div>
    </div>
  );
}

function CommentRow({
  item,
  confirming,
  pending,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  item: CommentListItem;
  confirming: boolean;
  pending: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const { comment, saidBy } = item;
  const name = saidBy?.name ?? (comment.saidByName ? "Unknown person" : "You");
  const title = !saidBy && comment.saidByName ? `Was: ${comment.saidByName}` : undefined;
  return (
    <li className="flex flex-col gap-1 rounded-sm px-2 py-1.5 hover:bg-surface-2">
      <div className="flex items-center gap-2">
        <Avatar name={saidBy?.name ?? (comment.saidByName ? "?" : null)} size="xs" />
        <span className="text-caption font-medium text-ink" title={title}>
          {name}
        </span>
        {comment.saidOn && (
          <span className="text-caption text-ink-subtle">· said {fmtDate(comment.saidOn, "d MMM yyyy")}</span>
        )}
        <span className="ml-auto text-caption text-ink-tertiary" title={`Entered ${fmtDateTime(comment.createdAt)}`}>
          {relative(comment.createdAt)}
        </span>
        {!confirming && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-ink-tertiary hover:text-tag-red"
            aria-label="Delete comment"
            onClick={onAskDelete}
            disabled={pending}
          >
            <Trash2 className="size-3" />
          </Button>
        )}
      </div>
      <CommentBody body={comment.body} />
      {confirming && (
        <div className="flex items-center gap-2 pt-1">
          <span className="text-caption text-ink-muted">Delete this comment?</span>
          <Button type="button" variant="danger" size="sm" loading={pending} onClick={onConfirmDelete}>
            Delete
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancelDelete}>
            Cancel
          </Button>
        </div>
      )}
    </li>
  );
}
