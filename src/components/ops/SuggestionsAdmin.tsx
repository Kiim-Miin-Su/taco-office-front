/** @file-guide
 * 목적: SuggestionsAdmin.tsx — 관리자 건의 답변 surface (component)
 * 책임/재사용: GET /ops의 건의 읽기 모델을 그리고 답변 초안만 소유한다. 영속 상태·알림·감사는 서버가 처리한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useEffect, useState } from 'react';
import { Banner, Button, Chip, Textarea } from '../ui';
import { WideDialog } from '../ui/WideDialog';
import { useReplySuggestion } from '@/api/queries';
import { apiMessage } from '@/api/client';
import type { Suggestion } from '@/api/types';

type SuggestionRow = Suggestion & { replyBy?: string | null; replyOn?: string | null };

export function SuggestionsAdmin({ open, rows, onClose }: {
  open: boolean; rows: readonly SuggestionRow[]; onClose: () => void;
}) {
  const write = useReplySuggestion();
  const [editing, setEditing] = useState<number | null>(null);
  const [reply, setReply] = useState('');
  useEffect(() => { if (!open) { setEditing(null); setReply(''); } }, [open]);
  const start = (row: SuggestionRow) => { setEditing(row.id); setReply(row.reply ?? ''); };
  return (
    <WideDialog open={open} onClose={onClose} title="건의 사항 답변"
      sub={`답변 필요 ${rows.filter((r) => r.state !== 'done').length}건 · 전체 ${rows.length}건`}>
      {write.isError ? <Banner tone="danger" className="mb-3">{apiMessage(write.error)}</Banner> : null}
      {rows.length === 0 ? <Banner tone="neutral">접수된 건의가 없습니다.</Banner> : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-line bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-[13px] text-fg">{row.staffName}</b>
                <span className="text-[11px] text-fg-subtle">{row.createdAt}</span>
                <Chip className="ml-auto" size="compact" tone={row.state === 'done' ? 'success' : 'warning'}>
                  {row.state === 'done' ? '답변 완료' : '답변 필요'}
                </Chip>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-fg">{row.body}</p>
              {editing === row.id ? (
                <div className="mt-3 border-t border-line pt-3">
                  <Textarea aria-label={`${row.staffName} 건의 답변`} rows={4} maxLength={2000} value={reply} autoFocus
                    disabled={write.isPending} onChange={(e) => setReply(e.target.value)} />
                  <div className="mt-2 flex justify-end gap-1">
                    <Button size="sm" variant="secondary" disabled={write.isPending}
                      onClick={() => { setEditing(null); setReply(''); }}>취소</Button>
                    <Button size="sm" variant="primary" disabled={write.isPending || !reply.trim()}
                      onClick={() => write.mutate({ id: row.id, reply: reply.trim() }, {
                        onSuccess: () => setEditing((current) => {
                          if (current !== row.id) return current;
                          setReply('');
                          return null;
                        }),
                      })}>
                      {write.isPending ? '답변 중…' : row.reply ? '답변 수정' : '답변 보내기'}
                    </Button>
                  </div>
                </div>
              ) : row.reply ? (
                <div className="mt-3 rounded-lg border border-green/30 bg-green/5 px-3 py-2">
                  <p className="whitespace-pre-wrap text-[12.5px] font-bold text-fg">{row.reply}</p>
                  <p className="mt-1 text-[11px] text-fg-subtle">
                    {[row.replyBy, row.replyOn].filter(Boolean).join(' · ')}
                  </p>
                  <Button className="mt-2" size="sm" variant="secondary" disabled={write.isPending} onClick={() => start(row)}>답변 수정</Button>
                </div>
              ) : (
                <div className="mt-3 flex justify-end">
                  <Button size="sm" variant="primary" disabled={write.isPending} onClick={() => start(row)}>답변하기</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </WideDialog>
  );
}
