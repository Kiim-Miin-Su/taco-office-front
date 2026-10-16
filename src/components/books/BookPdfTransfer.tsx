/** @file-guide
 * 목적: 첫 판·새 판의 PDF 전송 진행률과 취소를 같은 소유자로 제공한다.
 * 책임/재사용: SDK 전송의 지역 상태만 소유한다. 파일 권한·업로드 의도 소비·판 저장은 서버 writer가 판정한다.
 * 검증/작업 지침: file-upload.test.ts · BookShelf.test.tsx · BookVersions.test.tsx
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { uploadBookPdf } from '@/lib/file-upload';

type Progress = { label: string; percentage: number };

export function useBookPdfTransfer(maxFileBytes: number) {
  const controllerRef = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  const upload = async (file: File, kind: 'lib-se' | 'lib-te'): Promise<string> => {
    controllerRef.current ??= new AbortController();
    const signal = controllerRef.current.signal;
    const label = kind === 'lib-se' ? 'SE' : 'TE';
    setProgress({ label, percentage: 0 });
    try {
      return await uploadBookPdf(file, kind, {
        maxFileBytes, abortSignal: signal,
        onUploadProgress: ({ percentage }) => {
          if (!signal.aborted) {
            setProgress({ label, percentage: Math.max(0, Math.min(100, Math.round(percentage))) });
          }
        },
      });
    } finally {
      setProgress(null);
    }
  };
  const finish = () => {
    controllerRef.current = null;
    setProgress(null);
  };
  return { upload, finish, progress, cancel: () => controllerRef.current?.abort() };
}

export function BookPdfTransferProgress({ progress, onCancel }: { progress: Progress | null; onCancel: () => void }) {
  if (!progress) {
    return null;
  }
  return (
    <section className="mt-3 rounded-lg border border-line p-3" aria-label="PDF 전송 상태">
      <p className="text-[12px] text-fg-subtle">{progress.label} PDF 전송 {progress.percentage}% · 일시적인 전송 실패는 부분별로 재시도합니다.</p>
      <progress className="mt-2 w-full" max={100} value={progress.percentage} aria-label={`${progress.label} PDF 업로드 진행률`} />
      <Button size="sm" variant="secondary" className="mt-2 min-h-11" onClick={onCancel}>PDF 전송 취소</Button>
    </section>
  );
}
