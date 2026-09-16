import type { UploadedFile } from "./service";

const DEFAULT_MAX_CHARS = 100_000;

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function extract(file: UploadedFile): Promise<string | null> {
  if (file.type.startsWith("text/")) return file.bytes.toString("utf8");
  if (file.type === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(file.bytes)), { mergePages: true });
    return text;
  }
  if (file.type === DOCX) {
    const mammoth = await import("mammoth");
    return (await mammoth.extractRawText({ buffer: file.bytes })).value;
  }
  return null;
}

/**
 * Plain text of an uploaded Evidence file for the Assistant to read, or `null` when the type has no
 * extractor or parsing fails. Never throws: extraction must not fail the upload.
 */
export async function extractText(file: UploadedFile): Promise<string | null> {
  try {
    const text = (await extract(file))?.trim();
    if (!text) return null;
    const max = Number(process.env.EVIDENCE_EXTRACT_MAX_CHARS) || DEFAULT_MAX_CHARS;
    return text.slice(0, max);
  } catch (e) {
    console.error(`Evidence text extraction failed for ${file.name} (${file.type})`, e);
    return null;
  }
}
