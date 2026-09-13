/** @file-guide
 * 목적: WorkspaceRail.tsx — WorkspaceRail (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 원본 §07 우측 rail — 여덟 항목과 순서를 그대로 따른다.
 *
 * 대부분은 전역 `AppDrawer` 의 칸을 열지만, **GPA 관리는 서랍이 아니라 제 화면(`/gpa`)이 있다.**
 * 한동안 「대응 기능이 아직 없다」며 꺼 두었는데 **그 화면은 이미 돌고 있었고**(수업 상세가 이미
 * 그리로 링크한다) 컷에서도 이 항목은 다른 것과 똑같이 살아 있다. 꺼 두면 있는 기능이 없는 것처럼 보인다.
 */
'use client';
import { Bell, CheckSquare, GraduationCap, Inbox, LayoutGrid, FileText, Users, Video } from 'lucide-react';
import Link from 'next/link';
import type { DrawerPane } from '@/components/drawer/AppDrawer';

/** `pane` 이면 서랍을 열고, `href` 면 그 화면으로 간다 */
const ITEMS: Array<{
  label: string; pane?: DrawerPane; href?: string; icon: typeof Inbox; badge?: 'approvals' | 'unread';
}> = [
  { label: '승인 대기함', pane: 'approvals', icon: Inbox, badge: 'approvals' },
  { label: '알림', pane: 'notis', icon: Bell, badge: 'unread' },
  { label: 'GPA 관리', href: '/gpa', icon: GraduationCap },
  { label: '변경 요청', pane: 'chreqNew', icon: FileText },
  { label: '구성원', pane: 'members', icon: Users },
  { label: '줌 계정', pane: 'zoom', icon: Video },
  { label: '할 일', pane: 'todos', icon: CheckSquare },
  { label: '프로그램', pane: 'kinds', icon: LayoutGrid },
];

export function WorkspaceRail({ approvals, unread, onOpen }: {
  approvals: number;
  unread: number;
  onOpen: (pane: DrawerPane) => void;
}) {
  return (
    <nav aria-label="워크스페이스 바로가기" className="flex h-full w-[52px] flex-col items-center gap-1 overflow-y-auto bg-card py-2">
      {ITEMS.map(({ label, pane, href, icon: Icon, badge }) => {
        const count = badge === 'approvals' ? approvals : badge === 'unread' ? unread : 0;
        const look = 'relative flex w-11 flex-col items-center gap-0.5 rounded-md py-1.5 text-fg-subtle transition-colors hover:bg-inset hover:text-fg';
        const inside = (
          <>
            <Icon size={16} aria-hidden />
            <span className="text-[9px] leading-tight">{label}</span>
            {count > 0 ? (
              <span className="absolute right-0.5 top-0 rounded-full bg-red px-1 text-[9px] font-bold text-white">{count}</span>
            ) : null}
          </>
        );
        // 제 화면이 있는 항목은 링크다 — 서랍 칸이 아니다 (GPA 관리 · 위 주석)
        if (href) {
          return (
            <Link key={label} href={href} aria-label={label} title={label} className={look}>
              {inside}
            </Link>
          );
        }
        return (
          <button
            key={label}
            type="button"
            onClick={pane ? () => onOpen(pane) : undefined}
            aria-label={label}
            title={label}
            className={look}
          >
            {inside}
          </button>
        );
      })}
    </nav>
  );
}
