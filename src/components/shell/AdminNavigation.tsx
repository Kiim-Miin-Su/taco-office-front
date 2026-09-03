import Link from 'next/link';
import { CalendarDays, SquareCheckBig, type LucideIcon } from 'lucide-react';
import type { Me } from '@/api/types';
import { Chip, Logo, cn } from '@/components/ui';
import { ROLE_LABEL } from '@/lib/roles';
import {
  adminNavBadgeFor, adminNavItemsFor, isAdminNavActive,
  type AdminNavBadge, type AdminNavIcon, type AdminNavItem, type AdminNavSurface,
} from './navigation';

export type AdminNavBadges = Readonly<Partial<Record<AdminNavBadge, number>>>;

const ICONS: Record<AdminNavIcon, LucideIcon> = {
  calendar: CalendarDays,
  approval: SquareCheckBig,
};

function AdminNavLink({
  item,
  pathname,
  surface,
  badges,
}: {
  item: AdminNavItem;
  pathname: string | null;
  surface: AdminNavSurface;
  badges: AdminNavBadges;
}) {
  const active = isAdminNavActive(pathname, item.href);
  const count = adminNavBadgeFor(item, surface, badges);
  const Icon = item.icon ? ICONS[item.icon] : null;

  if (surface === 'top') {
    return (
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-bold whitespace-nowrap transition-colors',
          active ? 'bg-blue text-white' : 'text-line-2 hover:bg-white/10',
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

  return (
    <Link
      href={item.href}
      title={item.label}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] transition-colors',
        'xl:h-12 xl:w-full xl:justify-start xl:gap-3 xl:px-3.5',
        active ? 'bg-blue/10 text-blue' : 'text-fg-subtle hover:bg-inset hover:text-fg-2',
      )}
    >
      {Icon ? <Icon aria-hidden="true" className="h-5 w-5 shrink-0" strokeWidth={1.8} /> : null}
      <span className={cn('hidden min-w-0 flex-1 text-[14px] xl:block', active && 'font-bold')}>
        {item.label}
      </span>
      {count > 0 ? (
        <>
          <span aria-hidden="true" className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red xl:hidden" />
          <Chip size="compact" tone="danger" styleKind="solid" className="hidden xl:inline-flex">
            {count}
          </Chip>
        </>
      ) : null}
    </Link>
  );
}

export function AdminTopNavigation({
  pathname,
  badges,
}: {
  pathname: string | null;
  badges: AdminNavBadges;
}) {
  return (
    <nav aria-label="주 메뉴" className="flex flex-1 items-center gap-0.5 overflow-x-auto">
      {adminNavItemsFor('top').map((item) => (
        <AdminNavLink key={item.href} item={item} pathname={pathname} surface="top" badges={badges} />
      ))}
    </nav>
  );
}

function avatarText(name?: string): string {
  const letters = Array.from(name?.trim() || '관리');
  return letters.slice(-2).join('');
}

export function AdminSidebar({
  pathname,
  me,
  badges,
}: {
  pathname: string | null;
  me: Me | null;
  badges: AdminNavBadges;
}) {
  const roleName = me ? ROLE_LABEL[me.role] ?? me.role : '';

  return (
    <aside
      aria-label="관리자 메뉴"
      className="hidden min-h-[calc(100vh-50px)] shrink-0 flex-col overflow-hidden border-r border-line bg-card lg:flex lg:w-[var(--side-rail-w)] xl:w-[var(--side-w)]"
    >
      <div className="flex h-[72px] shrink-0 items-center justify-center xl:justify-start xl:gap-2.5 xl:px-4">
        <Logo size={32} withName={false} />
        <div className="hidden min-w-0 xl:block">
          <div className="whitespace-nowrap text-[16px] font-bold text-blue">TACO ERP</div>
          <div className="whitespace-nowrap text-[11px] text-fg-subtle">TN Academy · 관리자</div>
        </div>
      </div>

      <nav aria-label="관리자 업무" className="flex flex-col items-center gap-1 px-2 pt-2 xl:items-stretch xl:px-3">
        {adminNavItemsFor('sidebar').map((item) => (
          <AdminNavLink key={item.href} item={item} pathname={pathname} surface="sidebar" badges={badges} />
        ))}
      </nav>

      <div className="min-h-4 flex-1" />
      <div className="flex h-[72px] shrink-0 items-center justify-center border-t border-line xl:justify-start xl:gap-2.5 xl:px-4">
        <span className="grid h-[34px] min-w-[34px] place-items-center rounded-full bg-blue/10 px-1 text-[11px] font-bold text-blue">
          {avatarText(me?.name)}
        </span>
        <div className="hidden min-w-0 xl:block">
          <div className="truncate text-[13px] font-bold text-fg">{me?.name ?? ''}</div>
          <div className="truncate text-[11px] text-fg-subtle">
            {me ? `${me.title ?? roleName} · 마이 페이지` : ''}
          </div>
        </div>
      </div>
    </aside>
  );
}
