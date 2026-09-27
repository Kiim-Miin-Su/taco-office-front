/** @file-guide
 * 목적: page.tsx — BoardPage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 탭 05 수업 현황판 — §34 일간 · §35 주간 · §36 월간.
 *
 * 세 보기는 같은 `/board` 계약과 같은 네 마크 컴포넌트를 쓰고 묶는 방법만 바꾼다.
 * 마크와 집계는 저장하지 않으며 요청할 때마다 서버가 원장을 다시 판정한다 (D-R4).
 */
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useBoard, useMeta, useOccurrences } from '@/api/queries';
import type { Board, BoardRow, CheckMark } from '@/api/types';
import { DayBoard, MonthBoard, WeekBoard } from '@/components/board/BoardViews';
import { LessonDetail } from '@/components/lesson/LessonDetail';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Button, ChipButton, ChipRow, PageHeader, Segmented, StatCard, cn } from '@/components/ui';
import { boundsOf, longDateLabel, monthBounds, step, todayKst, weekDays } from '@/lib/calendar';
import { subjectColor } from '@/lib/tokens';
import { queryIsoDate } from '@/lib/url-state';
import { useCan } from '@/store/useSession';

type Span = 'day' | 'week' | 'month';

/**
 * 제목과 부제는 **탭이 바뀌어도 그대로다** — 컷 §34·§35·§36 이 셋 다 같은 한 줄을 쓴다.
 *
 * 전에는 탭마다 제목과 부제를 바꿔 달았고, 그래서 탭 이름이 「주간」인데 바로 위 제목은
 * 「주별 현황판」이라 **한 화면 안에서 낱말이 갈렸다.** 탭 이름도 컷의 「일별 · 주별 · 월별」로 맞췄다.
 */
const TITLE = '수업 현황판';
const SUB = '수업마다 교재 · 안내 · 줌 · 리포트가 다 됐는지 한눈에 봅니다';

/** 기간 낱말 — 원문 §34 「26년 8월 21일 금요일」 · §35 「08-17 ~ 08-23」 · §36 「2026년 8월」 (g4 §34-7 · §35-4) */
function periodLabel(span: Span, anchor: string, range: { from: string; to: string }): string {
  if (span === 'day') return longDateLabel(anchor);
  if (span === 'month') return `${+anchor.slice(0, 4)}년 ${+anchor.slice(5, 7)}월`;
  return `${range.from.slice(5)} ~ ${range.to.slice(5)}`;
}

/**
 * 원본 §34~§36 머리 여섯 칸. 가운데 넷은 서버의 `summary.marks[].missing` 그대로이고
 * 양 끝 둘(다 됐음 · 휴강)도 서버가 센다 — 낱말 순서까지 컷을 따른다 (D-R25 의 짝).
 */
const MISSING_OF = (data: Board, key: string): number => data.summary.marks.find((m) => m.key === key)?.missing ?? 0;

/** 머리 칸 하나 = 거르는 조건 하나 (§34 「상단 요약 클릭 → 해당 항목만 필터」). */
type HeadKey = 'done' | CheckMark['key'] | 'canceled';

// 원문 머리 칸은 「3/20 다 됐음」 한 줄 — 부가 설명 줄을 달지 않는다 (g4 §34-9)
const HEAD_CARDS: Array<{
  key: HeadKey;
  label: string;
  tone: 'danger' | 'warning' | 'neutral';
  value: (d: Board) => number | string;
}> = [
  { key: 'done', label: '다 됐음', tone: 'neutral', value: (d) => `${d.summary.doneLessons}/${d.summary.lessons}` },
  { key: 'book', label: '교재 안 됨', tone: 'danger', value: (d) => MISSING_OF(d, 'book') },
  { key: 'guide', label: '안내 안 됨', tone: 'danger', value: (d) => MISSING_OF(d, 'guide') },
  { key: 'zoom', label: '줌 없음', tone: 'danger', value: (d) => MISSING_OF(d, 'zoom') },
  { key: 'report', label: '리포트 안 씀', tone: 'danger', value: (d) => MISSING_OF(d, 'report') },
  { key: 'canceled', label: '휴강', tone: 'warning', value: (d) => d.summary.canceled },
];

