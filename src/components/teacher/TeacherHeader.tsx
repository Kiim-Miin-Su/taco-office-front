/** @file-guide
 * 목적: TeacherHeader.tsx — TeacherHeader (component)
 * 책임/재사용: Figma `Teacher/Header`(7686:22061) · 강사 덱 머리줄 한 줄 — ☰ 메뉴 토글 · 지금 메뉴 이름 · 시간대 · 시급 · 이름·역할 · 로그아웃 · 🔔 알림. 메뉴 목록·권한·세션·열림 상태·알림 목록을 소유하지 않는다(TeacherShell 이 넘긴다).
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 강사 표면의 머리줄 — Figma 「현재 · 강사 웹」(7676:21759)·「현재 · 모바일」(7615:1605)의 모든 화면이 이 한 줄이다.
 * 관리자 머리줄(오늘 전체·뒤로·되돌리기·업무 탭·전체 화면·권한)은 강사 덱·Figma 에 없으므로 그리지 않는다.
 * 강사 덱 머리줄 오른쪽 차례 그대로: 「◷ Seoul · UTC+9」 · 「₩ 45,000원/시간」 · 「김범준 · 강사」 · 「로그아웃」 · 🔔.
 * 덱의 「관리자 화면 미리보기」는 강사에게 남기지 않는다(AGENT.md §B). 시간대·시급·역할 낱말은 서버 값이다.
 * 좁은 화면(모바일 393)에서는 시간대·시급·역할을 메뉴 패널 사용자 칸으로 미루고 🔔 는 남긴다.
 * 누름 칸은 44px 높이다 — Figma 설명 「44px actions」(모바일 손가락 칸). UI/Button 두 크기(32/40)에 44 가 없어
 * 기존 관례(`!h-*`)로 높이만 올린다. 색은 UI/Button ghost(= Figma Spec Ghost: bg · fg-subtle) 그대로다.
 */
'use client';
import { Bell, Clock3 } from 'lucide-react';
import { Button, Chip } from '@/components/ui';

export function TeacherHeader({
  title, name, roleLabel, tzLabel, wageRate, unread = 0, notiOpen = false,
  menuOpen, menuId, toggleId, onToggleMenu, onLogout, onOpenNotis,
}: {
  /** 지금 켜진 메뉴의 강사 표시 이름(navigation.ts) — 맞는 메뉴가 없으면 비운다 */
  title: string;
  name?: string;
  /** 역할 낱말 — 서버 `MeDto.title || roleLabel` */
  roleLabel?: string | null;
  /** 서버가 지은 「Seoul · UTC+9」 — 없으면(읽는 중) 칸을 그리지 않는다 */
  tzLabel?: string | null;
  /** 오늘 적용 시급(원/시간) — null 이면 칸을 그리지 않는다 */
  wageRate?: number | null;
  /** 안 읽은 내 알림 수 — 서버 값 */
  unread?: number;
  notiOpen?: boolean;
  menuOpen: boolean;
  menuId: string;
  /** Escape·「메뉴 닫기」 뒤 포커스를 돌려받을 자리 */
  toggleId: string;
  onToggleMenu: () => void;
  onLogout: () => void;
  /** 없으면 🔔 를 그리지 않는다(알림을 읽을 수 없는 자리에서 빈 단추를 세우지 않는다) */
  onOpenNotis?: () => void;
}) {
  const pill = 'hidden h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-header-tool-line bg-header-tool px-2 text-[12px] font-bold text-line-2 md:flex';
  return (
    <header data-print="chrome" className="flex h-14 shrink-0 items-center gap-2 bg-header px-2">
      <Button
        id={toggleId} variant="ghost" size="sm" onClick={onToggleMenu}
        aria-label="메뉴" aria-expanded={menuOpen} aria-controls={menuOpen ? menuId : undefined}
        className="!h-11 w-10 shrink-0"
      >
        <span aria-hidden>☰</span>
      </Button>
      {/* 화면 이름은 여기 한 곳 — 문서 제목(h1)이다. 본문은 같은 낱말을 다시 세우지 않는다(ScreenHeader · wave 6) */}
      {title
        ? <h1 className="min-w-0 flex-1 truncate text-[16px] font-bold leading-6 text-white">{title}</h1>
        : <span aria-hidden className="min-w-0 flex-1" />}
      {tzLabel ? (
        <span data-teacher-tz="" className={pill}><Clock3 size={13} aria-hidden />{tzLabel}</span>
      ) : null}
      {wageRate !== null && wageRate !== undefined ? (
        <span data-teacher-wage="" className={pill}>
          <span aria-hidden>₩</span>{wageRate.toLocaleString('ko-KR')}원/시간
        </span>
      ) : null}
      {name ? (
        <span className="shrink-0 whitespace-nowrap text-[12px] font-medium text-white">
          {name}{roleLabel ? <span className="hidden sm:inline"> · {roleLabel}</span> : null}
        </span>
      ) : null}
      <Button variant="ghost" size="sm" onClick={onLogout} className="!h-11 shrink-0">로그아웃</Button>
      {onOpenNotis ? (
        <Button
          variant="ghost" size="sm" onClick={onOpenNotis} aria-haspopup="dialog" aria-expanded={notiOpen}
          aria-label={unread > 0 ? `알림 · 안 읽음 ${unread}건` : '알림'}
          className="relative !h-11 w-11 shrink-0"
        >
          <Bell size={18} aria-hidden />
          {unread > 0 ? (
            <Chip size="compact" tone="danger" styleKind="solid" className="absolute -right-1 -top-1">{unread}</Chip>
          ) : null}
        </Button>
      ) : null}
    </header>
  );
}
