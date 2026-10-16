/** @file-guide
 * 목적: TeacherTodayHero.test.tsx (test)
 * 책임/재사용: 홈 · 캘린더 「오늘」 띠의 현재 시각이 마이 페이지 진입 단추인지(강사 PPTX p31 ① · AUTH-SELF-01 D3) 실제 컴포넌트로 본다. 시각 계산 규칙은 clockIn 이 소유한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ search: 'date=2026-10-16', replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => '/schedule',
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock('@/api/queries', () => ({
  useTeacherShell: () => ({ data: { timezone: 'Asia/Seoul', tzLabel: 'Seoul · UTC+9', wageRate: 45000, notis: [], unread: 0, notiWindowDays: 30 } }),
}));
vi.mock('@/store/useSession', () => ({
  useSession: <T,>(select: (state: { me: { canAdminPage: boolean } }) => T) => select({ me: { canAdminPage: false } }),
}));

import { TeacherTodayHero } from './TeacherTodayHero';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('현재 시각은 마이 페이지를 여는 단추다 — 지금 화면의 질의는 그대로 두고 `?mypage=1` 만 더한다', () => {
  const view = render(<TeacherTodayHero date="2026-10-16" lessons={2} minutes={150} />);
  const clock = view.getByRole('button', { name: /^마이 페이지/ });
  expect(clock.getAttribute('aria-haspopup')).toBe('dialog');
  expect(within(clock).getByText(/^\d\d:\d\d$/)).toBeTruthy();
  expect(within(clock).getByText('Seoul · UTC+9 기준')).toBeTruthy();
  fireEvent.click(clock);
  expect(nav.replace).toHaveBeenCalledWith('/schedule?date=2026-10-16&mypage=1', { scroll: false });
});
