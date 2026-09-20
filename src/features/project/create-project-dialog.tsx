"use client";

import { useRouter } from "next/navigation";
import type { ProjectRow } from "@/server/modules/projects/schema";
import { createProjectAction } from "@/server/modules/projects/actions";
import { ActionForm, Dialog, FormRow, TextField, TextareaField } from "@/shared/ui";

export function CreateProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New project"
      description="A project gets its own tasks, milestones, risks and evidence."
    >
      <ActionForm
        action={createProjectAction}
        submitLabel="Create project"
        cancel={onClose}
        onSuccess={(data) => {
          onClose();
          router.push(`/projects/${(data as ProjectRow).id}`);
        }}
      >
        <TextField name="name" label="Name" required autoFocus placeholder="Payments Platform Relaunch" />
        <FormRow>
          <TextField
            name="key"
            label="Key"
            required
            placeholder="PAY"
            maxLength={6}
            hint="Prefix for task IDs, e.g. PAY"
            inputClassName="uppercase"
          />
        </FormRow>
        <TextareaField name="description" label="Description" placeholder="What is this project delivering?" />
        <FormRow>
          <TextField name="startDate" label="Start date" type="date" />
          <TextField name="targetDate" label="Target date" type="date" />
        </FormRow>
      </ActionForm>
    </Dialog>
  );
}
