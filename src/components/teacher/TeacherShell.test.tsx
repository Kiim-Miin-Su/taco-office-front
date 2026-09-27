/** @file-guide
 * 목적: TeacherShell.test.tsx (test)
 * 책임/재사용: 강사 머리줄(☰)·메뉴 패널의 열고 닫기·메뉴 차례·활성 항목·포커스 반환·로그아웃을 navigation.ts 정본으로 검증한다. 메뉴 목록을 테스트에 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import type { Me } from '@/api/types';
import { adminNavItemsFor } from '@/components/shell/navigation';
import { TeacherShell } from './TeacherShell';

// jsdom 은 문서 이동을 못 한다 — 링크 누름은 패널의 onClick 까지만 본다(실제 이동은 실브라우저 QA 몫)
vi.mock('next/link', () => ({
  default: ({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest} onClick={(event: MouseEvent<HTMLAnchorElement>) => { event.preventDefault(); onClick?.(event); }} />
  ),
}));

const unwritten = vi.hoisted(() => ({ calls: [] as boolean[], total: 5 }));
// 머리줄 서버 값(GET /teacher/shell) — 시간대 표기·시급·내 알림은 서버가 짓는다. 화면은 그리기만 한다
const shellQ = vi.hoisted(() => ({
  calls: [] as boolean[],
  read: vi.fn(),
  data: {
    timezone: 'Asia/Seoul', tzLabel: 'Seoul · UTC+9', wageRate: 45000, unread: 1, notiWindowDays: 30,
    notis: [
      { id: 11, title: '리포트 반려', body: '9/24 MAP Reading 리포트가 반려되었습니다', link: '/reports?serId=3', read: false, at: '2026-09-25T10:05:00+09:00', categoryLabel: '리포트', fromName: null },
      { id: 12, title: null, body: '구성원 권한이 바뀌었습니다', link: '/permissions', read: true, at: '2026-09-24T09:00:00+09:00', categoryLabel: '시스템', fromName: '김민선' },
    ],
  },
}));
vi.mock('@/api/queries', () => ({
  // 강사 본인 미작성 수(서버가 본인으로 고정) — 패널이 열려 있을 때만 부른다
  useUnwritten: (_teacherId: unknown, enabled: boolean) => {
    unwritten.calls.push(enabled);
    return { data: enabled ? { total: unwritten.total } : undefined };
  },
  useTeacherShell: (enabled: boolean) => {
    shellQ.calls.push(enabled);
    return { data: enabled ? shellQ.data : undefined };
  },
  useTeacherNotiRead: () => ({ mutate: shellQ.read, isPending: false }),
}));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const teacher: Me = {
  id: 7, name: '김재훈', role: 'teacher', roleLabel: '강사', title: null, canAdminPage: false, canCrudAll: false,
  canSeeProfit: false, canCrudAttendance: false, canMoney: false, canWage: false, canApprove: false, canHide: false,
  canGpaPack: false,
};

function shell(pathname: string | null = '/teacher', onLogout = vi.fn()) {
  const view = render(
    <TeacherShell pathname={pathname} me={teacher} onLogout={onLogout}>
      <main><h1>본문</h1><button type="button">본문 단추</button></main>
    </TeacherShell>,
  );
  return { view, onLogout, toggle: () => view.getByRole('button', { name: '메뉴' }) };
}

beforeEach(() => { unwritten.calls.length = 0; unwritten.total = 5; shellQ.calls.length = 0; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Teacher/Header — ☰ · 현재 메뉴 이름 · 내 이름 · 로그아웃 (Figma 7686:22061)', () => {
  it('기본은 메뉴가 접혀 있고 머리줄에 현재 메뉴 이름과 이름·로그아웃만 선다', () => {
    const { view, toggle } = shell('/teacher/unavailable');
    const header = view.getByRole('banner');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(view.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
    expect(within(header).getByText('불가 시간')).toBeTruthy();
    // 화면 이름은 머리줄 한 곳 — 문서의 제목(h1)이 여기다. 본문은 같은 낱말의 h1 을 다시 세우지 않는다(ScreenHeader)
    expect(within(header).getByRole('heading', { level: 1, name: '불가 시간' })).toBeTruthy();
    expect(within(header).getByText('김재훈')).toBeTruthy();
    expect(within(header).getByRole('button', { name: '로그아웃' })).toBeTruthy();
    // 관리자 머리줄의 도구·업무 탭은 강사 머리줄에 없다
    expect(within(header).queryByRole('link')).toBeNull();
    expect(within(header).queryByRole('button', { name: '오늘 전체' })).toBeNull();
    // 접힌 동안에는 본인 미작성 수도 부르지 않는다
    expect(unwritten.calls.every((enabled) => enabled === false)).toBe(true);
  });

  it('로그아웃은 셸이 넘긴 동작을 부른다', () => {
    const { view, onLogout } = shell();
    fireEvent.click(view.getByRole('button', { name: '로그아웃' }));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it('캘린더 경로의 머리줄 이름은 강사 표시 이름(캘린더)이다 — 관리자 낱말(스케줄)이 아니다', () => {
    const { view } = shell('/schedule');
    expect(within(view.getByRole('banner')).getByText('캘린더')).toBeTruthy();
    expect(view.queryByText('스케줄')).toBeNull();
  });
});

describe('Menu panel — 강사 메뉴 7개 (Figma Teacher/Navigation 7681:21765)', () => {
  it('☰ 을 누르면 패널이 열리고 navigation.ts 의 강사 메뉴 7개를 같은 차례로 그린다', () => {
    const { view, toggle } = shell('/teacher');
    fireEvent.click(toggle());
    const nav = view.getByRole('navigation', { name: '주 메뉴' });
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().getAttribute('aria-controls')).toBe(nav.id);
    // 메뉴 7칸만 센다 — 맨 아래 사용자 칸의 「마이 페이지 ›」는 메뉴 항목이 아니다
    const links = within(nav).getAllByRole('link').filter((link) => !link.closest('[data-teacher-user]'));
    const expected = adminNavItemsFor('sidebar', teacher);
    expect(links).toHaveLength(7);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(expected.map((item) => item.href));
    expect(links.map((link) => link.textContent?.replace(/\d+$/, ''))).toEqual([
      '홈', '캘린더', '불가 시간', '리포트', '수업 안내', '수업 히스토리', '건의 사항',
    ]);
    // 관리자 메뉴는 강사 패널에 없다
    ['/intake', '/consulting', '/board', '/books', '/guides', '/accounting', '/ops', '/exec'].forEach((href) => {
      expect(nav.querySelector(`a[href="${href}"]`)).toBeNull();
    });
  });

  it('하위 화면에서는 그 메뉴 하나만 켜진다 — mostSpecificNavItem 과 같은 판정', () => {
    const { view, toggle } = shell('/teacher/history');
    fireEvent.click(toggle());
    const nav = view.getByRole('navigation', { name: '주 메뉴' });
    const current = within(nav).getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current.map((link) => link.textContent)).toEqual(['수업 히스토리']);
    expect(current[0].classList.contains('bg-primary')).toBe(true);
    expect(within(nav).getByRole('link', { name: '홈' }).classList.contains('bg-primary')).toBe(false);
  });

  it('리포트 칸에는 본인 미작성 수를 서버 값 그대로 단다 — 열려 있을 때만 부른다', () => {
    const { view, toggle } = shell('/teacher');
    fireEvent.click(toggle());
    expect(unwritten.calls.at(-1)).toBe(true);
    const nav = view.getByRole('navigation', { name: '주 메뉴' });
    expect(within(nav).getByRole('link', { name: '리포트 5' })).toBeTruthy();
  });

  it('미작성이 0 이면 배지를 그리지 않는다', () => {
    unwritten.total = 0;
    const { view, toggle } = shell('/teacher');
    fireEvent.click(toggle());
    expect(within(view.getByRole('navigation', { name: '주 메뉴' })).getByRole('link', { name: '리포트' })).toBeTruthy();
  });

  it('사용자 칸은 서버가 내려준 이름·역할 낱말을 쓴다', () => {
    const { view, toggle } = shell('/teacher');
    fireEvent.click(toggle());
    const user = view.getByRole('navigation', { name: '주 메뉴' }).querySelector('[data-teacher-user]') as HTMLElement;
    expect(within(user).getByText('김재훈')).toBeTruthy();
    expect(within(user).getByText(/^강사 ·/)).toBeTruthy();
  });
});

describe('포커스·닫기 — 키보드로 열고 닫을 수 있다', () => {
  it('열리면 포커스가 패널 안(메뉴 닫기)으로 들어간다', () => {
    const { view, toggle } = shell();
    fireEvent.click(toggle());
    const nav = view.getByRole('navigation', { name: '주 메뉴' });
    expect(nav.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(within(nav).getByRole('button', { name: '메뉴 닫기' }));
  });

  it('Escape 는 패널을 닫고 포커스를 ☰ 로 돌려준다', () => {
    const { view, toggle } = shell();
    fireEvent.click(toggle());
    const link = within(view.getByRole('navigation', { name: '주 메뉴' })).getByRole('link', { name: '캘린더' });
    link.focus();
    fireEvent.keyDown(link, { key: 'Escape' });
    expect(view.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle());
  });

  it('「메뉴 닫기」와 ☰ 다시 누르기도 닫는다', () => {
    const { view, toggle } = shell();
    fireEvent.click(toggle());
    fireEvent.click(view.getByRole('button', { name: '메뉴 닫기' }));
    expect(view.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
    expect(document.activeElement).toBe(toggle());
    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(view.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
  });

  it('메뉴를 누르거나 경로가 바뀌면 닫힌다', () => {
    const onLogout = vi.fn();
    const { view, toggle } = shell('/teacher', onLogout);
    fireEvent.click(toggle());
    fireEvent.click(within(view.getByRole('navigation', { name: '주 메뉴' })).getByRole('link', { name: '홈' }));
    expect(view.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();

    fireEvent.click(toggle());
    expect(view.getByRole('navigation', { name: '주 메뉴' })).toBeTruthy();
    view.rerender(
      <TeacherShell pathname="/reports" me={teacher} onLogout={onLogout}>
        <main><h1>본문</h1></main>
      </TeacherShell>,
    );
    expect(view.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
    expect(within(view.getByRole('banner')).getByText('리포트')).toBeTruthy();
  });

  it('덮는 패널(모바일)에서는 Tab 이 패널 안에서 돈다 — 웹(나란히 서는 패널)에서는 가두지 않는다', () => {
    const { view, toggle } = shell();
    fireEvent.click(toggle());
    const nav = view.getByRole('navigation', { name: '주 메뉴' });
    const focusables = [within(nav).getByRole('button', { name: '메뉴 닫기' }), ...within(nav).getAllByRole('link')];
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    // 웹 — position 이 fixed 가 아니면 본문으로 나갈 수 있다(기본 동작 유지)
    last.focus();
    expect(fireEvent.keyDown(last, { key: 'Tab' })).toBe(true);

    // 모바일 — 패널이 화면을 덮는(position: fixed) 동안에는 끝에서 처음으로 돈다
    const real = window.getComputedStyle;
    const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
      const style = real(el, pseudo);
      return (el as HTMLElement).dataset?.teacherMenu !== undefined
        ? ({ ...style, position: 'fixed' } as CSSStyleDeclaration) : style;
    });
    last.focus();
    expect(fireEvent.keyDown(last, { key: 'Tab' })).toBe(false);
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    spy.mockRestore();
  });

  it('모바일 스크림(패널 밖)을 누르면 닫힌다', () => {
    const { view, toggle } = shell();
    fireEvent.click(toggle());
    const scrim = view.container.querySelector('[data-teacher-menu-scrim]');
    expect(scrim).not.toBeNull();
    fireEvent.click(scrim!);
    expect(view.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
  });
});

describe('강사 덱 머리줄 오른쪽 — 시간대 · 시급 · 이름·역할 · 로그아웃 · 🔔 (서버 값만)', () => {
  it('시간대·시급 칸은 GET /teacher/shell 이 지은 값이고, 🔔 에는 안 읽은 수가 선다', () => {
    const { view } = shell('/teacher');
    const header = view.getByRole('banner');
    expect(shellQ.calls.every(Boolean)).toBe(true);
    expect(within(header).getByText('Seoul · UTC+9')).toBeTruthy();
    expect(within(header).getByText('₩45,000/시간')).toBeTruthy();
    expect(within(header).getByText(/· 강사/)).toBeTruthy();
    const bell = within(header).getByRole('button', { name: '알림 · 안 읽음 1건' });
    expect(within(bell).getByText('1')).toBeTruthy();
    // 덱의 「관리자 화면 미리보기」는 강사에게 남기지 않는다(AGENT.md §B)
    expect(within(header).queryByText(/미리보기/)).toBeNull();
  });

  it('🔔 는 내게 온 알림 목록을 연다 — 누르면 읽음, 강사에게 열린 경로면 그리로 간다', () => {
    const { view } = shell('/teacher');
    fireEvent.click(view.getByRole('button', { name: '알림 · 안 읽음 1건' }));
    const dialog = view.getByRole('dialog', { name: '알림' });
    expect(within(dialog).getByText('최근 30일 · 안 읽음 1건')).toBeTruthy();
    fireEvent.click(within(dialog).getByText('9/24 MAP Reading 리포트가 반려되었습니다'));
    expect(shellQ.read).toHaveBeenCalledWith({ id: 11 });
    expect(router.push).toHaveBeenCalledWith('/reports?serId=3');
  });

  it('관리 화면을 가리키는 알림은 이동하지 않는다 · 이미 읽은 줄은 다시 쓰지 않는다 · 모두 읽음', () => {
    const { view } = shell('/teacher');
    fireEvent.click(view.getByRole('button', { name: '알림 · 안 읽음 1건' }));
    const dialog = view.getByRole('dialog', { name: '알림' });
    fireEvent.click(within(dialog).getByText('구성원 권한이 바뀌었습니다'));
    expect(shellQ.read).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: '모두 읽음으로 표시' }));
    expect(shellQ.read).toHaveBeenCalledWith({ all: true });
  });

  it('메뉴 사용자 칸 — 이름 · 역할 · 마이 페이지(홈 내 설정) · 시간대 · 시급, 로고는 TN Academy 줄과 함께', () => {
    const { view, toggle } = shell('/teacher/history');
    fireEvent.click(toggle());
    const nav = view.getByRole('navigation', { name: '주 메뉴' });
    expect(within(nav).getByText('TN Academy')).toBeTruthy();
    const my = within(nav).getByRole('link', { name: /마이 페이지/ });
    expect(my.getAttribute('href')).toBe('/teacher#my-settings');
    expect(within(nav).getByText('시간대').nextElementSibling?.textContent).toBe('Seoul · UTC+9');
    expect(within(nav).getByText('시급').nextElementSibling?.textContent).toBe('₩45,000');
  });
});

