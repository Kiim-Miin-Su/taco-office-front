/** @file-guide
 * 목적: ClipboardBar.tsx — ClipboardBarProps, ClipboardBar (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';
import { Button } from '@/components/ui';

export interface ClipboardBarProps {
  count: number;
  cut: boolean;
  target?: string | null;
  pasteDisabled?: boolean;
  pasteBusy?: boolean;
  onPaste?: () => void;
  onClear: () => void;
}

/** 앱 내부 클립보드 상태를 한 곳에서 보여 준다 (Figma `Overlay/Clipboard Bar`). */
export function ClipboardBar({ count, cut, target, pasteDisabled = false, pasteBusy = false, onPaste, onClear }: ClipboardBarProps) {
  if (!count) return null;
  return (
    <div
      role="status"
      className="fixed bottom-5 left-1/2 z-40 flex w-[min(92vw,620px)] -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 shadow-xl"
    >
      <span aria-hidden className="text-[16px]">📋</span>
      <div className="min-w-0">
        <p className="text-[12px] font-bold text-fg">{count}건 {cut ? '잘라내기' : '복사'}됨</p>
        <p className="truncate text-[11px] text-fg-subtle">
          {target ? `붙일 곳 ${target}` : '붙일 빈 칸을 먼저 고르세요'} · Ctrl/⌘ + V 또는 붙여넣기
        </p>
      </div>
      <div className="ml-auto flex gap-2">
        {onPaste ? (
          <Button
            size="sm"
            disabled={!target || pasteDisabled}
            title={!target ? '붙일 빈 칸을 먼저 고르세요' : pasteBusy ? '일정을 저장하는 중입니다' : undefined}
            onClick={onPaste}
          >
            {pasteBusy ? '저장 중…' : '붙여넣기'}
          </Button>
        ) : null}
        <Button size="sm" onClick={onClear}>Esc 취소</Button>
      </div>
    </div>
  );
}
