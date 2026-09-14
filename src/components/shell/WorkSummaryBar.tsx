/** @file-guide
 * 목적: 개발명세서 관리자 화면의 공용 「할 일」 바를 표시한다.
 * 책임/재사용: Drawer.workSummary를 그리기만 하며 숫자·분류·권한을 프론트에서 다시 판정하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';

import Link from 'next/link';
import {
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  MessageCircle,
  Video,
  WalletCards,
} from 'lucide-react';
import type { Drawer } from '@/api/types';
import { cn } from '@/components/ui';

const ICONS = {
  schedule: CalendarDays,
  consulting: MessageCircle,
  accounting: WalletCards,
  books: BookOpen,
  guides: ClipboardList,
  zoom: Video,
} as const;

export function WorkSummaryBar({ summary }: { summary?: Drawer['workSummary'] }) {
  if (!summary) return <div className="h-[44px] animate-pulse rounded-md bg-inset" aria-label="할 일 요약 불러오는 중" />;
  return (
    <details className="group rounded-md bg-red text-white">
      <summary className="flex min-h-[44px] cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-[12px]">
        <span className="flex items-center gap-2 text-[15px] font-black">
          <Bell size={17} aria-hidden />할 일 {summary.total}건
        </span>
        <span className="rounded bg-white/15 px-2 py-1 font-bold">지금 {summary.now}</span>
        <span className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-1">
          {summary.items.map((item) => {
            const Icon = ICONS[item.key as keyof typeof ICONS] ?? ClipboardList;
            return (
              <span key={item.key} className="inline-flex items-center gap-1 font-bold text-white/80">
                <Icon size={13} aria-hidden />
                {item.label} {item.count}
              </span>
            );
          })}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 font-bold text-white/80">
          <span className="group-open:hidden">펼치기</span>
          <span className="hidden group-open:inline">접기</span>
          <ChevronDown className="group-open:hidden" size={14} aria-hidden />
          <ChevronUp className="hidden group-open:block" size={14} aria-hidden />
        </span>
      </summary>
      <div className="grid gap-px border-t border-white/20 bg-white/20 sm:grid-cols-3 xl:grid-cols-6">
        {summary.items.map((item) => {
          const Icon = ICONS[item.key as keyof typeof ICONS] ?? ClipboardList;
          return (
            <Link
              key={item.key}
              href={item.go}
              className={cn(
                'flex items-center justify-between bg-red px-4 py-3 font-bold hover:bg-red/90',
                item.count === 0 && 'text-white/80',
              )}
            >
              <span className="inline-flex items-center gap-2">
                <Icon size={15} aria-hidden />
                {item.label}
              </span>
              <b>{item.count}건</b>
            </Link>
          );
        })}
      </div>
    </details>
  );
}
