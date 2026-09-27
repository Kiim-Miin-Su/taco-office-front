/** @file-guide
 * 목적: Overlay.tsx — Drawer, Dialog, Scope, RecurrenceScope, ConflictGuard 등 (ui)
 * 책임/재사용: props와 공용 시각 토큰으로 표현한다. 업무 권한·정산 판정, Axios 호출, 서버 캐시를 소유하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * Overlay/* — 서랍 · 다이얼로그 · 확인창 · Data/Toast.
 * 겹침 경고(Overlay/Conflict Guard)와 반복 범위(Overlay/Recurrence Scope)가 이 위에 올라간다.
 */
'use client';
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';
import { cn } from './cn';
import { Button } from './Button';
import type { Tone } from './Chip';

/**
 * 머리 오른쪽의 × — 원문 서랍(§14~§21)·창(§12 · §19 · §75 · §76) 머리의 닫기는 글자 단추가 아니라 × 아이콘이다.
 * 이름은 부르는 쪽이 정한다: 서랍은 「닫기」(예전 글자 단추와 같은 이름), 창은 바닥 「닫기」와 겹치지 않게 「창 닫기」.
 */
function CloseX({ onClose, label, dark = false }: { onClose: () => void; label: string; dark?: boolean }) {
  return (
    <button
      type="button" onClick={onClose} aria-label={label} title={label}
      className={cn(
        'grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        dark ? 'text-line-2 hover:bg-white/10 focus-visible:outline-white' : 'text-fg-subtle hover:bg-inset hover:text-fg focus-visible:outline-fg',
      )}
    >
      <X size={18} aria-hidden />
    </button>
  );
}

/**
 * 열리면 초점을 판으로 옮기고, 닫히면 연 자리로 돌려준다 — `Drawer` 는 한동안 초점을 옮기지 않아
 * 키보드 사용자가 열린 서랍을 찾아 헤맸다(공용 부품 잔여). 서랍은 비모달이라 Tab 을 가두지는 않는다.
 * 안에서 이미 초점을 가진 칸(autoFocus)이 있으면 빼앗지 않는다.
 */
function usePanelFocus(open: boolean, panelRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const active = document.activeElement;
    const returnTarget = active instanceof HTMLElement && !panel.contains(active) ? active : null;
    if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    return () => {
      const now = document.activeElement;
      // 닫는 사이 사용자가 다른 곳을 눌렀다면 그 자리를 존중한다 — 판 안이나 빈 곳에 있을 때만 되돌린다
      const lost = !now || now === document.body || !now.isConnected || panel.contains(now);
      if (lost && returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
    };
  }, [open, panelRef]);
}

function useEscape(onClose?: () => void) {
  useEffect(() => {
    if (!onClose) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
}

const DIALOG_FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function isTopDialog(panel: HTMLElement): boolean {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'));
  return dialogs.at(-1) === panel;
}

/** 중첩 다이얼로그까지 한 번의 Escape·Tab·focus return 규칙으로 처리한다. */
export function useDialogA11y(open: boolean, panelRef: RefObject<HTMLElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const returnTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusables = () => Array.from(panel.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE));
    (panel.querySelector<HTMLElement>('[data-dialog-autofocus]') ?? focusables()[0] ?? panel).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialog(panel)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const targets = focusables();
      if (targets.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = targets[0];
      const last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (returnTarget?.isConnected) returnTarget.focus();
    };
  }, [open, panelRef]);
}

/**
 * 오른쪽 서랍 — 탭 02 전체와 수업 상세(§12)가 쓴다.
 *
 * `docked` 는 **탭 02 우측 서랍(§14~§21)** 의 자리다. 원문 서랍은 머리줄 아래에서 시작하고
 * 오른쪽 레일 왼쪽에 붙으며 **머리줄·레일이 늘 보이고 눌린다** — 화면 전체를 덮으면 레일로 칸을
 * 바꿀 수 없다(g2 대조 C-1 · 실측 타임아웃). 그래서 docked 는 뷰포트가 아니라 **가장 가까운
 * 위치 잡힌 조상**(셸의 본문 칸)을 채운다. 원문 서랍에는 스크림이 없으므로 클릭 받이는
 * **투명을 명시**하고, 레일·머리줄이 살아 있으니 aria-modal 을 달지 않는다.
 * 기본값(수업 상세 등)은 예전 그대로 화면 전체를 덮는 모달이다.
 *
 * `headerTone="dark"` 는 원문 서랍 머리 — **머리줄 색 바탕 + 흰 제목**이다(g2 대조 C-4). 닫기는 어느 서랍이든 × 하나다.
 */
