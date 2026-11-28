// Where the office (team + tasks) is persisted.
// - RedisStore: Upstash Redis (Vercel Marketplace), shared by every function
//   instance. Chosen when UPSTASH_REDIS_REST_URL or KV_REST_API_URL is set.
//   Saves are compare-and-set on a version key, so two instances can't silently
//   overwrite each other.
// - FileStore: a JSON file, for running locally (single process).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { OfficeData } from "../shared/types.js";
import { UserError } from "./errors.js";

export interface Loaded {
  data: OfficeData | null;
  /** Version of `data` (null when the store doesn't version). Read atomically with it. */
  version: string | null;
}

export type Saved = { ok: true; version: string | null } | { ok: false };

export interface Store {
  load(): Promise<Loaded>;
  /** Saves only if the stored version still equals `expected` (compare-and-set). */
  save(data: OfficeData, expected: string | null): Promise<Saved>;
  /** Optional cheap change marker, so an unchanged state isn't re-read. */
  version?(): Promise<string | null>;
  /** Optional: increments and returns today's count of user-initiated writes. */
  bumpDaily?(): Promise<number>;
}

// SET the state and INCR the version only if the version is still the expected one.
const CAS_SCRIPT = `
local v = redis.call('GET', KEYS[2])
if (v == false and ARGV[2] == '') or v == ARGV[2] then
  redis.call('SET', KEYS[1], ARGV[1])
  return redis.call('INCR', KEYS[2])
end
return -1`;

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
  async load(): Promise<Loaded> {
    const [data, version] = await (await this.client())
      .multi()
      .get<OfficeData>(`${this.key}:state`)
      .get<number>(`${this.key}:version`)
      .exec<[OfficeData | null, number | null]>();
    return { data: data ?? null, version: version == null ? null : String(version) };
  }
  async save(data: OfficeData, expected: string | null): Promise<Saved> {
    const n = await (await this.client()).eval<string[], number>(
      CAS_SCRIPT,
      [`${this.key}:state`, `${this.key}:version`],
      [JSON.stringify(data), expected ?? ""],
    );
    return n < 0 ? { ok: false } : { ok: true, version: String(n) };
  }
  async version() {
    const v = await (await this.client()).get<number>(`${this.key}:version`);
    return v == null ? null : String(v);
  }
  async bumpDaily() {
    const key = `${this.key}:writes:${new Date().toISOString().slice(0, 10)}`;
    const [n] = await (await this.client()).multi().incr(key).expire(key, 172_800).exec<[number, number]>();
    return n;
  }
}

export class FileStore implements Store {
  constructor(private file: string) {}
  async load(): Promise<Loaded> {
    if (!existsSync(this.file)) return { data: null, version: null };
    try {
      return { data: JSON.parse(readFileSync(this.file, "utf8")) as OfficeData, version: null };
    } catch {
      return { data: null, version: null };
    }
  }
  async save(data: OfficeData): Promise<Saved> {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(data, null, 2));
    return { ok: true, version: null };
  }
}

/**
 * Keeps the office readable if the real store fails (quota, outage): serves this
 * instance's last good copy for 60 s and keeps changes in memory meanwhile. It
 * never invents data: with no copy in memory it reports the outage instead of
 * seeding, and because saves are compare-and-set, a degraded copy can't
 * overwrite the real state once the store is back.
 */
export class ResilientStore implements Store {
  private memory: OfficeData | null = null;
  private downUntil = 0;
  constructor(readonly inner: Store) {}
  private down(e: unknown) {
    console.error(`${this.inner.constructor.name} failed; using memory for 60 s`, e);
    this.downUntil = Date.now() + 60_000;
  }
  private get isDown() {
    return Date.now() < this.downUntil;
  }
  private degraded(): Loaded {
    if (!this.memory) throw new UserError("التخزين مش متاح دلوقتي. جرّب كمان دقيقة.");
    return { data: this.memory, version: null };
  }
  async load(): Promise<Loaded> {
    if (this.isDown) return this.degraded();
    try {
      const r = await this.inner.load();
      if (r.data) this.memory = r.data;
      return r;
    } catch (e) {
      this.down(e);
      return this.degraded();
    }
  }
  async save(data: OfficeData, expected: string | null): Promise<Saved> {
    if (this.isDown) {
      this.memory = data;
      return { ok: true, version: null };
    }
    try {
      const r = await this.inner.save(data, expected);
      if (r.ok) this.memory = data;
      return r;
    } catch (e) {
      this.down(e);
      this.memory = data;
      return { ok: true, version: null };
    }
  }
  async version() {
    if (!this.inner.version || this.isDown) return null;
    try {
      return await this.inner.version();
    } catch (e) {
      this.down(e);
      return null;
    }
  }
  async bumpDaily() {
    if (!this.inner.bumpDaily || this.isDown) return 0;
    try {
      return await this.inner.bumpDaily();
    } catch (e) {
      this.down(e);
      return 0;
    }
  }
}

export function defaultStore(file: string): Store {
  if (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) return new ResilientStore(new RedisStore());
  return new FileStore(file);
}

export function storeName(store: Store): string {
  return store instanceof ResilientStore ? store.inner.constructor.name : store.constructor.name;
}
