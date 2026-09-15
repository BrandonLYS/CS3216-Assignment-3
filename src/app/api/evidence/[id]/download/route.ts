import { NextResponse } from "next/server";
import { ctxForCurrentUser } from "@/server/core/action";
import { DomainError } from "@/server/core/errors";
import { evidenceService } from "@/server/modules/evidence/service";

export async function GET(_req: Request, { params }: RouteContext<"/api/evidence/[id]/download">) {
  const { id } = await params;
  try {
    const ctx = await ctxForCurrentUser();
    const { evidence, bytes } = await evidenceService.download(ctx, id);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": evidence.mimeType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(evidence.fileName ?? "file")}"`,
      },
    });
  } catch (e) {
    if (e instanceof DomainError)
      return NextResponse.json({ error: e.message }, { status: e.code === "not_found" ? 404 : 403 });
    throw e;
  }
}
