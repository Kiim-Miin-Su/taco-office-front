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
import { useMemo, useState } from 'react';
import { useBoard, useMeta, useOccurrences } from '@/api/queries';
import type { Board, BoardRow } from '@/api/types';
import { DayBoard, MonthBoard, WeekBoard } from '@/components/board/BoardViews';
import { LessonDetail } from '@/components/lesson/LessonDetail';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import {
  Banner,
  Button,
  Checkbox,
  Chip,
  PageHeader,
  Segmented,
  Select,
  StatCard,
} from '@/components/ui';
import { boundsOf, label, monthBounds, step, todayKst, weekDays } from '@/lib/calendar';
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

function periodLabel(span: Span, anchor: string, range: { from: string; to: string }): string {
  if (span === 'day') return label(anchor);
  if (span === 'month') return `${+anchor.slice(0, 4)}년 ${+anchor.slice(5, 7)}월`;
  return `${label(range.from)} – ${label(range.to)}`;
}

/**
 * 원본 §34~§36 머리 여섯 칸. 가운데 넷은 서버의 `summary.marks[].missing` 그대로이고
 * 양 끝 둘(다 됐음 · 휴강)도 서버가 센다 — 낱말 순서까지 컷을 따른다 (D-R25 의 짝).
 */
const MISSING_OF = (data: Board, key: string): number =>
  data.summary.marks.find((m) => m.key === key)?.missing ?? 0;

const HEAD_CARDS: Array<{
  label: string;
  tone: 'danger' | 'warning' | 'neutral';
  value: (d: Board) => number | string;
  note?: (d: Board) => string;
}> = [
  { label: '다 됐음', tone: 'neutral',
    value: (d) => `${d.summary.doneLessons}/${d.summary.lessons}`,
    note: () => '네 축이 전부 선 수업' },
  { label: '교재 안 됨', tone: 'danger', value: (d) => MISSING_OF(d, 'book') },
  { label: '안내 안 됨', tone: 'danger', value: (d) => MISSING_OF(d, 'guide') },
  { label: '줌 없음', tone: 'danger', value: (d) => MISSING_OF(d, 'zoom') },
  { label: '리포트 안 씀', tone: 'danger', value: (d) => MISSING_OF(d, 'report') },
  { label: '휴강', tone: 'warning', value: (d) => d.summary.canceled },
];

