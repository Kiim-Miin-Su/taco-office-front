/** @file-guide
 * 목적: navigation.test.ts (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { describe, expect, it } from 'vitest';
import type { Me } from '@/api/types';
import {
  ADMIN_NAV_ITEMS, adminNavBadgeFor, adminNavItemsFor, canAccessAppRoute, isAdminNavActive,
} from './navigation';

const ceo: Me = {
  id: 1, name: '대표', role: 'ceo', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: true, canCrudAttendance: true, canMoney: true, canWage: true,
  canApprove: true, canHide: true, canGpaPack: true,
};
const teacher: Me = {
  ...ceo, id: 2, role: 'teacher', canAdminPage: false, canCrudAll: false,
  canSeeProfit: false, canCrudAttendance: false, canMoney: false, canWage: false,
  canApprove: false, canHide: false, canGpaPack: false,
};

describe('명세서 탭 노출 SSOT', () => {
  it.each(['top', 'sidebar'] as const)('%s에서 대표 10탭, 강사 2탭만 노출한다', (surface) => {
    expect(adminNavItemsFor(surface, ceo)).toHaveLength(10);
    expect(adminNavItemsFor(surface, teacher).map((x) => x.href)).toEqual(['/schedule', '/reports']);
    expect(adminNavItemsFor(surface, null)).toEqual([]);
    expect(adminNavItemsFor(surface, ceo)[0]).toBe(ADMIN_NAV_ITEMS[0]);
  });

  it.each(['manager', 'admin'] as const)('%s도 money=false면 회계 탭 자체가 없다 (§52)', (role) => {
    const me = { ...ceo, role, canMoney: false, canSeeProfit: false };
    expect(adminNavItemsFor('top', me)).toHaveLength(9);
    expect(adminNavItemsFor('top', me).some((x) => x.href === '/accounting')).toBe(false);
    expect(canAccessAppRoute('/accounting', me)).toBe(false);
    expect(canAccessAppRoute('/ops', me)).toBe(true);
  });

  it('역할이 아니라 서버 예외 플래그를 소비하며 권한은 업무 탭에서 제외한다', () => {
    expect(canAccessAppRoute('/accounting', { ...ceo, role: 'manager', canSeeProfit: false })).toBe(true);
    expect(canAccessAppRoute('/accounting', { ...ceo, canMoney: false })).toBe(false);
    expect(canAccessAppRoute('/ops', { ...ceo, canAdminPage: false })).toBe(false);
    expect(canAccessAppRoute('/ops', { ...ceo, canCrudAll: false })).toBe(false);
    expect(adminNavItemsFor('top', ceo).some((x) => x.href === '/permissions')).toBe(false);
    expect(canAccessAppRoute('/permissions', teacher)).toBe(true);
  });

  it.each(['/accounting', '/ops', '/exec', '/intake', '/consulting', '/books', '/guides', '/board'])(
    '강사 직접 URL %s도 차단한다', (path) => {
      expect(canAccessAppRoute(path, teacher)).toBe(false);
      expect(canAccessAppRoute(path + '/1', teacher)).toBe(false);
    },
  );

  it('세션/경로 미확정은 닫고 로그인은 허용한다', () => {
    expect(canAccessAppRoute('/schedule', null)).toBe(false);
    expect(canAccessAppRoute(null, ceo)).toBe(false);
    expect(canAccessAppRoute('/unregistered', ceo)).toBe(false);
    expect(canAccessAppRoute('/login', null)).toBe(true);
  });

  it('하위 route만 active로 본다', () => {
    expect(isAdminNavActive('/reports/12', '/reports')).toBe(true);
    expect(isAdminNavActive('/reports-old', '/reports')).toBe(false);
    expect(isAdminNavActive(null, '/reports')).toBe(false);
  });

  it('기존 배지 snapshot을 재사용한다', () => {
    const reports = ADMIN_NAV_ITEMS.find((item) => item.href === '/reports')!;
    const exec = ADMIN_NAV_ITEMS.find((item) => item.href === '/exec')!;
    expect(adminNavBadgeFor(reports, 'top', { reports: 5 })).toBe(5);
    expect(adminNavBadgeFor(exec, 'top', { approvals: 2 })).toBe(0);
    expect(adminNavBadgeFor(exec, 'sidebar', { approvals: 2 })).toBe(2);
  });
});
