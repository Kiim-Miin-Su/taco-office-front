/** @file-guide
 * 목적: §30·§39·§41 등 인증 운영 파일의 공용 열기 버튼을 제공한다. §39-5·§41-3 원문의 작은 「SE」「TE」 배지 모양(variant="badge")도 여기 하나다.
 * 책임/재사용: 로딩·오류 표시와 공용 downloadFile 호출만 소유하며 권한/파일 종류를 재판정하지 않는다. 기본 모양(「… 열기」 단추)은 그대로다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';
import { useState } from 'react';
import { apiMessage } from '@/api/client';
import { Button, Chip, cn } from '@/components/ui';
import { downloadFile } from '@/lib/download-file';

/** 배지 바탕 — 원문 §39·§41 의 SE(갈색)·TE(보라 회색). 흰 글자 대비는 공용 토큰이 보장한다(D-R41) */
const BADGE_TONE = { primary: 'bg-primary', violet: 'bg-violet' } as const;

export function FileDownloadButton({
  id, label, missingLabel, variant = 'button', tone = 'primary', itemTitle,
}: {
  id: number | null | undefined;
  label: string;
  missingLabel?: string;
  /** 'badge' = 원문 §39-5 서가 카드·§41-3 자료 카드의 작은 「SE」「TE」 배지(누르면 내려받기). 기본은 「… 열기」 단추 */
  variant?: 'button' | 'badge';
  /** 배지 바탕색 — SE 는 primary(갈색), TE 는 violet */
  tone?: keyof typeof BADGE_TONE;
  /** 배지의 접근 이름 앞에 붙는 대상(교재 제목) — 「{제목} SE 내려받기」. 카드마다 같은 「SE」가 한 이름이 되지 않게 */
  itemTitle?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!id) return <Chip size="compact" tone="neutral">{missingLabel ?? `${label} 없음`}</Chip>;
  const run = () => void (async () => {
    setBusy(true); setError(null);
    try { await downloadFile(id, `${label}.bin`); }
    catch (cause) { setError(apiMessage(cause)); }
    finally { setBusy(false); }
  })();
  const errorLine = error ? <span className="text-[10px] text-danger" role="status">{error}</span> : null;
  if (variant === 'badge') {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          data-file-badge={label}
          aria-label={`${itemTitle ? `${itemTitle} ` : ''}${label} 내려받기`}
          aria-busy={busy || undefined}
          disabled={busy}
          title={error ?? (busy ? `${label} 받는 중…` : `${label} 파일 내려받기`)}
          onClick={run}
          className={cn(
            'inline-flex h-5 min-w-7 items-center justify-center rounded px-1.5 text-[10.5px] font-black text-white',
            'transition-opacity disabled:cursor-wait',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg',
            BADGE_TONE[tone],
          )}
        >
          {label}
        </button>
        {errorLine}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        title={error ?? `${label} 파일 내려받기`}
        onClick={run}
      >
        {busy ? `${label} 받는 중…` : `${label} 열기`}
      </Button>
      {errorLine}
    </span>
  );
}