/**
 * 눌린 머리 칸으로 거를 때는 **서버가 준 marks · missing · canceled 를 읽기만** 한다 — 다시 판정하지 않는다.
 * 마크 하나가 「안 됨」인 것은 해당 없음(na)이 아니고 다 되지(done) 않은 것이다 (머리 칸 숫자와 같은 칸).
 */
const markMissing = (marks: readonly CheckMark[], key: CheckMark['key']): boolean =>
  marks.some((mark) => mark.key === key && !mark.na && !mark.done);

function lessonMatches(row: BoardRow, focus: HeadKey | null): boolean {
  if (focus === null) return true;
  if (focus === 'canceled') return row.canceled;
  if (row.canceled) return false;
  return focus === 'done' ? row.missing === 0 : markMissing(row.marks, focus);
}

export default function BoardPage() {
  // 그 날을 곧장 여는 질의 `?date=` — 대표 보고 「준비가 덜 된 수업」 줄이 여기로 온다 (W11 · 7-3 ①). 없으면 오늘
  const queryDate = queryIsoDate(useSearchParams().get('date'));
  const [span, setSpan] = useState<Span>('day');
  const [anchor, setAnchor] = useState(() => queryDate ?? todayKst());
  useEffect(() => { if (queryDate) { setSpan('day'); setAnchor(queryDate); } }, [queryDate]);
  const [teacherId, setTeacherId] = useState<number>();
  const [subKey, setSubKey] = useState('');
  // 「미완료만」 체크 대신 머리 칸 하나를 눌러 거른다 (§34-4). 같은 칸을 다시 누르면 풀린다.
  const [headFocus, setHeadFocus] = useState<HeadKey | null>(null);
  const [selected, setSelected] = useState<BoardRow | null>(null);
  const canAll = useCan('canCrudAll');

  const range = useMemo(() => {
    if (span === 'month') return monthBounds(anchor);
    return boundsOf(span, anchor);
  }, [anchor, span]);
  const query = useBoard({
    ...range,
    teacherId: canAll ? teacherId : undefined,
    subKey: subKey || undefined,
  });
  const meta = useMeta();
  const detailQuery = useOccurrences({ from: selected?.date ?? anchor, to: selected?.date ?? anchor }, Boolean(selected));
  const detail = selected
    ? (detailQuery.data?.items.find((item) => item.serId === selected.serId && item.onDate === selected.onDate) ?? null)
    : null;
  const data = query.data;
  const subjectCodes = useMemo(() => new Map((meta.data?.subs ?? []).map((sub) => [sub.key, sub])), [meta.data?.subs]);
  const colorOf = (key: string | null | undefined) => subjectColor(key, subjectCodes);
  const today = todayKst();
  // 세 보기가 같은 줄(rows)을 쓴다 — 주별 카드도 월별 달력의 강조도 같은 머리 칸 조건으로 거른다
  const focus = headFocus;
  const dayRows = useMemo(() => (data?.rows ?? []).filter((row) => lessonMatches(row, focus)), [data?.rows, focus]);
  const highlight = useMemo(() => (focus === null ? null : new Set(dayRows.map((row) => row.date))), [focus, dayRows]);
  /*
   * 필터 칩은 **그 기간에 나온** 과목·강사만 (원문 §34 · g4 §34-3) — 서버 facet 이 거르기 전의 기간을 센다.
   * 기간을 옮기는 동안(새 응답 전)에는 직전 칩을 그대로 둔다 — 칩 줄이 깜박이며 비지 않게.
   * 고른 칩이 새 기간에 없으면 그 칩만 붙여 둔다 — 고른 조건이 화면에서 사라지면 왜 비었는지 모른다.
   */
  const lastFacets = useRef<Board['facets'] | null>(null);
  if (data?.facets) lastFacets.current = data.facets;
  const facets = data?.facets ?? lastFacets.current;
  const subjectChips = useMemo(() => {
    const list = (facets?.subjects ?? []).map((sub) => ({ key: sub.key, name: sub.name }));
    if (subKey && !list.some((sub) => sub.key === subKey)) {
      list.push({ key: subKey, name: meta.data?.subs.find((sub) => sub.key === subKey)?.name ?? subKey });
    }
    return list;
  }, [facets, subKey, meta.data?.subs]);
  const teacherChips = useMemo(() => {
    const list = (facets?.teachers ?? []).map((teacher) => ({ value: String(teacher.id), label: teacher.name }));
    if (teacherId !== undefined && !list.some((teacher) => teacher.value === String(teacherId))) {
      const name = meta.data?.staff.find((staff) => staff.id === teacherId)?.name ?? `#${teacherId}`;
      list.push({ value: String(teacherId), label: name });
    }
    return list;
  }, [facets, teacherId, meta.data?.staff]);
  const kindName = detail ? meta.data?.kinds.find((kind) => kind.key === detail.kindKey)?.name : undefined;
  const subName = detail?.subKey ? meta.data?.subs.find((sub) => sub.key === detail.subKey)?.name : undefined;

  const move = (direction: -1 | 1) => setAnchor((date) => step(span, date, direction));
  // §36 「날짜 클릭 → 그날 일별로」 — 고른 과목·강사 필터는 그대로 둔다
  const drillDay = (date: string) => {
    setAnchor(date);
    setSpan('day');
  };

  return (
    <RequireAuth>
      <AppShell>
        <PageHeader
          // TODO: 강사 정책 최상단 배치 (components)
          title={TITLE}
          sub={SUB}
          right={
            // 원문 §34 — 탭 바로 옆 한 상자 「‹ 26년 8월 21일 금요일 › 오늘」 (g4 §34-6)
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Segmented
                options={[
                  { value: 'day', label: '일별' },
                  { value: 'week', label: '주별' },
                  { value: 'month', label: '월별' },
                ]}
                value={span}
                onChange={setSpan}
              />
              <div className="flex items-center gap-1 rounded-xl border border-line bg-card px-1.5 py-1">
                <Button size="sm" variant="ghost" aria-label="이전 기간" onClick={() => move(-1)}>
                  ‹
                </Button>
                <strong className="min-w-40 text-center text-[13px] text-fg">{periodLabel(span, anchor, range)}</strong>
                <Button size="sm" variant="ghost" aria-label="다음 기간" onClick={() => move(1)}>
                  ›
                </Button>
                <Button size="sm" onClick={() => setAnchor(todayKst())}>
                  오늘
                </Button>
              </div>
            </div>
          }
        />
        <div className="mb-4 space-y-2 rounded-xl border border-line bg-card p-3">
          {/*
            원본 §34 필터 = 칩 줄 두 줄(과목 · 강사). 과목 칩 앞에는 과목색 점 — 색은 공용 subjectColor 하나.
            고른 값은 그대로 서버 조회 인자다(화면이 rows 를 다시 거르지 않는다) — 세 보기 공통.
          */}
          <div className="flex items-start gap-2 text-[12px]">
            <b className="w-10 shrink-0 pt-0.5 text-fg-subtle">과목</b>
            <div role="group" aria-label="과목" className="flex flex-wrap items-center gap-1.5">
              {/* 원문 §34~§36 — 눌린 칩은 진한 채움(「전체」 · W11 컷 재대조) */}
              <ChipButton pressed={subKey === ''} pressedTone="ink" onClick={() => setSubKey('')}>
                전체
              </ChipButton>
              {subjectChips.map((sub) => (
                <ChipButton
                  key={sub.key}
                  pressed={subKey === sub.key}
                  pressedTone="ink"
                  // 과목색 점은 공용 ChipButton 의 `dot` 한 벌이다 — 칩마다 점을 손으로 그리지 않는다
                  dot={colorOf(sub.key) ?? 'var(--fg-subtle)'}
                  onClick={() => setSubKey(subKey === sub.key ? '' : sub.key)}
                >
                  {sub.name}
                </ChipButton>
              ))}
            </div>
          </div>
          {canAll ? (
            <div className="flex items-start gap-2 text-[12px]">
              <b className="w-10 shrink-0 pt-0.5 text-fg-subtle">강사</b>
              <ChipRow
                ariaLabel="강사"
                pressedTone="ink"
                value={teacherId === undefined ? '' : String(teacherId)}
                onChange={(next) => setTeacherId(next ? Number(next) : undefined)}
                options={teacherChips}
              />
            </div>
          ) : null}
        </div>
        {/* 원문에 없는 범례 띠는 두지 않는다 (g4 §34-8) — 판정 근거는 마크마다 title 로 있다 */}
        {query.isError ? <Banner tone="danger">현황판을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.</Banner> : null}
        {/*
          원본 §34~§36 의 머리 여섯 칸 — **세 탭 공통**이다. 「완료율 %」 하나로는
          *무엇이* 덜 됐는지를 말하지 못한다. 숫자는 전부 서버가 센 것이고
          화면은 `rows` 를 다시 훑지 않는다 (D-R37 · N-19).
          칸을 누르면 그 항목만 남긴다(§34 「상단 요약 클릭 → 해당 항목만 필터」) — 같은 칸을 다시 누르면 풀린다.
        */}
        <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {HEAD_CARDS.map((card) => {
            const value = data ? card.value(data) : null;
            const pressed = focus === card.key;
            return (
              <button
                key={card.key}
                type="button"
                aria-pressed={pressed}
                title={pressed ? '다시 누르면 전체를 봅니다' : '누르면 이 항목만 봅니다'}
                onClick={() => setHeadFocus(pressed ? null : card.key)}
                className={cn('rounded-xl text-left', pressed ? 'ring-2 ring-primary ring-offset-1 ring-offset-bg' : '')}
              >
                <StatCard
                  className="h-full"
                  label={card.label}
                  value={value ?? '—'}
                  tone={typeof value === 'number' && value > 0 ? card.tone : 'neutral'}
                  // 0 보다 큰 「안 됨」 칸은 분홍 채움 + 붉은 수(g4 §34-9) — 0 이거나 휴강 칸은 흰 카드 그대로
                  fill={typeof value === 'number' && value > 0 && card.tone === 'danger'}
                />
              </button>
            );
          })}
        </div>
        {/*
          세 보기 모두 같은 줄 · 같은 카드. 칸 머리·달력 칸의 수는 서버 days[] 그대로다 (g4 §35-3 · §36-3).
          주별 카드도 §34 와 같은 수업 상세를 연다(§35-2), 월별 날짜는 그날 일별로 간다(§36-2).
        */}
        {span === 'day' ? (
          <DayBoard rows={dayRows} loading={query.isLoading} onOpen={setSelected} colorOf={colorOf} />
        ) : span === 'week' ? (
          <WeekBoard
            rows={dayRows}
            days={weekDays(anchor)}
            dayStats={data?.days ?? []}
            today={today}
            loading={query.isLoading}
            onOpen={setSelected}
            colorOf={colorOf}
          />
        ) : (
          // 원문 §36 은 머리 여섯 칸 다음 바로 달력이다 — 둘째 숫자 줄(다른 낱말의 같은 수)을 두지 않는다 (g4 §36-4)
          <MonthBoard
            anchor={anchor}
            dayStats={data?.days ?? []}
            today={today}
            loading={query.isLoading}
            onDay={drillDay}
            colorOf={colorOf}
            highlight={highlight}
          />
        )}
        <LessonDetail
          occ={detail}
          recurring={detail?.recurring ?? true}
          kindName={kindName}
          subName={subName}
          allStudents={meta.data?.students}
          cancelReasons={meta.data?.cancelReasons}
          cancelTreats={meta.data?.cancelTreats}
          meta={meta.data}
          onClose={() => setSelected(null)}
        />
      </AppShell>
    </RequireAuth>
  );
}
