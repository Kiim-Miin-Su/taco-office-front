/** @file-guide
 * 목적: navigation.ts — AdminNavSurface, AdminNavIcon, AdminNavBadge, AdminNavItem, ADMIN_NAV_ITEMS 등 (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 관리자 내비게이션의 단일 진실원.
 *
 * 상단 탭과 Sidebar가 각자 href/라벨/배지를 적으면 화면을 추가할 때 한쪽이 반드시 빠진다.
 * Figma `Shell/Admin Top Tabs`와 `Shell/Sidebar`는 이 배열과 active 판정을 같이 쓴다.
 */
import type { Me } from '@/api/types';

export type AdminNavSurface = 'top' | 'sidebar';
export type AdminNavIcon = 'calendar' | 'approval';
export type AdminNavBadge = 'reports' | 'approvals';
/**
 * 강사 메뉴 패널의 앞 아이콘 — Figma `Teacher/Navigation`(7681:21765) 의 Icon INSTANCE_SWAP 값(Lucide 이름).
 * 아이콘을 패널 쪽 href 표로 따로 적으면 메뉴 목록이 두 벌이 된다 — 그래서 항목 옆에 둔다.
 */
export type PersonalNavIcon = 'home' | 'calendar' | 'calendar-x' | 'file-text' | 'columns' | 'history' | 'message';

export interface AdminNavItem {
  href: string;
  label: string;
  /** 관리자 화면이 없는 개인용 UI의 표시 이름. URL/권한 규칙은 공유한다. */
  personalLabel?: string;
  /** 개인용(강사) 메뉴 패널에서만 그리는 앞 아이콘. 관리자 상단 탭은 쓰지 않는다. */
  personalIcon?: PersonalNavIcon;
  surfaces: readonly AdminNavSurface[];
  icon?: AdminNavIcon;
  badge?: AdminNavBadge;
  badgeSurfaces?: readonly AdminNavSurface[];
  /** 서버의 최종 플래그를 소비한다. 역할/직함을 화면에서 다시 판정하지 않는다. */
  requires?: readonly (keyof Pick<Me, 'canAdminPage' | 'canCrudAll' | 'canMoney'>)[];
  /** 개인용(강사) UI 전용 — 관리자 화면 사용자는 메뉴·직접 URL 모두 닫는다. */
  personalOnly?: boolean;
}

const BOTH = ['top', 'sidebar'] as const satisfies readonly AdminNavSurface[];
const ADMIN = ['canAdminPage', 'canCrudAll'] as const;

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  /* 강사 메뉴 7개 — 강사 원문 덱 §6 「① 홈 ② 캘린더 ③ 불가 시간 ④ 리포트 ⑤ 수업 안내 ⑥ 수업 히스토리 ⑦ 건의 사항」
     (Figma 강사 웹 Menu panel 과 같은 차례 · 1:1 대조 2026-09-25). 예전에는 넷을 홈 바로가기로만 두어 상단에
     셋만 섰고, 하위 화면에서 「홈」 탭이 켜졌다. 개인용 항목은 관리 화면 사용자에게 걸러지므로 관리자 차례는 그대로다. */
  { href: '/teacher', label: '홈', personalIcon: 'home', surfaces: BOTH, icon: 'calendar', personalOnly: true },
  { href: '/schedule', label: '스케줄', personalLabel: '캘린더', personalIcon: 'calendar', surfaces: BOTH, icon: 'calendar' },
  // 2026-09-30 추가 요구: 실제 목록·상세 route가 있는 학생/강사 탭. 개인 강사 홈(/teacher)과 다르다.
  { href: '/students', label: '학생', surfaces: BOTH, requires: ADMIN },
  { href: '/staff', label: '강사', surfaces: BOTH, requires: ADMIN },
  { href: '/teacher/unavailable', label: '불가 시간', personalIcon: 'calendar-x', surfaces: BOTH, personalOnly: true },
  { href: '/intake', label: '상담', surfaces: BOTH, icon: 'calendar', requires: ADMIN },
  { href: '/consulting', label: '컨설팅', surfaces: BOTH, icon: 'calendar', requires: ADMIN },
  { href: '/board', label: '수업', surfaces: BOTH, icon: 'calendar', requires: ADMIN },
  { href: '/books', label: '교재', surfaces: BOTH, icon: 'calendar', requires: ADMIN },
  { href: '/guides', label: '수업 안내', surfaces: BOTH, icon: 'calendar', requires: ADMIN },
  {
    href: '/reports', label: '리포트', personalIcon: 'file-text', surfaces: BOTH, icon: 'approval', badge: 'reports',
    badgeSurfaces: BOTH,
  },
  { href: '/teacher/guides', label: '수업 안내', personalIcon: 'columns', surfaces: BOTH, personalOnly: true },
  { href: '/teacher/history', label: '수업 히스토리', personalIcon: 'history', surfaces: BOTH, personalOnly: true },
  { href: '/teacher/suggestions', label: '건의 사항', personalIcon: 'message', surfaces: BOTH, personalOnly: true },
  { href: '/accounting', label: '회계', surfaces: BOTH, icon: 'calendar', requires: [...ADMIN, 'canMoney'] },
  { href: '/ops', label: '운영', surfaces: BOTH, icon: 'calendar', requires: ADMIN },
  {
    href: '/exec', label: '대표 보고', surfaces: BOTH, icon: 'approval', badge: 'approvals',
    badgeSurfaces: ['sidebar'],
    requires: ADMIN,
  },
  // §82 GPA 관리 — 상단 업무 탭 밖의 관리자 화면. kind='gpa' 수업 상세에서 연다 (URL 전용).
  { href: '/gpa', label: 'GPA 관리', surfaces: [], requires: ADMIN },
  /* §21 서랍의 「줌 계정 관리」가 가는 자리 · §18 의 「프로그램·과목 전체 열기」가 가는 자리.
     둘 다 원본 61컷에 **목적지 화면이 없었다** — 대표 결정(2026-09-12)으로 신설했다.
     원문 상단 10탭에는 없던 화면으로, 서랍 단추와 URL 로만 연다(신규 학생/강사 탭과 별개). */
  { href: '/zoom', label: '줌 계정 관리', surfaces: [], requires: ADMIN },
  { href: '/programs', label: '프로그램 · 과목 관리', surfaces: [], requires: ADMIN },
  { href: '/phrases', label: '문구 관리', surfaces: [], requires: ADMIN },
  // §76은 업무 탭이 아니라 상단 유틸리티에서 여는 관리자 모달이다. 옛 URL도 같은 관리자 경계를 쓴다.
  { href: '/permissions', label: '권한', surfaces: [], requires: ADMIN },
] as const;

