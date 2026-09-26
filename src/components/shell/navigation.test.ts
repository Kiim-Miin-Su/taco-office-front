/** @file-guide
 * 목적: navigation.test.ts (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { describe, expect, it } from 'vitest';
import type { Me } from '@/api/types';
import {
  ADMIN_NAV_ITEMS, ONBOARDING_PATH, PASSWORD_RESET_PATH, adminNavBadgeFor, adminNavItemsFor, canAccessAppRoute, fallbackRouteFor,
  isAdminNavActive, mostSpecificNavItem,
} from './navigation';

const ceo: Me = {
  id: 1, name: '대표', role: 'ceo', roleLabel: '대표', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: true, canCrudAttendance: true, canMoney: true, canWage: true,
  canApprove: true, canHide: true, canGpaPack: true,
};
const teacher: Me = {
  ...ceo, id: 2, role: 'teacher', roleLabel: '강사', canAdminPage: false, canCrudAll: false,
  canSeeProfit: false, canCrudAttendance: false, canMoney: false, canWage: false,
  canApprove: false, canHide: false, canGpaPack: false,
};

describe('명세서 탭 노출 SSOT', () => {
  // 강사 메뉴는 강사 원문 덱 §6 의 7개 차례 그대로다(1:1 대조 2026-09-25 — 예전 「3탭」은 넷을 홈 바로가기로 숨겼다)
  it.each(['top', 'sidebar'] as const)('%s에서 대표 10탭, 강사 7메뉴(원문 차례)만 노출한다', (surface) => {
    expect(adminNavItemsFor(surface, ceo)).toHaveLength(10);
    expect(adminNavItemsFor(surface, teacher).map((x) => x.label)).toEqual([
      '홈', '캘린더', '불가 시간', '리포트', '수업 안내', '수업 히스토리', '건의 사항',
    ]);
    expect(adminNavItemsFor(surface, null)).toEqual([]);
    // 관리자 노출분은 표 객체 그대로여야 한다(복제 금지) — 첫 항목은 personalOnly 홈을 건너뛴 /schedule
    expect(adminNavItemsFor(surface, ceo)[0]).toBe(ADMIN_NAV_ITEMS.find((x) => x.href === '/schedule'));
  });

  it('강사 메뉴 패널 7칸은 모두 Figma Teacher/Navigation 아이콘을 갖고, 관리자 전용 탭은 갖지 않는다', () => {
    expect(adminNavItemsFor('sidebar', teacher).map((x) => x.personalIcon)).toEqual([
      'home', 'calendar', 'calendar-x', 'file-text', 'columns', 'history', 'message',
    ]);
    const teacherHrefs = new Set(adminNavItemsFor('sidebar', teacher).map((x) => x.href));
    expect(ADMIN_NAV_ITEMS.filter((x) => !teacherHrefs.has(x.href) && x.personalIcon)).toEqual([]);
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
    expect(canAccessAppRoute('/permissions', teacher)).toBe(false);
    expect(canAccessAppRoute('/permissions', ceo)).toBe(true);
  });

  it.each(['/accounting', '/ops', '/exec', '/intake', '/consulting', '/books', '/guides', '/board', '/permissions'])(
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
    // 켜지는 탭은 가장 좁게 맞는 항목 하나 — 강사 하위 화면에서 「홈」이 같이 켜지지 않는다
    expect(mostSpecificNavItem('/teacher/unavailable')?.href).toBe('/teacher/unavailable');
    expect(mostSpecificNavItem('/teacher')?.href).toBe('/teacher');
    expect(mostSpecificNavItem('/reports/12')?.href).toBe('/reports');
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

/* W8 · 대표 지시 2026-09-26 「첫 로그인 시 아이디·비밀번호 강제 변경 · 변경 안 하면 홈 접속 불가 · 자동 리다이렉션」 */
describe('첫 설정 잠금 — 한 규칙으로 돌려보낸다', () => {
  const locked: Me = { ...ceo, mustChangeCredentials: true };
  const done: Me = { ...ceo, mustChangeCredentials: false };

  it.each(['/', '/schedule', '/ops', '/accounting', '/teacher', '/reports/12', '/unregistered'])(
    '첫 설정 전에는 %s 도 닫고 첫 설정으로 보낸다', (path) => {
      expect(canAccessAppRoute(path, locked)).toBe(false);
      expect(canAccessAppRoute(path, { ...teacher, mustChangeCredentials: true })).toBe(false);
    },
  );

  it('첫 설정 전에는 첫 설정 화면과 로그인만 열린다', () => {
    expect(ONBOARDING_PATH).toBe('/onboarding');
    expect(canAccessAppRoute('/onboarding', locked)).toBe(true);
    expect(canAccessAppRoute('/login', locked)).toBe(true);
    expect(fallbackRouteFor(locked)).toBe('/onboarding');
  });

  it('첫 설정이 필요 없는 계정에게 첫 설정 화면은 닫혀 있고 일정으로 보낸다 — 칸이 없는 옛 Me 도 같다', () => {
    for (const me of [done, ceo, teacher]) {
      expect(canAccessAppRoute('/onboarding', me)).toBe(false);
      expect(fallbackRouteFor(me)).toBe('/schedule');
    }
    expect(canAccessAppRoute('/schedule', done)).toBe(true);
    expect(canAccessAppRoute('/ops', done)).toBe(true);
  });

  // N-101 (대표 결정 2026-09-26) — 비밀번호 찾기는 로그인 전 화면이다(서버 세 API 도 공개)
  it('비밀번호 찾기는 로그아웃 · 첫 설정 전 · 끝난 계정 모두에게 열린다 — 앞자락만 같은 경로는 열리지 않는다', () => {
    expect(PASSWORD_RESET_PATH).toBe('/password-reset');
    for (const me of [null, locked, done, teacher]) expect(canAccessAppRoute('/password-reset', me)).toBe(true);
    expect(canAccessAppRoute('/password-reset/x', null)).toBe(false);
    expect(canAccessAppRoute('/password-resets', null)).toBe(false);
  });

  it('로그아웃 상태는 첫 설정 화면도 닫고 로그인으로 보낸다', () => {
    expect(canAccessAppRoute('/onboarding', null)).toBe(false);
    expect(fallbackRouteFor(null)).toBe('/login');
  });

  it('보낸 곳이 다시 막히지 않는다 — 돌려보내기 고리가 없다', () => {
    for (const me of [locked, done, teacher, null]) {
      expect(canAccessAppRoute(fallbackRouteFor(me), me)).toBe(true);
    }
  });
});
