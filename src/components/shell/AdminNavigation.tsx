/** @file-guide
 * 목적: AdminNavigation.tsx — AdminNavBadges, AdminTopNavigation (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import Link from 'next/link';
import type { Me } from '@/api/types';
import { Chip, cn } from '@/components/ui';
import {
  adminNavBadgeFor, adminNavItemsFor, isAdminNavActive,
  type AdminNavBadge, type AdminNavItem,
} from './navigation';

export type AdminNavBadges = Readonly<Partial<Record<AdminNavBadge, number>>>;

function AdminNavLink({
  item,
  pathname,
  badges,
  canAdminPage,
}: {
  item: AdminNavItem;
  pathname: string | null;
  badges: AdminNavBadges;
  canAdminPage: boolean;
}) {
  const active = isAdminNavActive(pathname, item.href);
  const count = adminNavBadgeFor(item, 'top', badges);
  const activeColor = canAdminPage ? 'bg-header-active text-white' : 'bg-blue text-white';

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-bold whitespace-nowrap transition-colors',
        active ? activeColor : 'text-line-2 hover:bg-white/10',
      )}
    >
      {item.label}
      {count > 0 ? (
        <Chip size="compact" tone="danger" styleKind="solid" className={active ? 'ring-1 ring-white/40' : undefined}>
          {count}
        </Chip>
      ) : null}
    </Link>
  );
}

export function AdminTopNavigation({
  pathname,
  badges,
  me,
}: {
  pathname: string | null;
  badges: AdminNavBadges;
  me: Me | null;
}) {
  return (
    <nav aria-label="주 메뉴" className="order-last flex min-w-0 basis-full items-center gap-0.5 overflow-x-auto sm:order-none sm:flex-1 sm:basis-auto">
      {adminNavItemsFor('top', me).map((item) => (
        <AdminNavLink key={item.href} item={item} pathname={pathname} badges={badges} canAdminPage={Boolean(me?.canAdminPage)} />
      ))}
    </nav>
  );
}
