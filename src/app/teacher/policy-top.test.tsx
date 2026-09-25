/** @file-guide
 * 목적: policy-top.test.tsx (test)
 * 책임/재사용: 강사 화면 다섯의 조립만 본다 — 정책 띠가 본문(불러오기·제목)보다 위에 서는가. 띠 자체는 컴포넌트 시험이 본다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 대표 결정 2026-09-25 「강사 정책은 강사 화면 7개 전부의 최상단」.
 * 리포트(/reports)·캘린더(TeacherSchedule)는 각자의 시험이 보고, 여기서는 나머지 다섯을 한 벌로 본다.
 * 데이터는 **불러오는 중**으로 두어 본문이 아직 없어도 띠가 먼저 서는지를 확인한다 — 띠는 본문 질의를 기다리지 않는다.
 */
import type { ReactNode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import { LATE_TIERS_FIXTURE } from '@/components/teacher/late-tiers.fixture';
import { TEACHER_POLICIES_FIXTURE } from '@/components/teacher/teacher-policies.fixture';

const pending = { data: undefined, isPending: true, isLoading: true, isError: false, refetch: vi.fn() };
const idle = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, reset: vi.fn() };
vi.mock('@/api/queries', () => ({
  useMeta: () => ({ data: { lateReportTiers: LATE_TIERS_FIXTURE, teacherPolicies: TEACHER_POLICIES_FIXTURE } }),
  useTeacherHome: () => pending, useCreateSettingRequest: () => idle,
  useTeacherUnav: () => pending, useCreateTeacherUnav: () => idle, useDeleteTeacherUnav: () => idle,
  useTeacherGuides: () => pending, useReceivedGuides: () => pending, useAcknowledgeGuide: () => idle,
  useTeacherHistory: () => pending,
  useTeacherSuggestions: () => pending, useCreateTeacherSuggestion: () => idle,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/teacher',
}));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));

import TeacherHomePage from './page';
import TeacherUnavailablePage from './unavailable/page';
import TeacherGuidesPage from './guides/page';
import TeacherHistoryPage from './history/page';
import TeacherSuggestionsPage from './suggestions/page';

const teacher = { id: 7, name: '김재훈', canAdminPage: false, canCrudAll: false } as unknown as Me;

describe('강사 화면 최상단 정책 띠', () => {
  beforeEach(() => useSession.setState({ me: teacher, ready: true }));
  afterEach(() => { cleanup(); useSession.setState({ me: null, ready: false }); });

  it.each([
    ['홈', TeacherHomePage, '리포트 지각 제출 차감'],
    ['불가 시간', TeacherUnavailablePage, '불가 시간 등록 규칙'],
    ['수업 안내', TeacherGuidesPage, '수업 전에 확인할 것'],
    ['수업 히스토리', TeacherHistoryPage, '정산 규칙'],
    ['건의 사항', TeacherSuggestionsPage, '건의 규칙'],
  ] as const)('%s — 띠가 본문의 첫 자리다', (_name, Page, label) => {
    const view = render(<Page />);
    const main = view.getByRole('main');
    const note = view.getByRole('note', { name: label });
    // 최상단 — 본문(main)의 첫 요소가 곧 띠다(주석 노드는 요소가 아니다)
    expect(main.firstElementChild).toBe(note);
  });

  it('관리 화면 로그인에는 다섯 화면 어디에도 띠가 없다', () => {
    useSession.setState({ me: { ...teacher, canAdminPage: true, canCrudAll: true } as Me, ready: true });
    for (const Page of [TeacherHomePage, TeacherUnavailablePage, TeacherGuidesPage, TeacherHistoryPage, TeacherSuggestionsPage]) {
      const view = render(<Page />);
      expect(view.queryByRole('note')).toBeNull();
      cleanup();
    }
  });
});