export function Drawer({ open, onClose, title, sub, width = 520, children, footer, docked = false, headerTone = 'light' }: {
  open: boolean; onClose: () => void; title?: ReactNode; sub?: ReactNode;
  width?: number; children?: ReactNode; footer?: ReactNode; docked?: boolean;
  headerTone?: 'light' | 'dark';
}) {
  useEscape(open ? onClose : undefined);
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  usePanelFocus(open, panelRef);
  if (!open) return null;
  const dark = headerTone === 'dark';
  return (
    <div className={cn(docked ? 'absolute' : 'fixed', 'inset-0 z-40')}>
      <div className={cn('absolute inset-0', docked ? 'bg-transparent' : 'bg-fg/25')} onClick={onClose} aria-hidden />
      <aside
        ref={panelRef} tabIndex={-1}
        role="dialog" aria-modal={docked ? undefined : true} aria-labelledby={title ? titleId : undefined}
        style={{ width: '100%', maxWidth: width }}
        className="absolute right-0 top-0 flex h-full flex-col border-l border-line bg-card shadow-xl focus:outline-none"
      >
        <header className={cn(
          'flex items-center justify-between gap-3 border-b',
          // 색은 머리줄과 같은 토큰이다 — 원문 서랍 머리가 머리줄 색이다 (D-R41)
          dark ? 'border-header-line bg-header px-4 py-3' : 'border-line p-4',
        )}>
          <div className="min-w-0">
            {title ? <h2 id={titleId} className={cn('font-bold', dark ? 'text-[16px] text-white' : 'text-[15px] text-fg')}>{title}</h2> : null}
            {sub ? <p className={cn('mt-0.5 text-[11px]', dark ? 'text-line-2' : 'text-fg-subtle')}>{sub}</p> : null}
          </div>
          <CloseX onClose={onClose} label="닫기" dark={dark} />
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer ? <footer className="border-t border-line p-3">{footer}</footer> : null}
      </aside>
    </div>
  );
}

/**
 * 가운데 다이얼로그 — 확인이 필요한 것.
 *
 * 원문 §19 · §75 · §76 창 머리는 「제목 + 부제 + 오른쪽 ×」이고 아래에 선이 있다. `sub` 나 `closeX` 를 주면
 * 그 머리가 선다 — 안 주면 예전 확인창 그대로다. × 는 바닥에 「닫기」가 이미 있는 창과 이름이 겹치지 않게
 * 「창 닫기」로 읽힌다. 바닥 줄은 **윗선 + 옅은 바탕**으로 본문과 갈린다(g2 대조 75-7 — 모든 창 공통).
 */
