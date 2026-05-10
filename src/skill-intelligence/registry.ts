import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import type { SkillMetadata, SkillCondition, SkillRegistryConfig } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_SKILLS_BASE_DIR = path.join(__dirname, '..', 'skills');

interface RegistryErrors {
  missingId: string[];
  missingCategory: string[];
  invalidCategory: string[];
  duplicateIds: string[];
  invalidPriority: string[];
  invalidTokenCost: string[];
  invalidConditions: string[];
}

export class SkillRegistry {
  private static instance: SkillRegistry | null = null;

  private skills: Map<string, SkillMetadata> = new Map();
  private byCategory: Map<string, SkillMetadata[]> = new Map();
  private byTag: Map<string, SkillMetadata[]> = new Map();
  private baseDir: string;
  private initialized = false;

  private constructor(config?: Partial<SkillRegistryConfig>) {
    this.baseDir = config?.skillsBaseDir ?? DEFAULT_SKILLS_BASE_DIR;
  }

  static getInstance(config?: Partial<SkillRegistryConfig>): SkillRegistry {
    if (!SkillRegistry.instance) {
      SkillRegistry.instance = new SkillRegistry(config);
    }
    return SkillRegistry.instance;
  }

  static resetInstance(): void {
    SkillRegistry.instance = null;
  }

  async initialize(): Promise<RegistryErrors> {
    if (this.initialized) {
      return {
        missingId: [],
        missingCategory: [],
        invalidCategory: [],
        duplicateIds: [],
        invalidPriority: [],
        invalidTokenCost: [],
        invalidConditions: [],
      };
    }

    const errors: RegistryErrors = {
      missingId: [],
      missingCategory: [],
      invalidCategory: [],
      duplicateIds: [],
      invalidPriority: [],
      invalidTokenCost: [],
      invalidConditions: [],
    };

    const files = await this.scanDirectory(this.baseDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    for (const filePath of mdFiles) {
      const content = await fs.readFile(filePath, 'utf8');
      const { metadata, contentWithoutFrontmatter } = this.parseFrontmatter(content);

      if (!metadata) continue;

      if (!metadata.id) {
        errors.missingId.push(filePath);
        continue;
      }
      if (!metadata.category) {
        errors.missingCategory.push(filePath);
        continue;
      }
      if (!this.isValidCategory(metadata.category)) {
        errors.invalidCategory.push(filePath);
        continue;
      }
      if (typeof metadata.priority !== 'number' || metadata.priority < 0) {
        errors.invalidPriority.push(filePath);
      }
      if (typeof metadata.tokenCost !== 'number' || metadata.tokenCost < 0) {
        errors.invalidTokenCost.push(filePath);
      }
      if (!this.hasValidConditions(metadata.conditions)) {
        errors.invalidConditions.push(filePath);
      }

      if (this.skills.has(metadata.id)) {
        errors.duplicateIds.push(`${metadata.id} (${filePath})`);
        continue;
      }

      const skill: SkillMetadata = {
        ...metadata,
        id: metadata.id!,
        category: metadata.category,
        tags: metadata.tags || [],
        priority: metadata.priority ?? 0,
        tokenCost: metadata.tokenCost ?? 0,
        filePath,
        content: contentWithoutFrontmatter,
      };

      this.skills.set(metadata.id, skill);
      this.indexByCategory(skill);
      this.indexByTag(skill);
    }

    this.initialized = true;
    return errors;
  }

  private async scanDirectory(dir: string): Promise<string[]> {
    const results: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = await this.scanDirectory(fullPath);
        results.push(...sub);
      } else {
        results.push(fullPath);
      }
    }

    return results;
  }

  private parseFrontmatter(content: string): {
    metadata: Partial<SkillMetadata>;
    contentWithoutFrontmatter: string;
  } {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) {
      return { metadata: {}, contentWithoutFrontmatter: content };
    }

    const frontmatterText = match[1];
    const contentWithoutFrontmatter = content.slice(match[0].length).trimStart();
    const parsed = yaml.load(frontmatterText);

    if (!parsed || typeof parsed !== 'object') {
      return { metadata: {}, contentWithoutFrontmatter };
    }

    const raw = parsed as Record<string, unknown>;
    const metadata: Partial<SkillMetadata> = {
      id: typeof raw.id === 'string' ? raw.id : undefined,
      category: this.isValidCategory(raw.category) ? raw.category : raw.category as any,
      tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
      priority: typeof raw.priority === 'number' ? raw.priority : undefined,
      tokenCost: typeof raw.tokenCost === 'number' ? raw.tokenCost : undefined,
      description: typeof raw.description === 'string' ? raw.description : undefined,
      conditions: this.normalizeConditions(raw.conditions),
    };

    return { metadata, contentWithoutFrontmatter };
  }

  private isValidCategory(value: unknown): value is SkillMetadata['category'] {
    return value === 'auth' || value === 'mcp' || value === 'openapi';
  }

  private normalizeConditions(value: unknown): SkillCondition[] | undefined {
    if (!Array.isArray(value)) return undefined;

    return value
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        field: String(item.field ?? ''),
        operator: item.operator as SkillCondition['operator'],
        value: item.value,
      }));
  }

  private hasValidConditions(conditions: SkillCondition[] | undefined): boolean {
    if (!conditions) return true;
    const operators = new Set<SkillCondition['operator']>([
      'equals',
      'notEquals',
      'contains',
      'gte',
      'lte',
      'gt',
      'lt',
      'regex',
      'exists',
    ]);
    return conditions.every((condition) =>
      Boolean(condition.field) && operators.has(condition.operator)
    );
  }

  private indexByCategory(skill: SkillMetadata): void {
    const list = this.byCategory.get(skill.category) ?? [];
    list.push(skill);
    this.byCategory.set(skill.category, list);
  }

  private indexByTag(skill: SkillMetadata): void {
    for (const tag of skill.tags) {
      const list = this.byTag.get(tag) ?? [];
      list.push(skill);
      this.byTag.set(tag, list);
    }
  }

  getSkill(id: string): SkillMetadata | undefined {
    return this.skills.get(id);
  }

  getSkillsByCategory(category: string): SkillMetadata[] {
    return this.byCategory.get(category) ?? [];
  }

  getSkillsByTag(tag: string): SkillMetadata[] {
    return this.byTag.get(tag) ?? [];
  }

  getAllSkills(): SkillMetadata[] {
    return Array.from(this.skills.values());
  }

  getSkillCount(): number {
    return this.skills.size;
  }
}