export function canAccessNavItem(item: AdminNavItem, me: Me | null): boolean {
  if (item.personalOnly && me?.canAdminPage) return false;
  return Boolean(me && (item.requires ?? []).every((flag) => me[flag] === true));
}

export function adminNavItemsFor(surface: AdminNavSurface, me: Me | null): readonly AdminNavItem[] {
  return ADMIN_NAV_ITEMS
    .filter((item) => item.surfaces.includes(surface) && canAccessNavItem(item, me))
    .map((item) => !me?.canAdminPage && item.personalLabel ? { ...item, label: item.personalLabel } : item);
}

/**
 * 첫 설정 화면 (W8 · 대표 지시 2026-09-26 「첫 로그인 시 아이디·비밀번호 강제 변경 · 변경 안 하면 홈 접속 불가 · 자동 리다이렉션」).
 * 첫 설정 전 계정이 열 수 있는 유일한 앱 경로다. 판정 재료는 서버가 준 `me.mustChangeCredentials` 하나다.
 */
export const ONBOARDING_PATH = '/onboarding';

/**
 * 로그인 전에도 열리는 경로 — 로그인 · 비밀번호 찾기(N-101 · 대표 결정 2026-09-26).
 * 비밀번호 찾기의 세 API 도 서버에서 공개(@Public)다. 첫 설정 전 계정도 열 수 있다(찾아도 첫 설정은 그대로 남는다).
 */
export const PASSWORD_RESET_PATH = '/password-reset';
const PUBLIC_PATHS: ReadonlySet<string> = new Set(['/login', PASSWORD_RESET_PATH]);

/** 메뉴와 직접 URL 진입이 같은 규칙을 사용한다. 미등록 업무 경로는 기본 거절한다. */
export function canAccessAppRoute(pathname: string | null, me: Me | null): boolean {
  if (pathname !== null && PUBLIC_PATHS.has(pathname)) return true;
  if (!me || !pathname) return false;
  // 첫 설정 전에는 첫 설정 화면만 · 필요 없는 계정에게 첫 설정 화면은 닫는다 — 서버도 같은 계정의 다른 API 를 403 으로 막는다
  if (me.mustChangeCredentials) return pathname === ONBOARDING_PATH;
  if (pathname === ONBOARDING_PATH) return false;
  if (pathname === '/') return true;
  const item = mostSpecificNavItem(pathname);
  return Boolean(item && canAccessNavItem(item, me));
}

/**
 * 막힌 경로에서 보낼 곳 — 로그아웃은 로그인, 첫 설정 전은 첫 설정, 나머지는 일정.
 * 보낸 곳은 위 규칙에서 늘 열려 있다(돌려보내기 고리가 없다 · navigation.test).
 */
export function fallbackRouteFor(me: Me | null): string {
  if (!me) return '/login';
  return me.mustChangeCredentials ? ONBOARDING_PATH : '/schedule';
}

export function isAdminNavActive(pathname: string | null, href: string): boolean {
  return pathname === href || Boolean(pathname?.startsWith(`${href}/`));
}

/**
 * 이 경로를 가장 좁게 맞추는 항목 — `/teacher/unavailable` 은 `/teacher` 도 앞자락으로 맞지만 제 항목이 있다.
 * 활성 탭과 직접 URL 권한이 같은 판정을 쓴다(둘이 다른 항목을 고르면 켜진 탭과 막는 규칙이 갈린다).
 */
export function mostSpecificNavItem(pathname: string | null): AdminNavItem | undefined {
  return ADMIN_NAV_ITEMS
    .filter((nav) => isAdminNavActive(pathname, nav.href))
    .reduce<AdminNavItem | undefined>((best, nav) => (!best || nav.href.length > best.href.length ? nav : best), undefined);
}

export function adminNavBadgeFor(
  item: AdminNavItem,
  surface: AdminNavSurface,
  badges: Readonly<Partial<Record<AdminNavBadge, number>>>,
): number {
  if (!item.badge || !item.badgeSurfaces?.includes(surface)) return 0;
  return Math.max(0, badges[item.badge] ?? 0);
}
