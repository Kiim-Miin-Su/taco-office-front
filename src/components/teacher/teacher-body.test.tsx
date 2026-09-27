/** @file-guide
 * 목적: teacher-body.test.tsx (test)
 * 책임/재사용: 강사 표면의 틀 한 벌을 실제 AppShell(강사 갈래)로 본다 — 본문 여백(모바일 8 · 웹 16)과 「화면 이름은 머리줄 한 곳(h1 하나)」. 화면별 내용은 각 화면 시험이 본다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * Figma Content viewport — 강사 본문 여백 모바일 8px · 웹 16px. 여백은 셸 한 곳(AppShell 강사 갈래의 main)이 정하고
 * 화면이 제 여백을 따로 두지 않는다 — 화면마다 두면 같은 폭에서 본문 시작선이 갈린다.
 * 화면 이름은 머리줄(Teacher/Header)의 h1 하나다. 본문 머리(ScreenHeader)는 부제만 그린다 (wave 6).
 */
import { cleanup, render, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import { AppShell } from '@/components/shell/AppShell';
import { ScreenHeader } from './ScreenHeader';

vi.mock('next/navigation', () => ({ usePathname: () => '/teacher/suggestions', useRouter: () => ({ replace: vi.fn(), back: vi.fn(), push: vi.fn() }) }));
vi.mock('@/api/client', () => ({ api: { post: vi.fn() }, setAccessToken: vi.fn() }));
vi.mock('@/api/queries', () => ({
  useDrawer: () => ({ data: undefined }),
  useUnwritten: () => ({ data: undefined }),
  useScheduleWrite: () => ({ mutate: vi.fn() }),
  useTeacherShell: () => ({ data: undefined }),
  useTeacherNotiRead: () => ({ mutate: vi.fn(), isPending: false }),
  useMeta: () => ({ data: undefined }),
  // 셸이 부르는 §76 권한 표(N-98) — 강사에게는 창이 없어 늘 꺼져 있다
  usePermissionTable: () => ({ data: undefined, isLoading: false, error: null }),
}));

const teacher: Me = {
  id: 7, name: '김재훈', role: 'teacher', roleLabel: '강사', title: null, canAdminPage: false, canCrudAll: false,
  canSeeProfit: false, canCrudAttendance: false, canMoney: false, canWage: false, canApprove: false, canHide: false,
  canGpaPack: false,
};

beforeEach(() => useSession.setState({ me: teacher, ready: true }));
afterEach(() => { cleanup(); useSession.setState({ me: null, ready: false }); });

function page() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AppShell>
        <ScreenHeader title="건의 사항" sub="9월 사용 1/3 · 내가 보낸 건의 1건" />
        <p>본문</p>
      </AppShell>
    </QueryClientProvider>,
  );
}

describe('강사 표면 틀 — 여백 한 곳 · 제목 한 곳', () => {
  it('본문(main) 여백은 모바일 8px(p-2) · 웹 16px(sm:p-4) — 셸이 정한다', () => {
    const view = page();
    const main = view.getByRole('main');
    expect(main.className).toContain('p-2');
    expect(main.className).toContain('sm:p-4');
    // 관리 화면 여백(p-3 · sm:p-6)이 아니다
    expect(main.className).not.toContain('sm:p-6');
  });

  it('화면 이름은 머리줄 h1 하나 — 본문 머리는 부제만 그린다', () => {
    const view = page();
    const headings = view.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(within(view.getByRole('banner')).getByRole('heading', { level: 1 }).textContent).toBe('건의 사항');
    expect(within(view.getByRole('main')).getByText('9월 사용 1/3 · 내가 보낸 건의 1건')).toBeTruthy();
  });
});
