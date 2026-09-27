/** @file-guide
 * 목적: 원문 §31 항목 줄의 「파일」 창 — 그 항목의 파일을 보고 · 올리고 · 뺀다 (N-63 · W11).
 * 책임/재사용: 계약서와 같은 끌어다 놓기 칸(ConsultingFileDropzone) · 내려받기(FileDownloadButton) · 업로드 본문(fileUploadBody)을 재사용한다. 한도 · 권한은 서버가 판정한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 항목 파일 — N-63 채택 ① 「같은 표 · 같은 업로드 · 같은 권한 함수 · 항목마다 6개 · 계약 파일 10개와 따로 센다」.
 * 더 올릴 수 있는지는 서버 값(`canAddFile`) 하나로 선다 — 화면이 파일 수를 세어 한도를 다시 판정하지 않는다 (D-R39).
 * 여러 개를 고르면 차례로 올리고, 서버가 막으면(한도 · 종료) 그 문장을 그대로 보인다.
 */
'use client';
import { useState } from 'react';
import { apiMessage } from '@/api/client';
import { useAddConsultingItemFile, useRemoveConsultingItemFile } from '@/api/queries';
import type { ConsItem } from '@/api/types';
import { FileDownloadButton } from '@/components/files/FileDownloadButton';
import { Banner, Button, Dialog } from '@/components/ui';
import { fileUploadBody } from '@/lib/file-upload';
import { ConsultingFileDropzone } from './ConsultingFileDropzone';

export function ConsultingItemFiles({ open, consId, item, canRemove, onClose }: {
  open: boolean;
  consId: number;
  item: ConsItem;
  /** 파일 빼기 — 종료 전 건(서버의 canEditItems) */
  canRemove: boolean;
  onClose: () => void;
}) {
  const add = useAddConsultingItemFile();
  const remove = useRemoveConsultingItemFile();
  const [busy, setBusy] = useState(false);

  const upload = async (files: File[]) => {
    setBusy(true);
    add.reset();
    try {
      for (const file of files) {
        const { name, base64 } = await fileUploadBody(file, 'cons-item');
        await add.mutateAsync({ consId, itemId: item.id, name, base64 });
      }
    } catch { /* 서버 문장은 아래 띠가 보인다 — 막힌 뒤의 파일은 올리지 않는다 */ }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} title={`${item.label} — 파일`} width={560}
      footer={<Button onClick={onClose}>닫기</Button>}>
      <div className="mb-3">
        <ConsultingFileDropzone label="+ 파일 고르기" hint="여기로 끌어다 놓아도 됩니다 · 여러 파일 가능" multiple
          disabled={!item.canAddFile || busy} onFiles={(files) => void upload(files)} />
      </div>
      {item.files.length === 0 ? <p className="text-[12px] text-fg-subtle">올린 파일이 없습니다.</p> : (
        <ul className="divide-y divide-line" aria-label={`${item.label} 파일`}>
          {item.files.map((file) => (
            <li key={file.id} className="flex flex-wrap items-center gap-2 py-2 text-[12px]">
              <span className="min-w-0 grow truncate font-bold">{file.name}</span>
              {/* 크기 · 올린 날 · 올린 사람 — 계약 파일 줄과 같은 모양(30-09) */}
              <span className="text-fg-subtle">{Math.ceil(file.bytes / 1024)}KB · {file.uploadedAt.slice(0, 10)} · {file.uploadedByName}</span>
              <FileDownloadButton id={file.id} label="파일" />
              <Button size="sm" variant="danger" disabled={!canRemove || remove.isPending}
                aria-label={`${file.name} 빼기`}
                onClick={() => remove.mutate({ consId, itemId: item.id, fileId: file.id })}>빼기</Button>
            </li>
          ))}
        </ul>
      )}
      {add.isError || remove.isError ? <Banner tone="danger" className="mt-2">{apiMessage(add.error ?? remove.error)}</Banner> : null}
    </Dialog>
  );
}
