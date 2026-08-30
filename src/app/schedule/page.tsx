/**
 * 탭 01 스케줄 — §7 일간 · §8 주간 · §9 월간 · §10 학생별 · §11 선생님별 · §12 수업 상세.
 *
 * 여섯 컷이 **한 화면의 보기 전환**이다. 컷마다 라우트를 만들면 같은 데이터를 여섯 번 읽고
 * 색·상태가 갈린다.
 *
 * 규칙 셋 (`AGENT.md §6.1`)
 *   ① 선택 상태(보기·날짜·고른 사람)는 **이 파일의 reducer 한 곳**이 갖는다
 *   ② 서버는 **bounding range 한 번**만 읽고 보기별로는 selector 로 나눈다
 *   ③ 도메인 판정은 서버와 `lib/` 가 갖는다 — 여기서 다시 계산하지 않는다
 */
'use client';
import { useMemo, useReducer } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Button, Chip, PageHeader, Panel, Segmented } from '@/components/ui';
import { DayGrid, MonthGrid, WeekGrid } from '@/components/cal/Grids';
import { Legend } from '@/components/cal/Legend';
import { LessonDetail } from '@/components/lesson/LessonDetail';
import { useHorizon, useMeta, useOccurrences } from '@/api/queries';
import { boundsOf, label, monthGrid, step, todayKst, type View } from '@/lib/calendar';
import type { Occurrence } from '@/api/types';

/* ── 상태 — 명시적 action + 순수 reducer (§6.1-3) ────────────────────── */

interface S {
  view: View;
  date: string;
  /** §10 · §11 왼쪽에서 고른 사람 */
  personId: number | null;
  open: Occurrence | null;
}

type A =
  | { t: 'view'; v: View }
  | { t: 'date'; d: string }
  | { t: 'step'; dir: -1 | 1 }
  | { t: 'today' }
  | { t: 'person'; id: number | null }
  | { t: 'open'; o: Occurrence | null };

function reducer(s: S, a: A): S {
  switch (a.t) {
    case 'view':
      // 사람을 고르는 보기가 아니면 선택을 놓는다 — 안 그러면 안 보이는 필터가 남는다
      return { ...s, view: a.v, personId: a.v === 'student' || a.v === 'teacher' ? s.personId : null };
    case 'date': return { ...s, date: a.d, view: s.view === 'month' ? 'day' : s.view };
    case 'step': return { ...s, date: step(s.view, s.date, a.dir) };
    case 'today': return { ...s, date: todayKst() };
    case 'person': return { ...s, personId: a.id };
    case 'open': return { ...s, open: a.o };
  }
}

const VIEWS: Array<{ value: View; label: string }> = [
  { value: 'day', label: '일간' },
  { value: 'week', label: '주간' },
  { value: 'month', label: '월간' },
  { value: 'student', label: '학생별' },
  { value: 'teacher', label: '선생님별' },
];

