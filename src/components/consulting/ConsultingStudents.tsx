/** @file-guide
 * 목적: ConsultingStudents.tsx — ConsultingStudentsProps, ConsultingStudents (component)
 * 책임/재사용: 기존 UI 프리미티브/도메인 훅을 조합하고 표시 상태만 소유한다. 권한·정산 판정과 서버 진실을 재구현하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §27 컨설팅 학생별 — 왼쪽에 학생, 오른쪽에 그 학생의 컨설팅.
 *
 * **이 화면은 아무것도 세지 않는다.** 「컨설팅 N건」·「회차 2/6」·「항목 4/7」·받은 돈까지
 * 전부 서버가 센 값이다 (D-R37). 배열 길이를 세면 **내용이 잠긴 건에서 「항목 0/0」**이 되고,
 * 안 보이는 건을 세면 원문 규칙 「csCan() 으로 볼 수 있는 것만 집계합니다」가 깨진다.
 *
 * 항목 칩은 **끝낸 것에 줄을 긋는다** — 원문 컷의 일곱 칩 중 넷이 그어져 있고 머리가 「4 / 7」이다.
 */
'use client';
import { useEffect, useState } from 'react';
import type { ConsStudent, ConsStudentCase } from '@/api/types';
import { Button, Chip, Panel, cn } from '@/components/ui';
import { ConsultingProgress } from '@/components/consulting/ConsultingProgress';
import { CONSULTING_STAGE_BY_KEY, consultingTypeLabel } from '@/lib/consulting';
import { MASKED, won } from '@/lib/money';

export interface ConsultingStudentsProps {
  items?: ConsStudent[];
  loading?: boolean;
  /** 「열기」 — 그 건의 항목·회차 기록으로 간다 (§31) */
  onOpen?: (consId: number) => void;
}

/** 「받은 돈 / 계약 금액」 — 둘 다 서버가 준 값이고, 못 보면 「가려짐」 한 번만 적는다 */
const moneyPair = (paid?: number | null, amount?: number | null): string =>
  paid === null || paid === undefined || amount === null || amount === undefined
    ? MASKED
    : `${won(paid)} / ${won(amount)}`;

function CaseCard({ c, onOpen }: { c: ConsStudentCase; onOpen?: (id: number) => void }) {
  const tone = CONSULTING_STAGE_BY_KEY[c.stage]?.tone ?? 'neutral';
  return (
    <article className="rounded-xl border border-line border-l-[3px] border-l-blue bg-card p-4">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <Chip tone="info">{consultingTypeLabel(c.consType)}</Chip>
        <Chip tone={tone}>{c.stageLabel}</Chip>
        <span className="text-[12.5px] font-bold">
          {c.createdOn} ~ {c.endOn ?? '종료일 미정'}
        </span>
        <span className="text-[12.5px] text-fg-subtle">{c.ownerName ?? '담당 미지정'}</span>
        <Button size="sm" className="ml-auto" onClick={() => onOpen?.(c.id)}>열기</Button>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-inset p-3">
          <div className="text-[11px] font-bold text-fg-subtle">회차</div>
          {/* 기록 행 수 ≠ 완료 회차 (N-18 §4-17) — 화면이 그 둘을 같은 말로 적지 않는다 */}
          <div className="mb-2 text-[17px] font-bold">
            {c.sessionsLogged} / {c.sessions ?? '—'}
          </div>
          <ConsultingProgress
            value={c.sessionsLogged} max={c.sessions ?? 0}
            label={`기록 ${c.sessionsLogged}회 / 약정 ${c.sessions ?? 0}회`}
          />
        </div>
        <div className="rounded-lg bg-inset p-3">
          <div className="text-[11px] font-bold text-fg-subtle">항목</div>
          <div className="mb-2 text-[17px] font-bold">{c.itemsDone} / {c.itemsTotal}</div>
          <ConsultingProgress
            value={c.itemsDone} max={c.itemsTotal}
            label={`끝낸 항목 ${c.itemsDone}/${c.itemsTotal}`}
          />
        </div>
        <div className="rounded-lg bg-inset p-3">
          <div className="text-[11px] font-bold text-fg-subtle">납부</div>
          <div className="text-[17px] font-bold text-amber">{won(c.paid)}</div>
          <div className="text-[11px] text-fg-subtle">/ {won(c.amount)}</div>
        </div>
      </div>

      {c.items.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {c.items.map((i) => (
            <li
              key={i.id}
              className={cn(
                'rounded-md px-2 py-1 text-[11.5px]',
                i.done ? 'bg-inset text-fg-subtle line-through' : 'bg-line-2/40 font-bold text-fg',
              )}
            >
              {i.label}
            </li>
          ))}
        </ul>
      ) : c.itemsTotal > 0 ? (
        // 숫자는 살아 있고 줄만 안 내려온 경우 — 「항목이 없다」와 구분해서 말한다
        <p className="mt-3 text-[11.5px] text-fg-subtle">
          이 건의 내용은 공개 범위 밖입니다 — 항목 {c.itemsDone}/{c.itemsTotal} 만 보입니다.
        </p>
      ) : null}
    </article>
  );
}

export function ConsultingStudents({ items, loading, onOpen }: ConsultingStudentsProps) {
  const list = items ?? [];
  const [pickedId, setPickedId] = useState<number | null>(null);
  // 목록이 바뀌어 고른 학생이 사라지면 선택을 놓는다 — 빈 오른쪽 칸을 남기지 않는다
  useEffect(() => {
    if (pickedId !== null && !list.some((s) => s.studentId === pickedId)) setPickedId(null);
  }, [list, pickedId]);
  const picked = list.find((s) => s.studentId === pickedId) ?? list[0] ?? null;

  if (list.length === 0) {
    return (
      <Panel title="학생별">
        <p className="p-4 text-[12px] text-fg-subtle">
          {loading ? '불러오는 중…' : '볼 수 있는 컨설팅이 없습니다.'}
        </p>
      </Panel>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Panel title={`학생 ${list.length}명`} sub="눌러서 자세히">
        <ul className="divide-y divide-line">
          {list.map((s) => {
            const on = picked?.studentId === s.studentId;
            return (
              <li key={s.studentId}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPickedId(s.studentId)}
                  className={cn(
                    'w-full border-l-[3px] px-3 py-3 text-left transition-colors',
                    on ? 'border-l-primary bg-inset' : 'border-l-transparent hover:bg-inset',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-bold">{s.name}</span>
                    {s.grade ? <Chip tone="neutral">{s.grade}</Chip> : null}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {s.cases.map((c) => (
                      <Chip key={c.id} tone="purple">
                        {consultingTypeLabel(c.consType)} · {c.stageLabel}
                      </Chip>
                    ))}
                  </div>
                  <div className="mt-1.5 text-[11.5px] text-fg-subtle">{moneyPair(s.paid, s.amount)}</div>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      {picked ? (
        <section>
          <header className="mb-3 flex flex-wrap items-baseline gap-2">
            <h2 className="text-[19px] font-bold">{picked.name}</h2>
            {picked.grade ? <Chip tone="neutral">{picked.grade}</Chip> : null}
            {/* 건수도 서버가 센 값이다 — 보이는 것만 센다(원문 §27 규칙) */}
            <span className="text-[12.5px] text-fg-subtle">컨설팅 <b className="text-fg">{picked.caseCount}</b>건</span>
            <span className="text-[12.5px] text-fg-subtle">{moneyPair(picked.paid, picked.amount)}</span>
          </header>
          <div className="space-y-3">
            {picked.cases.map((c) => <CaseCard key={c.id} c={c} onOpen={onOpen} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}
