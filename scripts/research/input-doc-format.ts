import fs from "fs";
import path from "path";

export type InputDocEndpoint = {
  index: number;
  title: string;
  method: string;
  endpointPath: string;
  description: string;
  requestExample: string;
  responseExample: string;
  safeProbe: string;
};

export type InputDocFixture = {
  filePath: string;
  formatVersion: string;
  apiId: string;
  title: string;
  baseUrl: string;
  declaredEndpointCount: number;
  safeProbePolicy: string;
  endpoints: InputDocEndpoint[];
};

const REQUIRED_METADATA = [
  "Format-Version",
  "API-ID",
  "Title",
  "Base-URL",
  "Declared-Endpoint-Count",
  "Safe-Probe-Policy",
] as const;

const SECTION_LABELS = [
  "Method",
  "Path",
  "Description",
  "Request Example",
  "Response Example",
  "Safe Probe",
];

function metadataValue(text: string, key: string): string {
  const match = text.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"));
  return match?.[1]?.trim() || "";
}

function sectionField(section: string, label: string): string {
  const labelPattern = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const start = section.search(new RegExp(`^${labelPattern}:\\s*$`, "m"));
  if (start === -1) {
    const inline = section.match(new RegExp(`^${labelPattern}:\\s*(.+?)\\s*$`, "m"));
    return inline?.[1]?.trim() || "";
  }

  const afterLabel = section.slice(start).replace(new RegExp(`^${labelPattern}:\\s*\\r?\\n?`, "m"), "");
  const nextLabel = SECTION_LABELS
    .filter((candidate) => candidate !== label)
    .map((candidate) => candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const next = afterLabel.search(new RegExp(`^(${nextLabel}):`, "m"));
  return (next === -1 ? afterLabel : afterLabel.slice(0, next)).trim();
}

function parseEndpointSections(text: string): InputDocEndpoint[] {
  const matches = [...text.matchAll(/^## Endpoint\s+(\d+):\s*(.+?)\s*$/gm)];
  return matches.map((match, arrayIndex) => {
    const start = match.index || 0;
    const end = matches[arrayIndex + 1]?.index ?? text.length;
    const section = text.slice(start, end);
    return {
      index: Number(match[1]),
      title: match[2].trim(),
      method: sectionField(section, "Method"),
      endpointPath: sectionField(section, "Path"),
      description: sectionField(section, "Description"),
      requestExample: sectionField(section, "Request Example"),
      responseExample: sectionField(section, "Response Example"),
      safeProbe: sectionField(section, "Safe Probe"),
    };
  });
}

function hasRealExample(value: string): boolean {
  const withoutFence = value
    .replace(/```[a-zA-Z0-9_-]*\s*/g, "")
    .replace(/```/g, "")
    .trim();
  return withoutFence.length > 0;
}

export function parseInputDocFixture(filePath: string): InputDocFixture {
  const absolutePath = path.resolve(filePath);
  const text = fs.readFileSync(absolutePath, "utf8");
  const missingMetadata = REQUIRED_METADATA.filter((key) => !metadataValue(text, key));
  if (missingMetadata.length > 0) {
    throw new Error(`${filePath}: missing required metadata fields: ${missingMetadata.join(", ")}`);
  }

  const declaredEndpointCount = Number(metadataValue(text, "Declared-Endpoint-Count"));
  if (!Number.isInteger(declaredEndpointCount) || declaredEndpointCount < 1) {
    throw new Error(`${filePath}: Declared-Endpoint-Count must be a positive integer.`);
  }

  return {
    filePath,
    formatVersion: metadataValue(text, "Format-Version"),
    apiId: metadataValue(text, "API-ID"),
    title: metadataValue(text, "Title"),
    baseUrl: metadataValue(text, "Base-URL"),
    declaredEndpointCount,
    safeProbePolicy: metadataValue(text, "Safe-Probe-Policy"),
    endpoints: parseEndpointSections(text),
  };
}

export function validateInputDocFixture(filePath: string): InputDocFixture {
  const fixture = parseInputDocFixture(filePath);
  const errors: string[] = [];

  if (!/^https?:\/\//.test(fixture.baseUrl)) {
    errors.push(`Base-URL must be an absolute HTTP(S) URL.`);
  }
  if (fixture.endpoints.length !== fixture.declaredEndpointCount) {
    errors.push(`declared endpoint count ${fixture.declaredEndpointCount} does not match parsed endpoint sections ${fixture.endpoints.length}.`);
  }

  for (const endpoint of fixture.endpoints) {
    const prefix = `Endpoint ${endpoint.index} (${endpoint.title})`;
    if (!endpoint.method) errors.push(`${prefix}: missing Method.`);
    if (!endpoint.endpointPath) errors.push(`${prefix}: missing Path.`);
    if (!endpoint.description) errors.push(`${prefix}: missing Description.`);
    if (!hasRealExample(endpoint.requestExample)) errors.push(`${prefix}: missing Request Example.`);
    if (!hasRealExample(endpoint.responseExample)) errors.push(`${prefix}: missing Response Example.`);
    if (!endpoint.safeProbe) errors.push(`${prefix}: missing Safe Probe note.`);
  }

  if (errors.length > 0) {
    throw new Error(`${filePath}: invalid input fixture:\n- ${errors.join("\n- ")}`);
  }

  return fixture;
}
