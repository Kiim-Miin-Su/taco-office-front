/** @file-guide
 * 목적: UndoControl.tsx — 상단바 「⟲ 되돌리기 ▾」 단추와 단계 목록 (원본 §16 · g1 S5)
 * 책임/재사용: 되돌리기 자체는 useUndoLast 한 곳이 한다. 여기는 단추·목록 그리기와 열고 닫기만 소유한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 원본 §16 컷의 상단바 세 번째 단추 「⟲ 되돌리기 ▾」.
 *
 * - 단추는 **늘 서 있고**(조건부로 사라지지 않는다) 되돌릴 것이 없으면 흐리며 이유를 `title` 이 말한다.
 * - 본 단추는 가장 최근 한 단계, **▾ 는 여러 단계 목록**(g1 S5)이다 — 고른 단계까지 최근 것부터 차례로 되돌린다.
 *   목록의 단계·순서·만료 판정은 `useUndoLast` 가 준다(만료는 서버 값 · 화면이 10분을 따로 들지 않는다).
 * - 셸 파일에서 떼어 둔 이유: 셸 머리는 여러 청크가 함께 고치는 자리라 되돌리기 부분만 한 파일에 모은다.
 * - 일정 쓰기와 §14 결재(N-84)가 **같은 목록**에 선다 — 원문 셸의 단추는 하나다. 그래서 문구에 「일정」을 붙이지 않는다.
 */
'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { objectParticle } from '@/lib/calendar';
import { useUndoLast } from './useUndoLast';

const TOOL = 'flex h-[30px] items-center gap-1 border border-header-tool-line bg-header-tool text-[12px] font-bold text-line-2 disabled:opacity-40';

export function UndoControl({ onFail }: { onFail: (message: string) => void }) {
  const undo = useUndoLast();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const blocked = !undo.canUndo || undo.pending;

  // 목록 밖을 누르거나 Esc 면 닫는다 — 되돌릴 것이 사라져도 닫는다(빈 목록이 떠 있지 않게)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  useEffect(() => { if (!undo.canUndo) setOpen(false); }, [undo.canUndo]);

  return (
    <div ref={box} className="relative flex shrink-0">
      <button type="button" onClick={() => undo.undo({ onFail })} disabled={blocked}
        title={undo.canUndo ? `${undo.label}${objectParticle(undo.label ?? '')} 되돌립니다 · Ctrl/⌘+Z` : '되돌릴 최근 작업이 없습니다'}
        className={`${TOOL} rounded-l-md px-2.5`}>
        <RotateCcw size={14} aria-hidden />되돌리기
      </button>
      <button type="button" aria-label="되돌릴 단계 목록" aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((v) => !v)} disabled={blocked}
        title={undo.canUndo ? `되돌릴 수 있는 작업 ${undo.steps.length}단계` : '되돌릴 최근 작업이 없습니다'}
        className={`${TOOL} rounded-r-md border-l-0 px-1`}>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open ? (
        <div role="menu" aria-label="되돌릴 단계"
          className="absolute left-0 top-full z-30 mt-1 w-64 rounded-md border border-line bg-card p-1 text-fg shadow-lg">
          <p className="px-2 py-1 text-[11px] text-fg-subtle">누른 단계까지 최근 것부터 차례로 되돌립니다</p>
          {undo.steps.map((step, i) => (
            <button key={step.token} type="button" role="menuitem"
              onClick={() => { setOpen(false); undo.undoTo(i + 1, { onFail }); }}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[12px] font-bold hover:bg-inset">
              <span className="truncate" title={step.label}>{step.label}</span>
              <span className="shrink-0 text-[11px] font-normal text-fg-subtle">{i === 0 ? '최근' : `${i + 1}단계`}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
