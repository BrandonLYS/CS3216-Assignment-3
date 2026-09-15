import { FolderX } from "lucide-react";
import Link from "next/link";
import { Button, EmptyState } from "@/shared/ui";

export default function ProjectNotFound() {
  return (
    <EmptyState
      icon={<FolderX />}
      title="Project not found"
      description="It may have been deleted, or it belongs to another account."
      action={
        <Link href="/projects">
          <Button>Back to projects</Button>
        </Link>
      }
    />
  );
}