export default function BoardPage() {
  const [span, setSpan] = useState<Span>('day');
  const [anchor, setAnchor] = useState(todayKst);
  const [teacherId, setTeacherId] = useState<number>();
  const [subKey, setSubKey] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
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
  const detailQuery = useOccurrences(
    { from: selected?.date ?? anchor, to: selected?.date ?? anchor },
    Boolean(selected),
  );
  const detail = selected
    ? (detailQuery.data?.items.find(
        (item) => item.serId === selected.serId && item.onDate === selected.onDate,
      ) ?? null)
    : null;
  const data = query.data;
  const dayRows = (data?.rows ?? []).filter(
    (row) => !onlyMissing || (!row.canceled && row.missing > 0),
  );
  const teacherRows = (data?.teacherRows ?? []).filter((row) => !onlyMissing || row.missing > 0);
  const weeks = (data?.weeks ?? []).filter((week) => !onlyMissing || week.missing > 0);
  const kindName = detail
    ? meta.data?.kinds.find((kind) => kind.key === detail.kindKey)?.name
    : undefined;
  const subName = detail?.subKey
    ? meta.data?.subs.find((sub) => sub.key === detail.subKey)?.name
    : undefined;

  const move = (direction: -1 | 1) => setAnchor((date) => step(span, date, direction));
  const drillDay = (date: string, nextTeacherId?: number | null) => {
    setAnchor(date);
    if (canAll) setTeacherId(nextTeacherId ?? undefined);
    setSpan('day');
  };
  const drillWeek = (date: string) => {
    setAnchor(date);
    setSpan('week');
  };

  return (
    <RequireAuth>
      <AppShell>
        <PageHeader
          title={TITLE}
          sub={SUB}
          right={
            <Segmented
              options={[
                { value: 'day', label: '일별' },
                { value: 'week', label: '주별' },
                { value: 'month', label: '월별' },
              ]}
              value={span}
              onChange={setSpan}
            />
          }
        />

        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card p-3">
          <Button size="sm" aria-label="이전 기간" onClick={() => move(-1)}>
            ‹
          </Button>
          <Button size="sm" onClick={() => setAnchor(todayKst())}>
            오늘
          </Button>
          <Button size="sm" aria-label="다음 기간" onClick={() => move(1)}>
            ›
          </Button>
          <strong className="min-w-44 text-[13px] text-fg">
            {periodLabel(span, anchor, range)}
          </strong>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {canAll ? (
              <Select
                aria-label="선생님 필터"
                className="w-36"
                value={teacherId ?? ''}
                onChange={(event) =>
                  setTeacherId(event.target.value ? Number(event.target.value) : undefined)
                }
              >
                <option value="">선생님 전체</option>
                {(meta.data?.staff ?? []).map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name}
                  </option>
                ))}
              </Select>
            ) : null}
            <Select
              aria-label="과목 필터"
              className="w-36"
              value={subKey}
              onChange={(event) => setSubKey(event.target.value)}
            >
              <option value="">과목 전체</option>
              {(meta.data?.subs ?? []).map((sub) => (
                <option key={sub.key} value={sub.key}>
                  {sub.name}
                </option>
              ))}
            </Select>
            <Checkbox
              checked={onlyMissing}
              onChange={(event) => setOnlyMissing(event.target.checked)}
              label="미완료만"
            />
          </div>
        </div>

        <Banner tone="info">
          <span className="inline-flex flex-wrap items-center gap-2">
            <b>색 = 원장에서 매번 다시 판정</b>
            <Chip tone="success">완료</Chip>
            <Chip tone="danger">미완료</Chip>
            <Chip styleKind="outline">해당 없음</Chip>
            <span className="text-fg-subtle">취소와 해당 없음은 완료율 분모에서 뺍니다.</span>
            {data?.computedAt ? (
              <span className="text-fg-subtle">
                ({new Date(data.computedAt).toLocaleTimeString('ko-KR')} 기준)
              </span>
            ) : null}
          </span>
        </Banner>

        {query.isError ? (
          <Banner tone="danger">현황판을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.</Banner>
        ) : null}

        {/*
          원본 §34~§36 의 머리 여섯 칸 — **세 탭 공통**이다. 「완료율 %」 하나로는
          *무엇이* 덜 됐는지를 말하지 못한다. 숫자는 전부 서버가 센 것이고
          화면은 `rows` 를 다시 훑지 않는다 (D-R37 · N-19).
        */}
        <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {HEAD_CARDS.map((card) => {
            const value = data ? card.value(data) : null;
            return (
              <StatCard
                key={card.label}
                label={card.label}
                value={value ?? '—'}
                note={data && card.note ? card.note(data) : undefined}
                tone={typeof value === 'number' && value > 0 ? card.tone : 'neutral'}
              />
            );
          })}
        </div>

        {span === 'day' ? (
          <DayBoard rows={dayRows} loading={query.isLoading} onOpen={setSelected} />
        ) : span === 'week' ? (
          <div className="mt-4">
            <WeekBoard
              rows={teacherRows}
              days={weekDays(anchor)}
              loading={query.isLoading}
              onDay={drillDay}
            />
          </div>
        ) : (
          <div className="mt-4">
            <MonthBoard
              summary={data?.summary}
              weeks={weeks}
              loading={query.isLoading}
              onWeek={drillWeek}
            />
          </div>
        )}

        <LessonDetail
          occ={detail}
          recurring={detail?.recurring ?? true}
          kindName={kindName}
          subName={subName}
          allStudents={meta.data?.students}
          onClose={() => setSelected(null)}
        />
      </AppShell>
    </RequireAuth>
  );
}
