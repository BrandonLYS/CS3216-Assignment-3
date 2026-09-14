import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** Blob storage seam for Evidence files. Swap drivers via STORAGE_DRIVER. */
export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class DiskStorage implements Storage {
  constructor(private readonly root: string) {}
  private resolve(key: string) {
    const root = path.resolve(this.root);
    const p = path.resolve(root, key);
    const rel = path.relative(root, p);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Invalid storage key");
    return p;
  }
  async put(key: string, data: Buffer) {
    const p = this.resolve(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, data);
  }
  get(key: string) {
    return readFile(this.resolve(key));
  }
  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

class VercelBlobStorage implements Storage {
  private mod = () => import("@vercel/blob");
  async put(key: string, data: Buffer, contentType: string) {
    const { put } = await this.mod();
    await put(key, data, { access: "private", contentType, addRandomSuffix: false });
  }
  async get(key: string) {
    const { get } = await this.mod();
    const result = await get(key, { access: "private" });
    if (!result || result.statusCode !== 200) throw new Error("Blob not found");
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }
  async delete(key: string) {
    const { del } = await this.mod();
    await del(key);
  }
}

const globalForStorage = globalThis as unknown as { __storage?: Storage };

export function getStorage(): Storage {
  if (globalForStorage.__storage) return globalForStorage.__storage;
  const driver = process.env.STORAGE_DRIVER ?? "disk";
  globalForStorage.__storage =
    driver === "vercel-blob" ? new VercelBlobStorage() : new DiskStorage(process.env.STORAGE_DIR ?? "./storage");
  return globalForStorage.__storage;
}
