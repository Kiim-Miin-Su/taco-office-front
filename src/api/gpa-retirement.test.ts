/** @file-guide
 * 목적: GPA Front 퇴역 경계가 역사 GET만 남기고 수기 writer·강사 요청 옵션을 다시 만들지 않는지 검사한다.
 * 책임/재사용: queries.ts의 endpoint 경계만 검증하며 생성 OpenAPI·Backend·DB 퇴역은 후속 단계가 소유한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
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
