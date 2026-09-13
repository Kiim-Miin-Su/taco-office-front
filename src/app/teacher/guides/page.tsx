/** @file-guide
 * 목적: page.tsx — TeacherGuidesPage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 수업 안내 — 강사 덱 §10~13 · Figma 「웹 · 수업 안내」(7977:46327·7983:46928).
 * 이번 주 담당 학생(좌) + 학생 준비 정보(우): 교재·진단·수업 설정. 전부 GET /teacher/guides.
 * 덱의 «학생 스타일 영역별 바»는 구조화 저장처가 없어 싣지 않는다 — 진단 요약(diag)으로 대신하고
 * 경계를 기록했다 (TBO-49 §6 조사 메모). 교재 «변경 요청·받기»는 미확정 쓰기 — disabled 표시만.
 */
'use client';
import { useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Button, Chip, PageHeader, Panel, QueryState } from '@/components/ui';
import { useTeacherGuides } from '@/api/queries';
import type { TeacherGuideStudent } from '@/api/types';
import { hm, md } from '@/components/teacher/format';
import { DiagnosticForm } from '@/components/teacher/DiagnosticForm';

const addDays = (iso: string, n: number): string => {
  const d = new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86400000);
  return d.toISOString().slice(0, 10);
};

/** stu.lang 원문 → 칩 라벨. 값이 없거나 낯설면 원문 그대로 보여 준다 — 화면이 다시 판정하지 않는다. */
const LANG_LABEL: Record<string, string> = { ko: '한국어 수업', en: '영어로만 수업', mix: '혼용 수업' };

function StudentRow({ s, active, onPick }: { s: TeacherGuideStudent; active: boolean; onPick: () => void }) {
  const subjects = [...new Set(s.lessons.map((l) => l.title ?? l.subKey ?? ''))].filter(Boolean).join(', ');
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        aria-pressed={active}
        className={`flex w-full items-center gap-3 border-b border-line px-3 py-3 text-left last:border-b-0 ${active ? 'bg-primary/10' : ''}`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-inset text-[12px] font-bold text-primary">
          {s.name.slice(1) || s.name}
        </span>
        <span className="min-w-0 grow">
          <span className="flex items-center gap-1.5">
            <b className="text-[13.5px] text-fg">{s.name}</b>
            {s.grade ? <Chip size="compact" tone="info">{s.grade}</Chip> : null}
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] text-fg-subtle">{subjects || '과목 미정'}</span>
        </span>
        <span className="shrink-0 text-[11.5px] font-bold text-fg-subtle">주 {s.weekCount}회</span>
      </button>
    </li>
  );
}

