/** @file-guide
 * 목적: AdminNavigation.tsx — AdminNavBadges, AdminTopNavigation (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import Link from 'next/link';
import type { Me } from '@/api/types';
import { Chip, cn } from '@/components/ui';
import {
  adminNavBadgeFor, adminNavItemsFor, mostSpecificNavItem,
  type AdminNavBadge, type AdminNavItem,
} from './navigation';

export type AdminNavBadges = Readonly<Partial<Record<AdminNavBadge, number>>>;

function AdminNavLink({
  item,
  activeHref,
  badges,
}: {
  item: AdminNavItem;
  activeHref: string | undefined;
  badges: AdminNavBadges;
}) {
  // 켜지는 탭은 가장 좁게 맞는 항목 하나 — 하위 화면에서 상위 탭까지 켜지지 않게
  const active = item.href === activeHref;
  const count = adminNavBadgeFor(item, 'top', badges);
  // 활성 색은 하나다 — 예전 강사용 파랑(bg-blue)은 강사가 TeacherShell(☰ 메뉴 패널)로 옮긴 뒤 닿지 않아 걷었다
  const activeColor = 'bg-header-active text-white';

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
  const activeHref = mostSpecificNavItem(pathname)?.href;
  return (
    <nav aria-label="주 메뉴" className="order-last flex min-w-0 basis-full items-center gap-0.5 overflow-x-auto sm:order-none sm:flex-1 sm:basis-auto">
      {adminNavItemsFor('top', me).map((item) => (
        <AdminNavLink key={item.href} item={item} activeHref={activeHref} badges={badges} />
      ))}
    </nav>
  );
}