export function Dialog({ open, onClose, title, sub, closeX = false, children, footer, width = 460 }: {
  open: boolean; onClose: () => void; title?: ReactNode;
  /** 제목 아래 한 줄 — 원문 창의 부제 */
  sub?: ReactNode;
  /** 머리 오른쪽 × — 원문 컷이 × 를 보여 주는 창에서 켠다 */
  closeX?: boolean;
  children?: ReactNode; footer?: ReactNode; width?: number;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y(open, panelRef, onClose);
  if (!open) return null;
  const framed = Boolean(sub) || closeX;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6">
      {/* 원문 §19·§75·§76 모달 뒤는 어둡고 흐리다 — 색은 `fg` 투명도(tailwind withAlpha), 흐림은 공용 유틸 */}
      <div className="absolute inset-0 bg-fg/30 backdrop-blur-sm" onClick={onClose} aria-hidden />
      {/*
        창은 화면 높이(바깥 p-6 을 뺀 만큼)를 넘지 않고 **본문만 구른다** — 머리 · 바닥 줄은 늘 보인다.
        창은 fixed 라 페이지를 굴려도 따라오지 않아, 넘친 바닥 줄(「저장」)은 누를 길이 없었다(W11 실브라우저 QA · 구성원 수정 창 1280×900).
        WideDialog 와 같은 틀이다(max-h + flex-col + 본문 overflow-y-auto).
      */}
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} tabIndex={-1}
        style={{ width: '100%', maxWidth: width }}
        className="relative flex min-w-0 max-h-[calc(100dvh-3rem)] flex-col rounded-2xl border border-line bg-card p-5 shadow-xl">
        {framed ? (
          <div data-dialog-head className="-mx-5 flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 pb-3">
            <div className="min-w-0">
              {title ? <h2 id={titleId} className="text-[16px] font-bold text-fg">{title}</h2> : null}
              {sub ? <div className="mt-0.5 text-[12px] text-fg-subtle">{sub}</div> : null}
            </div>
            {closeX ? <CloseX onClose={onClose} label="창 닫기" /> : null}
          </div>
        ) : title ? <h2 id={titleId} className="shrink-0 text-[15px] font-bold text-fg">{title}</h2> : null}
        {/* 구르는 칸을 창 가장자리까지 넓힌다(-mx-5 px-5 · py-1) — 칸 끝에 닿은 입력의 초점 테두리가 잘리지 않게. 간격은 전과 같다(mt · py 합) */}
        <div className={cn(framed ? 'mt-3' : 'mt-2', '-mx-5 min-h-0 flex-1 overflow-y-auto px-5 py-1')}>{children}</div>
        {footer ? (
          <div className="-mx-5 -mb-5 mt-4 flex shrink-0 flex-wrap justify-end gap-2 rounded-b-2xl border-t border-line bg-inset px-5 py-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Overlay/Recurrence Scope — 반복이면 「이번만 · 향후 · 모두」를 묻는다 (D-R16).
 * 단발이면 묻지 않는다 — 확인창은 반복일 때 저장 직전 한 번뿐이다.
 */
export type Scope = 'this' | 'future' | 'all';
const SCOPE_TEXT: Record<'edit' | 'paste' | 'delete', Record<Scope, { label: string; help: string }>> = {
  edit: {
    this: { label: '이번만', help: '그날 회차만 바뀝니다. 다음 주는 그대로입니다.' },
    future: { label: '향후', help: '이번 회차부터 뒤로 전부 바뀝니다. 규칙이 둘로 갈립니다.' },
    all: { label: '모두', help: '지난 회차까지 포함해 규칙 전체가 바뀝니다.' },
  },
  paste: {
    this: { label: '이번만', help: '붙인 날 하루짜리 단발 일정이 새로 생깁니다.' },
    future: { label: '향후', help: '원본 반복 규칙을 가져와 붙인 날부터 이어집니다.' },
    all: { label: '모두', help: '원본 반복 구간 전체가 날짜 차이만큼 평행 이동해 복제됩니다.' },
  },
  delete: {
    this: { label: '이번만', help: '그날 회차만 휴강 처리합니다.' },
    future: { label: '향후', help: '이 회차 전날로 반복 기간을 마감합니다.' },
    all: { label: '모두', help: '참조가 없으면 규칙 전체를 지우고, 있으면 기간을 마감합니다.' },
  },
};

export function RecurrenceScope({ open, mode, warning, scopes, onPick, onClose }: {
  open: boolean; mode: 'edit' | 'paste' | 'delete'; warning?: ReactNode;
  /** 시리즈 필드처럼 이번 회차에 저장할 곳이 없는 변경은 future/all만 보여 준다. 생략하면 기존 3범위다. */
  scopes?: Scope[];
  onPick: (s: Scope) => void; onClose: () => void;
}) {
  const verb = { edit: '고칩니다', paste: '붙여넣습니다', delete: '지웁니다' }[mode];
  const choices = scopes ?? (['this', 'future', 'all'] as Scope[]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`반복 수업입니다 — 어디까지 ${verb}?`}
      footer={<Button type="button" variant="ghost" onClick={onClose}>취소 (Esc)</Button>}
    >
      {warning ? <div className="mb-3 rounded-lg border border-amber/35 bg-amber/5 p-3 text-[11px] text-fg-2">{warning}</div> : null}
      <div className="flex flex-col gap-2">
        {choices.map((s, index) => (
          <button key={s} type="button" autoFocus={index === 0} onClick={() => onPick(s)}
            className="rounded-lg border border-line p-3 text-left transition-colors hover:border-blue hover:bg-blue/5">
            <div className="text-[13px] font-bold text-fg">{SCOPE_TEXT[mode][s].label}</div>
            <div className="mt-0.5 text-[11px] text-fg-subtle">{SCOPE_TEXT[mode][s].help}</div>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

/** Overlay/Conflict Guard — 겹치면 되돌린다. 강행 옵션은 없다 (D-R43). */
export function ConflictGuard({ result, dates, message }: {
  result: 'blocking' | 'warning' | 'ok' | 'dates'; dates?: string[]; message?: ReactNode;
}) {
  const tone: Tone = result === 'ok' ? 'success' : result === 'warning' ? 'warning' : 'danger';
  const look = { success: 'border-green/30 bg-green/5', warning: 'border-amber/35 bg-amber/5', danger: 'border-red/35 bg-red/5' }[
    tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : 'danger'
  ];
  return (
    <div className={cn('rounded-lg border p-3', look)}>
      <p className="text-[12px] font-bold text-fg">{message ?? (result === 'ok' ? '겹치는 것이 없습니다' : '같은 시간에 다른 일정이 있습니다')}</p>
      {dates?.length ? (
        <p className="mt-1 text-[11px] text-fg-2">
          {dates.slice(0, 5).join(' · ')}{dates.length > 5 ? ` 외 ${dates.length - 5}일` : ''}
        </p>
      ) : null}
      {result !== 'ok' ? (
        <p className="mt-2 text-[11px] text-fg-subtle">
          강행할 수 없습니다. 시간이나 자원을 바꿔 주세요 — 마지막에는 DB 가 거부합니다.
        </p>
      ) : null}
    </div>
  );
}

/** Data/Toast */
export function Toast({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const look: Record<Tone, string> = {
    neutral: 'bg-fg text-white', info: 'bg-blue text-white', success: 'bg-green text-white',
    warning: 'bg-amber text-white', danger: 'bg-red text-white', purple: 'bg-violet text-white',
  };
  return (
    <div className={cn('fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2.5 text-[12px] font-bold shadow-lg', look[tone])}>
      {children}
    </div>
  );
}
