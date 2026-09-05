/**
 * 탭 05 수업 현황판 — §34 일간 · §35 주간 · §36 월간.
 *
 * 세 보기는 같은 `/board` 계약과 같은 네 마크 컴포넌트를 쓰고 묶는 방법만 바꾼다.
 * 마크와 집계는 저장하지 않으며 요청할 때마다 서버가 원장을 다시 판정한다 (D-R4).
 */
'use client';
import { useMemo, useState } from 'react';
import { useBoard, useMeta, useOccurrences } from '@/api/queries';
import type { BoardRow } from '@/api/types';
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

const COPY: Record<Span, { title: string; sub: string }> = {
  day: { title: '수업 현황판', sub: '수업별 교재 · 안내 · 줌 · 리포트를 확인합니다.' },
  week: { title: '주별 현황판', sub: '한 주를 한눈에. 빠진 칸이 어느 요일에 몰리는지 보입니다.' },
  month: { title: '월별 현황판', sub: '월간 완료율과 주차별 미완료 항목을 함께 확인합니다.' },
};

function periodLabel(span: Span, anchor: string, range: { from: string; to: string }): string {
  if (span === 'day') return label(anchor);
  if (span === 'month') return `${+anchor.slice(0, 4)}년 ${+anchor.slice(5, 7)}월`;
  return `${label(range.from)} – ${label(range.to)}`;
}

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
          title={COPY[span].title}
          sub={COPY[span].sub}
          right={
            <Segmented
              options={[
                { value: 'day', label: '일간' },
                { value: 'week', label: '주간' },
                { value: 'month', label: '월간' },
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

        {span === 'day' ? (
          <>
            <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="수업" value={data?.summary.lessons ?? '—'} />
              <StatCard
                label="덜 된 수업"
                value={data?.missingCount ?? '—'}
                tone={data?.missingCount ? 'danger' : 'success'}
              />
              <StatCard
                label="취소·휴강"
                value={(data?.rows ?? []).filter((row) => row.canceled).length}
              />
              <StatCard
                label="완료율"
                value={data ? `${data.summary.completionRate}%` : '—'}
                tone="info"
              />
            </div>
            <DayBoard rows={dayRows} loading={query.isLoading} onOpen={setSelected} />
          </>
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
