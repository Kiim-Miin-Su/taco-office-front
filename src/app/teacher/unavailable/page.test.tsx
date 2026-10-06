/** @file-guide
 * 목적: 최신 T07 불가 시간 Front의 10일·15자 초안, 계약 잠금, URL 회차, 읽기 오류·기존 목록 경계를 검증한다.
 * 책임/재사용: 실제 route를 렌더하고 생성 DTO에 없는 성공을 만들지 않는지 확인한다. 업무 판정 자체를 테스트 안에 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ReactNode } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import type { Me, TeacherUnav } from '@/api/types';
import { useSession } from '@/store/useSession';

const nav = vi.hoisted(() => ({ search: '', replace: vi.fn() }));
const apiState = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  anchors: [] as Array<string | undefined>,
  create: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/api/queries', () => ({
  useMeta: () => ({
    data: { teacherPolicies: [{ screen: 'unavailable', title: '불가 시간 등록 규칙', lines: ['서버 기존 정책'] }] },
  }),
  useTeacherUnav: (anchor?: string) => { apiState.anchors.push(anchor); return apiState.query; },
  useCreateTeacherUnav: () => ({ mutate: apiState.create, isPending: false, isError: false, error: null }),
  useDeleteTeacherUnav: () => ({ mutate: apiState.remove, isPending: false, isError: false, error: null }),
}));

import TeacherUnavailablePage from './page';

const teacher = {
  id: 7, name: '박도윤', role: 'teacher', roleLabel: '강사', title: null,
  canAdminPage: false, canCrudAll: false, canSeeProfit: false, canCrudAttendance: false,
  canMoney: false, canWage: false, canApprove: false, canHide: false, canGpaPack: false,
} as Me;

const DATA: TeacherUnav = {
  cycle: { index: 2, from: '2026-10-01', to: '2026-10-14', hiredOn: '2026-09-17' },
  today: '2026-10-01',
  openFrom: '2026-10-08',
  lockedDays: 7,
  openDays: 7,
  blocks: [
    { id: 31, onDate: '2026-10-12', dow: 1, startMin: 1080, endMin: 1140, reason: '기존 등록 사유', canDelete: true },
  ],
};

const ready = (data = DATA) => ({ data, isPending: false, isLoading: false, isError: false, error: null, refetch: vi.fn() });

beforeEach(() => {
  useSession.setState({ me: teacher, ready: true });
  apiState.query = ready();
  apiState.anchors = [];
  nav.search = '';
});

afterEach(() => {
  cleanup();
  useSession.setState({ me: null, ready: false });
  vi.clearAllMocks();
});

describe('T07 불가 시간 Front 계약 대기', () => {
  it('서버 old openFrom을 성공 근거로 쓰지 않고 정확히 10일째부터 15자 초안을 받되 저장은 잠근다', () => {
    const view = render(<TeacherUnavailablePage />);

    expect(view.queryByRole('button', { name: '10월 10일 (토) 08:00 선택' })).toBeNull();
    expect(view.getByRole('button', { name: '10월 12일 (월) 08:00 선택' })).toBeTruthy();
    expect(view.container.textContent).toContain('대상 날짜 10일 전까지 초안을 등록합니다.');
    expect(view.container.textContent).not.toContain('서버 기존 정책');
    fireEvent.click(view.getByRole('button', { name: '10월 11일 (일) 08:00 선택' }));

    const reason = view.getByLabelText('불가 사유');
    const submit = view.getByRole('button', { name: '저장 계약 준비 중' });
    fireEvent.change(reason, { target: { value: '12345678901234' } });
    expect(view.getByText('14/500자 · 최소 15자')).toBeTruthy();
    expect(submit).toHaveProperty('disabled', true);
    fireEvent.change(reason, { target: { value: '123456789012345' } });
    expect(view.getByText('15/500자 · 입력 완료')).toBeTruthy();
    expect(submit).toHaveProperty('disabled', true);
    fireEvent.change(reason, { target: { value: '  12345678901234  ' } });
    expect(view.getByText('14/500자 · 최소 15자')).toBeTruthy();
    fireEvent.click(submit);
    expect(apiState.create).not.toHaveBeenCalled();
    expect(view.container.textContent).toContain('배정 수업 충돌 계약까지 연결된 뒤 저장할 수 있습니다');
  });

  it('키보드 click 선택 뒤 pointer 이동은 눌린 drag로 남지 않는다', () => {
    const view = render(<TeacherUnavailablePage />);
    fireEvent.click(view.getByRole('button', { name: '10월 11일 (일) 08:00 선택' }));
    fireEvent.pointerEnter(view.getByRole('button', { name: '10월 11일 (일) 10:00 선택' }));
    expect(view.container.textContent).toContain('10월 11일 (일) · 08:00 – 09:00');
    expect(view.container.textContent).not.toContain('08:00 – 11:00');
  });

  it('2주 이동은 allowlist한 anchor URL을 사용하고 잘못된 날짜는 query에 넘기지 않는다', () => {
    nav.search = 'anchor=2026-10-01';
    const view = render(<TeacherUnavailablePage />);
    expect(apiState.anchors.at(-1)).toBe('2026-10-01');
    fireEvent.click(view.getByRole('button', { name: '다음 2주' }));
    expect(nav.replace).toHaveBeenCalledWith('/teacher/unavailable?anchor=2026-10-15', { scroll: false });

    cleanup();
    nav.search = 'anchor=2026-02-30';
    render(<TeacherUnavailablePage />);
    expect(apiState.anchors.at(-1)).toBeUndefined();
  });

  it('기존 목록은 읽되 삭제도 새 10일 계약 전에는 실행하지 않는다', () => {
    const view = render(<TeacherUnavailablePage />);
    expect(view.getByText('기존 등록 사유')).toBeTruthy();
    const remove = view.getByRole('button', { name: '삭제 계약 준비 중' });
    expect(remove).toHaveProperty('disabled', true);
    fireEvent.click(remove);
    expect(apiState.remove).not.toHaveBeenCalled();
  });

  it('입사일 등 읽기 409는 서버 문장을 보존하고 같은 query를 다시 시도한다', () => {
    const refetch = vi.fn();
    apiState.query = {
      data: undefined, isPending: false, isLoading: false, isError: true,
      error: new ApiError('NO_HIRED_ON', '입사일이 없어 2주 회차를 계산할 수 없습니다', 409), refetch,
    };
    const view = render(<TeacherUnavailablePage />);
    expect(view.getByRole('alert').textContent).toContain('입사일이 없어 2주 회차를 계산할 수 없습니다');
    fireEvent.click(view.getByRole('button', { name: '다시 시도' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
