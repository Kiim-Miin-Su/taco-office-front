import { render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Me } from '@/api/types';
import { AdminSidebar, AdminTopNavigation } from './AdminNavigation';

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
  it('상단은 기존 11개 route와 리포트 배지를 유지한다', () => {
    const view = render(
      <AdminTopNavigation pathname="/reports/7" badges={{ reports: 5, approvals: 2 }} />,
    );
    const nav = view.getByRole('navigation', { name: '주 메뉴' });
    const links = within(nav).getAllByRole('link');

    expect(links).toHaveLength(11);
    expect(within(nav).getByRole('link', { name: '리포트 5' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: '대표 보고' }).textContent).not.toContain('2');
    expect(within(nav).getByRole('link', { name: '권한' }).getAttribute('href')).toBe('/permissions');
  });

  it('Sidebar는 Figma의 10개 route와 결재 배지만 렌더링한다', () => {
    const view = render(
      <AdminSidebar pathname="/exec" me={me} badges={{ reports: 5, approvals: 2 }} />,
    );
    const aside = view.getByRole('complementary', { name: '관리자 메뉴' });
    const nav = within(aside).getByRole('navigation', { name: '관리자 업무' });
    const links = within(nav).getAllByRole('link');

    expect(links).toHaveLength(10);
    expect(within(nav).queryByRole('link', { name: '권한' })).toBeNull();
    expect(within(nav).getByRole('link', { name: '대표 보고' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: '대표 보고' }).textContent).toContain('2');
    expect(within(aside).getByText('김민선')).toBeTruthy();
    expect(within(aside).getByText('대표 · 마이 페이지')).toBeTruthy();
  });
});
