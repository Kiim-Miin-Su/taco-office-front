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

export interface AdminNavItem {
  href: string;
  label: string;
  /** 관리자 화면이 없는 개인용 UI의 표시 이름. URL/권한 규칙은 공유한다. */
  personalLabel?: string;
  surfaces: readonly AdminNavSurface[];
  icon?: AdminNavIcon;
  badge?: AdminNavBadge;
  badgeSurfaces?: readonly AdminNavSurface[];
  /** 서버의 최종 플래그를 소비한다. 역할/직함을 화면에서 다시 판정하지 않는다. */
  requires?: readonly (keyof Pick<Me, 'canAdminPage' | 'canCrudAll' | 'canMoney'>)[];
}

const BOTH = ['top', 'sidebar'] as const satisfies readonly AdminNavSurface[];
const ADMIN = ['canAdminPage', 'canCrudAll'] as const;

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { href: '/schedule', label: '스케줄', personalLabel: '캘린더', surfaces: BOTH, icon: 'calendar' },
  { href: '/intake', label: '상담', surfaces: BOTH, icon: 'calendar', requires: ADMIN },
  { href: '/consulting', label: '컨설팅', surfaces: BOTH, icon: 'calendar', requires: ADMIN },
  { href: '/board', label: '수업', surfaces: BOTH, icon: 'calendar', requires: ADMIN },
  { href: '/books', label: '교재', surfaces: BOTH, icon: 'calendar', requires: ADMIN },
  { href: '/guides', label: '수업 안내', surfaces: BOTH, icon: 'calendar', requires: ADMIN },
  {
    href: '/reports', label: '리포트', surfaces: BOTH, icon: 'approval', badge: 'reports',
    badgeSurfaces: BOTH,
  },
  { href: '/accounting', label: '회계', surfaces: BOTH, icon: 'calendar', requires: [...ADMIN, 'canMoney'] },
  { href: '/ops', label: '운영', surfaces: BOTH, icon: 'calendar', requires: ADMIN },
  {
    href: '/exec', label: '대표 보고', surfaces: BOTH, icon: 'approval', badge: 'approvals',
    badgeSurfaces: ['sidebar'],
    requires: ADMIN,
  },
  // §76은 업무 탭이 아니라 상단 유틸리티에서 여는 모달이다. 옛 URL 접근만 유지한다.
  { href: '/permissions', label: '권한', surfaces: [] },
] as const;

export function canAccessNavItem(item: AdminNavItem, me: Me | null): boolean {
  return Boolean(me && (item.requires ?? []).every((flag) => me[flag] === true));
}

export function adminNavItemsFor(surface: AdminNavSurface, me: Me | null): readonly AdminNavItem[] {
  return ADMIN_NAV_ITEMS
    .filter((item) => item.surfaces.includes(surface) && canAccessNavItem(item, me))
    .map((item) => !me?.canAdminPage && item.personalLabel ? { ...item, label: item.personalLabel } : item);
}

/** 메뉴와 직접 URL 진입이 같은 규칙을 사용한다. 미등록 업무 경로는 기본 거절한다. */
export function canAccessAppRoute(pathname: string | null, me: Me | null): boolean {
  if (pathname === '/login') return true;
  if (!me || !pathname) return false;
  if (pathname === '/') return true;
  const item = ADMIN_NAV_ITEMS.find((nav) => isAdminNavActive(pathname, nav.href));
  return Boolean(item && canAccessNavItem(item, me));
}

export function isAdminNavActive(pathname: string | null, href: string): boolean {
  return pathname === href || Boolean(pathname?.startsWith(`${href}/`));
}

export function adminNavBadgeFor(
  item: AdminNavItem,
  surface: AdminNavSurface,
  badges: Readonly<Partial<Record<AdminNavBadge, number>>>,
): number {
  if (!item.badge || !item.badgeSurfaces?.includes(surface)) return 0;
  return Math.max(0, badges[item.badge] ?? 0);
}
