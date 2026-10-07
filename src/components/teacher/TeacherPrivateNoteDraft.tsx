/** @file-guide
 * 목적: TeacherPrivateNoteDraft.tsx — 완료 회차의 강사 특이사항을 관리자 전용 원장에 저장하고 최근 전달 영수증을 확인한다.
 * 책임/재사용: 생성 DTO·공용 query/mutation·requestKey를 재사용하며 본문은 로컬 입력 중에만 소유한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';

import { useState } from 'react';
import { apiMessage } from '@/api/client';
import { useTeacherPrivateNoteReceipts, useWriteTeacherPrivateNote } from '@/api/queries';
import type { TeacherHistoryLesson, TeacherPrivateNoteReceipt } from '@/api/types';
import { Banner, Button, Chip, Dialog, Label, Select, Textarea } from '@/components/ui';
import { hm } from '@/components/teacher/format';
import { kstDateTime } from '@/lib/calendar';
import { useRequestKey } from '@/lib/request-key';

function dateLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

const sameTarget = (receipt: TeacherPrivateNoteReceipt, lesson: TeacherHistoryLesson, studentId: number) =>
  receipt.studentId === studentId && receipt.serId === lesson.serId && receipt.onDate === lesson.onDate;

/**
 * BOC-09D-03 권고안 채택: 기존 관리자→강사 NOTE에 저장하지 않는다. 구조화 studentId와
 * 원래 회차일(onDate), server version, requestKey로 전용 writer를 호출하고 강사에게는 본문 없는
 * 전달 영수증만 보인다. 정책 변경 시 Back DTO/service/migration, 관리자 학생 모음, 두 DBML,
 * 두 수정사항 대조표와 portfolio를 같은 청크에서 갱신한다.
 */
export function TeacherPrivateNoteDraft({
  lesson,
  subject,
  onClose,
}: {
  lesson: TeacherHistoryLesson;
  subject: string;
  onClose: () => void;
}) {
  const receipts = useTeacherPrivateNoteReceipts();
  const write = useWriteTeacherPrivateNote();
  const requestKey = useRequestKey();
  const [studentId, setStudentId] = useState(lesson.studentItems[0]?.id ?? 0);
  const [body, setBody] = useState('');
  const [saved, setSaved] = useState<TeacherPrivateNoteReceipt | null>(null);
  const current = saved && sameTarget(saved, lesson, studentId)
    ? saved
    : receipts.data?.items.find((item) => sameTarget(item, lesson, studentId)) ?? null;
  const invalid = studentId <= 0 || body.trim().length === 0 || body.length > 2000;

  const save = async () => {
    if (invalid || receipts.isPending || write.isPending) return;
    const command = {
      studentId, serId: lesson.serId, onDate: lesson.onDate, body: body.trim(), expectedVersion: current?.version ?? 0,
    };
    try {
      const result = await write.mutateAsync({ ...command, requestKey: requestKey.keyFor(command) });
      setSaved(result);
      setBody('');
      requestKey.reset();
    } catch {
      // mutation.error가 공용 ApiError 문구를 렌더링한다. requestKey는 같은 입력의 안전한 재시도를 위해 유지한다.
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="특이사항 작성"
      sub="리포트에 담기 어려운 이야기를 남겨 주세요. 필수는 아닙니다."
      closeX
      width={560}
      footer={(
        <>
          <Button className="!h-11" onClick={onClose}>{saved ? '닫기' : '취소'}</Button>
          <Button className="!h-11" variant="primary" disabled={invalid || receipts.isPending || write.isPending} onClick={() => void save()}>
            {write.isPending ? '전달 중…' : '관리자에게 전달'}
          </Button>
        </>
      )}
    >
      <div className="rounded-xl border border-line bg-inset p-3">
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-[13px] text-fg">{subject}</b>
          <Chip size="compact" tone="neutral">{lesson.mode === 'online' ? '비대면' : '대면'}</Chip>
        </div>
        <p className="mt-1 text-[12px] text-fg-subtle">
          {dateLabel(lesson.date)} · {hm(lesson.startMin)}–{hm(lesson.startMin + lesson.durMin)}
        </p>
      </div>

      {saved ? <Banner tone="success" className="mt-4"><p role="status">관리자에게 전달되었습니다.</p></Banner> : null}
      {write.error ? <Banner tone="danger" className="mt-4">{apiMessage(write.error)}</Banner> : null}
      {receipts.isError ? (
        <Banner tone="warning" className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span>최근 전달 버전을 확인하지 못해 저장할 수 없습니다.</span>
            <Button size="sm" onClick={() => void receipts.refetch()}>다시 불러오기</Button>
          </div>
        </Banner>
      ) : null}

      <div className="mt-4">
        <Label htmlFor="private-note-student" hint="수업 명단에서 자동 입력">학생</Label>
        <Select
          id="private-note-student"
          value={studentId}
          onChange={(event) => { setStudentId(Number(event.target.value)); setSaved(null); }}
          disabled={lesson.studentItems.length < 2 || write.isPending}
        >
          {lesson.studentItems.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
        </Select>
      </div>

      <div className="mt-4">
        <Label htmlFor="private-note-body" hint={`${body.trim().length}자 / 2,000자`}>특이사항 내용</Label>
        <Textarea
          id="private-note-body"
          value={body}
          maxLength={2000}
          onChange={(event) => { setBody(event.target.value); setSaved(null); }}
          placeholder="예) 오늘 유난히 지쳐 보였습니다. 학교 수행평가가 겹쳤다고 지나가듯 이야기했습니다."
        />
      </div>

      <div className="mt-4 rounded-xl border border-amber/40 bg-amber/5 p-3 text-[12px] leading-relaxed text-fg">
        <b className="block text-amber">관리자만 볼 수 있고 학부모에게 공개되지 않습니다.</b>
        학생 상태, 학생·학부모의 말, 리포트에 쓰기 조심스러운 내용을 남기는 자리입니다.
      </div>

      <div className="mt-4 rounded-xl border border-line bg-card p-3">
        <b className="text-[12px] text-fg">최근 전달 내역</b>
        {receipts.isPending ? <p className="mt-2 text-[12px] text-fg-subtle">불러오는 중…</p>
          : receipts.data?.items.length ? (
            <ul className="mt-2 space-y-2">
              {receipts.data.items.slice(0, 5).map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-x-2 text-[12px] text-fg-subtle">
                  <b className="text-fg">{item.studentName}</b>
                  <span>{item.onDate}</span>
                  <span>전달 v{item.version}</span>
                  <span className="ml-auto">{kstDateTime(item.updatedAt) ?? item.updatedAt}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-[12px] text-fg-subtle">아직 전달한 특이사항이 없습니다.</p>}
      </div>
    </Dialog>
  );
}
