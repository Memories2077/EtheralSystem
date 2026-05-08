import crypto from "node:crypto";
import type { CacheEntry, SpecProfile } from "./types.js";

const DEFAULT_MAX_SIZE = 100;
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

export class ProfileCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private hits = 0;
  private misses = 0;

  constructor(maxSize = DEFAULT_MAX_SIZE) {
    this.maxSize = maxSize;
  }

  get(specContent: string): SpecProfile | null {
    const key = this.hashContent(specContent);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    const age = Date.now() - entry.timestamp;
    if (age > CACHE_TTL_MS) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.profile;
  }

  set(specContent: string, profile: SpecProfile): void {
    const key = this.hashContent(specContent);

    if (this.cache.has(key)) {
      this.cache.set(key, { profile, timestamp: Date.now() });
      return;
    }

    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, { profile, timestamp: Date.now() });
  }

  invalidate(specContent: string): void {
    const key = this.hashContent(specContent);
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  size(): number {
    return this.cache.size;
  }

  getStats(): { size: number; hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : this.hits / total,
    };
  }

  private hashContent(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex");
  }
}
