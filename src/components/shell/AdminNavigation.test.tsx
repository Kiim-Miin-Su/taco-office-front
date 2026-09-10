/** @file-guide
 * 목적: AdminNavigation.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Me } from '@/api/types';
import * as navigation from './AdminNavigation';

const { AdminTopNavigation } = navigation;

const me: Me = {
  id: 1,
  name: '김민선',
  role: 'ceo',
  title: '대표',
  canAdminPage: true,
  canCrudAll: true,
  canSeeProfit: true,
  canCrudAttendance: true,
  canMoney: true,
  canWage: true,
  canApprove: true,
  canHide: true,
  canGpaPack: true,
};

describe('AdminNavigation', () => {
  it('상단은 권한이 있는 업무 탭 10개와 리포트 배지를 렌더한다', () => {
    const view = render(
      <AdminTopNavigation pathname="/reports/7" me={me} badges={{ reports: 5, approvals: 2 }} />,
    );
    const nav = view.getByRole('navigation', { name: '주 메뉴' });
    const links = within(nav).getAllByRole('link');

    expect(links).toHaveLength(10);
    expect(links.map((link) => link.textContent)).toEqual([
      '스케줄', '상담', '컨설팅', '수업', '교재', '수업 안내', '리포트5', '회계', '운영', '대표 보고',
    ]);
    expect(within(nav).getByRole('link', { name: '리포트 5' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: '대표 보고' }).textContent).not.toContain('2');
    expect(within(nav).queryByRole('link', { name: '권한' })).toBeNull();
  });

  it('상단 업무 메뉴 하나만 제공하고 중복 Sidebar 구현을 남기지 않는다', () => {
    const view = render(<AdminTopNavigation pathname="/schedule" me={me} badges={{}} />);
    expect(view.getAllByRole('navigation')).toHaveLength(1);
    expect(view.queryByRole('complementary')).toBeNull();
    expect(navigation).not.toHaveProperty('AdminSidebar');
  });

  it('관리자 활성 탭은 원본 헤더 토큰을 쓰고 비활성 탭에는 적용하지 않는다', () => {
    const view = render(<AdminTopNavigation pathname="/schedule" me={me} badges={{}} />);
    const active = view.getByRole('link', { name: '스케줄' });
    expect(active.classList.contains('bg-header-active')).toBe(true);
    expect(active.classList.contains('text-white')).toBe(true);
    expect(active.classList.contains('bg-blue')).toBe(false);
    expect(view.getByRole('link', { name: '상담' }).classList.contains('bg-header-active')).toBe(false);
  });

  it('메뉴는 가로 스크롤하고 링크를 축소해 서로 겹치지 않는다', () => {
    const view = render(<AdminTopNavigation pathname="/schedule" me={me} badges={{}} />);
    const nav = view.getByRole('navigation', { name: '주 메뉴' });
    expect(nav.classList.contains('min-w-0')).toBe(true);
    expect(nav.classList.contains('overflow-x-auto')).toBe(true);
    within(nav).getAllByRole('link').forEach((link) => {
      expect(link.classList.contains('shrink-0')).toBe(true);
      expect(link.classList.contains('whitespace-nowrap')).toBe(true);
    });
  });

  it('권한 없는 회계는 잠김 링크나 숨겨진 DOM도 남기지 않는다', () => {
    const view = render(<AdminTopNavigation pathname="/schedule" me={{ ...me, canMoney: false }} badges={{}} />);
    expect(view.container.querySelector('a[href="/accounting"]')).toBeNull();
  });

  it('강사 캘린더 탭은 같은 schedule 경로를 쓰며 활성 파랑을 유지한다', () => {
    const view = render(<AdminTopNavigation pathname="/schedule" me={{ ...me, canAdminPage: false }} badges={{}} />);
    const active = view.getByRole('link', { name: '캘린더' });
    expect(active.getAttribute('href')).toBe('/schedule');
    expect(active.getAttribute('aria-current')).toBe('page');
    expect(active.classList.contains('bg-blue')).toBe(true);
    expect(active.classList.contains('text-white')).toBe(true);
    expect(active.classList.contains('bg-header-active')).toBe(false);
    expect(view.queryByRole('link', { name: '스케줄' })).toBeNull();
    expect(view.getAllByRole('link').map((link) => link.textContent)).toEqual(['캘린더', '리포트']);
  });

  it('최종 canAdminPage 플래그가 바뀌면 같은 메뉴의 활성 색과 라벨을 갱신한다', () => {
    const view = render(<AdminTopNavigation pathname="/schedule" me={me} badges={{ reports: 3 }} />);
    view.rerender(<AdminTopNavigation pathname="/schedule" me={{ ...me, canAdminPage: false }} badges={{ reports: 3 }} />);
    expect(view.getByRole('link', { name: '캘린더' }).classList.contains('bg-blue')).toBe(true);
    expect(view.getByRole('link', { name: '리포트 3' })).toBeTruthy();
    view.rerender(<AdminTopNavigation pathname="/schedule" me={me} badges={{ reports: 3 }} />);
    expect(view.getByRole('link', { name: '스케줄' }).classList.contains('bg-header-active')).toBe(true);
  });
});
