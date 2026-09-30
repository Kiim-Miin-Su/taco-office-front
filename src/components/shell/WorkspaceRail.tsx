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
 *
 * **지금 열린 칸은 어두운 채운 타일**이다(원문 §14~§21 · g2 대조 C-2). 서랍이 레일 왼쪽에 붙으면서
 * 레일이 곧 칸 전환 줄이 됐으므로, 어느 칸을 보고 있는지를 레일이 말한다. 무엇이 열렸는지는
 * 셸이 쥔 서랍 상태 하나(`activePane`)에서 온다 — 레일이 따로 기억하지 않는다.
 *
 * 아이콘·구분선·굵은 라벨은 원문 레일 그대로다(g2 대조 C-5) — GPA 관리=시계 · 변경 요청=되감기 시계 ·
 * 구성원=사람+ · 할 일=달력 체크, 구분선은 「승인 대기함」 뒤와 「변경 요청」 뒤.
 */
'use client';
import { Fragment, useEffect, useSyncExternalStore } from 'react';
import { Bell, CalendarCheck, Clock, History, Inbox, LayoutGrid, UserPlus, Video } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/components/ui';
import type { DrawerPane } from '@/components/drawer/AppDrawer';

/** `pane` 이면 서랍을 열고, `href` 면 그 화면으로 간다. `divider` 는 그 항목 **뒤**의 구분선 */
const ITEMS: Array<{
  label: string; pane?: DrawerPane; href?: string; icon: typeof Inbox; badge?: 'approvals' | 'unread'; divider?: boolean;
}> = [
  { label: '승인 대기함', pane: 'approvals', icon: Inbox, badge: 'approvals', divider: true },
  { label: '알림', pane: 'notis', icon: Bell, badge: 'unread' },
  { label: 'GPA 관리', href: '/gpa', icon: Clock },
  // 원문 레일의 「변경 요청」은 §20 「변경 요청 · 이력」 칸이다 — 넣기(§19)는 그 칸의 「+ 변경 요청」 창 (g2 20-1)
  { label: '변경 요청', pane: 'chreqs', icon: History, divider: true },
  { label: '구성원', pane: 'members', icon: UserPlus },
  { label: '줌 계정', pane: 'zoom', icon: Video },
  { label: '할 일', pane: 'todos', icon: CalendarCheck },
  { label: '프로그램', pane: 'kinds', icon: LayoutGrid },
];

/*
 * **레일이 떠 있는가** — 서랍(§14~§21)이 제 칸 전환 줄을 그릴지 정하는 한 가지 사실이다(g2 대조 C-3).
 * 원문 서랍 안에는 칸 전환 줄이 없고 레일이 그 일을 한다. 모든 관리자 업무 탭에서 공통 셸이 레일을 제공하지만
 * 사용자가 접어 둔 채 서랍을 열면 서랍 안 줄이 유일한 전환 수단이다.
 * 그래서 레일 자신이 떠 있는 동안을 알린다 — 셸이나 화면이 따로 기억하면 두 곳이 갈린다.
 */
let railsMounted = 0;
const railListeners = new Set<() => void>();
const emitRail = () => railListeners.forEach((listener) => listener());
const subscribeRail = (listener: () => void) => {
  railListeners.add(listener);
  return () => { railListeners.delete(listener); };
};

/** 레일이 지금 화면에 떠 있으면 true — 서버 렌더에서는 늘 false 다 */
export function useRailPresent(): boolean {
  return useSyncExternalStore(subscribeRail, () => railsMounted > 0, () => false);
}

export function WorkspaceRail({ approvals, unread, onOpen, activePane = null }: {
  approvals: number;
  unread: number;
  onOpen: (pane: DrawerPane) => void;
  /** 지금 열린 서랍 칸 — 서랍이 닫혀 있으면 null (셸의 `WorkspacePanelApi.activePane`) */
  activePane?: DrawerPane | null;
}) {
  useEffect(() => {
    railsMounted += 1;
    emitRail();
    return () => { railsMounted -= 1; emitRail(); };
  }, []);

  return (
    <nav aria-label="워크스페이스 바로가기" className="flex h-full w-[52px] flex-col items-center gap-1 overflow-y-auto bg-card py-2">
      {ITEMS.map(({ label, pane, href, icon: Icon, badge, divider }) => {
        const count = badge === 'approvals' ? approvals : badge === 'unread' ? unread : 0;
        const active = pane !== undefined && pane === activePane;
        const look = cn(
          'relative flex w-11 flex-col items-center gap-0.5 rounded-md py-1.5 transition-colors',
          // 색은 머리줄과 같은 토큰이다 — 원문의 어두운 타일이 머리줄 색이다 (D-R41)
          active ? 'bg-header text-white' : 'text-fg-subtle hover:bg-inset hover:text-fg',
        );
        const inside = (
          <>
            <Icon size={16} aria-hidden />
            <span className="text-[9px] font-bold leading-tight">{label}</span>
            {count > 0 ? (
              <span className="absolute right-0.5 top-0 rounded-full bg-red px-1 text-[9px] font-bold text-white">{count}</span>
            ) : null}
          </>
        );
        // 제 화면이 있는 항목은 링크다 — 서랍 칸이 아니다 (GPA 관리 · 위 주석)
        const item = href ? (
          <Link href={href} aria-label={label} title={label} className={look}>
            {inside}
          </Link>
        ) : (
          <button
            type="button"
            onClick={pane ? () => onOpen(pane) : undefined}
            aria-label={label}
            aria-pressed={active}
            title={label}
            className={look}
          >
            {inside}
          </button>
        );
        return (
          <Fragment key={label}>
            {item}
            {divider ? <span role="separator" aria-hidden className="my-1 h-px w-8 shrink-0 bg-line" /> : null}
          </Fragment>
        );
      })}
    </nav>
  );
}
