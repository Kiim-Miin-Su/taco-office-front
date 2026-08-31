'use client';
import { Button } from '@/components/ui';

export interface ClipboardBarProps {
  count: number;
  cut: boolean;
  onClear: () => void;
}

/** 앱 내부 클립보드 상태를 한 곳에서 보여 준다 (Figma `Overlay/Clipboard Bar`). */
export function ClipboardBar({ count, cut, onClear }: ClipboardBarProps) {
  if (!count) return null;
  return (
    <div
      role="status"
      className="fixed bottom-5 left-1/2 z-40 flex w-[min(92vw,620px)] -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 shadow-xl"
    >
      <span aria-hidden className="text-[16px]">📋</span>
      <div className="min-w-0">
        <p className="text-[12px] font-bold text-fg">{count}건 {cut ? '잘라내기' : '복사'}됨</p>
        <p className="truncate text-[11px] text-fg-subtle">붙일 칸을 고른 뒤 Ctrl/⌘ + V</p>
      </div>
      <div className="ml-auto">
        <Button size="sm" onClick={onClear}>Esc 취소</Button>
      </div>
    </div>
  );
}
