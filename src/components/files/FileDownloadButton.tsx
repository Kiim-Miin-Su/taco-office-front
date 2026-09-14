/** @file-guide
 * 목적: §30·§39·§41 등 인증 운영 파일의 공용 열기 버튼을 제공한다.
 * 책임/재사용: 로딩·오류 표시와 공용 downloadFile 호출만 소유하며 권한/파일 종류를 재판정하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';
import { useState } from 'react';
import { apiMessage } from '@/api/client';
import { Button, Chip } from '@/components/ui';
import { downloadFile } from '@/lib/download-file';

export function FileDownloadButton({ id, label, missingLabel }: { id: number | null | undefined; label: string; missingLabel?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!id) return <Chip size="compact" tone="neutral">{missingLabel ?? `${label} 없음`}</Chip>;
  return (
    <span className="inline-flex items-center gap-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        title={error ?? `${label} 파일 내려받기`}
        onClick={() => void (async () => {
          setBusy(true); setError(null);
          try { await downloadFile(id, `${label}.bin`); }
          catch (cause) { setError(apiMessage(cause)); }
          finally { setBusy(false); }
        })()}
      >
        {busy ? `${label} 받는 중…` : `${label} 열기`}
      </Button>
      {error ? <span className="text-[10px] text-danger" role="status">{error}</span> : null}
    </span>
  );
}
