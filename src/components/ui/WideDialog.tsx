/** @file-guide
 * 목적: WideDialog.tsx — WideDialog (ui) · 화면 가운데 큰 창(딤 · 머리 × · 본문 스크롤 · 바닥 고정 단추 줄).
 * 책임/재사용: 제목·스크롤·닫기·focus trap/return(`useDialogA11y` 재사용)만 소유한다. 업무 판정·Axios·서버 캐시는 부르는 쪽과 서버에 둔다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * UI/Wide Dialog — 원문 §65 기획 보고서 · §66 회의 상세 · §85 디자인 창의 **가운데 큰 창**.
 *
 * 원문 컷은 셋 다 오른쪽 서랍이 아니라 **화면 가운데 큰 창**(딤 · 오른쪽 위 「×」 · 바닥에 고정된 단추 줄)이다.
 * 제품은 §65·§66 을 520px 서랍(`Drawer`)으로 열어 문서가 좁은 칸에 접혀 있었고, 단추가 본문과 함께 흘러갔다.
 *
 * `Overlay` 의 `Dialog` 는 확인창 크기라 **본문이 창 안에서 스크롤하지 않는다** — 긴 보고서를 담으면 화면 밖으로 넘친다.
 * 그래서 컨설팅 계약 창(`consulting/ConsultingWorkflowDialog`)이 이미 쓰는 틀(최대 1480px · 본문만 스크롤 ·
 * 바닥 줄 고정)을 공용으로 올렸다. 키보드(Escape · Tab 가두기 · 닫은 뒤 초점 되돌리기)는 `Dialog` 와
 * **같은 함수**(`useDialogA11y`)를 쓴다 — 중첩된 창에서도 맨 위 창만 Escape 를 받는다.
 *
 * 닫기는 머리의 「×」 하나다(원문 컷). 보조기기에는 「닫기」로 읽힌다.
 */
'use client';
import { useId, useRef, type ReactNode } from 'react';
import { Button } from './Button';
import { useDialogA11y } from './Overlay';

export interface WideDialogProps {
  open: boolean;
  onClose: () => void;
  /** 창 제목 — 보조기기가 창 이름으로 읽는다 */
  title: ReactNode;
  /** 제목 바로 옆에 붙는 것(단계 칩 등) — 원문 §65 의 「검토 요청」이 그 자리다 */
  head?: ReactNode;
  /** 제목 아래 한 줄 */
  sub?: ReactNode;
  /** 머리 오른쪽, 「×」 앞에 서는 단추들 */
  actions?: ReactNode;
  children?: ReactNode;
  /** 바닥에 고정되는 단추 줄 — 본문을 스크롤해도 따라 흐르지 않는다 */
  footer?: ReactNode;
  /** 최대 폭(px). 기본은 원문 큰 창의 1480 */
  width?: number;
}

export function WideDialog({
  open, onClose, title, head, sub, actions, children, footer, width = 1480,
}: WideDialogProps) {
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
        style={{ maxWidth: width }}
        className="relative flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-xl border border-line bg-card shadow-xl sm:max-h-[calc(100dvh-2.5rem)]"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0 grow">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={titleId} className="min-w-0 truncate text-[17px] font-bold text-fg">{title}</h2>
              {head}
            </div>
            {sub ? <div className="mt-0.5 text-[12px] text-fg-subtle">{sub}</div> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <Button size="sm" variant="ghost" onClick={onClose} aria-label="닫기" className="w-8 px-0 text-[16px]">
              <span aria-hidden>×</span>
            </Button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
        {footer ? (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
