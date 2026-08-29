/**
 * §07 전체 시간표 · 일간 — 첫 화면.
 *
 * 여기에 목 데이터가 **한 줄도 없다.** 보이는 값은 전부 시드가 Postgres 에 넣은 행이고
 * `/schedule/occurrences` 로 내려온 것이다. 진짜 데이터로 바뀌어도 이 파일은 안 바뀐다.
 */
'use client';
import { useMemo, useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { EventBlock } from '@/components/cal/EventBlock';
import { Legend } from '@/components/cal/Legend';
import { Banner, Button, Chip, PageHeader, StatCard } from '@/components/ui';
import { useMeta, useOccurrences } from '@/api/queries';

/**
 * 오늘(KST). 고정 문자열로 두면 시간이 지나면서 화면이 과거를 가리킨다 —
 * 시드도 같은 기준으로 「오늘」을 잡는다.
 */
const todayKst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const TODAY = todayKst();
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export default function SchedulePage() {
  const [date, setDate] = useState(TODAY);
  const meta = useMeta();
  const occ = useOccurrences({ from: date, to: date });

  const subName = useMemo(() => {
    const m = new Map((meta.data?.subs ?? []).map((s) => [s.key, s.name]));
    return (key?: string | null) => (key ? m.get(key) ?? key : undefined);
  }, [meta.data]);

  const items = occ.data?.items ?? [];
  const byTeacher = useMemo(() => {
    const g = new Map<string, typeof items>();
    for (const o of items) {
      const k = o.teacherName ?? '미배정';
      g.set(k, [...(g.get(k) ?? []), o]);
    }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const written = items.filter((o) => o.written).length;
  const unwritten = items.filter((o) => !o.written && !o.canceled && o.repState !== 'na').length;

  return (
    <RequireAuth><AppShell>
      <PageHeader
        title="전체 시간표 · 일간"
        sub="선생님별로 세로로 끊어 봅니다. 블록 색은 리포트를 썼는가이고, 점선은 비대면입니다."
        right={
          <>
            <Button size="sm" onClick={() => setDate(addDays(date, -1))}>← 어제</Button>
            <Chip tone="info">{date}</Chip>
            <Button size="sm" onClick={() => setDate(addDays(date, 1))}>내일 →</Button>
            <Button size="sm" variant="ghost" onClick={() => setDate(TODAY)}>오늘</Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-4 gap-3">
        <StatCard label="수업" value={items.length} note={`${byTeacher.length}명 담당`} />
        <StatCard label="리포트 씀" value={written} tone="success" />
        <StatCard label="안 씀" value={unwritten} tone={unwritten ? 'danger' : 'neutral'} />
        <StatCard label="취소" value={items.filter((o) => o.canceled).length} tone="neutral" />
      </div>

      <Legend />

      {occ.isLoading ? (
        <Banner tone="neutral">불러오는 중…</Banner>
      ) : occ.isError ? (
        <Banner tone="danger">
          서버에 닿지 못했습니다. 백엔드를 띄우고 시드를 넣었는지 확인해 주세요 —
          <code className="ml-1">./scripts/dev-db.sh up</code> · <code>npm run dev</code>
        </Banner>
      ) : items.length === 0 ? (
        <Banner tone="warning">이 날에는 수업이 없습니다.</Banner>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(byTeacher.length, 6)}, minmax(0, 1fr))` }}>
          {byTeacher.map(([name, list]) => (
            <section key={name} className="rounded-xl border border-line bg-inset p-2">
              <header className="mb-2 flex items-center justify-between px-1">
                <span className="text-[12px] font-bold text-fg">{name}</span>
                <Chip>{list.length}</Chip>
              </header>
              <div className="flex flex-col gap-1.5">
                {list.map((o) => (
                  <EventBlock key={`${o.serId}-${o.date}`} occ={o} subName={subName(o.subKey)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Banner tone="info" className="mt-4">
        블록 색은 <b>리포트를 썼는가</b> 하나만 말합니다 — 정산에 들어가는 조건도 같습니다 (D-R7).
        승인 여부는 색을 바꾸지 않습니다.
      </Banner>
    </AppShell></RequireAuth>
  );
}
