import { describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { validateInputDocFixture } from "./input-doc-format";

const validFixture = `# Research API Input Document
Format-Version: 1
API-ID: fixture-test
Title: Fixture Test
Base-URL: https://api.example.com
Authentication: none
Declared-Endpoint-Count: 1
Safe-Probe-Policy: Safe GET only.

## Endpoint 1: List things
Method: GET
Path: /things
Description: List things.
Request Example:
\`\`\`http
GET /things HTTP/1.1
Host: api.example.com
\`\`\`
Response Example:
\`\`\`json
[{ "id": "thing-1" }]
\`\`\`
Safe Probe: yes.
`;

function tempFixture(contents: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "input-doc-fixture-"));
  const filePath = path.join(dir, "fixture.txt");
  writeFileSync(filePath, contents);
  return filePath;
}

describe("input doc fixture format", () => {
  it("parses a valid fixture", () => {
    const fixture = validateInputDocFixture(tempFixture(validFixture));
    expect(fixture.apiId).toBe("fixture-test");
    expect(fixture.declaredEndpointCount).toBe(1);
    expect(fixture.endpoints[0]?.method).toBe("GET");
    expect(fixture.endpoints[0]?.endpointPath).toBe("/things");
  });

  it("fails when declared endpoint count does not match parsed endpoints", () => {
    const filePath = tempFixture(validFixture.replace("Declared-Endpoint-Count: 1", "Declared-Endpoint-Count: 2"));
    expect(() => validateInputDocFixture(filePath)).toThrow(/declared endpoint count 2/);
  });

  it("fails when request or response examples are missing", () => {
    const filePath = tempFixture(validFixture.replace("GET /things HTTP/1.1\nHost: api.example.com", ""));
    expect(() => validateInputDocFixture(filePath)).toThrow(/missing Request Example/);
  });
});
