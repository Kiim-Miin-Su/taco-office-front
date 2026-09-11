/** @file-guide
 * 목적: page.tsx — TeacherUnavailablePage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 불가 시간 — 강사 원본 §15/16 · Figma 48F-11M-a. N-20 채택(2026-09-12 §4-17):
 * 등록 대상 **날짜별 7일 전 마감**, 2주 회차(입사일+14k)는 표시/묶음용.
 * 격자는 08:00~23:00. 마감·겹침 판정은 전부 서버(UNAV_DEADLINE·UNAV_OVERLAP·UNAV_LOCKED) —
 * 화면은 열린 칸만 입력을 받고, 거절 메시지를 그대로 보여 준다.
 */
'use client';
import { useMemo, useRef, useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { ApiError } from '@/api/client';
import { Banner, Button, PageHeader, Panel, QueryState } from '@/components/ui';
import { useCreateTeacherUnav, useDeleteTeacherUnav, useTeacherUnav } from '@/api/queries';
import type { TeacherUnav, TeacherUnavBlock } from '@/api/types';
import { dowOf, hm } from '@/components/teacher/format';

const H0 = 8;                     // 격자 첫 시간 (원본 §15)
const H1 = 23;                    // 격자 끝
const CELL = 34;                  // 1시간 칸 높이(px)
const addD = (iso: string, n: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const mdDow = (iso: string): string => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일 (${dowOf(iso)})`;

type Sel = { date: string; a: number; b: number } | null;   // a·b = 시간(시) 경계, 드래그 중 순서 무관

function errText(e: unknown): string {
  return e instanceof ApiError ? e.message : '저장하지 못했습니다 — 잠시 후 다시 시도해 주세요';
}

/** 날짜 한 컬럼 — 열린 날이면 드래그로 시간대를 고른다. 등록 블록은 겹쳐 그린다. */
function DayColumn({ date, open, blocks, sel, onDown, onEnter }: {
  date: string; open: boolean; blocks: TeacherUnavBlock[]; sel: Sel;
  onDown: (date: string, h: number) => void; onEnter: (date: string, h: number) => void;
}) {
  const sun = dowOf(date) === '일';
  const picked = sel?.date === date ? sel : null;
  const [p0, p1] = picked ? [Math.min(picked.a, picked.b), Math.max(picked.a, picked.b) + 1] : [0, 0];
  return (
    <div className="w-[96px] shrink-0 border-r border-line last:border-r-0">
      <div className={`border-b border-line px-1 py-1.5 text-center text-[11px] ${open ? '' : 'bg-inset opacity-60'}`}>
        <b className={sun ? 'text-red' : 'text-fg'}>{dowOf(date)}</b>
        <span className="ml-1 text-fg-subtle">{Number(date.slice(8, 10))}</span>
        {open ? null : <span className="ml-1 rounded bg-line px-1 text-[10px] text-fg-subtle">마감</span>}
      </div>
      <div className="relative" style={{ height: (H1 - H0) * CELL }}>
        {Array.from({ length: H1 - H0 }, (_, i) => {
          const h = H0 + i;
          const inSel = picked && h >= p0 && h < p1;
          return open ? (
            <button
              key={h}
              type="button"
              aria-label={`${mdDow(date)} ${hm(h * 60)} 선택`}
              onMouseDown={(e) => { e.preventDefault(); onDown(date, h); }}
              onMouseEnter={() => onEnter(date, h)}
              className={`block h-[34px] w-full border-b border-line/60 last:border-b-0 ${inSel ? 'bg-primary/25' : 'bg-blue/5 hover:bg-blue/15'}`}
            />
          ) : (
            <div
              key={h}
              className="h-[34px] border-b border-line/60 opacity-70 last:border-b-0"
              style={{ background: 'repeating-linear-gradient(135deg, transparent 0 6px, var(--line) 6px 7px)' }}
            />
          );
        })}
        {blocks.map((b) => (
          <div
            key={b.id}
            title={`${hm(b.startMin)}–${hm(b.endMin)} · ${b.reason}`}
            className="pointer-events-none absolute inset-x-0.5 overflow-hidden rounded-md bg-fg/85 px-1 py-0.5 text-[10px] leading-tight text-card"
            style={{ top: ((b.startMin - H0 * 60) / 60) * CELL, height: Math.max(16, ((b.endMin - b.startMin) / 60) * CELL - 2) }}
          >
            {hm(b.startMin)}–{hm(b.endMin)}
          </div>
        ))}
      </div>
    </div>
  );
}

function Body({ d, anchor, setAnchor }: { d: TeacherUnav; anchor: string | undefined; setAnchor: (a: string | undefined) => void }) {
  const create = useCreateTeacherUnav();
  const remove = useDeleteTeacherUnav();
  const [sel, setSel] = useState<Sel>(null);
  const [reason, setReason] = useState('');
  const [armedId, setArmedId] = useState<number | null>(null);
  const dragging = useRef(false);

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addD(d.cycle.from, i)), [d.cycle.from]);
  const allLocked = d.openFrom > d.cycle.to;
  const cutoffEnd = addD(d.openFrom, -1);

  const onDown = (date: string, h: number) => { dragging.current = true; setSel({ date, a: h, b: h }); setArmedId(null); };
  const onEnter = (date: string, h: number) => { if (dragging.current && sel && sel.date === date) setSel({ ...sel, b: h }); };
  const onUp = () => { dragging.current = false; };
  const range = sel ? { start: Math.min(sel.a, sel.b) * 60, end: (Math.max(sel.a, sel.b) + 1) * 60 } : null;

  const submit = () => {
    if (!sel || !range || !reason.trim() || create.isPending) return;
    create.mutate(
      { onDate: sel.date, startMin: range.start, endMin: range.end, reason: reason.trim() },
      { onSuccess: () => { setSel(null); setReason(''); } },
    );
  };

  return (
    <div onMouseUp={onUp} onMouseLeave={onUp}>
      <PageHeader
        title="불가 시간"
        sub={`입사일 기준 ${d.cycle.index}번째 2주 · ${mdDow(d.cycle.from)} – ${mdDow(d.cycle.to)}`}
      />

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Button size="sm" onClick={() => { setAnchor(addD(d.cycle.from, -14)); setSel(null); }}>← 이전 2주</Button>
        <Button size="sm" variant={anchor === undefined ? 'primary' : 'secondary'} onClick={() => { setAnchor(undefined); setSel(null); }}>지금 설정 가능한 주</Button>
        <Button size="sm" onClick={() => { setAnchor(addD(d.cycle.from, 14)); setSel(null); }}>다음 2주 →</Button>
        <span className="ml-auto text-[12px] text-fg-subtle">
          이 2주 등록 {d.blocks.length}건 · 열린 날짜 {d.openDays}일
        </span>
      </div>

      <Banner className="mt-3" tone={allLocked ? 'warning' : 'info'}>
        {allLocked
          ? '이 2주는 모두 마감되었습니다 — 「다음 2주」에서 등록해 주세요.'
          : `${mdDow(d.openFrom)}부터 등록할 수 있습니다. 열려 있는 칸을 마우스로 끌면 등록됩니다.`}
      </Banner>

      <div className="mt-2 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-[12px] leading-relaxed text-fg">
        <b>1주 안에 생긴 사정은 여기서 등록할 수 없습니다.</b> 오늘부터 {mdDow(cutoffEnd)}까지는 이미 수업 배정이
        끝난 구간이라 시스템에서 막을 수 없습니다. 갑작스러운 사정은 TN Academy 강사 단톡방에 바로 올려 주세요 —
        관리자가 확인하고 직접 조정합니다.
      </div>

      <Panel className="mt-4" title="2주 격자 · 08:00 – 23:00" sub="여기 등록한 시간에는 관리자가 수업을 배정할 수 없습니다 · 등록은 날짜별 7일 전까지">
        <div className="overflow-x-auto">
          <div className="flex min-w-[1400px] select-none">
            <div className="w-12 shrink-0">
              <div className="border-b border-transparent px-1 py-1.5 text-[11px]">&nbsp;</div>
              {Array.from({ length: H1 - H0 }, (_, i) => (
                <div key={i} className="flex h-[34px] items-start justify-end pr-1.5 text-[10.5px] text-fg-subtle">{hm((H0 + i) * 60)}</div>
              ))}
            </div>
            {days.map((date) => (
              <DayColumn
                key={date}
                date={date}
                open={date >= d.openFrom}
                blocks={d.blocks.filter((b) => b.onDate === date)}
                sel={sel}
                onDown={onDown}
                onEnter={onEnter}
              />
            ))}
          </div>
        </div>
      </Panel>

      <Panel className="mt-4" title="선택한 시간 등록" sub="사유는 관리자가 조정 가능성을 판단하는 근거입니다">
        {sel && range ? (
          <div className="flex flex-col gap-2.5">
            <div className="text-[13.5px] font-bold text-fg">
              {mdDow(sel.date)} · {hm(range.start)} – {hm(range.end)}
              <Button size="sm" className="ml-2" onClick={() => setSel(null)}>선택 해제</Button>
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="예) 목요일 저녁은 아이 하원 및 돌봄 시간입니다."
              className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px] text-fg"
            />
            {create.isError ? <Banner tone="danger">{errText(create.error)}</Banner> : null}
            <div>
              <Button variant="primary" disabled={!reason.trim() || create.isPending} onClick={submit}>
                {create.isPending ? '등록 중…' : '불가 시간 등록'}
              </Button>
            </div>
          </div>
        ) : (
          <p className="px-1 py-4 text-center text-[13px] text-fg-subtle">
            {allLocked ? '이 2주에는 등록할 수 있는 날짜가 없습니다.' : '격자의 열린 칸을 끌어 시간대를 먼저 선택해 주세요.'}
          </p>
        )}
      </Panel>

      <Panel className="mt-4" title={`이 2주 등록 내역 · ${d.blocks.length}건`} sub="마감된 날짜의 등록은 관리자에게 문의해 주세요">
        {remove.isError ? <Banner tone="danger" className="mb-2">{errText(remove.error)}</Banner> : null}
        {d.blocks.length === 0
          ? <p className="px-1 py-4 text-center text-[13px] text-fg-subtle">이 2주에 등록한 불가 시간이 없습니다.</p>
          : (
            <ul>
              {d.blocks.map((b) => (
                <li key={b.id} className="flex items-center gap-3 border-b border-line px-1 py-2.5 last:border-b-0">
                  <div className="w-32 shrink-0 text-[13px] font-bold text-fg">{mdDow(b.onDate)}</div>
                  <div className="w-28 shrink-0 text-[13px] text-fg">{hm(b.startMin)} – {hm(b.endMin)}</div>
                  <div className="min-w-0 grow truncate text-[12.5px] text-fg-subtle" title={b.reason}>{b.reason}</div>
                  {b.canDelete ? (
                    <Button
                      size="sm"
                      variant={armedId === b.id ? 'primary' : 'secondary'}
                      disabled={remove.isPending}
                      onClick={() => {
                        if (armedId === b.id) { remove.mutate(b.id, { onSettled: () => setArmedId(null) }); }
                        else setArmedId(b.id);
                      }}
                    >
                      {armedId === b.id ? '한 번 더 누르면 삭제' : '삭제'}
                    </Button>
                  ) : (
                    <Button size="sm" disabled title="마감된 날짜 — 관리자 조정 대상">삭제 불가</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
      </Panel>
    </div>
  );
}

export default function TeacherUnavailablePage() {
  const [anchor, setAnchor] = useState<string | undefined>(undefined);
  const q = useTeacherUnav(anchor);
  return (
    <RequireAuth>
      <AppShell>
        <QueryState query={q} isEmpty={() => false}>
          {(d) => <Body d={d} anchor={anchor} setAnchor={setAnchor} />}
        </QueryState>
      </AppShell>
    </RequireAuth>
  );
}
