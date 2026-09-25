/** @file-guide
 * 목적: PermissionMatrix.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cleanup, render, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { Me } from '@/api/types';
import { PermissionMatrix } from './PermissionMatrix';

const manager: Me = {
  id: 3, name: '담당자', role: 'manager', roleLabel: '매니저', title: null, canAdminPage: true,
  canCrudAll: true, canSeeProfit: false, canCrudAttendance: true, canMoney: false,
  canWage: false, canApprove: false, canHide: false, canGpaPack: false,
};
afterEach(cleanup);

it('원본 14개 기능과 서버 최종 플래그를 표시한다', () => {
  const view = render(<PermissionMatrix me={manager} />);
  expect(view.getAllByRole('row')).toHaveLength(15);
  expect(within(view.getByText('회계 탭 전체').closest('tr')!).getByText('잠김')).toBeTruthy();
  expect(within(view.getByText('입금 처리').closest('tr')!).getByText('✓ 가능')).toBeTruthy();
  view.rerender(<PermissionMatrix me={{ ...manager, canMoney: true }} />);
  expect(within(view.getByText('회계 탭 전체').closest('tr')!).getByText('✓ 가능')).toBeTruthy();
});

it('인증 정보가 없으면 모든 기능을 잠그고 강사 출결을 읽기 전용으로 설명한다', () => {
  const view = render(<PermissionMatrix me={null} />);
  expect(view.getAllByText('잠김')).toHaveLength(14);
  expect(view.queryByText('✓ 가능')).toBeNull();
  expect(view.getByText(/자기 수업 출결을 조회만/)).toBeTruthy();
});

/* g2 대조 76-2 — 원문 「무엇인가 · 누가 · 지금」 은 가운데 정렬, 「누가」 칩은 색 채움이다 (칩 **낱말**은 의도적 차이 — 권한 깃발 이름) */
it('무엇인가 · 누가 · 지금은 가운데 정렬이고 누가 칩은 색을 채운다', () => {
  const view = render(<PermissionMatrix me={manager} />);
  const heads = view.getAllByRole('columnheader');
  expect(heads.map((h) => h.className.includes('text-center'))).toEqual([false, true, true, true]);
  const row = view.getByText('입금 처리').closest('tr')!;
  const cells = within(row).getAllByRole('cell');
  expect(cells.slice(1).every((c) => c.className.includes('text-center'))).toBe(true);
  expect(within(row).getByText('매니저 이상').className).toContain('text-white');
});

/* g2 대조 76-4 — 원문 부제 「지금 대표 화면입니다 · 대표 전용 12가지 · …까지 2가지」 의 모양(D-R44).
   등급별 수는 지금 권한 모형(매니저에게도 모든 권한 · 사람별 예외)과 맞지 않아 이 계정의 가능/잠김 수를 잇는다.
   역할 이름은 서버 낱말(`Me.roleLabel`)이다 — 화면이 역할 코드를 번역하지 않는다 */
it('부제는 「지금 {역할} 화면입니다 · N가지 가능 / M가지 잠김」 이다', () => {
  const view = render(<PermissionMatrix me={manager} />);
  const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
  // 매니저 픽스처: 입금 처리 · 청구서 · 마케팅 코멘트(canCrudAll) 셋만 가능
  expect(text).toContain('지금 매니저 화면입니다 · 3가지 가능 / 11가지 잠김');
  expect(text).not.toContain('교수실장');
  const none = render(<PermissionMatrix me={null} />);
  expect((none.container.textContent ?? '').replace(/\s+/g, ' ')).toContain('로그인 정보가 없습니다 · 0가지 가능 / 14가지 잠김');
});
