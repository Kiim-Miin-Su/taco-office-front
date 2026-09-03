/**
 * 관리자 내비게이션의 단일 진실원.
 *
 * 상단 탭과 Sidebar가 각자 href/라벨/배지를 적으면 화면을 추가할 때 한쪽이 반드시 빠진다.
 * Figma `Shell/Admin Top Tabs`와 `Shell/Sidebar`는 이 배열과 active 판정을 같이 쓴다.
 */
export type AdminNavSurface = 'top' | 'sidebar';
export type AdminNavIcon = 'calendar' | 'approval';
export type AdminNavBadge = 'reports' | 'approvals';

export interface AdminNavItem {
  href: string;
  label: string;
  surfaces: readonly AdminNavSurface[];
  icon?: AdminNavIcon;
  badge?: AdminNavBadge;
  badgeSurfaces?: readonly AdminNavSurface[];
}

const BOTH = ['top', 'sidebar'] as const satisfies readonly AdminNavSurface[];

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { href: '/schedule', label: '스케줄', surfaces: BOTH, icon: 'calendar' },
  { href: '/intake', label: '상담', surfaces: BOTH, icon: 'calendar' },
  { href: '/consulting', label: '컨설팅', surfaces: BOTH, icon: 'calendar' },
  { href: '/board', label: '수업 현황판', surfaces: BOTH, icon: 'calendar' },
  { href: '/books', label: '교재', surfaces: BOTH, icon: 'calendar' },
  { href: '/guides', label: '수업 안내', surfaces: BOTH, icon: 'calendar' },
  {
    href: '/reports', label: '리포트', surfaces: BOTH, icon: 'approval', badge: 'reports',
    badgeSurfaces: BOTH,
  },
  { href: '/accounting', label: '회계', surfaces: BOTH, icon: 'calendar' },
  { href: '/ops', label: '운영', surfaces: BOTH, icon: 'calendar' },
  {
    href: '/exec', label: '대표 보고', surfaces: BOTH, icon: 'approval', badge: 'approvals',
    badgeSurfaces: ['sidebar'],
  },
  // §76은 명세 화면이지만 Figma Sidebar의 관리자 탭 10개에는 없다. 기존 접근 경로는 상단에 유지한다.
  { href: '/permissions', label: '권한', surfaces: ['top'] },
] as const;

export function adminNavItemsFor(surface: AdminNavSurface): readonly AdminNavItem[] {
  return ADMIN_NAV_ITEMS.filter((item) => item.surfaces.includes(surface));
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
