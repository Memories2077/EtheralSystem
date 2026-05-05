import yaml from 'js-yaml';
import type { SpecProfile, AuthScheme } from './types.js';

export class SpecProfileAnalyzer {
  analyzeSpec(specContent: string): SpecProfile {
    let parsed: Record<string, unknown>;

    try {
      parsed = yaml.load(specContent) as Record<string, unknown>;
    } catch {
      return this.emptyProfile();
    }

    if (!parsed || typeof parsed !== 'object') {
      return this.emptyProfile();
    }

    const paths = (parsed['paths'] as Record<string, unknown>) ?? {};
    const components = (parsed['components'] as Record<string, unknown>) ?? {};
    const securitySchemes = (components['securitySchemes'] as Record<string, unknown>) ?? {};
    const info = (parsed['info'] as Record<string, unknown>) ?? {};

    const authTypes = this.extractAuthTypes(securitySchemes);
    const schemes = this.extractAuthSchemes(securitySchemes);
    const endpointCount = this.countEndpoints(paths);
    const pathCount = Object.keys(paths).length;

    const hasFileUpload = this.detectFileUpload(paths);
    const contentTypes = this.extractContentTypes(paths);
    const hasBinaryResponse = contentTypes.some(ct => ct.includes('octet-stream') || ct.includes('image/'));

    const pagination = this.detectPagination(paths);
    const rateLimiting = this.detectRateLimiting(paths);
    const hasFiltering = this.detectFiltering(paths);
    const hasSorting = this.detectSorting(paths);

    const errorFormat = this.detectErrorFormat(paths);
    const hasStandardErrorSchema = this.detectStandardError(parsed);

    const hasStreaming = this.detectStreaming(parsed);
    const hasWebhooks = this.detectWebhooks(parsed);

    const complexityScore = this.calculateComplexity({
      endpointCount,
      authTypes,
      hasFileUpload,
      hasStreaming,
      hasWebhooks,
      pagination,
      rateLimiting,
      hasFiltering,
      hasSorting,
    });

    return {
      auth: {
        types: authTypes,
        hasAuth: authTypes.length > 0,
        schemes,
      },
      structure: {
        endpointCount,
        pathCount,
        hasStreaming,
        hasWebhooks,
      },
      data: {
        hasFileUpload,
        hasBinaryResponse,
        contentTypes,
      },
      patterns: {
        pagination,
        rateLimiting,
        hasFiltering,
        hasSorting,
      },
      errors: {
        format: errorFormat,
        hasStandardErrorSchema,
      },
      guidance: {
        complexityScore,
        recommendedSkills: [],
      },
    };
  }

  private extractAuthTypes(securitySchemes: Record<string, unknown>): string[] {
    const types = new Set<string>();

    for (const [, scheme] of Object.entries(securitySchemes)) {
      if (typeof scheme !== 'object' || !scheme) continue;
      const s = scheme as Record<string, unknown>;
      const type = s['type'] as string;
      if (type) types.add(type);
    }

    return Array.from(types);
  }

  private extractAuthSchemes(securitySchemes: Record<string, unknown>): AuthScheme[] {
    const schemes: AuthScheme[] = [];

    for (const [name, scheme] of Object.entries(securitySchemes)) {
      if (typeof scheme !== 'object' || !scheme) continue;
      const s = scheme as Record<string, unknown>;
      schemes.push({
        type: (s['type'] as string) ?? 'unknown',
        name,
        location: s['in'] as string,
        scheme: s['scheme'] as string,
      });
    }

    return schemes;
  }

