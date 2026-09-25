/** @file-guide
 * 목적: LateReportPolicy.test.tsx (test)
 * 책임/재사용: 기존 대상 컴포넌트를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import { LATE_TIERS_FIXTURE } from './late-tiers.fixture';
import { LateReportPolicy } from './LateReportPolicy';

const meta = vi.hoisted(() => ({ tiers: [] as unknown[], enabled: [] as boolean[] }));
vi.mock('@/api/queries', () => ({
  useMeta: (enabled: boolean) => {
    meta.enabled.push(enabled);
    return { data: enabled ? { lateReportTiers: meta.tiers } : undefined };
  },
}));

const me = (canAdminPage: boolean) =>
  ({ id: 5, name: '강사', role: canAdminPage ? 'manager' : 'teacher', canAdminPage, canCrudAll: canAdminPage }) as unknown as Me;

describe('LateReportPolicy — 리포트 지각 제출 차감 안내 (대표 지시 2026-09-25)', () => {
  afterEach(() => { cleanup(); useSession.setState({ me: null, ready: false }); meta.enabled.length = 0; meta.tiers = LATE_TIERS_FIXTURE; });
  meta.tiers = LATE_TIERS_FIXTURE;

  it('강사로 로그인하면 1시간 지각 5,000원 · 4시간 이후 10,000원 차감을 적는다', () => {
    useSession.setState({ me: me(false), ready: true });
    const view = render(<LateReportPolicy />);
    const note = view.getByRole('note', { name: '리포트 지각 제출 차감' });
    expect(note.textContent).toBe(
      '리포트 지각 제출 시 강의료 차감수업 종료 후 1시간 미만 제출은 차감 없음1시간 지각 시5,000원 차감4시간 이후10,000원 차감',
    );
  });

  it('관리 화면(canAdminPage) 로그인에는 그리지 않고 코드표도 부르지 않는다', () => {
    useSession.setState({ me: me(true), ready: true });
    expect(render(<LateReportPolicy />).container.textContent).toBe('');
    expect(meta.enabled.every((on) => on === false)).toBe(true);
  });

  it('서버 구간을 받기 전에는 금액을 지어내지 않는다', () => {
    useSession.setState({ me: me(false), ready: true });
    meta.tiers = [];
    expect(render(<LateReportPolicy />).container.textContent).toBe('');
  });

  it('로그인 전에는 그리지 않는다', () => {
    useSession.setState({ me: null, ready: true });
    expect(render(<LateReportPolicy />).container.textContent).toBe('');
  });
});
