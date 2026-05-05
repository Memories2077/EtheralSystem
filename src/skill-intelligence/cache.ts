import crypto from 'node:crypto';
import type { CacheEntry, SpecProfile } from './types.js';

const DEFAULT_MAX_SIZE = 100;
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

export class ProfileCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;

  constructor(maxSize = DEFAULT_MAX_SIZE) {
    this.maxSize = maxSize;
  }

  get(specContent: string): SpecProfile | null {
    const key = this.hashContent(specContent);
    const entry = this.cache.get(key);

    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }

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
  }

  size(): number {
    return this.cache.size;
  }

  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
