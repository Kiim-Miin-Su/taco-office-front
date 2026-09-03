import { describe, expect, it } from 'vitest';
import {
  ADMIN_NAV_ITEMS, adminNavBadgeFor, adminNavItemsFor, isAdminNavActive,
} from './navigation';

describe('관리자 내비게이션 SSOT', () => {
  it('상단 11개와 Figma Sidebar 10개가 같은 항목 객체를 공유한다', () => {
    const top = adminNavItemsFor('top');
    const sidebar = adminNavItemsFor('sidebar');

    expect(top).toHaveLength(11);
    expect(sidebar).toHaveLength(10);
    expect(sidebar).not.toContainEqual(expect.objectContaining({ href: '/permissions' }));
    expect(sidebar[0]).toBe(ADMIN_NAV_ITEMS[0]);
  });

  it('하위 route만 active로 보고 접두사가 같은 다른 route는 제외한다', () => {
    expect(isAdminNavActive('/reports', '/reports')).toBe(true);
    expect(isAdminNavActive('/reports/12', '/reports')).toBe(true);
    expect(isAdminNavActive('/reports-old', '/reports')).toBe(false);
    expect(isAdminNavActive(null, '/reports')).toBe(false);
  });

  it('리포트는 양쪽, 결재는 Sidebar에서만 같은 snapshot의 배지를 읽는다', () => {
    const reports = ADMIN_NAV_ITEMS.find((item) => item.href === '/reports');
    const exec = ADMIN_NAV_ITEMS.find((item) => item.href === '/exec');
    const badges = { reports: 5, approvals: 1 };

    expect(reports && adminNavBadgeFor(reports, 'top', badges)).toBe(5);
    expect(reports && adminNavBadgeFor(reports, 'sidebar', badges)).toBe(5);
    expect(exec && adminNavBadgeFor(exec, 'top', badges)).toBe(0);
    expect(exec && adminNavBadgeFor(exec, 'sidebar', badges)).toBe(1);
  });
});
