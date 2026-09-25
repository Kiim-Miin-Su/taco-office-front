/** @file-guide
 * 목적: 상단바 되돌리기와 삭제·휴강 토큰의 단일 소유자 (C99 · N-138)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 원본 §16 컷의 상단바는 「오늘 전체 · ← 뒤로 · **⟲ 되돌리기**」이고 되돌릴 것이 없으면
 * **흐리게** 그려져 있다. 그래서 보는 것은 두 가지다.
 *
 *   ① 단추가 **조건부로 사라지지 않고** 늘 서 있으며, 못 누를 때 이유가 `title` 에 있다
 *   ② 삭제·휴강의 **토큰이 버려지지 않는다** — 지금까지 `LessonDetail` 은 `onClose()` 만 불렀다
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Me, Occurrence } from '@/api/types';
import { useSession } from '@/store/useSession';
import { useWorkspace } from '@/store/useWorkspace';
import { api } from '@/api/client';
import { AppShell } from './AppShell';
import { LessonDetail } from '@/components/lesson/LessonDetail';

const mocks = vi.hoisted(() => ({ back: vi.fn(), replace: vi.fn(), post: vi.fn(), drawer: vi.fn(), unwritten: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/schedule', useRouter: () => mocks }));

const me: Me = {
  id: 1, name: '김민수', role: 'admin', roleLabel: '관리자', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: false, canCrudAttendance: true, canMoney: false, canWage: false,
  canApprove: true, canHide: true, canGpaPack: true,
};

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  useSession.setState({ me, ready: true });
  useWorkspace.setState({ undoStack: [] });
});
afterEach(() => {
  cleanup();
  useSession.setState({ me: null, ready: false });
  useWorkspace.setState({ undoStack: [] });
  vi.restoreAllMocks();
});

/**
 * 되돌리기 요청만 센다 — 셸의 다른 조회(GET)는 목이 아니라서, 이 컨테이너처럼 3001 에 서버가 떠 있으면
 * 401 → 재발급(`/auth/refresh`) POST 가 같은 spy 에 섞여 들어온다(서버가 없으면 안 섞인다 — 환경에 따라 갈리던 실패).
 */
const undoCalls = (post: { mock: { calls: unknown[][] } }) => post.mock.calls.filter((c) => c[0] === '/schedule/undo');

/** 서버가 준 만료 — 앞으로 5분 / 이미 지남 */
const live = () => new Date(Date.now() + 5 * 60_000).toISOString();
const gone = () => new Date(Date.now() - 1_000).toISOString();

describe('상단바 되돌리기 (원본 §16 · N-138)', () => {
  it('되돌릴 것이 없어도 단추는 서 있고 왜 못 누르는지 말한다', () => {
    const view = wrap(<AppShell><div /></AppShell>);
    const btn = view.getByRole('button', { name: '되돌리기' }) as HTMLButtonElement;
    // 조건부로 사라지면 컷과 다르다 — 컷은 흐린 단추를 그린다
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('title')).toBe('되돌릴 최근 일정 작업이 없습니다');
  });

  it('토큰이 앉으면 살아나고 누르면 되돌리기 한 번을 보낸다 — 무엇을 되돌리는지도 말한다', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { projected: [], serIds: [], log: [], effScope: 'undo', undoToken: null } } as never);
    useWorkspace.setState({ undoStack: [{ token: 'tok-1', label: '수업 삭제', expiresAt: live() }] });
    const view = wrap(<AppShell><div /></AppShell>);
    const btn = view.getByRole('button', { name: '되돌리기' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('title')).toBe('수업 삭제를 되돌립니다 · Ctrl/⌘+Z');

    fireEvent.click(btn);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/schedule/undo', { token: 'tok-1' }));
    expect(undoCalls(post)).toHaveLength(1);
    // 되돌린 뒤에는 되돌릴 것이 없다 — 같은 토큰을 두 번 쓰면 서버가 UNDO_STALE 로 막는다
    await waitFor(() => expect(useWorkspace.getState().undoStack).toEqual([]));
  });

  it('실패해도 토큰을 버린다 — 만료·stale 은 다시 눌러도 같은 답이다', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new Error('만료'));
    useWorkspace.setState({ undoStack: [{ token: 'tok-2', label: '휴강', expiresAt: live() }] });
    const view = wrap(<AppShell><div /></AppShell>);
    fireEvent.click(view.getByRole('button', { name: '되돌리기' }));
    await waitFor(() => expect(useWorkspace.getState().undoStack).toEqual([]));
  });
});

/* ── 원문 셸 「⟲ 되돌리기 ▾」 — 여러 단계 목록 (g1 S5) ─────────────────── */

