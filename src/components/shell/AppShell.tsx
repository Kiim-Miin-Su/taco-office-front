/**
 * Shell — Figma `Shell/Admin Top Tabs` + `Shell/Sidebar` + `Shell/Top Bar`.
 * 61컷이 전부 이 껍데기를 쓴다. 화면은 본문만 그린다.
 */
'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../ui/cn';

const TABS = [
  { href: '/schedule', label: '스케줄' },
  { href: '/intake', label: '상담' },
  { href: '/consulting', label: '컨설팅' },
  { href: '/board', label: '수업 현황판' },
  { href: '/books', label: '교재' },
  { href: '/guides', label: '수업 안내' },
  { href: '/reports', label: '리포트' },
  { href: '/accounting', label: '회계' },
  { href: '/ops', label: '운영' },
  { href: '/exec', label: '대표 보고' },
];

export function AppShell({ children, userLabel }: { children: ReactNode; userLabel?: string }) {
  const path = usePathname();
  return (
    <div className="min-h-screen bg-bg">
      <header className="flex h-[50px] items-center gap-1 bg-fg px-4">
        <span className="mr-3 text-[13px] font-bold text-white">TACO ERP</span>
        <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto">
          {TABS.map((t) => {
            const on = path?.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[12px] font-bold whitespace-nowrap transition-colors',
                  on ? 'bg-blue text-white' : 'text-line-2 hover:bg-white/10',
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <span className="ml-3 text-[11px] text-line-2">{userLabel ?? ''}</span>
      </header>
      <main className="mx-auto max-w-[1440px] p-6">{children}</main>
    </div>
  );
}
