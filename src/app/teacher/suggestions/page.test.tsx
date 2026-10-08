/** @file-guide
 * 목적: 강사 건의 이력의 수업 스냅숏과 exact 캘린더 복귀 링크를 검증한다.
 * 책임/재사용: 실제 페이지를 렌더하고 API query hook만 고정한다. 서버 스냅숏을 화면에서 재계산하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const suggestions = {
  data: {
    yearMonth: '2026-09', used: 2, limit: 3, remaining: 1, canPost: true,
    items: [
      {
        id: 82, category: 'schedule', body: '시간 조정 확인 부탁드립니다.', state: 'open', createdOn: '2026-09-28',
        reply: null, replyBy: null, replyOn: null,
        lesson: {
          serId: 7, onDate: '2026-09-25', date: '2026-09-28', startMin: 960, endMin: 1020,
          subject: 'Writing', title: 'Essay', students: ['학생 A'],
        },
      },
      { id: 81, category: 'pay', body: '급여 확인 부탁드립니다.', state: 'reviewing', createdOn: '2026-09-27', reply: null, replyBy: null, replyOn: null, lesson: null },
    ],
  },
  isLoading: false, isPending: false, isError: false, error: null, refetch: vi.fn(),
};

vi.mock('@/api/queries', () => ({
  useTeacherSuggestions: () => suggestions,
  useCreateTeacherSuggestion: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/teacher/TeacherPolicyBar', () => ({ TeacherPolicyBar: () => <div /> }));

const { default: TeacherSuggestionsPage } = await import('./page');

afterEach(cleanup);

it('연결 건의는 제출 당시 수업 정보와 exact 캘린더 링크를 보이고 일반 건의는 그대로 유지한다', () => {
  const view = render(<TeacherSuggestionsPage />);
  expect(view.getByText('Writing · Essay')).toBeTruthy();
  expect(view.getByText(/학생 A · 원래 회차일/)).toBeTruthy();
  const link = view.getByRole('link', { name: '이 수업 보기' });
  expect(link.getAttribute('href'))
    .toBe('/schedule?view=day&anchor=2026-09-28&serId=7&onDate=2026-09-25&date=2026-09-28&source=calendar');
  expect(view.getByText('급여 확인 부탁드립니다.')).toBeTruthy();
  expect(view.getAllByRole('link', { name: '이 수업 보기' })).toHaveLength(1);
});
