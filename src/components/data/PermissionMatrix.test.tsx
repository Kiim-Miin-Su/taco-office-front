/** @file-guide
 * 목적: PermissionMatrix.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cleanup, render, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { PermissionRow, PermissionTable } from '@/api/types';
import { PermissionMatrix } from './PermissionMatrix';

/**
 * §76 — 줄 · 「지금」 · 역할 설명은 서버(`GET /permissions` · N-98)가 준 그대로 그린다. 화면은 세지도 판정하지도 않는다.
 * 픽스처는 서버 응답 모양이다(회계 권한이 꺼진 매니저 — 사람별 예외 N-68).
 */
const line = (key: string, feature: string, what: string, who: string, allowed: boolean): PermissionRow => ({
  key, feature, what, who, perm: 'canMoney', allowed,
});
const table: PermissionTable = {
  roleLabel: '매니저', possible: 12, locked: 2,
  sub: '지금 매니저 화면입니다 · 12가지 가능 / 2가지 잠김',
  rows: [
    line('money-tab', '회계 탭 전체', '매출 · 수납 · 지출 · 정산 화면', '회계 권한', false),
    line('payment', '입금 처리', '받은 돈으로 확정하기', '매니저 이상', true),
    line('consulting-fee', '컨설팅비 보기', '고액 계약 금액', '회계 권한', false),
    line('gpapack', '자료 요청 접수', '시험 대비 · 자습 자료', '자료 요청 권한', true),
  ],
  roleNotes: [
    '대표 · 14가지 가능 / 0가지 잠김', '관리자 · 14가지 가능 / 0가지 잠김',
    '매니저 · 14가지 가능 / 0가지 잠김', '강사 · 0가지 가능 / 14가지 잠김',
  ],
};
afterEach(cleanup);

it('줄과 「지금」은 서버가 준 allowed 그대로다 — 화면이 권한 깃발을 다시 읽지 않는다', () => {
  const view = render(<PermissionMatrix table={table} />);
  expect(view.getAllByRole('row')).toHaveLength(5);
  expect(within(view.getByText('회계 탭 전체').closest('tr')!).getByText('잠김')).toBeTruthy();
  expect(within(view.getByText('입금 처리').closest('tr')!).getByText('✓ 가능')).toBeTruthy();
  view.rerender(<PermissionMatrix table={{ ...table, rows: table.rows.map((r) => ({ ...r, allowed: true })) }} />);
  expect(within(view.getByText('회계 탭 전체').closest('tr')!).getByText('✓ 가능')).toBeTruthy();
});

/* g2 대조 76-2 — 원문 「무엇인가 · 누가 · 지금」 은 가운데 정렬, 「누가」 칩은 색을 채운다 (칩 **낱말**은 의도적 차이 — 권한 깃발 이름) */
it('무엇인가 · 누가 · 지금은 가운데 정렬이고 누가 칩은 색을 채운다', () => {
  const view = render(<PermissionMatrix table={table} />);
  const heads = view.getAllByRole('columnheader');
  expect(heads.map((h) => h.className.includes('text-center'))).toEqual([false, true, true, true]);
  const row = view.getByText('입금 처리').closest('tr')!;
  const cells = within(row).getAllByRole('cell');
  expect(cells.slice(1).every((c) => c.className.includes('text-center'))).toBe(true);
  expect(within(row).getByText('매니저 이상').className).toContain('text-white');
});

/* 원문 §76 초록 상자 — 첫 줄(역할 전환)은 빼고 역할 줄은 서버 문장 그대로 · 옛 직함 낱말 없음 (N-98) */
it('역할 설명 상자는 서버 문장 네 줄의 점 목록이고 역할 전환 줄과 옛 직함 낱말이 없다', () => {
  const view = render(<PermissionMatrix table={table} />);
  const items = view.getAllByRole('listitem').map((li) => li.textContent);
  expect(items).toEqual(table.roleNotes);
  const text = view.container.textContent ?? '';
  expect(text).not.toContain('상단 오른쪽에서 바꿉니다');
  expect(text).not.toMatch(/교수실장|상담실장|코디네이터|이사/);
  // 부제는 창 머리의 몫이다 — 표 위 첫 줄로 다시 적지 않는다 (W11 7-3)
  expect(text).not.toContain(table.sub);
});

it('읽는 중 · 읽지 못함은 표 대신 한 줄로 말한다 — 모르는 것을 「잠김」으로 그리지 않는다', () => {
  const view = render(<PermissionMatrix table={undefined} loading />);
  expect(view.getByText('읽는 중…')).toBeTruthy();
  expect(view.queryByText('잠김')).toBeNull();
  view.rerender(<PermissionMatrix table={undefined} error={new Error('네트워크 오류')} />);
  expect(view.queryByRole('table')).toBeNull();
  expect(view.container.textContent).not.toBe('');
});
