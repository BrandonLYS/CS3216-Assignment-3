import { generateText } from "ai";
import type { Ctx } from "@/server/core/context";
import { getModelForUser, modelInfo } from "@/server/modules/assistant/model";
import { traceGeneration } from "@/shared/analytics/ai";
import type { UploadedFile } from "./service";

const PROMPT =
  "Transcribe every piece of text in this document verbatim, preserving reading order. Output only the transcription - no commentary, no markdown fences.";

/**
 * A file markitdown cannot read is offered to the model as-is: PDFs go as file input, images
 * as image input, anything else as file input for the API to accept or reject. Covers scanned
 * and image-only PDFs, which carry no text layer for markitdown to find. Runs on the same model
 * as every other call for this User (their saved config, else the environment fallback), traced
 * as `scan_transcription`. Never throws - no configured model, an unsupported format or a failed
 * call returns null and the caller keeps whatever extraction produced, like every other enrichment here.
 */
export async function fileToTextViaModel(ctx: Ctx, projectId: string, file: UploadedFile): Promise<string | null> {
  try {
    const model = await getModelForUser(ctx);
    if (!model) return null;
    const telemetry = { userId: ctx.userId, properties: { project_id: projectId } };
    const res = await traceGeneration(telemetry, { span: "scan_transcription", ...modelInfo(model) }, () =>
      generateText({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              file.type.startsWith("image/")
                ? { type: "image", image: file.bytes }
                : { type: "file", data: file.bytes, mediaType: file.type },
            ],
          },
        ],
      }),
    );
    return res.text.trim() || null;
  } catch (e) {
    console.error(`[evidence] model transcription failed for ${file.name} (${file.type})`, e);
    return null;
  }
}
