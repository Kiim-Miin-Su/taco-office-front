/** @file-guide
 * 목적: TeacherMenuPanel.tsx — TeacherMenuPanel (component)
 * 책임/재사용: Figma `Menu panel`(「메뉴 닫기」 + `Teacher/Navigation` 7681:21765)을 그린다. 항목·차례·활성·배지는 navigation.ts 정본을 받기만 하고 목록을 새로 적지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 강사 메뉴 패널 (폭 280).
 * - 웹(sm 이상): 본문 **옆에 나란히** 선다 — [패널 280 | 본문] (C21 「덮는 방식 제거」 · Figma `웹 · 메뉴 · …` 프레임).
 * - 모바일(sm 미만): 화면을 **덮는** 서랍 + 스크림 (Figma `모바일 · 메뉴 · …` — 393 폭에서는 옆에 설 자리가 없다).
 * 한 DOM 을 CSS 한 벌(Tailwind sm)로 가른다 — 폭 판정을 JS 로 두 번 적지 않는다. 포커스 가두기도 같은 CSS 를 읽어
 * 「지금 덮고 있는가(position: fixed)」로만 정한다.
 */
'use client';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import Link from 'next/link';
import {
  Calendar, CalendarX, Columns2, FileText, History, House, MessageSquare, type LucideIcon,
} from 'lucide-react';
import type { Me } from '@/api/types';
import { Button, Chip, Logo, cn } from '@/components/ui';
import {
  adminNavBadgeFor, type AdminNavBadge, type AdminNavItem, type PersonalNavIcon,
} from '@/components/shell/navigation';

/** Figma Icon/* (Lucide) — 이름은 navigation.ts 항목이 갖고, 여기서는 그림만 잇는다 */
const ICON: Record<PersonalNavIcon, LucideIcon> = {
  home: House, calendar: Calendar, 'calendar-x': CalendarX, 'file-text': FileText,
  columns: Columns2, history: History, message: MessageSquare,
};

const FOCUSABLE = 'a[href], button:not([disabled])';

export function TeacherMenuPanel({
  id, items, activeHref, badges, me, onClose, onNavigate,
}: {
  id: string;
  items: readonly AdminNavItem[];
  /** mostSpecificNavItem 이 고른 한 항목 — 하위 화면에서 「홈」까지 켜지지 않게 */
  activeHref: string | undefined;
  badges: Readonly<Partial<Record<AdminNavBadge, number>>>;
  me: Me | null;
  /** 닫고 포커스를 ☰ 로 돌려준다 (Escape · 「메뉴 닫기」 · 스크림) */
  onClose: () => void;
  /** 메뉴를 눌러 이동할 때 — 같은 경로를 다시 눌러도 닫힌다 */
  onNavigate: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 열리면 포커스를 패널 첫 칸(「메뉴 닫기」)으로 옮긴다 — 키보드 사용자가 머리줄에 남아 길을 잃지 않게
    rootRef.current?.querySelector<HTMLElement>(`nav ${FOCUSABLE}`)?.focus();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    const root = rootRef.current;
    if (event.key !== 'Tab' || !root) return;
    // 덮는 패널(모바일)일 때만 가둔다 — 웹 패널은 본문과 나란히 서므로 본문으로 나갈 수 있어야 한다
    if (window.getComputedStyle(root).position !== 'fixed') return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = targets[0];
    const last = targets[targets.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      ref={rootRef} data-teacher-menu="" data-print="chrome" onKeyDown={onKeyDown}
      className="fixed inset-0 z-40 flex sm:static sm:z-auto sm:shrink-0"
    >
      {/* 모바일 스크림 — 패널 밖(Figma Dismiss area)을 누르면 닫힌다. 웹에서는 본문을 덮지 않으므로 없다 */}
      <div data-teacher-menu-scrim="" aria-hidden className="absolute inset-0 bg-fg/40 sm:hidden" onClick={onClose} />
      <nav id={id} aria-label="주 메뉴" className="relative flex h-full w-[280px] flex-col overflow-y-auto bg-card">
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="메뉴 닫기" className="!h-[52px] w-full shrink-0">
          메뉴 닫기 <span aria-hidden>×</span>
        </Button>
        <div className="flex flex-col gap-2 px-3 py-4">
          {/* UI/Wordmark Context=Menu — 로고는 Logo.tsx 한 자리에서만 그린다 (크기 29 → 글자 18px) */}
          <Logo size={29} withMark={false} className="h-[27px]" />
          {items.map((item) => {
            const active = item.href === activeHref;
            const Icon = item.personalIcon ? ICON[item.personalIcon] : null;
            const count = adminNavBadgeFor(item, 'sidebar', badges);
            return (
              <Link
                key={item.href} href={item.href} onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-11 shrink-0 items-center gap-2 rounded-sm px-3 text-[15px] font-bold whitespace-nowrap transition-colors',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg',
                  active ? 'bg-primary text-white' : 'bg-bg text-fg-subtle hover:bg-line',
                )}
              >
                {Icon ? <Icon size={20} aria-hidden className="shrink-0" /> : null}
                {item.label}
                {count > 0 ? (
                  <Chip size="compact" tone="danger" styleKind="solid" className="ml-auto">{count}</Chip>
                ) : null}
              </Link>
            );
          })}
          {/* 역할 낱말도 서버가 만든다 — 화면이 제 표를 들면 관리자 서랍과 여기가 갈린다 */}
          {me ? (
            <p className="text-[13px] font-medium leading-5 text-fg-subtle">{me.name} · {me.title || me.roleLabel}</p>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