export default function SchedulePage() {
  const [s, go] = useReducer(reducer, { view: 'day', date: todayKst(), personId: null, open: null });
  const meta = useMeta();
  const hz = useHorizon();

  // ② 보기가 무엇이든 **범위 하나**만 읽는다.
  //    사람 필터를 서버에 보내지 않는 것이 요점이다 — 보내면 사람마다 다른 응답이 되어
  //    주간과 캐시를 공유하지 못하고, 왼쪽 목록에 「누가 몇 건인지」도 못 적는다.
  const range = useMemo(() => boundsOf(s.view, s.date), [s.view, s.date]);
  const q = useOccurrences({ from: range.from, to: range.to });

  const all = useMemo(() => q.data?.items ?? [], [q.data]);

  /** ③ 사람 필터는 selector 로 — 같은 응답을 나눠 쓴다 */
  const items = useMemo(() => {
    if (s.view === 'student') {
      return s.personId === null ? [] : all.filter((o) => o.students.some((x) => x.id === s.personId));
    }
    if (s.view === 'teacher') {
      return s.personId === null ? [] : all.filter((o) => o.teacherId === s.personId);
    }
    return all;
  }, [all, s.view, s.personId]);
  /** 코드표 → 이름. 화면이 `class` 같은 코드값을 그대로 찍지 않는다 (D-R18) */
  const subName = useMemo(() => {
    const m = new Map((meta.data?.subs ?? []).map((x) => [x.key, x.name]));
    return (o: Occurrence) => (o.subKey ? m.get(o.subKey) : undefined);
  }, [meta.data]);
  const kindName = useMemo(() => {
    const m = new Map((meta.data?.kinds ?? []).map((x) => [x.key, x.name]));
    return (o: Occurrence) => m.get(o.kindKey);
  }, [meta.data]);

  /** §7 세로 열 — 강의실이 기본, 선생님별 보기는 강사로 바꾼다 */
  const columns = useMemo(() => {
    if (s.view === 'teacher') {
      return (meta.data?.staff ?? []).map((t) => ({ id: t.id, name: t.name }));
    }
    return [
      ...(meta.data?.rooms ?? []).map((r) => ({ id: r.id as number | null, name: r.name })),
      { id: null, name: '온라인 · 미지정' },
    ];
  }, [meta.data, s.view]);

  /**
   * 왼쪽 목록 — 이름 옆에 **이 기간의 건수**를 적는다.
   * §11 은 시수 합계도 요구한다. **취소·휴강은 빼고** 센다 (D-R11).
   */
  const people = useMemo(() => {
    const mine = (id: number) =>
      s.view === 'student'
        ? all.filter((o) => o.students.some((x) => x.id === id))
        : all.filter((o) => o.teacherId === id);
    const src = s.view === 'student'
      ? (meta.data?.students ?? []).map((x) => ({ id: x.id, name: x.name, sub: x.grade ?? '' }))
      : (meta.data?.staff ?? []).map((x) => ({ id: x.id, name: x.name, sub: x.title ?? '' }));
    return src
      .map((p) => {
        const list = mine(p.id);
        const live = list.filter((o) => !o.canceled);
        return {
          ...p,
          n: list.length,
          // 시수 = 취소를 뺀 회차의 분 합계 (D-R11)
          hours: live.reduce((t, o) => t + (o.endMin - o.startMin), 0) / 60,
        };
      })
      // 이 기간에 수업이 있는 사람을 위로 — 첫 줄이 늘 0건이면 화면이 고장 난 것처럼 보인다
      .sort((a2, b2) => b2.n - a2.n || a2.name.localeCompare(b2.name, 'ko'));
  }, [all, meta.data, s.view]);

  const outOfHorizon = !!hz.data && (range.from < hz.data.from || range.to > hz.data.to);
  const grid = s.view === 'month' ? monthGrid(s.date) : [];

  const head = s.view === 'month'
    ? `${s.date.slice(0, 4)}년 ${+s.date.slice(5, 7)}월`
    : s.view === 'day' ? label(s.date) : `${label(range.from)} – ${label(range.to)}`;

  return (
    <RequireAuth>
      <AppShell>
        <PageHeader
          title="스케줄"
          sub="§7~§12 — 여섯 컷이 한 화면의 보기 전환입니다. 같은 범위를 한 번만 읽습니다."
          right={<Segmented options={VIEWS} value={s.view} onChange={(v) => go({ t: 'view', v })} />}
        />

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => go({ t: 'step', dir: -1 })}>‹</Button>
          <Button size="sm" onClick={() => go({ t: 'today' })}>오늘</Button>
          <Button size="sm" onClick={() => go({ t: 'step', dir: 1 })}>›</Button>
          <span className="ml-1 text-[14px] font-bold text-fg">{head}</span>
          <span className="text-[12px] text-fg-subtle">{items.length}건</span>
          <div className="ml-auto"><Legend /></div>
        </div>

        {outOfHorizon ? (
          <Banner tone="warning">
            이 범위는 <b>아직 펼쳐지지 않았습니다</b>. 회차는 {hz.data?.from} ~ {hz.data?.to} 만 표에 있습니다 —
            비어 보이는 것은 일정이 없어서가 아닙니다.
          </Banner>
        ) : null}

        {s.view === 'student' || s.view === 'teacher' ? (
          <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
            <Panel title={s.view === 'student' ? '학생' : '선생님'} sub="고르면 그 사람 일정만">
              <div className="max-h-[560px] overflow-y-auto">
                {people.map((p) => (
                  <button key={p.id} type="button" onClick={() => go({ t: 'person', id: p.id })}
                    className={`flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left transition-colors hover:bg-inset ${
                      s.personId === p.id ? 'bg-blue/10' : ''}`}>
                    <span className="text-[12px] font-bold text-fg">{p.name}</span>
                    <span className="text-[11px] text-fg-subtle">{p.sub}</span>
                    <span className={`ml-auto text-[11px] ${p.n ? 'font-bold text-blue' : 'text-line-2'}`}>
                      {p.n ? `${p.n}건` : '—'}
                    </span>
                  </button>
                ))}
              </div>
            </Panel>
            {s.personId ? (
              <div className="flex flex-col gap-3">
                {s.view === 'teacher' ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card p-3">
                    <span className="text-[12px] font-bold text-fg">
                      {people.find((p) => p.id === s.personId)?.name}
                    </span>
                    <Chip tone="info">{items.filter((o) => !o.canceled).length}회</Chip>
                    {/*
                      「시수」라는 낱말이 회계 탭에도 있다. 그쪽은 **그 달의 확정된 정산 시수**
                      (PAYOUT 에 저장된 스냅숏)이고, 이것은 **지금 보고 있는 기간**의 합계다.
                      숫자가 다를 수밖에 없으므로 무엇을 센 것인지 적어 둔다 —
                      안 적으면 강사가 두 숫자를 맞춰 보다가 어느 쪽이 틀렸는지 묻게 된다.
                    */}
                    <Chip title="이 기간 · 취소 제외 (D-R11). 정산 시수는 회계 탭에서 월 단위로 확정됩니다">
                      이 기간 시수 {(people.find((p) => p.id === s.personId)?.hours ?? 0).toFixed(1)}시간
                    </Chip>
                    <span className="text-[11px] text-fg-subtle">취소·휴강은 시수에서 뺍니다 (D-R11)</span>
                  </div>
                ) : null}
                <WeekGrid date={s.date} items={items} subName={subName}
                  onOpen={(o) => go({ t: 'open', o })} onPickDate={(d) => go({ t: 'date', d })} />
              </div>
            ) : (
              <Panel title="사람을 고르세요">
                <p className="p-6 text-[12px] text-fg-subtle">
                  왼쪽에서 {s.view === 'student' ? '학생' : '선생님'}을 고르면 그 사람 일정만 봅니다.
                </p>
              </Panel>
            )}
          </div>
        ) : s.view === 'day' ? (
          <DayGrid date={s.date} items={items} columns={columns}
            columnOf={(o) => (s.view === 'teacher' ? o.teacherId ?? null : o.roomId ?? null)}
            subName={subName} onOpen={(o) => go({ t: 'open', o })} />
        ) : s.view === 'week' ? (
          <WeekGrid date={s.date} items={items} subName={subName}
            onOpen={(o) => go({ t: 'open', o })} onPickDate={(d) => go({ t: 'date', d })} />
        ) : (
          <MonthGrid date={s.date} items={items} grid={grid} subName={subName}
            onOpen={(o) => go({ t: 'open', o })} onPickDate={(d) => go({ t: 'date', d })} />
        )}

        {q.isLoading ? <p className="mt-3 text-[12px] text-fg-subtle">불러오는 중…</p> : null}
        {!q.isLoading && items.length === 0 && !outOfHorizon ? (
          <p className="mt-3 text-[12px] text-fg-subtle">이 기간에 수업이 없습니다.</p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-fg-subtle">
          <Chip>취소·휴강 {items.filter((o) => o.canceled).length}</Chip>
          <Chip>이 회차만 다름 {items.filter((o) => o.hasException).length}</Chip>
          <Chip>리포트 쓴 수업 {items.filter((o) => o.written).length}</Chip>
        </div>

        <LessonDetail
          occ={s.open}
          kindName={s.open ? kindName(s.open) : undefined}
          subName={s.open ? subName(s.open) : undefined}
          onClose={() => go({ t: 'open', o: null })}
        />
      </AppShell>
    </RequireAuth>
  );
}
