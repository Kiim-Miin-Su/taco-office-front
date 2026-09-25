/** @file-guide
 * 목적: 개발명세서 v2 §44의 학생별 최신 안내·진단·교재 화면을 표시한다.
 * 책임/재사용: GET /guides/students projection을 그대로 소비하고 편집·PNG는 공용 GuideWriter/png-export에, 학부모 발송은 GuardianSendDialog(보호자 선택 발송)에 위임한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useGuideStudents } from '@/api/queries';
import type { GuideStudent } from '@/api/types';
import { Banner } from '@/components/ui/Banner';
import { Button, LinkButton } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Panel } from '@/components/ui/Panel';
import { QueryState } from '@/components/ui/QueryState';
import { cn } from '@/components/ui/cn';
import { downloadElementPng } from '@/lib/png-export';
import { GuideDiagnosticSummary, GuideScoreCards } from './GuideDiagnosticSummary';
import { GuideBody, GuideNote, GuideTimeline } from './GuideReadout';
import { GuideKindChip, GuideStateChip, guideLessonLabel } from './GuideStatus';
import { GuideWriter } from './GuideWriter';
import { GuardianSendDialog } from '@/components/guardians/GuardianSendDialog';

const LANG_LABEL: Record<string, string> = {
  ko: '한국어',
  en: '영어',
  mix: '영어·한국어',
};

function StudentRail({
  students,
  pickedId,
  onPick,
}: {
  students: GuideStudent[];
  pickedId: number | null;
  onPick: (studentId: number) => void;
}) {
  return (
    <Panel
      title={`학생 ${students.length}명`}
      right={
        <LinkButton href="/schedule" size="sm">
          + 수업
        </LinkButton>
      }
    >
      <ul className="-mx-4 -mb-4 divide-y divide-line border-t border-line">
        {students.map((student) => {
          const active = pickedId === student.studentId;
          return (
            <li key={student.studentId}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onPick(student.studentId)}
                className={cn(
                  'flex w-full items-center gap-2 border-l-[3px] px-3 py-3 text-left transition-colors',
                  active ? 'border-l-primary bg-inset' : 'border-l-transparent hover:bg-inset',
                )}
              >
                <span className="min-w-0 grow">
                  <span className="flex items-center gap-2">
                    <b className="truncate text-[13.5px]">{student.studentName}</b>
                    {student.grade ? <Chip size="compact">{student.grade}</Chip> : null}
                  </span>
                  <span className="mt-1 block text-[11px] text-fg-subtle">안내 {student.guideCount}건</span>
                </span>
                <GuideStateChip state={student.latestGuide.state} />
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function StudentGuideDetail({ student }: { student: GuideStudent }) {
  const [writing, setWriting] = useState(false);
  // 학부모에게 안내문 보내기 (DQ3) — 보호자·채널 선택과 결과는 보호자 발송 창이 서버에서 읽는다
  const [sendingParent, setSendingParent] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const guideRef = useRef<HTMLDivElement>(null);
  const guide = student.latestGuide;
  useEffect(() => { if (!guide.pending) setWriting(false); }, [guide.pending]);

  const savePng = async () => {
    if (!guideRef.current) return;
    setExporting(true);
    setExportError(false);
    try {
      const safeName = student.studentName.replace(/[^0-9A-Za-z가-힣_-]+/g, '-');
      await downloadElementPng(guideRef.current, `${guide.eventOn ?? guide.createdAt.slice(0, 10)}-${safeName}-수업안내.png`);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-w-0 grow space-y-4">
      {writing && guide.pending ? <GuideWriter guide={guide} onClose={() => setWriting(false)} /> : null}
      {exportError ? <Banner tone="danger">안내문 PNG를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.</Banner> : null}
      {sendingParent ? (
        <GuardianSendDialog open student={{ id: student.studentId, name: student.studentName }}
          defaultBody={guide.body ?? ''} title={`학부모에게 안내문 보내기 — ${student.studentName}`}
          onClose={() => setSendingParent(false)} />
      ) : null}

      {/* 단추 줄은 카드 안 아래(원문 §44 · g4 §44-6) — PNG 는 안쪽 내용(ref)만 찍어 단추가 안내문에 들지 않는다 */}
      <div data-testid="guide-student-card" className="overflow-hidden rounded-xl border border-l-[4px] border-line border-l-blue bg-card">
      <div ref={guideRef} className="bg-card p-4">
        <header className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
          {/* 원문 §44 머리 「● 포괄 안내」 — 작성된 안내의 종류(서버 kindLabel · g4 §44-4) */}
          <GuideKindChip guide={guide} />
          <h2 className="text-[20px] font-bold">{student.studentName}</h2>
          {student.grade ? <Chip>{student.grade}</Chip> : null}
          <GuideStateChip state={guide.state} />
          <span className="ml-auto text-[12px] font-bold text-fg-subtle">
            {guide.teacherName ?? '강사 미정'} · {guideLessonLabel(guide)}
          </span>
        </header>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-amber/30 bg-amber/5 p-3">
            <div className="text-[11px] font-bold text-fg-subtle">지도 강도</div>
            <div className="mt-1 text-[17px] font-bold text-amber">{student.guidance ?? '미설정'}</div>
          </div>
          <div className="rounded-lg border border-blue/30 bg-blue/5 p-3">
            <div className="text-[11px] font-bold text-fg-subtle">수업 언어</div>
            <div className="mt-1 text-[17px] font-bold text-blue">
              {student.lang ? (LANG_LABEL[student.lang] ?? student.lang) : '미설정'}
            </div>
          </div>
        </div>

        <Panel
          className="mt-3"
          title="진단 요약"
          sub={student.diagnostic ? `${student.diagnostic.createdAt.slice(0, 10)} 기록` : '최근 진단 기록'}
        >
          <GuideScoreCards scores={student.scores} />
          <GuideDiagnosticSummary diagnostic={student.diagnostic} />
        </Panel>

        <GuideBody body={guide.body} />
        <div className="mt-3">
          <GuideNote label="지도 방향" text={guide.direction} tone="info" />
        </div>

        <Panel className="mt-3" title={`교재 ${student.books.length}종`}>
          {student.books.length === 0 ? (
            <p className="py-3 text-center text-[12px] text-fg-subtle">배부된 교재가 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {student.books.map((book) => (
                <li key={book.issueId} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2.5">
                  {book.seTe ? <Chip tone="purple">{book.seTe}</Chip> : null}
                  <span className="min-w-0 grow text-[13px] font-bold">{book.title}</span>
                  {book.edition ? <Chip>{book.edition}</Chip> : null}
                  <span className="text-[11px] text-fg-subtle">{book.code}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <GuideTimeline guide={guide} />
      </div>

      {/* 관리자 코멘트는 강사에게만 남기는 말 — PNG(ref) 밖에 두어 안내문 그림·학부모 발송 본문에 싣지 않는다 (g4 §44-3) */}
      <div className="px-4 pb-4">
        <GuideNote label="관리자 코멘트 · 강사만" text={guide.adminNote} tone="warning" />
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-line p-4 lg:grid-cols-4">
        <Button disabled={!guide.pending} onClick={() => setWriting(true)}>
          수정
        </Button>
        <Button disabled={exporting} onClick={() => void savePng()}>
          {exporting ? '만드는 중…' : '안내문 PNG'}
        </Button>
        <LinkButton href="/schedule">+ 수업</LinkButton>
        <Button disabled={!guide.body?.trim()} title={guide.body?.trim() ? '보호자를 골라 안내문을 보냅니다' : '안내를 먼저 작성해 주세요'}
          onClick={() => setSendingParent(true)}>
          학부모에게 보내기
        </Button>
        <Button variant="success" disabled title="강사 확인 전이는 수신처·세션 계약 확정 후 연결합니다">
          {guide.acknowledgedAt ? '강사 확인 완료' : '강사 확인 대기'}
        </Button>
      </div>
      </div>
    </div>
  );
}

export function GuideStudents() {
  const query = useGuideStudents();
  const [pickedId, setPickedId] = useState<number | null>(null);

  return (
    <QueryState query={query} isEmpty={(data) => data.items.length === 0} empty="안내가 있는 학생이 없습니다.">
      {(data) => {
        const picked = data.items.find((student) => student.studentId === pickedId) ?? data.items[0];
        return (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <StudentRail students={data.items} pickedId={picked.studentId} onPick={setPickedId} />
            {/* 다른 학생/안내는 별도 편집 세션이며 같은 안내의 재조회는 초안을 유지한다. */}
            <StudentGuideDetail key={`${picked.studentId}:${picked.latestGuide.id}`} student={picked} />
          </div>
        );
      }}
    </QueryState>
  );
}
