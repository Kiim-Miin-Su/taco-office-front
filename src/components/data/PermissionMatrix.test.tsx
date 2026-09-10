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
  id: 3, name: '담당자', role: 'manager', title: null, canAdminPage: true,
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
