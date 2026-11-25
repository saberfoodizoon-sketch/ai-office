// Where the office (team + tasks) is persisted.
// - RedisStore: Upstash Redis (Vercel Marketplace), shared by every function
//   instance. Chosen when UPSTASH_REDIS_REST_URL or KV_REST_API_URL is set.
// - BlobStore: one private JSON blob in Vercel Blob (BLOB_READ_WRITE_TOKEN).
//   Works, but Blob's operation quota is small for an app that polls.
// - FileStore: a JSON file, for running locally.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { OfficeData } from "../shared/types.js";

export interface Store {
  load(): Promise<OfficeData | null>;
  save(data: OfficeData): Promise<void>;
  /**
   * Optional cheap change marker: when it matches the last load, the cached copy
   * is still current and the full state isn't re-read.
   */
  version?(): Promise<string | null>;
}

export class RedisStore implements Store {
  private redis: import("@upstash/redis").Redis | null = null;
  constructor(private key = "ai-office") {}
  private async client() {
    if (!this.redis) {
      const { Redis } = await import("@upstash/redis");
      this.redis = Redis.fromEnv();
    }
    return this.redis;
  }
  async load() {
    return ((await (await this.client()).get<OfficeData>(`${this.key}:state`)) ?? null) as OfficeData | null;
  }
  async save(data: OfficeData) {
    const r = await this.client();
    await r.multi().set(`${this.key}:state`, data).incr(`${this.key}:version`).exec();
  }
  async version() {
    const v = await (await this.client()).get<number>(`${this.key}:version`);
    return v == null ? null : String(v);
  }
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

/**
 * Keeps the office usable if the real store fails (quota, outage): falls back to
 * this instance's memory and retries the real store after a cooldown.
 */
export class ResilientStore implements Store {
  private memory: OfficeData | null = null;
  private downUntil = 0;
  constructor(readonly inner: Store) {}
  private down(e: unknown) {
    console.error(`${this.inner.constructor.name} failed; using memory for 60 s`, e);
    this.downUntil = Date.now() + 60_000;
  }
  async load() {
    if (Date.now() >= this.downUntil) {
      try {
        const d = await this.inner.load();
        this.memory = d;
        return d;
      } catch (e) {
        this.down(e);
      }
    }
    return this.memory;
  }
  async save(data: OfficeData) {
    this.memory = data;
    if (Date.now() < this.downUntil) return;
    try {
      await this.inner.save(data);
    } catch (e) {
      this.down(e);
    }
  }
  async version() {
    if (!this.inner.version || Date.now() < this.downUntil) return null;
    try {
      return await this.inner.version();
    } catch (e) {
      this.down(e);
      return null;
    }
  }
}

export function defaultStore(file: string): Store {
  if (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) return new ResilientStore(new RedisStore());
  if (process.env.BLOB_READ_WRITE_TOKEN && process.env.STORE !== "file") return new ResilientStore(new BlobStore());
  return new FileStore(file);
}

export function storeName(store: Store): string {
  return store instanceof ResilientStore ? store.inner.constructor.name : store.constructor.name;
}
