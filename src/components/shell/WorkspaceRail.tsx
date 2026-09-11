/** @file-guide
 * 목적: WorkspaceRail.tsx — WorkspaceRail (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 원본 §07 우측 rail — 여덟 항목과 순서를 그대로 따른다.
 * 각 항목은 기존 전역 AppDrawer pane 을 열기만 한다. GPA 관리는 대응 기능이 아직 없어 비활성으로 표기한다.
 */
'use client';
import { Bell, CheckSquare, GraduationCap, Inbox, LayoutGrid, FileText, Users, Video } from 'lucide-react';
import type { DrawerPane } from '@/components/drawer/AppDrawer';

const ITEMS: Array<{ label: string; pane: DrawerPane | null; icon: typeof Inbox; badge?: 'approvals' | 'unread' }> = [
  { label: '승인 대기함', pane: 'approvals', icon: Inbox, badge: 'approvals' },
  { label: '알림', pane: 'notis', icon: Bell, badge: 'unread' },
  { label: 'GPA 관리', pane: null, icon: GraduationCap },
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
      {ITEMS.map(({ label, pane, icon: Icon, badge }) => {
        const count = badge === 'approvals' ? approvals : badge === 'unread' ? unread : 0;
        return (
          <button
            key={label}
            type="button"
            disabled={!pane}
            onClick={pane ? () => onOpen(pane) : undefined}
            aria-label={label}
            title={pane ? label : `${label} — 준비 중`}
            className="relative flex w-11 flex-col items-center gap-0.5 rounded-md py-1.5 text-fg-subtle transition-colors enabled:hover:bg-inset enabled:hover:text-fg disabled:opacity-40"
          >
            <Icon size={16} aria-hidden />
            <span className="text-[9px] leading-tight">{label}</span>
            {count > 0 ? (
              <span className="absolute right-0.5 top-0 rounded-full bg-red px-1 text-[9px] font-bold text-white">{count}</span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
