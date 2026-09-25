/** @file-guide
 * 목적: TeacherHeader.tsx — TeacherHeader (component)
 * 책임/재사용: Figma `Teacher/Header`(7686:22061) 한 줄 — ☰ 메뉴 토글 · 지금 메뉴 이름 · 내 이름 · 로그아웃. 메뉴 목록·권한·세션·열림 상태를 소유하지 않는다(TeacherShell 이 넘긴다).
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 강사 표면의 머리줄 — Figma 「현재 · 강사 웹」(7676:21759)·「현재 · 모바일」(7615:1605)의 모든 화면이 이 한 줄이다.
 * 관리자 머리줄(오늘 전체·뒤로·되돌리기·업무 탭·전체 화면·권한)은 강사 덱·Figma 에 없으므로 그리지 않는다.
 * 누름 칸은 44px 높이다 — Figma 설명 「44px actions」(모바일 손가락 칸). UI/Button 두 크기(32/40)에 44 가 없어
 * 기존 관례(`!h-*`)로 높이만 올린다. 색은 UI/Button ghost(= Figma Spec Ghost: bg · fg-subtle) 그대로다.
 */
'use client';
import { Button } from '@/components/ui';

export function TeacherHeader({
  title, name, menuOpen, menuId, toggleId, onToggleMenu, onLogout,
}: {
  /** 지금 켜진 메뉴의 강사 표시 이름(navigation.ts) — 맞는 메뉴가 없으면 비운다 */
  title: string;
  name?: string;
  menuOpen: boolean;
  menuId: string;
  /** Escape·「메뉴 닫기」 뒤 포커스를 돌려받을 자리 */
  toggleId: string;
  onToggleMenu: () => void;
  onLogout: () => void;
}) {
  return (
    <header data-print="chrome" className="flex h-14 shrink-0 items-center gap-2 bg-header px-2">
      <Button
        id={toggleId} variant="ghost" size="sm" onClick={onToggleMenu}
        aria-label="메뉴" aria-expanded={menuOpen} aria-controls={menuOpen ? menuId : undefined}
        className="!h-11 w-10 shrink-0"
      >
        <span aria-hidden>☰</span>
      </Button>
      <span className="min-w-0 flex-1 truncate text-[16px] font-bold leading-6 text-white">{title}</span>
      {name ? <span className="shrink-0 whitespace-nowrap text-[12px] font-medium text-white">{name}</span> : null}
      <Button variant="ghost" size="sm" onClick={onLogout} className="!h-11 shrink-0">로그아웃</Button>
    </header>
  );
}
