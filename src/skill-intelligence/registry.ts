import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SkillMetadata, SkillCondition, SkillRegistryConfig } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_SKILLS_BASE_DIR = path.join(__dirname, '..', 'skills');

interface RegistryErrors {
  missingId: string[];
  missingCategory: string[];
  duplicateIds: string[];
  invalidPriority: string[];
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
      return { missingId: [], missingCategory: [], duplicateIds: [], invalidPriority: [] };
    }

    const errors: RegistryErrors = {
      missingId: [],
      missingCategory: [],
      duplicateIds: [],
      invalidPriority: [],
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
      if (typeof metadata.priority !== 'number' || metadata.priority < 0) {
        errors.invalidPriority.push(filePath);
      }

      if (this.skills.has(metadata.id)) {
        errors.duplicateIds.push(`${metadata.id} (${filePath})`);
        continue;
      }

      const skill: SkillMetadata = {
        ...metadata,
        id: metadata.id!,
        category: metadata.category as SkillMetadata['category'],
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
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
      return { metadata: {}, contentWithoutFrontmatter: content };
    }

    const frontmatterText = match[1];
    const contentWithoutFrontmatter = content.slice(match[0].length).trimStart();
    const metadata: Partial<SkillMetadata> = {};

    for (const line of frontmatterText.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const key = line.slice(0, colonIdx).trim();
      let value: any = line.slice(colonIdx + 1).trim();

      // Remove leading/trailing quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      // Parse arrays: [tag1, tag2]
      if (value.startsWith('[') && value.endsWith(']')) {
        const inner = value.slice(1, -1).trim();
        value = inner ? inner.split(',').map((s: string) => s.trim().replace(/^["']|["']$/g, '')) : [];
      }

      // Parse numbers
      if (/^\d+$/.test(value as string)) {
        value = Number(value);
      }

      // Parse conditions array of objects
      if (key === 'conditions' && typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch {
          // leave as-is
        }
      }

      (metadata as Record<string, unknown>)[key] = value;
    }

    // Parse conditions from separate lines if in YAML-style
    if (match[1].includes('conditions:') && !metadata.conditions) {
      metadata.conditions = this.parseConditions(frontmatterText);
    }

    return { metadata, contentWithoutFrontmatter };
  }

  private parseConditions(text: string): SkillCondition[] {
    const conditions: SkillCondition[] = [];
    const lines = text.split('\n');
    let inConditions = false;

    for (const line of lines) {
      if (line.trim().startsWith('conditions:')) {
        inConditions = true;
        continue;
      }
      if (inConditions) {
        const trimmed = line.trim();
        if (!trimmed || (!trimmed.startsWith('-') && !trimmed.startsWith('  '))) break;

        const condMatch = trimmed.match(/-\s*field:\s*(\S+)\s+operator:\s*(\S+)\s+value:\s*(.+)/);
        if (condMatch) {
          conditions.push({
            field: condMatch[1],
            operator: condMatch[2] as SkillCondition['operator'],
            value: condMatch[3].replace(/^["']|["']$/g, ''),
          });
        }
      }
    }

    return conditions;
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
