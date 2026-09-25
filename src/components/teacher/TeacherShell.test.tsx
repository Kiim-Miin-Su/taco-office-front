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
vi.mock('@/api/queries', () => ({
  // 강사 본인 미작성 수(서버가 본인으로 고정) — 패널이 열려 있을 때만 부른다
  useUnwritten: (_teacherId: unknown, enabled: boolean) => {
    unwritten.calls.push(enabled);
    return { data: enabled ? { total: unwritten.total } : undefined };
  },
}));

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

beforeEach(() => { unwritten.calls.length = 0; unwritten.total = 5; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Teacher/Header — ☰ · 현재 메뉴 이름 · 내 이름 · 로그아웃 (Figma 7686:22061)', () => {
  it('기본은 메뉴가 접혀 있고 머리줄에 현재 메뉴 이름과 이름·로그아웃만 선다', () => {
    const { view, toggle } = shell('/teacher/unavailable');
    const header = view.getByRole('banner');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(view.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
    expect(within(header).getByText('불가 시간')).toBeTruthy();
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
    const links = within(nav).getAllByRole('link');
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
    expect(within(view.getByRole('navigation', { name: '주 메뉴' })).getByText('김재훈 · 강사')).toBeTruthy();
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
