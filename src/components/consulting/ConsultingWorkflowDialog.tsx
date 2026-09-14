/** @file-guide
 * 목적: §29·§30의 큰 컨설팅 워크플로를 담는 공용 모달 프레임이다.
 * 책임/재사용: 제목·스크롤·닫기·focus trap/focus return만 소유한다. 단계·권한·API 판정은 자식과 서버에 맡긴다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';
import { useId, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { useDialogA11y } from '@/components/ui/Overlay';

export function ConsultingWorkflowDialog({ open, onClose, title, sub, children, footer }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y(open, panelRef, onClose);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-2 sm:p-5">
      <div className="absolute inset-0 bg-fg/45" aria-hidden onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-[1480px] flex-col overflow-hidden rounded-xl border border-line bg-card shadow-xl sm:max-h-[calc(100dvh-2.5rem)]"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-[17px] font-bold text-fg">{title}</h2>
            {sub ? <p className="mt-0.5 text-[12px] text-fg-subtle">{sub}</p> : null}
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="닫기">닫기</Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
        {footer ? <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">{footer}</footer> : null}
      </div>
    </div>
  );
}
