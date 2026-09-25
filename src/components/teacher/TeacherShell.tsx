/** @file-guide
 * 목적: TeacherShell.tsx — TeacherShell (component)
 * 책임/재사용: 강사 표면의 틀 — [메뉴 패널 | 머리줄 + 본문]. 메뉴 열림·포커스 반환만 소유하고 항목·활성·권한은 navigation.ts(adminNavItemsFor·mostSpecificNavItem)를 그대로 쓴다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * AppShell 이 강사(= canAdminPage 가 아닌 로그인 사용자)에게만 조립한다. 관리자 셸은 이것을 쓰지 않는다.
 *
 * 전에는 강사에게도 관리자식 상단 탭 7개가 섰고 모바일에서는 가로로 밀렸다. 강사 덱·Figma 는
 * 머리줄의 ☰ 가 여는 **메뉴 패널**이다 — 기본은 접힘, 누르면 열림, 메뉴를 고르면 닫힘.
 * 패널은 머리줄보다 한 층 바깥(왼쪽 전체 높이)에 선다: Figma `웹 · 메뉴` 에서 「메뉴 닫기」가 머리줄 높이에 있다.
 */
'use client';
import { useId, useState, type ReactNode } from 'react';
import type { Me } from '@/api/types';
import { useUnwritten } from '@/api/queries';
import { adminNavItemsFor, mostSpecificNavItem } from '@/components/shell/navigation';
import { TeacherHeader } from './TeacherHeader';
import { TeacherMenuPanel } from './TeacherMenuPanel';

export function TeacherShell({ pathname, me, onLogout, children }: {
  pathname: string | null;
  me: Me | null;
  onLogout: () => void;
  /** 본문(main) — 여백·스크롤은 AppShell 이 정한다 */
  children: ReactNode;
}) {
  const menuId = useId();
  const toggleId = useId();
  /*
   * 「어느 경로에서 열었나」를 기억한다 — 경로가 바뀌면(메뉴 이동·뒤로 가기) 별도 효과 없이 저절로 닫힌다.
   * 열림을 boolean 으로 두면 이동 뒤 닫는 effect 가 한 번 더 그려야 하고, 그 사이 패널이 새 화면을 한 번 덮는다.
   */
  const here = pathname ?? '';
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === here;

  // 강사 메뉴 = 관리자 표와 같은 한 표(개인용 표시 이름 적용). 켜진 칸도 직접 URL 권한과 같은 판정이다
  const items = adminNavItemsFor('sidebar', me);
  const activeHref = mostSpecificNavItem(pathname)?.href;
  const title = items.find((item) => item.href === activeHref)?.label ?? '';
  // 리포트 칸의 숫자는 본인 미작성 수(서버가 본인으로 고정) — 패널이 보일 때만 부른다
  const unwritten = useUnwritten(undefined, open).data;

  function close(returnFocus: boolean) {
    setOpenOn(null);
    // ☰ 는 늘 머리줄에 있다 — 패널이 사라지기 전에 포커스를 옮겨 둔다
    if (returnFocus) document.getElementById(toggleId)?.focus();
  }

  return (
    <div className="flex min-h-0 flex-1">
      {open ? (
        <TeacherMenuPanel
          id={menuId} items={items} activeHref={activeHref} me={me}
          badges={{ reports: unwritten?.total ?? 0 }}
          onClose={() => close(true)} onNavigate={() => close(false)}
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <TeacherHeader
          title={title} name={me?.name} menuOpen={open} menuId={menuId} toggleId={toggleId}
          onToggleMenu={() => (open ? close(false) : setOpenOn(here))} onLogout={onLogout}
        />
        {children}
      </div>
    </div>
  );
}
