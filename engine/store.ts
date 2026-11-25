// Where the office (team + tasks) is persisted.
// - FileStore: a JSON file, for running locally.
// - BlobStore: one private JSON blob in Vercel Blob, shared by every function
//   instance in production. Chosen automatically when BLOB_READ_WRITE_TOKEN is set.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { OfficeData } from "../shared/types.js";

export interface Store {
  load(): Promise<OfficeData | null>;
  save(data: OfficeData): Promise<void>;
}

export class FileStore implements Store {
  constructor(private file: string) {}
  async load() {
    if (!existsSync(this.file)) return null;
    try {
      return JSON.parse(readFileSync(this.file, "utf8")) as OfficeData;
    } catch {
      return null;
    }
  }
  async save(data: OfficeData) {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(data, null, 2));
  }
}

export class BlobStore implements Store {
  constructor(private pathname = "office/state.json") {}
  async load() {
    const { get } = await import("@vercel/blob");
    // useCache:false → read the latest write, not a CDN copy.
    const r = await get(this.pathname, { access: "private", useCache: false });
    if (!r || r.statusCode !== 200) return null;
    return JSON.parse(await new Response(r.stream).text()) as OfficeData;
  }
  async save(data: OfficeData) {
    const { put } = await import("@vercel/blob");
    await put(this.pathname, JSON.stringify(data), {
      access: "private",
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType: "application/json",
    });
  }
}

export function defaultStore(file: string): Store {
  return process.env.BLOB_READ_WRITE_TOKEN ? new BlobStore() : new FileStore(file);
}