  private countEndpoints(paths: Record<string, unknown>): number {
    let count = 0;
    for (const [, methods] of Object.entries(paths)) {
      if (typeof methods !== 'object' || !methods) continue;
      const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];
      for (const method of httpMethods) {
        if (method in (methods as Record<string, unknown>)) count++;
      }
    }
    return count;
  }

  private detectFileUpload(paths: Record<string, unknown>): boolean {
    for (const [, methods] of Object.entries(paths)) {
      if (typeof methods !== 'object' || !methods) continue;
      for (const [, operation] of Object.entries(methods as Record<string, unknown>)) {
        if (typeof operation !== 'object' || !operation) continue;
        const op = operation as Record<string, unknown>;
        const requestBody = op['requestBody'] as Record<string, unknown>;
        if (!requestBody) continue;

        const content = requestBody['content'] as Record<string, unknown>;
        if (!content) continue;

        if (content['multipart/form-data'] || content['application/octet-stream']) {
          return true;
        }
      }
    }
    return false;
  }

  private extractContentTypes(paths: Record<string, unknown>): string[] {
    const types = new Set<string>();

    for (const [, methods] of Object.entries(paths)) {
      if (typeof methods !== 'object' || !methods) continue;
      for (const [, operation] of Object.entries(methods as Record<string, unknown>)) {
        if (typeof operation !== 'object' || !operation) continue;
        const op = operation as Record<string, unknown>;

        const requestBody = op['requestBody'] as Record<string, unknown>;
        if (requestBody) {
          const content = requestBody['content'] as Record<string, unknown>;
          if (content) Object.keys(content).forEach(ct => types.add(ct));
        }

        const responses = op['responses'] as Record<string, unknown>;
        if (responses) {
          for (const [, resp] of Object.entries(responses)) {
            if (typeof resp !== 'object' || !resp) continue;
            const r = resp as Record<string, unknown>;
            const content = r['content'] as Record<string, unknown>;
            if (content) Object.keys(content).forEach(ct => types.add(ct));
          }
        }
      }
    }

    return Array.from(types);
  }

  private detectPagination(paths: Record<string, unknown>): 'offset' | 'cursor' | 'page' | 'none' {
    for (const [, methods] of Object.entries(paths)) {
      if (typeof methods !== 'object' || !methods) continue;
      for (const [, operation] of Object.entries(methods as Record<string, unknown>)) {
        if (typeof operation !== 'object' || !operation) continue;
        const op = operation as Record<string, unknown>;
        const params = (op['parameters'] as Record<string, unknown>[]) ?? [];

        const paramNames = params.map(p => {
          const pObj = p as Record<string, unknown>;
          return (pObj['name'] as string)?.toLowerCase() ?? '';
        });

        if (paramNames.some(n => n === 'cursor' || n === 'after' || n === 'next_token')) {
          return 'cursor';
        }
        if (paramNames.some(n => n === 'page' || n === 'page_number')) {
          return 'page';
        }
        if (paramNames.some(n => n === 'offset' || n === 'skip')) {
          return 'offset';
        }
      }
    }
    return 'none';
  }

  private detectRateLimiting(paths: Record<string, unknown>): boolean {
    for (const [, methods] of Object.entries(paths)) {
      if (typeof methods !== 'object' || !methods) continue;
      for (const [, operation] of Object.entries(methods as Record<string, unknown>)) {
        if (typeof operation !== 'object' || !operation) continue;
        const op = operation as Record<string, unknown>;
        const responses = op['responses'] as Record<string, unknown>;
        if (!responses) continue;

        for (const [code] of Object.entries(responses)) {
          if (code === '429') return true;
        }

        const headers = op['headers'] as Record<string, unknown>;
        if (headers) {
          const headerNames = Object.keys(headers).map(h => h.toLowerCase());
          if (headerNames.some(h => h.includes('rate') || h.includes('x-rate'))) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private detectFiltering(paths: Record<string, unknown>): boolean {
    for (const [, methods] of Object.entries(paths)) {
      if (typeof methods !== 'object' || !methods) continue;
      for (const [, operation] of Object.entries(methods as Record<string, unknown>)) {
        if (typeof operation !== 'object' || !operation) continue;
        const op = operation as Record<string, unknown>;
        const params = (op['parameters'] as Record<string, unknown>[]) ?? [];

        const filterKeywords = ['filter', 'query', 'search', 'q', 'term', 'keyword'];
        for (const p of params) {
          const pObj = p as Record<string, unknown>;
          const name = (pObj['name'] as string)?.toLowerCase() ?? '';
          if (filterKeywords.some(kw => name.includes(kw))) return true;
        }
      }
    }
    return false;
  }

  private detectSorting(paths: Record<string, unknown>): boolean {
    for (const [, methods] of Object.entries(paths)) {
      if (typeof methods !== 'object' || !methods) continue;
      for (const [, operation] of Object.entries(methods as Record<string, unknown>)) {
        if (typeof operation !== 'object' || !operation) continue;
        const op = operation as Record<string, unknown>;
        const params = (op['parameters'] as Record<string, unknown>[]) ?? [];

        const sortKeywords = ['sort', 'order', 'orderby', 'order_by', 'sort_by', 'sortby'];
        for (const p of params) {
          const pObj = p as Record<string, unknown>;
          const name = (pObj['name'] as string)?.toLowerCase() ?? '';
          if (sortKeywords.some(kw => name.includes(kw))) return true;
        }
      }
    }
    return false;
  }

  private detectErrorFormat(paths: Record<string, unknown>): 'json' | 'xml' | 'html' | 'text' | 'unknown' {
    for (const [, methods] of Object.entries(paths)) {
      if (typeof methods !== 'object' || !methods) continue;
      for (const [, operation] of Object.entries(methods as Record<string, unknown>)) {
        if (typeof operation !== 'object' || !operation) continue;
        const op = operation as Record<string, unknown>;
        const responses = op['responses'] as Record<string, unknown>;
        if (!responses) continue;

        for (const [, resp] of Object.entries(responses)) {
          if (typeof resp !== 'object' || !resp) continue;
          const r = resp as Record<string, unknown>;
          const content = r['content'] as Record<string, unknown>;
          if (!content) continue;

          const types = Object.keys(content);
          if (types.some(t => t.includes('json'))) return 'json';
          if (types.some(t => t.includes('xml'))) return 'xml';
          if (types.some(t => t.includes('html'))) return 'html';
          if (types.some(t => t.includes('text'))) return 'text';
        }
      }
    }
    return 'unknown';
  }

  private detectStandardError(parsed: Record<string, unknown>): boolean {
    const components = (parsed['components'] as Record<string, unknown>) ?? {};
    const schemas = (components['schemas'] as Record<string, unknown>) ?? {};

    for (const [, schema] of Object.entries(schemas)) {
      if (typeof schema !== 'object' || !schema) continue;
      const s = schema as Record<string, unknown>;
      const props = (s['properties'] as Record<string, unknown>) ?? {};
      const propNames = Object.keys(props).map(n => n.toLowerCase());

      if (propNames.some(n => n === 'error' || n === 'message' || n === 'code')) {
        return true;
      }
    }
    return false;
  }

  private detectStreaming(parsed: Record<string, unknown>): boolean {
    const paths = (parsed['paths'] as Record<string, unknown>) ?? {};
    for (const [, methods] of Object.entries(paths)) {
      if (typeof methods !== 'object' || !methods) continue;
      for (const [, operation] of Object.entries(methods as Record<string, unknown>)) {
        if (typeof operation !== 'object' || !operation) continue;
        const op = operation as Record<string, unknown>;
        const responses = op['responses'] as Record<string, unknown>;
        if (!responses) continue;

        for (const [, resp] of Object.entries(responses)) {
          if (typeof resp !== 'object' || !resp) continue;
          const r = resp as Record<string, unknown>;
          const content = r['content'] as Record<string, unknown>;
          if (!content) continue;

          const types = Object.keys(content);
          if (types.some(t => t.includes('stream') || t.includes('event-stream'))) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private detectWebhooks(parsed: Record<string, unknown>): boolean {
    return 'webhooks' in parsed || 'x-webhooks' in parsed;
  }

  private calculateComplexity(factors: {
    endpointCount: number;
    authTypes: string[];
    hasFileUpload: boolean;
    hasStreaming: boolean;
    hasWebhooks: boolean;
    pagination: string;
    rateLimiting: boolean;
    hasFiltering: boolean;
    hasSorting: boolean;
  }): number {
    let score = 0;

    // Endpoint count (0-30)
    score += Math.min(factors.endpointCount * 2, 30);

    // Auth complexity (0-20)
    score += factors.authTypes.length * 10;

    // Features (0-50)
    if (factors.hasFileUpload) score += 10;
    if (factors.hasStreaming) score += 15;
    if (factors.hasWebhooks) score += 15;
    if (factors.pagination !== 'none') score += 5;
    if (factors.rateLimiting) score += 5;
    if (factors.hasFiltering) score += 3;
    if (factors.hasSorting) score += 2;

    return Math.min(score, 100);
  }

  private emptyProfile(): SpecProfile {
    return {
      auth: { types: [], hasAuth: false, schemes: [] },
      structure: { endpointCount: 0, pathCount: 0, hasStreaming: false, hasWebhooks: false },
      data: { hasFileUpload: false, hasBinaryResponse: false, contentTypes: [] },
      patterns: { pagination: 'none', rateLimiting: false, hasFiltering: false, hasSorting: false },
      errors: { format: 'unknown', hasStandardErrorSchema: false },
      guidance: { complexityScore: 0, recommendedSkills: [] },
    };
  }
}
