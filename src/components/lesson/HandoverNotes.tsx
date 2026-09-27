/** @file-guide
 * 목적: HandoverNotes.tsx — HandoverNoteList, HandoverNoteForm (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 인수인계 메모 (N-36 ② · W11 M2 · 강사 덱 27 「주의사항 — 학부모 요청 · 학생 특성 · 이전 강사 인수인계」 · 44 「관리자 → 강사」).
 *
 * **쓰는 쪽은 관리자 · 매니저**(§79 학생 트래킹 카드 · 서버 @Perm canAdminPage + canCrudAll), **읽는 쪽은 그 학생을 맡은 강사**
 * (수업 안내 학생 카드)다. 한 줄씩 **더하기만** 한다 — 고치기 · 지우기가 없고 누가 · 언제가 남는다(append).
 * 학부모에게 나가는 글에는 쓰이지 않는다 — 시스템이 이 줄로 학부모 문장을 짓지 않는다.
 * 목록 · 차례 · 몇 줄까지 싣는지는 서버가 정한다(최근 것부터 스무 줄 · 전체 줄 수 `noteCount`).
 */
'use client';
import { useId, useState } from 'react';
import { Banner, Button, Input } from '../ui';
import { apiMessage } from '@/api/client';
import { useAddTrackingNote } from '@/api/queries';

export interface HandoverNote { id: number; body: string; authorName: string | null; createdAt: string }

/** 「2026-09-27 14:05」 — 서버가 준 KST ISO 를 자르기만 한다 */
const at = (iso: string) => iso.slice(0, 16).replace('T', ' ');

export function HandoverNoteList({ notes, total, empty = '아직 남긴 인수인계 메모가 없습니다' }: {
  notes: readonly HandoverNote[];
  /** 서버가 센 전체 줄 수 — 실린 줄보다 많으면 「최근 N줄만」이라 적는다 */
  total?: number;
  empty?: string;
}) {
  if (notes.length === 0) return <p className="text-[11.5px] text-fg-subtle">{empty}</p>;
  return (
    <>
      <ul className="flex flex-col gap-1.5">
        {notes.map((n) => (
          <li key={n.id} className="rounded-lg border border-line bg-bg-2 px-2.5 py-2">
            <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-fg">{n.body}</p>
            <p className="mt-1 text-[10.5px] text-fg-subtle">{n.authorName ?? '—'} · {at(n.createdAt)}</p>
          </li>
        ))}
      </ul>
      {total !== undefined && total > notes.length ? (
        <p className="mt-1 text-[10.5px] text-fg-subtle">최근 {notes.length}줄만 보입니다 · 전체 {total}줄</p>
      ) : null}
    </>
  );
}

/** 한 줄 더하기 — 앞뒤 빈칸은 서버가 지우고 빈 글은 400(`NOTE_EMPTY`)이다. 오류는 서버 문장 그대로 */
export function HandoverNoteForm({ studentId, serId, studentName }: { studentId: number; serId: number; studentName: string }) {
  const id = useId();
  const add = useAddTrackingNote();
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const ready = body.trim() !== '' && !add.isPending;
  const submit = () => {
    if (!ready) return;
    setErr(null);
    add.mutate({ studentId, serId, body: body.trim() }, {
      onSuccess: () => setBody(''),
      onError: (e) => setErr(apiMessage(e)),
    });
  };
  return (
    <form
      className="mt-1.5 flex flex-col gap-1.5"
      onSubmit={(e) => { e.preventDefault(); submit(); }}
    >
      <div className="flex gap-1.5">
        <label htmlFor={`${id}-note`} className="sr-only">{studentName} 인수인계 메모</label>
        <Input
          id={`${id}-note`} value={body} maxLength={500} disabled={add.isPending}
          placeholder="다음 강사에게 남길 한 줄 — 학부모에게 나가지 않습니다"
          onChange={(e) => setBody(e.target.value)}
        />
        <Button type="submit" size="sm" variant="secondary" disabled={!ready}>{add.isPending ? '남기는 중…' : '남기기'}</Button>
      </div>
      {err ? <Banner tone="danger">{err}</Banner> : null}
    </form>
  );
}
