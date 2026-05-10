import yaml from 'js-yaml';
import type { SpecProfile, AuthScheme } from './types.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

export class SpecProfileAnalyzer {
  analyzeSpec(input: string): SpecProfile {
    const parsed = this.tryParseObject(input);
    if (parsed && this.looksLikeOpenApi(parsed)) {
      return this.analyzeOpenApiSpec(parsed);
    }

    return this.analyzeEndpointDescription(input);
  }

  analyzeOpenApiSpec(spec: string | Record<string, unknown>): SpecProfile {
    const parsed = typeof spec === 'string' ? this.tryParseObject(spec) : spec;
    if (!parsed || !this.looksLikeOpenApi(parsed)) {
      return this.emptyProfile('unknown', 0);
    }

    const paths = (parsed.paths as Record<string, unknown>) ?? {};
    const components = (parsed.components as Record<string, unknown>) ?? {};
    const securitySchemes = (components.securitySchemes as Record<string, unknown>) ?? {};

    const schemes = this.extractAuthSchemes(securitySchemes, parsed, paths);
    const authTypes = [...new Set(schemes.map((scheme) => scheme.type))];
    const endpointCount = this.countEndpoints(paths);
    const pathCount = Object.keys(paths).length;

    const contentTypes = this.extractContentTypes(paths);
    const multipart = contentTypes.includes('multipart/form-data');
    const formUrlEncoded = contentTypes.includes('application/x-www-form-urlencoded');
    const hasFileUpload = multipart || contentTypes.includes('application/octet-stream');
    const hasBinaryResponse = contentTypes.some((ct) => ct.includes('octet-stream') || ct.includes('image/'));
    const requestBodies = this.detectRequestBodies(paths);

    const pagination = this.detectPagination(paths);
    const rateLimiting = this.detectRateLimiting(paths);
    const hasFiltering = this.detectFiltering(paths);
    const hasSorting = this.detectSorting(paths);

    const hasStreaming = this.detectStreaming(parsed);
    const hasWebhooks = this.detectWebhooks(parsed);
    const errorFormat = this.detectErrorFormat(paths);
    const hasStandardErrorSchema = this.detectStandardError(parsed);

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
      requestBodies,
    });

    return {
      source: 'openapi',
      auth: {
        types: authTypes,
        hasAuth: schemes.length > 0,
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
      features: {
        formUrlEncoded,
        multipart,
        requestBodies,
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
      confidence: {
        auth: schemes.length > 0 ? 0.95 : 0.85,
        pagination: pagination === 'none' ? 0.7 : 0.9,
        overall: 0.9,
      },
    };
  }

  analyzeEndpointDescription(input: string): SpecProfile {
    const text = input || '';
    const endpointCount = this.countEndpointMentions(text);
    const auth = this.detectAuthFromText(text);
    const pagination = this.detectPaginationFromText(text);
    const contentTypes = this.detectContentTypesFromText(text);
    const multipart = contentTypes.includes('multipart/form-data');
    const formUrlEncoded = contentTypes.includes('application/x-www-form-urlencoded');
    const hasFileUpload = multipart || /\b(file upload|upload file|attachment|multipart)\b/i.test(text);
    const requestBodies = /\b(body|payload|json|form data|post|put|patch)\b/i.test(text);
    const rateLimiting = /\b(rate limit|429|retry-after|x-ratelimit)\b/i.test(text);
    const hasFiltering = /\b(filter|search|query|q=)\b/i.test(text);
    const hasSorting = /\b(sort|order_by|sort_by|orderby)\b/i.test(text);
    const hasStreaming = /\b(stream|server-sent events|event-stream|sse)\b/i.test(text);
    const hasWebhooks = /\b(webhook|callback)\b/i.test(text);

    const complexityScore = this.calculateComplexity({
      endpointCount,
      authTypes: auth.types,
      hasFileUpload,
      hasStreaming,
      hasWebhooks,
      pagination: pagination.type,
      rateLimiting,
      hasFiltering,
      hasSorting,
      requestBodies,
    });

    return {
      source: 'endpoint_text',
      auth: {
        types: auth.types,
        hasAuth: auth.types.length > 0,
        schemes: auth.schemes,
      },
      structure: {
        endpointCount,
        pathCount: endpointCount,
        hasStreaming,
        hasWebhooks,
      },
      data: {
        hasFileUpload,
        hasBinaryResponse: /\b(binary|image|pdf|octet-stream)\b/i.test(text),
        contentTypes,
      },
      features: {
        formUrlEncoded,
        multipart,
        requestBodies,
      },
      patterns: {
        pagination: pagination.type,
        rateLimiting,
        hasFiltering,
        hasSorting,
      },
      errors: {
        format: /\bxml\b/i.test(text) ? 'xml' : /\bhtml\b/i.test(text) ? 'html' : 'json',
        hasStandardErrorSchema: /\b(error response|error code|error message)\b/i.test(text),
      },
      guidance: {
        complexityScore,
        recommendedSkills: [],
      },
      confidence: {
        auth: auth.confidence,
        pagination: pagination.confidence,
        overall: endpointCount > 0 ? 0.65 : 0.35,
      },
    };
  }

  private tryParseObject(input: string): Record<string, unknown> | null {
    try {
      const parsed = yaml.load(input);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private looksLikeOpenApi(parsed: Record<string, unknown>): boolean {
    return Boolean(parsed.openapi || parsed.swagger || parsed.paths);
  }

  private extractAuthSchemes(
    securitySchemes: Record<string, unknown>,
    parsed: Record<string, unknown>,
    paths: Record<string, unknown>,
  ): AuthScheme[] {
    const schemes: AuthScheme[] = [];

    for (const [name, scheme] of Object.entries(securitySchemes)) {
      if (typeof scheme !== 'object' || !scheme) continue;
      const s = scheme as Record<string, unknown>;
      schemes.push({
        type: (s.type as string) ?? 'unknown',
        name,
        location: s.in as string,
        scheme: s.scheme as string,
      });
    }

    const declaredNames = new Set(schemes.map((scheme) => scheme.name));
    for (const name of this.extractSecurityRequirementNames(parsed, paths)) {
      if (!declaredNames.has(name)) {
        schemes.push({ type: 'unknown', name });
      }
    }

    return schemes;
  }

  private extractSecurityRequirementNames(
    parsed: Record<string, unknown>,
    paths: Record<string, unknown>,
  ): string[] {
    const names = new Set<string>();
    this.collectSecurityNames(parsed.security, names);

    for (const methods of Object.values(paths)) {
      if (typeof methods !== 'object' || !methods) continue;
      for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
        if (!HTTP_METHODS.includes(method.toLowerCase())) continue;
        if (typeof operation !== 'object' || !operation) continue;
        this.collectSecurityNames((operation as Record<string, unknown>).security, names);
      }
    }

    return [...names];
  }

  private collectSecurityNames(value: unknown, names: Set<string>): void {
    if (!Array.isArray(value)) return;
    for (const entry of value) {
      if (!entry || typeof entry !== 'object') continue;
      for (const name of Object.keys(entry)) names.add(name);
    }
  }

  private countEndpoints(paths: Record<string, unknown>): number {
    let count = 0;
    for (const methods of Object.values(paths)) {
      if (typeof methods !== 'object' || !methods) continue;
      for (const method of HTTP_METHODS) {
        if (method in (methods as Record<string, unknown>)) count++;
      }
    }
    return count;
  }

  private countEndpointMentions(text: string): number {
    const methodPathMatches = text.match(/\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\/[^\s`"']+/gi) ?? [];
    if (methodPathMatches.length > 0) return methodPathMatches.length;

    const pathMatches = text.match(/\/[a-z0-9][a-z0-9_\-/{}/.:?=&%]*/gi) ?? [];
    return pathMatches.length;
  }

  private extractContentTypes(paths: Record<string, unknown>): string[] {
    const types = new Set<string>();

    for (const methods of Object.values(paths)) {
      if (typeof methods !== 'object' || !methods) continue;
      for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
        if (!HTTP_METHODS.includes(method.toLowerCase())) continue;
        if (typeof operation !== 'object' || !operation) continue;
        const op = operation as Record<string, unknown>;

        const requestBody = op.requestBody as Record<string, unknown>;
        if (requestBody) {
          const content = requestBody.content as Record<string, unknown>;
          if (content) Object.keys(content).forEach((ct) => types.add(ct));
        }

        const responses = op.responses as Record<string, unknown>;
        if (responses) {
          for (const resp of Object.values(responses)) {
            if (typeof resp !== 'object' || !resp) continue;
            const content = (resp as Record<string, unknown>).content as Record<string, unknown>;
            if (content) Object.keys(content).forEach((ct) => types.add(ct));
          }
        }
      }
    }

    return [...types];
  }

  private detectContentTypesFromText(text: string): string[] {
    const types = new Set<string>();
    const known = [
      'application/json',
      'application/x-www-form-urlencoded',
      'multipart/form-data',
      'application/octet-stream',
      'text/event-stream',
      'application/xml',
      'text/xml',
      'text/plain',
    ];
    for (const type of known) {
      if (text.toLowerCase().includes(type)) types.add(type);
    }
    if (/\bjson\b/i.test(text)) types.add('application/json');
    if (/\bform[- ]?urlencoded\b/i.test(text)) types.add('application/x-www-form-urlencoded');
    if (/\bmultipart|form data\b/i.test(text)) types.add('multipart/form-data');
    return [...types];
  }

  private detectRequestBodies(paths: Record<string, unknown>): boolean {
    for (const methods of Object.values(paths)) {
      if (typeof methods !== 'object' || !methods) continue;
      for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
        if (!HTTP_METHODS.includes(method.toLowerCase())) continue;
        if (typeof operation === 'object' && operation && 'requestBody' in operation) return true;
      }
    }
    return false;
  }

  private detectPagination(paths: Record<string, unknown>): 'offset' | 'cursor' | 'page' | 'none' {
    for (const methods of Object.values(paths)) {
      if (typeof methods !== 'object' || !methods) continue;
      for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
        if (!HTTP_METHODS.includes(method.toLowerCase())) continue;
        if (typeof operation !== 'object' || !operation) continue;
        const params = ((operation as Record<string, unknown>).parameters as Record<string, unknown>[]) ?? [];
        const names = params.map((p) => String(p?.name ?? '').toLowerCase());

        if (names.some((n) => ['cursor', 'after', 'before', 'next_token', 'nextToken'].map((v) => v.toLowerCase()).includes(n))) return 'cursor';
        if (names.some((n) => ['page', 'page_number', 'pageNumber', 'per_page'].map((v) => v.toLowerCase()).includes(n))) return 'page';
        if (names.some((n) => ['offset', 'skip', 'start'].includes(n))) return 'offset';
      }
    }
    return 'none';
  }

  private detectPaginationFromText(text: string): { type: 'offset' | 'cursor' | 'page' | 'none'; confidence: number } {
    if (/\b(cursor|next_token|next token|after|before)\b/i.test(text)) return { type: 'cursor', confidence: 0.75 };
    if (/\b(page|per_page|page_size|page number)\b/i.test(text)) return { type: 'page', confidence: 0.7 };
    if (/\b(offset|skip|limit)\b/i.test(text)) return { type: 'offset', confidence: 0.65 };
    return { type: 'none', confidence: 0.55 };
  }

  private detectRateLimiting(paths: Record<string, unknown>): boolean {
    for (const methods of Object.values(paths)) {
      if (typeof methods !== 'object' || !methods) continue;
      for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
        if (!HTTP_METHODS.includes(method.toLowerCase())) continue;
        if (typeof operation !== 'object' || !operation) continue;
        const op = operation as Record<string, unknown>;
        const responses = op.responses as Record<string, unknown>;
        if (responses && Object.keys(responses).includes('429')) return true;

        const headers = op.headers as Record<string, unknown>;
        if (headers) {
          const headerNames = Object.keys(headers).map((h) => h.toLowerCase());
          if (headerNames.some((h) => h.includes('rate') || h.includes('retry-after'))) return true;
        }
      }
    }
    return false;
  }

  private detectFiltering(paths: Record<string, unknown>): boolean {
    return this.hasParameterName(paths, ['filter', 'query', 'search', 'q', 'term', 'keyword']);
  }

  private detectSorting(paths: Record<string, unknown>): boolean {
    return this.hasParameterName(paths, ['sort', 'order', 'orderby', 'order_by', 'sort_by', 'sortby']);
  }

  private hasParameterName(paths: Record<string, unknown>, keywords: string[]): boolean {
    for (const methods of Object.values(paths)) {
      if (typeof methods !== 'object' || !methods) continue;
      for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
        if (!HTTP_METHODS.includes(method.toLowerCase())) continue;
        if (typeof operation !== 'object' || !operation) continue;
        const params = ((operation as Record<string, unknown>).parameters as Record<string, unknown>[]) ?? [];
        for (const p of params) {
          const name = String(p?.name ?? '').toLowerCase();
          if (keywords.some((kw) => name.includes(kw))) return true;
        }
      }
    }
    return false;
  }

  private detectErrorFormat(paths: Record<string, unknown>): 'json' | 'xml' | 'html' | 'text' | 'unknown' {
    const types = this.extractContentTypes(paths);
    if (types.some((t) => t.includes('json'))) return 'json';
    if (types.some((t) => t.includes('xml'))) return 'xml';
    if (types.some((t) => t.includes('html'))) return 'html';
    if (types.some((t) => t.includes('text'))) return 'text';
    return 'unknown';
  }

  private detectStandardError(parsed: Record<string, unknown>): boolean {
    const components = (parsed.components as Record<string, unknown>) ?? {};
    const schemas = (components.schemas as Record<string, unknown>) ?? {};

    for (const schema of Object.values(schemas)) {
      if (typeof schema !== 'object' || !schema) continue;
      const props = ((schema as Record<string, unknown>).properties as Record<string, unknown>) ?? {};
      const names = Object.keys(props).map((name) => name.toLowerCase());
      if (names.some((name) => name === 'error' || name === 'message' || name === 'code')) return true;
    }
    return false;
  }

  private detectStreaming(parsed: Record<string, unknown>): boolean {
    return this.extractContentTypes((parsed.paths as Record<string, unknown>) ?? {}).some(
      (type) => type.includes('stream') || type.includes('event-stream'),
    );
  }

  private detectWebhooks(parsed: Record<string, unknown>): boolean {
    return 'webhooks' in parsed || 'x-webhooks' in parsed || 'callbacks' in parsed;
  }

  private detectAuthFromText(text: string): { types: string[]; schemes: AuthScheme[]; confidence: number } {
    const schemes: AuthScheme[] = [];
    const add = (type: string, name: string, location?: string, scheme?: string) => {
      if (!schemes.some((existing) => existing.type === type && existing.name === name)) {
        schemes.push({ type, name, location, scheme });
      }
    };

    if (/\boauth2?\b|\bauthorization code\b|\bclient credentials\b|\bgrant_type\b/i.test(text)) {
      add('oauth2', 'oauth2');
    }
    if (/\bbearer\b|\baccess[_ -]?token\b|\bjwt\b|\bAuthorization:\s*Bearer\b/i.test(text)) {
      add('http', 'bearerAuth', 'header', 'bearer');
    }
    if (/\bapi[_ -]?key\b|\bx-api-key\b/i.test(text)) {
      add('apiKey', 'apiKeyAuth', /\bquery\b/i.test(text) ? 'query' : 'header');
    }
    if (/\bbasic auth\b|--user\s+|Authorization:\s*Basic\b/i.test(text)) {
      add('http', 'basicAuth', 'header', 'basic');
    }

    return {
      types: [...new Set(schemes.map((scheme) => scheme.type))],
      schemes,
      confidence: schemes.length > 0 ? 0.75 : 0.6,
    };
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
    requestBodies: boolean;
  }): number {
    let score = 0;
    score += Math.min(factors.endpointCount * 2, 30);
    score += factors.authTypes.length * 10;
    if (factors.requestBodies) score += 8;
    if (factors.hasFileUpload) score += 10;
    if (factors.hasStreaming) score += 15;
    if (factors.hasWebhooks) score += 15;
    if (factors.pagination !== 'none') score += 5;
    if (factors.rateLimiting) score += 5;
    if (factors.hasFiltering) score += 3;
    if (factors.hasSorting) score += 2;
    return Math.min(score, 100);
  }

  private emptyProfile(source: SpecProfile['source'], confidence: number): SpecProfile {
    return {
      source,
      auth: { types: [], hasAuth: false, schemes: [] },
      structure: { endpointCount: 0, pathCount: 0, hasStreaming: false, hasWebhooks: false },
      data: { hasFileUpload: false, hasBinaryResponse: false, contentTypes: [] },
      features: { formUrlEncoded: false, multipart: false, requestBodies: false },
      patterns: { pagination: 'none', rateLimiting: false, hasFiltering: false, hasSorting: false },
      errors: { format: 'unknown', hasStandardErrorSchema: false },
      guidance: { complexityScore: 0, recommendedSkills: [] },
      confidence: { auth: confidence, pagination: confidence, overall: confidence },
    };
  }
}
