/** @file-guide
 * 목적: 정확한 강사 회차에서 10일 이상 변경 요청과 10일 미만·과거 건의 초안을 분기한다.
 * 책임/재사용: 회차 identity·입력 초안과 승인 요청 receipt만 소유한다. 생성 DTO·공용 requestKey·drawer writer를 재사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ApiError, apiMessage } from '@/api/client';
import { useDrawerWrite } from '@/api/queries';
import type { ChangeReqCreate, ChangeReqResult, Occurrence } from '@/api/types';
import { conflictLines, hhmm, lessonTimeIssue, parseHm } from '@/lib/calendar';
import { useRequestKey } from '@/lib/request-key';
import { Banner, Button, Dialog, Input, Label, Select } from '@/components/ui';
import { TEACHER_SUGGESTION_CATEGORIES, type TeacherSuggestionCategory } from './suggestion-categories';

const REQUIRED_NOTICE_DAYS = 10;
const dayDistance = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

export type TeacherScheduleChangeMode = 'request' | 'suggestion';

/** 화면 분기는 안내용이다. 저장 시점의 KST 10일 판정은 후속 서버 계약이 다시 검사한다. */
export function teacherScheduleChangeMode(today: string, lessonDate: string): TeacherScheduleChangeMode {
  return dayDistance(today, lessonDate) >= REQUIRED_NOTICE_DAYS ? 'request' : 'suggestion';
}

const inputTime = (minutes: number): string => hhmm(minutes);

function LessonIdentity({ occ }: { occ: Occurrence }) {
  const students = occ.students.filter((student) => !student.droppedOnce).map((student) => student.name).join(' · ');
  return (
    <div className="rounded-xl border border-line bg-inset p-3 text-[12px] leading-relaxed text-fg-2">
      <b className="block text-[13px] text-fg">현재 일정 · {occ.date} · {hhmm(occ.startMin)}–{hhmm(occ.endMin)}</b>
      <span>회차 #{occ.serId} · 원래 회차일 {occ.onDate} · {students || '학생 미정'}</span>
    </div>
  );
}