describe('되돌리기 여러 단계 (g1 S5)', () => {
  it('▾ 목록은 최근 것부터 적고, 고른 단계까지 뒤에서부터 차례로 되돌린다', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { projected: 1, serIds: [], log: [], effScope: 'undo', undoToken: null, undoExpiresAt: null } } as never);
    useWorkspace.setState({ undoStack: [
      { token: 'tok-a', label: '새 일정', expiresAt: live() },
      { token: 'tok-b', label: '수업 이동', expiresAt: live() },
      { token: 'tok-c', label: '휴강', expiresAt: live() },
    ] });
    const view = wrap(<AppShell><div /></AppShell>);
    // 단추 하나는 가장 최근 것을 말한다
    expect(view.getByRole('button', { name: '되돌리기' }).getAttribute('title')).toBe('휴강을 되돌립니다 · Ctrl/⌘+Z');

    fireEvent.click(view.getByRole('button', { name: '되돌릴 단계 목록' }));
    const items = view.getAllByRole('menuitem');
    expect(items.map((el) => el.textContent)).toEqual([
      expect.stringContaining('휴강'), expect.stringContaining('수업 이동'), expect.stringContaining('새 일정'),
    ]);
    // 둘째 줄(수업 이동)까지 — 휴강 → 수업 이동 순서로 두 번
    fireEvent.click(items[1]);
    await waitFor(() => expect(undoCalls(post)).toHaveLength(2));
    expect(undoCalls(post).map((c) => c[1])).toEqual([{ token: 'tok-c' }, { token: 'tok-b' }]);
    await waitFor(() => expect(useWorkspace.getState().undoStack.map((s) => s.token)).toEqual(['tok-a']));
  });

  it('서버 만료가 지난 단계는 목록에 없고, 전부 지나면 단추가 흐려진다', () => {
    useWorkspace.setState({ undoStack: [
      { token: 'tok-old', label: '새 일정', expiresAt: gone() },
      { token: 'tok-new', label: '수업 이동', expiresAt: live() },
    ] });
    const view = wrap(<AppShell><div /></AppShell>);
    fireEvent.click(view.getByRole('button', { name: '되돌릴 단계 목록' }));
    expect(view.getAllByRole('menuitem').map((el) => el.textContent)).toEqual([expect.stringContaining('수업 이동')]);
    cleanup();

    useWorkspace.setState({ undoStack: [{ token: 'tok-old', label: '새 일정', expiresAt: gone() }] });
    const again = wrap(<AppShell><div /></AppShell>);
    expect((again.getByRole('button', { name: '되돌리기' }) as HTMLButtonElement).disabled).toBe(true);
    expect((again.getByRole('button', { name: '되돌릴 단계 목록' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('중간 단계가 막히면 거기서 멈추고 그 단계만 버린다 — 앞 단계는 남는다', async () => {
    // 「첫 번째는 성공 · 두 번째는 막힘」은 **되돌리기 요청에만** 건다 — 재발급 POST 가 Once 값을 먼저 먹지 않게(undoCalls 주석)
    let undone = 0;
    const post = vi.spyOn(api, 'post').mockImplementation(async (url: string) => {
      if (url !== '/schedule/undo') return { data: {} } as never;
      undone += 1;
      if (undone === 1) return { data: { projected: 1, serIds: [], log: [], effScope: 'undo', undoToken: null, undoExpiresAt: null } } as never;
      throw { response: { data: { message: '그 뒤 같은 수업이 다시 바뀌었습니다' } } };
    });
    useWorkspace.setState({ undoStack: [
      { token: 'tok-a', label: '새 일정', expiresAt: live() },
      { token: 'tok-b', label: '수업 이동', expiresAt: live() },
      { token: 'tok-c', label: '휴강', expiresAt: live() },
    ] });
    const view = wrap(<AppShell><div /></AppShell>);
    fireEvent.click(view.getByRole('button', { name: '되돌릴 단계 목록' }));
    fireEvent.click(view.getAllByRole('menuitem')[2]);
    await waitFor(() => expect(undoCalls(post)).toHaveLength(2));
    await waitFor(() => expect(useWorkspace.getState().undoStack.map((s) => s.token)).toEqual(['tok-a']));
    expect(await view.findByText(/다시 바뀌었습니다/)).toBeTruthy();
  });

  it('새 쓰기는 맨 뒤에 쌓이고, 지난 단계는 쌓을 때 버린다', () => {
    useWorkspace.setState({ undoStack: [{ token: 'tok-old', label: '새 일정', expiresAt: gone() }] });
    useWorkspace.getState().pushUndo({ token: 'tok-1', label: '수업 이동', expiresAt: live() });
    useWorkspace.getState().pushUndo({ token: 'tok-2', label: '휴강', expiresAt: live() });
    expect(useWorkspace.getState().undoStack.map((s) => s.token)).toEqual(['tok-1', 'tok-2']);
  });
});

/* ── 삭제·휴강이 토큰을 버리지 않는다 ─────────────────────────────── */

const occ: Occurrence = {
  serId: 3, onDate: '2026-09-22', date: '2026-09-22', startMin: 600, endMin: 660,
  kindKey: 'class', subKey: 'vocab', title: '수업', mode: 'offline', teacherId: 2, teacherName: '김재훈',
  roomId: 1, roomName: '1호', canceled: false, students: [], recurring: true,
} as unknown as Occurrence;

describe('삭제·휴강의 되돌리기 토큰 (N-138)', () => {
  it('「반복 끝내기 · 모두」가 성공하면 무엇을 되돌리는지와 함께 알린다', async () => {
    vi.spyOn(api, 'delete').mockResolvedValue({ data: { projected: [], serIds: [3], log: [], effScope: 'all', undoToken: 'tok-del' } } as never);
    const onWritten = vi.fn();
    const view = wrap(<LessonDetail occ={occ} onWritten={onWritten} onClose={() => {}} />);

    fireEvent.click(view.getByRole('button', { name: /반복 끝내기/ }));
    fireEvent.click(await view.findByRole('button', { name: /모두/ }));
    await waitFor(() => expect(onWritten).toHaveBeenCalledTimes(1));
    expect(onWritten.mock.calls[0][1]).toBe('수업 삭제');
    expect((onWritten.mock.calls[0][0] as { undoToken: string }).undoToken).toBe('tok-del');
  });
});
