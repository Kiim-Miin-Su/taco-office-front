/** @file-guide
 * 목적: TeacherPrivateNoteDraft.tsx — 강사가 수업 회차에서 관리자 전용 특이사항 초안을 작성하는 Front 계약 준비 UI다.
 * 책임/재사용: 선택한 회차의 표시 정보와 로컬 초안만 소유한다. 학생 identity·저장·최근 제출 조회는 생성 DTO 이후의 서버 계약이 소유한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';

import { useState } from 'react';
import type { TeacherHistoryLesson } from '@/api/types';
import { Button, Chip, Dialog, Label, Select, Textarea } from '@/components/ui';
import { hm } from '@/components/teacher/format';

function studentNames(students?: string | null): string[] {
  return (students ?? '')
    .split(/\s*(?:,|·)\s*/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function dateLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

export function TeacherPrivateNoteDraft({
  lesson,
  subject,
  onClose,
}: {
  lesson: TeacherHistoryLesson;
  subject: string;
  onClose: () => void;
}) {
  const students = studentNames(lesson.students);
  const [student, setStudent] = useState(students[0] ?? '');
  const [body, setBody] = useState('');

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
          <Button className="!h-11" onClick={onClose}>취소</Button>
          <Button className="!h-11" variant="primary" disabled>저장 계약 준비 중</Button>
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

      <div className="mt-4">
        <Label htmlFor="private-note-student" hint="수업 명단에서 자동 입력">학생</Label>
        <Select
          id="private-note-student"
          value={student}
          onChange={(event) => setStudent(event.target.value)}
          disabled={students.length < 2}
        >
          {students.map((name) => <option key={name} value={name}>{name}</option>)}
        </Select>
      </div>

      <div className="mt-4">
        <Label htmlFor="private-note-body" hint={`${body.trim().length}자`}>특이사항 내용</Label>
        <Textarea
          id="private-note-body"
          value={body}
          maxLength={2000}
          onChange={(event) => setBody(event.target.value)}
          placeholder="예) 오늘 유난히 지쳐 보였습니다. 학교 수행평가가 겹쳤다고 지나가듯 이야기했습니다."
        />
      </div>

      <div className="mt-4 rounded-xl border border-amber/40 bg-amber/5 p-3 text-[12px] leading-relaxed text-fg">
        <b className="block text-amber">관리자만 볼 수 있고 학부모에게 공개되지 않습니다.</b>
        학생 상태, 학생·학부모의 말, 리포트에 쓰기 조심스러운 내용을 남기는 자리입니다.
      </div>

      <div className="mt-3 rounded-xl border border-line bg-card p-3 text-[12px] leading-relaxed text-fg-subtle">
        저장에는 학생 ID와 실제 회차를 구분하는 전용 계약이 필요합니다. 현재 히스토리 응답은 학생 이름만 제공하므로
        기존 관리자→강사 인계 메모에 연결하지 않고 입력 경로만 준비했습니다.
      </div>
    </Dialog>
  );
}

