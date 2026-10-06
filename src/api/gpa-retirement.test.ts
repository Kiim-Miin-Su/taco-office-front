import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('GPA Frontend retirement boundary', () => {
  const source = readFileSync(join(__dirname, 'queries.ts'), 'utf8');

  it('keeps the historical ledger GET while removing every handwritten GPA writer and teacher request option', () => {
    expect(source).toMatch(/api\.get<GpaBoard>\('\/gpa'/);
    expect(source).not.toMatch(/api\.(?:post|put|patch|delete)[^\n]*(?:'|`)\/gpa(?:\/|(?:'|`))/);
    expect(source).not.toContain('/teacher/gpa-request-options');
    expect(source).not.toMatch(/export function use(?:CreateGpa|SetGpa|DeleteGpa|PutGpa|CloseGpa)/);
  });
});
