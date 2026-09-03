/**
 * Overlay/* — 서랍 · 다이얼로그 · 확인창 · Data/Toast.
 * 겹침 경고(Overlay/Conflict Guard)와 반복 범위(Overlay/Recurrence Scope)가 이 위에 올라간다.
 */
'use client';
import { useEffect, useId, type ReactNode } from 'react';
import { cn } from './cn';
import { Button } from './Button';
import type { Tone } from './Chip';

function useEscape(onClose?: () => void) {
  useEffect(() => {
    if (!onClose) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
}

/** 오른쪽 서랍 — 탭 02 전체와 수업 상세(§12)가 쓴다 */
export function Drawer({ open, onClose, title, sub, width = 520, children, footer }: {
  open: boolean; onClose: () => void; title?: ReactNode; sub?: ReactNode;
  width?: number; children?: ReactNode; footer?: ReactNode;
}) {
  useEscape(open ? onClose : undefined);
  const titleId = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-fg/25" onClick={onClose} aria-hidden />
      <aside
        role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined}
        style={{ width }}
        className="absolute right-0 top-0 flex h-full flex-col border-l border-line bg-card shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line p-4">
          <div>
            {title ? <h2 id={titleId} className="text-[15px] font-bold text-fg">{title}</h2> : null}
            {sub ? <p className="mt-0.5 text-[11px] text-fg-subtle">{sub}</p> : null}
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>닫기</Button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer ? <footer className="border-t border-line p-3">{footer}</footer> : null}
      </aside>
    </div>
  );
}

/** 가운데 다이얼로그 — 확인이 필요한 것 */
export function Dialog({ open, onClose, title, children, footer, width = 460 }: {
  open: boolean; onClose: () => void; title?: ReactNode; children?: ReactNode; footer?: ReactNode; width?: number;
}) {
  useEscape(open ? onClose : undefined);
  const titleId = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6">
      <div className="absolute inset-0 bg-fg/30" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} style={{ width }}
        className="relative rounded-2xl border border-line bg-card p-5 shadow-xl">
        {title ? <h2 id={titleId} className="text-[15px] font-bold text-fg">{title}</h2> : null}
        <div className="mt-3">{children}</div>
        {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
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

export function RecurrenceScope({ open, mode, warning, onPick, onClose }: {
  open: boolean; mode: 'edit' | 'paste' | 'delete'; warning?: ReactNode;
  onPick: (s: Scope) => void; onClose: () => void;
}) {
  const verb = { edit: '고칩니다', paste: '붙여넣습니다', delete: '지웁니다' }[mode];
  return (
    <Dialog open={open} onClose={onClose} title={`반복 수업입니다 — 어디까지 ${verb}?`}>
      {warning ? <div className="mb-3 rounded-lg border border-amber/35 bg-amber/5 p-3 text-[11px] text-fg-2">{warning}</div> : null}
      <div className="flex flex-col gap-2">
        {(['this', 'future', 'all'] as Scope[]).map((s) => (
          <button key={s} type="button" autoFocus={s === 'this'} onClick={() => onPick(s)}
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
