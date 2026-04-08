import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE = new Map<string, string>();

/**
 * SkillRouter handles loading and caching of modular prompt skills
 */
export class SkillRouter {
  // NOTE: __dirname resolves to src/skills/ because skill-router.ts lives there.
  // If this file is ever moved, update baseDir accordingly.
  private static baseDir = __dirname;

  /**
   * Load a skill file content with caching
   * @param relativePath Path relative to src/skills/
   */
  static async getSkill(relativePath: string): Promise<string> {
    const fullPath = path.join(this.baseDir, relativePath);
    
    if (CACHE.has(fullPath)) {
      return CACHE.get(fullPath)!;
    }

    try {
      const content = await fs.readFile(fullPath, 'utf8');
      CACHE.set(fullPath, content);
      return content;
    } catch (error) {
      console.error(`Error loading skill from ${fullPath}:`, error);
      throw new Error(`Failed to load skill: ${relativePath}`);
    }
  }

  /**
   * Resolve and combine multiple skills for MCP generation
   */
  static async assembleMCPSkills(context: { hasAuth: boolean }): Promise<{
    system: string;
    auth: string;
    userMessage: string;
    zodMapping: string;
    requestPatterns: string;
  }> {
    const [system, zodMapping, requestPatterns, auth, userMessage] = await Promise.all([
      this.getSkill('mcp/system.md'),
      this.getSkill('mcp/zod_mapping.md'),
      this.getSkill('mcp/request_patterns.md'),
      context.hasAuth 
        ? this.getSkill('auth/mcp_requirements.md') 
        : this.getSkill('auth/mcp_anti_contamination.md'),
      this.getSkill('mcp/user_message.md')
    ]);

    return { system, auth, userMessage, zodMapping, requestPatterns };
  }

  /**
   * Resolve and combine multiple skills for OpenAPI generation
   */
  static async assembleOpenAPISkills(_context?: { hasAuth: boolean }): Promise<{
    system: string;
    userMessage: string;
    inputFormat: string;
    requirements: string;
    antiContamination: string;
  }> {
    // NOTE: `auth` field intentionally omitted — prompt.ts builds the auth section
    // itself to handle the {{INPUT_FORMAT}} interpolation inside requirements.
    const [system, userMessage, inputFormat, requirements, antiContamination] = await Promise.all([
      this.getSkill('openapi/system.md'),
      this.getSkill('openapi/user_message.md'),
      this.getSkill('auth/input_format.md'),
      this.getSkill('auth/openapi_requirements.md'),
      this.getSkill('auth/openapi_anti_contamination.md')
    ]);

    return { system, userMessage, inputFormat, requirements, antiContamination };
  }
}
