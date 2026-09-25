/** @file-guide
 * 목적: Table.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Table, type Column } from './Table';

afterEach(cleanup);

type Row = { id: number; name: string; late: boolean };
const rows: Row[] = [{ id: 1, name: '정하윤', late: true }, { id: 2, name: '박시온', late: false }];
const columns: Array<Column<Row>> = [{ key: 'n', head: '이름', cell: (r) => r.name }];
const tr = (v: ReturnType<typeof render>, name: string) => v.getByText(name).closest('tr')!;

describe('Table — 줄 바탕(rowClassName · §54 넘길 돈 줄 · §62 지난 줄 · x5)', () => {
  it('주지 않으면 지금 모양 그대로다', () => {
    const v = render(<Table columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(tr(v, '정하윤').className).toBe('border-b border-line last:border-0');
  });

  it('부르는 쪽이 돌려준 클래스만 그 줄에 붙고 undefined 인 줄은 그대로다', () => {
    const v = render(<Table columns={columns} rows={rows} rowKey={(r) => r.id} rowClassName={(r) => (r.late ? 'bg-pink/10' : undefined)} />);
    expect(tr(v, '정하윤').className).toContain('bg-pink/10');
    expect(tr(v, '박시온').className).toBe('border-b border-line last:border-0');
  });
});