function BookCard({ code, title, seTe, issuedOn, returnedOn }: {
  code: string; title: string; seTe: string; issuedOn: string; returnedOn: string | null | undefined;
}) {
  const done = Boolean(returnedOn);
  return (
    <div className={`flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 ${done ? 'opacity-60' : ''}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-fg text-[10px] font-bold text-card">
        {seTe}
      </span>
      <div className="min-w-0 grow">
        <div className="truncate text-[13.5px] font-bold text-fg">{title}</div>
        <div className="text-[11.5px] text-fg-subtle">
          {code} · {issuedOn}부터{done ? ` ~ ${returnedOn} 교체` : ''}
        </div>
      </div>
      {done ? (
        <Chip size="compact" tone="neutral">교재 완료</Chip>
      ) : (
        <div className="flex shrink-0 items-center gap-1.5">
          <Chip size="compact" tone="success">사용 중</Chip>
          <Button size="sm" disabled title="정책 확정 전 — 표시만">변경 요청</Button>
        </div>
      )}
    </div>
  );
}

export default function TeacherGuidesPage() {
  const [week, setWeek] = useState<string | undefined>(undefined);
  const [pickedId, setPickedId] = useState<number | null>(null);
  /** 진단을 쓰고 있는 학생 — 한 번에 한 명 (화면이 두 폼을 들고 있으면 어느 쪽을 저장했는지 흐려진다) */
  const [writing, setWriting] = useState<number | null>(null);
  const q = useTeacherGuides(week);
  return (
    <RequireAuth>
      <AppShell>
        {/* 빈 주에도 주 내비는 살아 있어야 한다 — QA C28: isEmpty 로 좌측 레일까지 삼키면
            materialization horizon 밖 주에서 과거 주로 돌아갈 길이 없다. 빈 목록은 레일 안에서 말한다. */}
        <QueryState query={q} isEmpty={() => false}>
          {(d) => {
            const picked = d.students.find((s) => s.studentId === pickedId) ?? d.students[0];
            return (
              <>
                <PageHeader
                  title="수업 안내"
                  sub={`${md(d.weekFrom)} – ${md(d.weekTo)} · 담당 학생 ${d.students.length}명`}
                />
                <div className="mt-3 flex flex-col gap-4 lg:flex-row">
                  <aside className="w-full shrink-0 lg:w-[300px]">
                    <div className="rounded-t-xl bg-fg px-4 py-3 text-card">
                      <div className="text-[13px] font-bold">이번 주 담당 학생</div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Button size="sm" onClick={() => setWeek(addDays(d.weekFrom, -7))}>‹</Button>
                        <Button size="sm" variant={week === undefined ? 'primary' : 'secondary'} onClick={() => setWeek(undefined)}>이번 주</Button>
                        <Button size="sm" onClick={() => setWeek(addDays(d.weekFrom, 7))}>›</Button>
                        <span className="ml-auto text-[11px] opacity-80">{d.weekFrom.slice(5).replace('-', '/')}–{d.weekTo.slice(5).replace('-', '/')}</span>
                      </div>
                    </div>
                    <ul className="rounded-b-xl border border-t-0 border-line bg-card">
                      {d.students.length === 0 ? (
                        <li className="px-3 py-6 text-center text-[12.5px] text-fg-subtle">이 주에는 담당 수업이 없습니다.</li>
                      ) : (
                        d.students.map((s) => (
                          <StudentRow key={s.studentId} s={s} active={picked?.studentId === s.studentId} onPick={() => setPickedId(s.studentId)} />
                        ))
                      )}
                    </ul>
                  </aside>

                  {picked ? (
                    <div className="min-w-0 grow">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[22px] font-bold text-fg">{picked.name}</h2>
                        {picked.grade ? <Chip tone="info">{picked.grade}</Chip> : null}
                        {picked.school ? <span className="text-[12px] text-fg-subtle">{picked.school}</span> : null}
                        <span className="ml-auto flex items-center gap-1.5">
                          <span className="text-[11px] text-fg-subtle">지도 강도</span>
                          <Chip size="compact" tone={picked.guidance ? 'info' : 'neutral'}>{picked.guidance ?? '미설정'}</Chip>
                          <span className="ml-2 text-[11px] text-fg-subtle">수업 언어</span>
                          <Chip size="compact" tone={picked.lang ? 'info' : 'neutral'}>
                            {picked.lang ? (LANG_LABEL[picked.lang] ?? picked.lang) : '미설정'}
                          </Chip>
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-fg-subtle">
                        {picked.lessons.map((l) => (
                          <span key={`${l.onDate}-${l.startMin}`}>
                            {md(l.onDate)} {hm(l.startMin)} <b className="text-fg">{l.title ?? l.subKey ?? ''}</b>
                          </span>
                        ))}
                      </div>

                      <Panel className="mt-4" title="학생 교재" sub="교체·종료 이력이 계속 쌓입니다">
                        {picked.books.length === 0
                          ? <p className="px-1 py-5 text-center text-[13px] text-fg-subtle">배부된 교재가 없습니다.</p>
                          : (
                            <div className="flex flex-col gap-2.5">
                              {picked.books.map((b) => (
                                <BookCard key={b.issueId} code={b.code} title={b.title} seTe={b.seTe} issuedOn={b.issuedOn} returnedOn={b.returnedOn} />
                              ))}
                            </div>
                          )}
                        <p className="mt-3 text-[11px] text-fg-subtle">교재 변경 요청·받기는 정책 확정 전이라 표시만 합니다.</p>
                      </Panel>

                      <Panel
                        className="mt-4"
                        title="진단 요약"
                        sub={picked.diag?.onDate ? `${picked.diag.onDate} 기록${picked.diag.byName ? ` · ${picked.diag.byName}` : ''}` : '최근 진단 기록'}
                        right={
                          writing === picked.studentId
                            ? null
                            : (
                              <Button size="sm" variant="primary" onClick={() => setWriting(picked.studentId)}>
                                {picked.diag ? '다시 진단' : '진단 쓰기'}
                              </Button>
                            )
                        }
                      >
                        {writing === picked.studentId ? (
                          <DiagnosticForm
                            studentId={picked.studentId}
                            studentName={picked.name}
                            serId={picked.lessons[0]?.serId ?? null}
                            onDone={() => setWriting(null)}
                            onCancel={() => setWriting(null)}
                          />
                        ) : picked.diag ? (
                          <dl className="flex flex-col gap-2 text-[13px]">
                            <div><dt className="font-bold text-fg">수준</dt><dd className="mt-0.5 leading-relaxed text-fg">{picked.diag.levelSummary}</dd></div>
                            {picked.diag.strengths ? <div><dt className="font-bold text-green">잘하는 것</dt><dd className="mt-0.5 leading-relaxed text-fg">{picked.diag.strengths}</dd></div> : null}
                            {picked.diag.weaknesses ? <div><dt className="font-bold text-red">보완할 것</dt><dd className="mt-0.5 leading-relaxed text-fg">{picked.diag.weaknesses}</dd></div> : null}
                            {picked.diag.curriculum ? <div><dt className="font-bold text-fg">권장 커리큘럼</dt><dd className="mt-0.5 leading-relaxed text-fg">{picked.diag.curriculum}</dd></div> : null}
                          </dl>
                        ) : (
                          <p className="px-1 py-5 text-center text-[13px] text-fg-subtle">아직 진단 기록이 없습니다.</p>
                        )}
                        {writing === picked.studentId ? null : (
                          <p className="mt-3 border-t border-line pt-2 text-[11px] text-fg-subtle">
                            영역별 스타일 평가는 저장처 확정 전이라 싣지 않습니다 — 진단 기록 원문을 그대로 보여 줍니다.
                          </p>
                        )}
                      </Panel>
                    </div>
                  ) : null}
                </div>
              </>
            );
          }}
        </QueryState>
      </AppShell>
    </RequireAuth>
  );
}
