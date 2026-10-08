/** @file-guide
 * 목적: BOC-05D-01 수업 허브의 exact 안내·학생 이력 패널
 * 책임/재사용: 서버 read model만 표시하며 회차 이동은 상위 TeacherSchedule이 소유한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { TeacherLessonHub, TeacherLessonHubHistoryItem } from '@/api/types';
import { hhmm, label } from '@/lib/calendar';
import { Button, Chip, Dialog, Select } from '@/components/ui';

const reportStateLabel = (state: string): string => ({
  na: '리포트 대상 아님', plan: '수업 예정', none: '리포트 미작성', draft: '작성 중',
  wait: '승인 대기', ok: '승인 완료', rej: '반려',
}[state] ?? '상태 확인 필요');

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line p-4 text-[13px] text-fg-subtle">{children}</p>;
}

export function TeacherLessonGuidePanel({ hub, onClose }: { hub: TeacherLessonHub; onClose: () => void }) {
  const lesson = hub.lesson;
  const place = lesson.mode === 'online'
    ? lesson.zaccLabel ?? '줌 계정 미정'
    : [lesson.roomBranch, lesson.roomName].filter(Boolean).join(' · ') || '강의실 미정';
  return (
    <Dialog open onClose={onClose} title="수업 안내" sub={`${label(lesson.date)} · ${hhmm(lesson.startMin)} · ${place}`} closeX width={760}>
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pt-4">
        {hub.guideStudents.length === 0 ? <Empty>{hub.capabilities.guide.reason ?? '연결된 학생 안내가 없습니다.'}</Empty> : null}
        {hub.guideStudents.map((student) => (
          <section key={student.studentId} className="rounded-xl border border-line bg-card p-4" aria-label={`${student.name} 수업 안내`}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-bold text-fg">{student.name}</h3>
              {student.grade ? <Chip>{student.grade}</Chip> : null}
              {student.school ? <span className="text-[12px] text-fg-2">{student.school}</span> : null}
            </div>
            <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
              <div><dt className="font-bold text-fg-subtle">지도 방식</dt><dd className="mt-1 text-fg">{student.guidance ?? '미설정'}</dd></div>
              <div><dt className="font-bold text-fg-subtle">수업 언어</dt><dd className="mt-1 text-fg">{student.lang ?? '미설정'}</dd></div>
              <div><dt className="font-bold text-fg-subtle">목표 시험</dt><dd className="mt-1 text-fg">{student.targetExam ?? '미설정'}</dd></div>
              <div><dt className="font-bold text-fg-subtle">이번 주 수업</dt><dd className="mt-1 text-fg">{student.weekCount}회</dd></div>
            </dl>
            <div className="mt-4">
              <h4 className="text-[13px] font-bold text-fg">최신 진단</h4>
              {student.diag ? (
                <div className="mt-2 rounded-lg bg-inset p-3 text-[13px] text-fg-2">
                  <b className="text-fg">{student.diag.levelSummary}</b>
                  {student.diag.strengths ? <p className="mt-1">강점 · {student.diag.strengths}</p> : null}
                  {student.diag.weaknesses ? <p className="mt-1">약점 · {student.diag.weaknesses}</p> : null}
                  {student.diag.curriculum ? <p className="mt-1">권장 커리큘럼 · {student.diag.curriculum}</p> : null}
                </div>
              ) : <p className="mt-2 text-[12px] text-fg-subtle">진단 기록이 없습니다.</p>}
            </div>
            <div className="mt-4">
              <h4 className="text-[13px] font-bold text-fg">교재</h4>
              {student.books.length ? (
                <ul className="mt-2 flex flex-col gap-2 text-[13px]">
                  {student.books.map((book) => (
                    <li key={book.issueId} className="rounded-lg border border-line px-3 py-2">
                      <b>{book.title}</b> <span className="text-fg-subtle">{book.code} · {book.stateLabel}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-[12px] text-fg-subtle">연결된 교재가 없습니다.</p>}
            </div>
            <div className="mt-4">
              <h4 className="text-[13px] font-bold text-fg">인수인계</h4>
              {student.notes.length ? (
                <ul className="mt-2 flex flex-col gap-2 text-[13px]">
                  {student.notes.map((note) => <li key={note.id} className="rounded-lg bg-inset p-3">{note.body}</li>)}
                </ul>
              ) : <p className="mt-2 text-[12px] text-fg-subtle">인수인계 메모가 없습니다.</p>}
            </div>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

export function TeacherLessonHistoryPanel({ hub, subjectName, onOpenLesson, onClose }: {
  hub: TeacherLessonHub;
  subjectName: (key: string | null) => string;
  onOpenLesson: (item: TeacherLessonHubHistoryItem) => void;
  onClose: () => void;
}) {
  const [studentId, setStudentId] = useState('all');
  const [subject, setSubject] = useState('all');
  const [state, setState] = useState('all');
  const students = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of hub.history) for (const student of item.studentItems) map.set(student.id, student.name);
    return [...map].sort((a, b) => a[1].localeCompare(b[1], 'ko'));
  }, [hub.history]);
  const subjects = useMemo(() => [...new Set(hub.history.map((item) => item.subKey ?? item.kindKey))], [hub.history]);
  const filtered = hub.history.filter((item) => (
    (studentId === 'all' || item.studentItems.some((student) => student.id === Number(studentId)))
    && (subject === 'all' || (item.subKey ?? item.kindKey) === subject)
    && (state === 'all' || item.repState === state)
  ));
  const groups = [...new Set(filtered.map((item) => item.date.slice(0, 7)))];

  return (
    <Dialog open onClose={onClose} title="학생 수업 이력" sub="현재 회차 학생 · 현재 담당 강사의 수업" closeX width={760}>
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pt-4">
        <div className="grid gap-2 sm:grid-cols-3" aria-label="수업 이력 필터">
          <Select aria-label="학생 필터" value={studentId} onChange={(event) => setStudentId(event.target.value)}>
            <option value="all">학생 전체</option>
            {students.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
          <Select aria-label="과목 필터" value={subject} onChange={(event) => setSubject(event.target.value)}>
            <option value="all">과목 전체</option>
            {subjects.map((key) => <option key={key} value={key}>{subjectName(key)}</option>)}
          </Select>
          <Select aria-label="상태 필터" value={state} onChange={(event) => setState(event.target.value)}>
            <option value="all">상태 전체</option>
            {[...new Set(hub.history.map((item) => item.repState))].map((key) => (
              <option key={key} value={key}>{reportStateLabel(key)}</option>
            ))}
          </Select>
        </div>
        {groups.length === 0 ? <Empty>조건에 맞는 수업 이력이 없습니다.</Empty> : groups.map((month) => (
          <section key={month} aria-label={`${month} 수업 이력`}>
            <h3 className="mb-2 text-[13px] font-bold text-fg">{month}</h3>
            <ul className="flex flex-col gap-2">
              {filtered.filter((item) => item.date.startsWith(month)).map((item) => (
                <li key={`${item.serId}:${item.onDate}`}>
                  <Button className="min-h-14 w-full justify-start text-left" onClick={() => onOpenLesson(item)}>
                    <span>
                      <b className="block text-fg">{label(item.date)} · {hhmm(item.startMin)} · {subjectName(item.subKey ?? item.kindKey)}</b>
                      <span className="mt-1 block text-[12px] font-normal text-fg-subtle">
                        {item.studentItems.map((student) => student.name).join(' · ')} · {item.canceled ? '취소' : reportStateLabel(item.repState)}
                      </span>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
