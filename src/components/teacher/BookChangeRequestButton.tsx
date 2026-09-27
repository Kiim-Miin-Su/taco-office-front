/** @file-guide
 * 목적: BookChangeRequestButton.tsx — BookChangeRequestButton (component · 강사 수업 안내 교재 행의 「변경 요청」)
 * 책임/재사용: 기존 useCreateSettingRequest(POST /teacher/requests)와 ui Dialog 를 재사용한다. 요청할 수 있는지 · 처리 중인지는 서버 플래그만 본다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 강사 덱 수업 안내 교재 행 「변경 요청」 (N-99 채택 · W11) — 학생 · 교재 · 사유를 담아 REQ(book_change) 한 줄을 올린다.
 *
 * - 서는지 · 눌리는지는 서버 플래그 그대로다: 올린 요청이 처리 중이면(`changePending`) 단추 대신 「변경 요청 중」,
 *   쓰고 있는 교재가 아니면(`changeRequestable` 아님) 눌리지 않는다. 내 담당 학생인지 · 겹치는 요청인지도 서버가 다시 본다.
 * - 사유는 필수다(서버 400 REASON_REQUIRED) — 관리자가 무엇으로 바꿀지 판단하는 근거다.
 * - 승인은 관리자가 §14 에서 하고 결과는 알림으로 온다. 배부를 실제로 바꾸는 일은 관리자 교재 화면의 몫이다(결정표 N-99).
 */
'use client';
import { useId, useState } from 'react';
import { apiMessage } from '@/api/client';
import { useCreateSettingRequest } from '@/api/queries';
import { Banner, Button, Chip, Dialog, Label, Textarea } from '@/components/ui';

export interface BookChangeTarget {
  issueId: number;
  title: string;
  /** 이 교재에 올린 변경 요청이 처리 중인가 — 서버 */
  changePending?: boolean;
  /** 지금 변경을 요청할 수 있는가(쓰고 있고 처리 중인 요청이 없다) — 서버 */
  changeRequestable?: boolean;
}

export function BookChangeRequestButton({ studentId, studentName, book }: {
  studentId: number; studentName: string; book: BookChangeTarget;
}) {
  const id = useId();
  const ask = useCreateSettingRequest();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  if (book.changePending) return <Chip size="compact" tone="warning">변경 요청 중</Chip>;

  const close = () => { setOpen(false); setReason(''); ask.reset(); };
  const ready = reason.trim().length > 0 && !ask.isPending;
  const submit = () => {
    if (!ready) return;
    ask.mutate({ reqType: 'book_change', studentId, issueId: book.issueId, reason: reason.trim() }, { onSuccess: close });
  };

  return (
    <>
      <Button size="sm" disabled={!book.changeRequestable} onClick={() => setOpen(true)}
        title={book.changeRequestable ? undefined : '쓰고 있는 교재만 바꿔 달라고 할 수 있습니다'}>
        변경 요청
      </Button>
      <Dialog
        open={open} onClose={close} title="교재 변경 요청" closeX
        sub="관리자 승인 뒤 처리됩니다 · 결과는 알림으로 옵니다"
        footer={(
          <>
            <Button onClick={close} disabled={ask.isPending}>취소</Button>
            <Button variant="primary" disabled={!ready} onClick={submit}>{ask.isPending ? '올리는 중…' : '요청 올리기'}</Button>
          </>
        )}
      >
        <div className="flex flex-col gap-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
            <dt className="text-fg-subtle">학생</dt>
            <dd className="font-bold text-fg">{studentName}</dd>
            <dt className="text-fg-subtle">교재</dt>
            <dd className="font-bold text-fg">{book.title}</dd>
          </dl>
          <div>
            <Label htmlFor={`${id}-reason`} hint="필수">사유</Label>
            <Textarea
              id={`${id}-reason`} value={reason} maxLength={500} rows={3} disabled={ask.isPending}
              onChange={(e) => setReason(e.target.value)}
              placeholder="왜 바꿔야 하는지 적어 주세요 — 관리자가 무엇으로 바꿀지 판단합니다"
            />
          </div>
          {ask.isError ? <Banner tone="danger">{apiMessage(ask.error)}</Banner> : null}
        </div>
      </Dialog>
    </>
  );
}