export function TeacherScheduleChange({ open, occ, today, readVersion, onRefresh, onBack }: {
  open: boolean;
  occ: Occurrence;
  today: string;
  readVersion: number;
  onRefresh: () => Promise<unknown>;
  onBack: () => void;
}) {
  const write = useDrawerWrite();
  const requestKey = useRequestKey();
  const mode = teacherScheduleChangeMode(today, occ.date);
  const identity = `${occ.serId}|${occ.onDate}|${occ.date}`;
  const [requestedDate, setRequestedDate] = useState(occ.date);
  const [start, setStart] = useState(() => inputTime(occ.startMin));
  const [end, setEnd] = useState(() => inputTime(occ.endMin));
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState<TeacherSuggestionCategory>('schedule');
  const [body, setBody] = useState('');
  const [savedId, setSavedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);

  useEffect(() => {
    setRequestedDate(occ.date);
    setStart(inputTime(occ.startMin));
    setEnd(inputTime(occ.endMin));
    setReason('');
    setCategory('schedule');
    setBody('');
    setSavedId(null);
    setError(null);
    setConflicts([]);
    requestKey.reset();
  }, [identity, occ.date, occ.endMin, occ.startMin, requestKey]);

  const startMin = parseHm(start);
  const endMin = parseHm(end);
  const timeIssue = startMin === null || endMin === null ? '시작과 끝 시각을 확인해 주세요.' : lessonTimeIssue(startMin, endMin);
  const changed = requestedDate !== occ.date || startMin !== occ.startMin || endMin !== occ.endMin;
  const requestReady = Boolean(requestedDate && !timeIssue && changed && reason.trim());
  const suggestionReady = Boolean(category && body.trim());
  const days = dayDistance(today, occ.date);
  const command = useMemo(() => {
    if (startMin === null || endMin === null) return null;
    return {
      reqType: 'time_move', serId: occ.serId, onDate: occ.onDate, sourceDate: occ.date, readVersion,
      requestedDate, startMin, endMin, reason: reason.trim(),
    } satisfies ChangeReqCreate;
  }, [endMin, occ.date, occ.onDate, occ.serId, readVersion, reason, requestedDate, startMin]);

  /**
   * BO-06D-02 권고안: 화면은 기존 일정 writer를 호출하지 않고 CHREQ만 접수한다. 서버가 KST 10일·source version을
   * 다시 판정하고 승인 transaction에서 월마감·충돌·취소를 재검사한다. 계약 변경 시 DTO/OpenAPI/generated type,
   * 두 수정사항 대조표·시나리오·portfolio를 같은 청크에서 갱신한다.
   */
  const submit = async () => {
    if (!requestReady || !command || write.isPending || savedId !== null) return;
    setError(null);
    setConflicts([]);
    try {
      const result = await write.mutateAsync({
        kind: 'changeReq', body: { ...command, requestKey: requestKey.keyFor(command) },
      }) as ChangeReqResult;
      if (result.conflicts.length > 0) {
        setConflicts(conflictLines(result.conflicts));
        return;
      }
      if (typeof result.id !== 'number') {
        setError('요청 번호를 받지 못했습니다. 현재 일정을 새로고침한 뒤 다시 요청해 주세요.');
        return;
      }
      setSavedId(result.id);
      requestKey.reset();
      await onRefresh();
    } catch (cause) {
      if (cause instanceof ApiError && ['CHREQ_SOURCE_STALE', 'CHREQ_OCCURRENCE_CHANGED'].includes(cause.code)) {
        setError(`${cause.message} 현재 일정을 새로고침한 뒤 다시 요청해 주세요.`);
      } else {
        setError(apiMessage(cause));
      }
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onBack}
      title={mode === 'request' ? '일정 변경 요청' : '수업 건의 초안'}
      sub={mode === 'request'
        ? `수업까지 ${days}일 · 정확히 10일 이상은 승인 요청`
        : days < 0 ? '이미 지난 수업 · 건의로만 요청' : `수업까지 ${days}일 · 10일 미만은 건의로 요청`}
      closeX
      width={620}
      footer={<Button className="min-h-11" onClick={onBack}>이 수업으로 돌아가기</Button>}
    >
      <div className="flex flex-col gap-3">
        <LessonIdentity occ={occ} />
        {mode === 'request' ? (
          <>
            <Banner tone="info" title="관리자 승인 후 반영">
              변경 요청을 보내도 승인 전에는 원래 일정이 유지됩니다. 관리자가 승인할 때 충돌과 월 마감을 다시 검사합니다.
            </Banner>
            {savedId !== null ? <Banner tone="success" title={`변경 요청 #${savedId} 접수`}>
              관리자 승인 대기 중입니다. 승인 전까지 현재 일정은 바뀌지 않습니다.
            </Banner> : null}
            {error ? <Banner tone="danger" title="변경 요청을 접수하지 못했습니다">{error}</Banner> : null}
            {conflicts.length > 0 ? <Banner tone="warning" title="요청한 일정이 겹칩니다">
              <ul className="list-disc pl-5">{conflicts.map((line) => <li key={line}>{line}</li>)}</ul>
            </Banner> : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="min-w-0">
                <Label htmlFor="teacher-change-date">변경 날짜</Label>
                <Input id="teacher-change-date" type="date" value={requestedDate} onChange={(event) => setRequestedDate(event.currentTarget.value)} />
              </div>
              <div className="min-w-0">
                <Label htmlFor="teacher-change-start">새 시작</Label>
                <Input id="teacher-change-start" type="time" step={300} value={start} onChange={(event) => setStart(event.currentTarget.value)} />
              </div>
              <div className="min-w-0">
                <Label htmlFor="teacher-change-end">새 끝</Label>
                <Input id="teacher-change-end" type="time" step={300} value={end} onChange={(event) => setEnd(event.currentTarget.value)} />
              </div>
            </div>
            {timeIssue ? <p role="alert" className="text-[12px] text-red">{timeIssue}</p> : null}
            <div>
              <Label htmlFor="teacher-change-reason">변경 사유</Label>
              <textarea
                id="teacher-change-reason"
                value={reason}
                onChange={(event) => setReason(event.currentTarget.value)}
                maxLength={500}
                rows={4}
                placeholder="예) 학생과 보호자에게 확인한 일정 변경 요청입니다."
                className="mt-1.5 w-full resize-y rounded-lg border border-line bg-card px-3 py-2.5 text-[13px] text-fg placeholder:text-fg-subtle"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-fg-subtle">{savedId !== null ? '접수된 요청은 수업 허브에서 다시 확인할 수 있습니다.'
                : requestReady ? '입력 완료 · 관리자가 승인할 때 다시 검증합니다.' : '날짜 또는 시각을 바꾸고 사유를 입력해 주세요.'}</span>
              <Button className="ml-auto min-h-11" variant="primary"
                disabled={!requestReady || write.isPending || savedId !== null} onClick={() => void submit()}>
                {write.isPending ? '접수 중…' : savedId !== null ? '승인 대기 중' : '변경 요청 보내기'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <Banner tone="warning" title={days < 0 ? '지난 수업은 건의만 가능합니다' : '10일 미만은 건의로 요청합니다'}>
              이 회차의 원래 날짜와 실제 수업일을 건의에 함께 연결해야 합니다. 관리자가 답변해도 일정은 자동으로 바뀌지 않습니다.
            </Banner>
            <Banner tone="warning" title="수업 연결 기능 준비 중">
              현재 건의 기능은 원래 회차와 실제 수업일을 함께 저장할 수 없습니다. 지금은 초안만 보존합니다.
            </Banner>
            <div>
              <Label htmlFor="teacher-lesson-suggestion-category">분류</Label>
              <Select id="teacher-lesson-suggestion-category" value={category}
                onChange={(event) => setCategory(event.currentTarget.value as TeacherSuggestionCategory)}>
                {TEACHER_SUGGESTION_CATEGORIES.map((item) => (
                  <option key={item.key} value={item.key}>{item.label} · {item.sub}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="teacher-lesson-suggestion-body">내용</Label>
              <textarea
                id="teacher-lesson-suggestion-body"
                value={body}
                onChange={(event) => setBody(event.currentTarget.value)}
                maxLength={2000}
                rows={5}
                placeholder="예) 이 수업 시간을 조정할 수 있을지 확인 부탁드립니다."
                className="mt-1.5 w-full resize-y rounded-lg border border-line bg-card px-3 py-2.5 text-[13px] text-fg placeholder:text-fg-subtle"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/teacher/suggestions" aria-label="건의 사항 전체 보기"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-card px-3 text-[13px] font-bold text-fg hover:bg-inset focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg">
                건의 사항 전체 보기
              </Link>
              <span className="text-[12px] text-fg-subtle">{suggestionReady ? '초안 입력 완료 · 수업 연결 기능 준비 중' : '분류와 내용을 입력해 주세요.'}</span>
              <Button className="ml-auto min-h-11" variant="primary" disabled title="수업 회차 연결 기능이 준비된 뒤 사용할 수 있습니다">
                건의 기능 준비 중
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
