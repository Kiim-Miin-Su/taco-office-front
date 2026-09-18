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
  useWorkspace.setState({ undo: null });
});
afterEach(() => {
  cleanup();
  useSession.setState({ me: null, ready: false });
  useWorkspace.setState({ undo: null });
  vi.restoreAllMocks();
});

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
    useWorkspace.setState({ undo: { token: 'tok-1', label: '수업 삭제' } });
    const view = wrap(<AppShell><div /></AppShell>);
    const btn = view.getByRole('button', { name: '되돌리기' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('title')).toBe('수업 삭제를 되돌립니다 · Ctrl/⌘+Z');

    fireEvent.click(btn);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/schedule/undo', { token: 'tok-1' }));
    expect(post).toHaveBeenCalledTimes(1);
    // 되돌린 뒤에는 되돌릴 것이 없다 — 같은 토큰을 두 번 쓰면 서버가 UNDO_STALE 로 막는다
    await waitFor(() => expect(useWorkspace.getState().undo).toBeNull());
  });

  it('실패해도 토큰을 버린다 — 만료·stale 은 다시 눌러도 같은 답이다', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new Error('만료'));
    useWorkspace.setState({ undo: { token: 'tok-2', label: '휴강' } });
    const view = wrap(<AppShell><div /></AppShell>);
    fireEvent.click(view.getByRole('button', { name: '되돌리기' }));
    await waitFor(() => expect(useWorkspace.getState().undo).toBeNull());
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
