/** @file-guide
 * 목적: staff-directory-csv.test.ts — Excel용 CSV 인코딩·수식 주입·민감열 누출 회귀.
 * 책임/재사용: 서버가 준 행 타입으로 실제 내보내기 문자열을 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { describe, expect, it } from 'vitest';
import type { components } from '@/api/schema';
import { staffDirectoryCsv } from './staff-directory-csv';

type Row = components['schemas']['StaffDirectoryRowDto'];

describe('강사 Excel용 CSV', () => {
  it('한글 BOM·CRLF와 따옴표/개행 이스케이프, 수식 시작 문자를 처리한다', () => {
    const row: Row = {
      id: 9, name: '=SUM(1,2)', englishName: '  +HACK', title: '강사 "가"\nA', active: true,
      hiredOn: '2026-09-30', createdAt: '2026-09-30T12:00:00+09:00',
    };
    const csv = staffDirectoryCsv([row]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"\'=SUM(1,2)"');
    expect(csv).toContain('"\'  +HACK"');
    expect(csv).toContain('"강사 ""가""\nA"');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('API 행에 부가 민감값이 실수로 붙어도 허용한 열만 내보낸다', () => {
    const row = {
      id: 1, name: '김강사', englishName: null, title: null, active: false,
      hiredOn: null, createdAt: '2026-09-30T12:00:00+09:00',
      email: 'private@example.test', phone: '01012345678', bankAccount: '123-123', wageRate: 45000,
    } as Row;
    const csv = staffDirectoryCsv([row]);
    expect(csv).toContain('김강사');
    for (const value of ['private@example.test', '01012345678', '123-123', '45000']) expect(csv).not.toContain(value);
  });

  it('탭과 개행 뒤 수식 문자열을 셀 텍스트로 고정한다', () => {
    const base: Row = { id: 2, name: '\t=1+1', englishName: '\r@SUM(A1)', title: null, active: true, hiredOn: null, createdAt: '2026-09-30' };
    const csv = staffDirectoryCsv([base]);
    expect(csv).toContain('"\'\t=1+1"');
    expect(csv).toContain('"\'\r@SUM(A1)"');
  });
});
