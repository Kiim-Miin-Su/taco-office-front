/** @file-guide
 * 목적: page.tsx — TeacherHistoryPage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 수업 히스토리 — 강사 덱 §29~31 · Figma 「웹 · 수업 히스토리」(8027:44990·8056:48153·8562:42504).
 * 월 기록 + 본인 정산. 금액·차감·인정 판정은 전부 GET /teacher/history 가 한다 (D-R7·D-R32·D-15).
 * Kinder·그룹·진단 «가산»과 특이사항 저장은 정책·저장처 확정 전 — 배선하지 않는다 (teacherC22 원장 경계).
 */
'use client';
import { useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Button, Chip, PageHeader, Panel, QueryState, type Tone } from '@/components/ui';
import { useTeacherHistory } from '@/api/queries';
import type { TeacherHistoryLesson } from '@/api/types';
import { won } from '@/lib/money';
import { REP, dowOf, hm, hours } from '@/components/teacher/format';

const addMonth = (ym: string, n: number): string => {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** D-R32 안내 스티커 — 표시용 사본. 판정 정본은 back lib/rules(LATE_REPORT_TIERS)이며 화면 차감액은 서버 값만 쓴다. */
const LATE_RULE: ReadonlyArray<{ range: string; say: string; tone: Tone }> = [
  { range: '수업 종료 후 1시간 미만', say: '차감 없음', tone: 'success' },
  { range: '1시간 이상 ~ 4시간 미만', say: '5,000원 차감', tone: 'warning' },
  { range: '4시간 이상', say: '10,000원 차감', tone: 'danger' },
];

function kindChips(l: TeacherHistoryLesson): Array<{ label: string; tone: Tone }> {
  const out: Array<{ label: string; tone: Tone }> = [];
  if (l.kindKey === 'mock') out.push({ label: '모의수업', tone: 'info' });
  if (l.kindKey === 'diagx') out.push({ label: '진단고사', tone: 'info' });
  if (l.studentCount > 1) out.push({ label: `그룹 ${l.studentCount}명`, tone: 'warning' });
  return out;
}

function StatCard({ tag, value, sub, tint, action }: {
  tag: string; value: string; sub: string; tint?: 'success' | 'danger'; action?: React.ReactNode;
}) {
  const tone = tint === 'success' ? 'border-green/40 bg-green/5' : tint === 'danger' ? 'border-red/40 bg-red/5' : 'border-line bg-card';
  return (
    <div className={`min-w-0 grow basis-52 rounded-xl border p-4 ${tone}`}>
      <Chip size="compact" tone={tint === 'success' ? 'success' : tint === 'danger' ? 'danger' : 'neutral'}>{tag}</Chip>
      <div className="mt-2 text-[22px] font-bold leading-none text-fg">{value}</div>
      <div className="mt-1.5 text-[12px] text-fg-subtle">{sub}</div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** 정산 패널 한 줄 — 왼쪽 항목·가운데 산식·오른쪽 금액 */
function SRow({ name, how, amount }: { name: string; how?: string; amount: string }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-card/15 py-2.5 text-[13px] last:border-b-0">
      <span className="w-40 shrink-0 font-bold">{name}</span>
      <span className="min-w-0 grow truncate opacity-75">{how}</span>
      <b className="shrink-0 text-[14px]">{amount}</b>
    </div>
  );
}

function Row({ l }: { l: TeacherHistoryLesson }) {
  const rep = l.canceled ? { label: '수업 취소', tone: 'neutral' as Tone } : REP[l.repState];
  return (
    <li className={`flex items-center gap-3 border-b border-line px-1 py-3 last:border-b-0 ${l.canceled ? 'opacity-55' : ''}`}>
      <div className="w-14 shrink-0 text-[13px] font-bold text-fg">{hm(l.startMin)}</div>
      <div className="w-24 shrink-0 truncate text-[13px] font-bold text-fg">
        {l.students ? `${l.students.split(', ')[0]}${l.studentCount > 1 ? ` 외 ${l.studentCount - 1}명` : ''}` : '미배정'}
      </div>
      <div className="flex min-w-0 grow items-center gap-2">
        <span className={`truncate text-[14px] font-bold text-fg ${l.canceled ? 'line-through' : ''}`}>
          {l.title ?? l.subKey ?? l.kindKey}
        </span>
        {kindChips(l).map((c) => <Chip key={c.label} size="compact" tone={c.tone}>{c.label}</Chip>)}
      </div>
      <Chip size="compact" tone="neutral">{l.canceled ? '취소' : l.mode === 'online' ? '비대면' : '대면'}</Chip>
      <div className="w-10 shrink-0 text-right text-[13px] font-bold text-fg">{l.canceled ? '0h' : `${hours(l.durMin)}h`}</div>
      {rep ? <Chip size="compact" tone={rep.tone}>{rep.label}</Chip> : null}
      <div className="w-28 shrink-0 text-right">
        {l.canceled ? (
          <div className="text-[11px] text-fg-subtle">— <br />시수·정산 제외</div>
        ) : l.pay !== null && l.pay !== undefined ? (
          <>
            <div className="text-[13px] font-bold text-fg">{won(l.pay)}</div>
            {l.lateCut ? <div className="text-[11px] font-bold text-red">−{won(l.lateCut)} 지각</div> : null}
          </>
        ) : l.penaltyIfNow !== null && l.penaltyIfNow !== undefined ? (
          <>
            <div className="text-[13px] font-bold text-fg">보류</div>
            <div className="text-[11px] font-bold text-red">
              {l.penaltyIfNow > 0 ? `−${won(l.penaltyIfNow)} 지각` : '지금 쓰면 차감 없음'}
            </div>
          </>
        ) : (
          <div className="text-[13px] text-fg-subtle">—</div>
        )}
      </div>
    </li>
  );
}

export default function TeacherHistoryPage() {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const q = useTeacherHistory(month);
  return (
    <RequireAuth>
      <AppShell>
        <QueryState query={q} isEmpty={() => false}>
          {(d) => {
            const s = d.settlement;
            const nowCut = d.lessons.reduce((a, l) => a + (l.penaltyIfNow ?? 0), 0);
            const groups: Array<{ date: string; rows: TeacherHistoryLesson[] }> = [];
            for (const l of d.lessons) {
              const g = groups[groups.length - 1];
              if (g && g.date === l.onDate) g.rows.push(l);
              else groups.push({ date: l.onDate, rows: [l] });
            }
            const ymLabel = `${Number(d.month.slice(0, 4))}년 ${Number(d.month.slice(5, 7))}월`;
            return (
              <>
                <PageHeader
                  title="수업 히스토리"
                  sub={`${ymLabel} · 종료 ${d.stats.doneCount}건 · 리포트 완료 ${d.stats.writtenCount} · 미작성 ${d.stats.unwrittenCount}`}
                />
                <div className="mt-3 flex flex-col gap-4 lg:flex-row">
                  <div className="min-w-0 grow">
                    <div className="flex flex-wrap gap-3">
                      <StatCard tag="진행 수업" value={`${d.stats.doneCount}건`} sub={`시수 ${hours(d.stats.doneMinutes)}시간 · 종료된 수업 기준`} />
                      <StatCard tag="리포트 완료" tint="success" value={`${d.stats.writtenCount}건`}
                        sub={`시수 ${hours(d.stats.writtenMinutes)}시간 · 정산 ${s.confirmed ? '확정' : '반영'}`} />
                      <StatCard tag="리포트 미작성" tint="danger" value={`${d.stats.unwrittenCount}건`}
                        sub={`시수 ${hours(d.stats.unwrittenMinutes)}시간 · 정산 보류`} />
                      <StatCard tag="내 기본 시급" value={d.wageRate === null || d.wageRate === undefined ? '—' : won(d.wageRate)}
                        sub={`${d.wageFrom ?? '—'} 적용 · 나만 볼 수 있습니다`}
                        action={<Button size="sm" disabled title="정책 확정 전 — 표시만">시급 변경 신청</Button>} />
                    </div>

                    <div className="mt-4 rounded-xl bg-fg p-5 text-card">
                      <div className="mb-1 flex items-center gap-2">
                        <h3 className="grow text-[15px] font-bold">{ymLabel} 정산</h3>
                        <Chip size="compact" tone={s.confirmed ? 'success' : 'info'}>
                          {s.confirmed
                            ? s.state === 'paid' ? '지급 완료' : s.state === 'draft' ? '마감 작성 중' : '확정'
                            : '실시간 계산'}
                        </Chip>
                      </div>
                      <SRow name="수업료 · 시급 기준" how={`제출 인정 ${hours(s.writtenMinutes)}시간 (리포트 쓴 수업만 · D-R7)`} amount={won(s.gross)} />
                      <SRow name="리포트 지각 제출 차감" how="수업 종료 시각 기준 두 구간" amount={s.lateCut > 0 ? `−${won(s.lateCut)}` : '없음'} />
                      <SRow name="원천징수" how="소득세 3% + 지방소득세 · 각각 절사" amount={`−${won(s.incomeTax + s.localTax)}`} />
                      <div className="mt-2 flex items-baseline justify-between border-t border-card/25 pt-3">
                        <b className="text-[14px]">실지급 {s.confirmed ? '' : '예정'}액</b>
                        <b className="text-[24px]">{won(s.net)}</b>
                      </div>
                      {s.unwrittenCount > 0 ? (
                        <div className="mt-3 flex flex-col gap-2">
                          <div className="flex items-center justify-between rounded-lg border border-card/35 px-3 py-2 text-[12.5px]">
                            <span className="font-bold">리포트 미작성 {s.unwrittenCount}건 · {hours(s.unwrittenMinutes)}시간은 아직 빠져 있습니다</span>
                            <b>{won(s.unwrittenAmount)}</b>
                          </div>
                          <div className="flex items-center justify-between rounded-lg border border-card/35 px-3 py-2 text-[12.5px]">
                            <span className="font-bold">지금 쓰시면 지각 차감이 함께 붙습니다</span>
                            <b>{nowCut > 0 ? `−${won(nowCut)}` : '차감 없음'}</b>
                          </div>
                        </div>
                      ) : null}
                      <p className="mt-3 text-[11px] leading-relaxed opacity-70">
                        이 정산 내역은 본인만 볼 수 있습니다. 리포트를 쓴 수업만 정산에 들어가며, 승인 여부로 깎이지 않습니다.
                        Kinder·그룹·진단 가산은 정책 확정 전이라 단일 시급 기준입니다.
                        {s.remainingCount > 0 ? ` 이 달 남은 예정 수업 ${s.remainingCount}건 · ${hours(s.remainingMinutes)}시간 (예상 ${won(s.remainingAmount)}).` : ''}
                      </p>
                    </div>

                    <Panel
                      className="mt-4"
                      title={`${ymLabel} 수업 기록`}
                      right={
                        <div className="flex gap-1.5">
                          <Button size="sm" onClick={() => setMonth(addMonth(d.month, -1))}>← 지난달</Button>
                          <Button size="sm" variant={month === undefined ? 'primary' : 'secondary'} onClick={() => setMonth(undefined)}>이번 달</Button>
                          <Button size="sm" onClick={() => setMonth(addMonth(d.month, 1))}>다음 달 →</Button>
                        </div>
                      }
                    >
                      {groups.length === 0
                        ? <p className="px-1 py-6 text-center text-[13px] text-fg-subtle">이 달에는 수업 기록이 없습니다.</p>
                        : groups.map((g) => {
                            const live = g.rows.filter((l) => !l.canceled);
                            const canceled = g.rows.length - live.length;
                            return (
                              <div key={g.date}>
                                <div className="flex items-center gap-2 rounded-md bg-inset px-2 py-1.5 text-[12px]">
                                  <b className="text-fg">{Number(g.date.slice(8, 10))}일 ({dowOf(g.date)})</b>
                                  <span className="text-fg-subtle">{live.length}건{canceled ? ` · 취소 ${canceled}건` : ''}</span>
                                  <span className="ml-auto text-fg-subtle">{hours(live.reduce((a, l) => a + l.durMin, 0))}시간</span>
                                </div>
                                <ul>{g.rows.map((l) => <Row key={`${l.serId}-${l.onDate}-${l.startMin}`} l={l} />)}</ul>
                              </div>
                            );
                          })}
                    </Panel>
                  </div>

                  <aside className="w-full shrink-0 lg:w-[344px]">
                    <Panel title="리포트 지각 차감 규칙" sub="수업이 끝난 시각부터 계산 · 연강도 수업별 적용 · 추가 유예 없음">
                      <ul className="flex flex-col gap-2">
                        {LATE_RULE.map((r) => (
                          <li key={r.range} className="flex items-center justify-between gap-2 text-[13px]">
                            <span className="text-fg">{r.range}</span>
                            <Chip size="compact" tone={r.tone}>{r.say}</Chip>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 border-t border-line pt-2 text-[11px] text-fg-subtle">
                        차감액은 서버가 최초 제출 시각으로 확정합니다. Kinder·그룹·진단 가산 규칙은 확정 전이라 여기 싣지 않습니다.
                      </p>
                    </Panel>
                  </aside>
                </div>
              </>
            );
          }}
        </QueryState>
      </AppShell>
    </RequireAuth>
  );
}
