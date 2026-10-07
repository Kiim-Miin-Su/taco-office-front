/** @file-guide
 * 목적: page.tsx — TeacherUnavailablePage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 불가 시간 — 강사 수정사항 T07의 10일·사유15자·배정 수업 충돌 계약을 준비한다.
 * 2주 회차와 기존 등록 읽기는 생성 DTO를 사용한다. 서버가 아직 7일·사유1자·본인 UNAV 겹침만
 * 검증하므로 새 등록·삭제는 성공으로 가장하지 않고 잠근다. DTO/OpenAPI 단계에서 writer를 다시 연결한다.
 */
'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { ApiError } from '@/api/client';
import { Banner, Button, Panel, QueryState } from '@/components/ui';
import { useTeacherUnav } from '@/api/queries';
import type { TeacherUnav, TeacherUnavBlock } from '@/api/types';
import { dowOf, hm } from '@/components/teacher/format';
import { TeacherPolicyBar } from '@/components/teacher/TeacherPolicyBar';
import { ScreenHeader } from '@/components/teacher/ScreenHeader';
import { queryIsoDate } from '@/lib/url-state';

const H0 = 8;                     // 격자 첫 시간 (원본 §15)
const H1 = 23;                    // 격자 끝
const CELL = 44;                  // 1시간 칸 높이(px) — 키보드/터치 조작점 최소 높이
const REQUIRED_NOTICE_DAYS = 10;
const REQUIRED_REASON_LENGTH = 15;
const addD = (iso: string, n: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const mdDow = (iso: string): string => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일 (${dowOf(iso)})`;

type Sel = { date: string; a: number; b: number } | null;   // a·b = 시간(시) 경계, 드래그 중 순서 무관

function errText(e: unknown): string {
  return e instanceof ApiError ? e.message : '저장하지 못했습니다 — 잠시 후 다시 시도해 주세요';
}

/** 날짜 한 컬럼 — 열린 날이면 드래그로 시간대를 고른다. 등록 블록은 겹쳐 그린다. */
function DayColumn({ date, open, blocks, sel, onDown, onEnter, onActivate }: {
  date: string; open: boolean; blocks: TeacherUnavBlock[]; sel: Sel;
  onDown: (date: string, h: number) => void;
  onEnter: (date: string, h: number) => void;
  onActivate: (date: string, h: number) => void;
}) {
  const sun = dowOf(date) === '일';
  const picked = sel?.date === date ? sel : null;
  const [p0, p1] = picked ? [Math.min(picked.a, picked.b), Math.max(picked.a, picked.b) + 1] : [0, 0];
  return (
    <div className="w-[96px] shrink-0 border-r border-line last:border-r-0">
      <div className={`border-b border-line px-1 py-1.5 text-center text-[12px] ${open ? '' : 'bg-inset opacity-60'}`}>
        <b className={sun ? 'text-red' : 'text-fg'}>{dowOf(date)}</b>
        <span className="ml-1 text-fg-subtle">{Number(date.slice(8, 10))}</span>
        {open ? null : <span className="ml-1 rounded bg-line px-1 text-[12px] text-fg-subtle">마감</span>}
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
              onPointerDown={(e) => { e.preventDefault(); onDown(date, h); }}
              onPointerEnter={() => onEnter(date, h)}
              onClick={(e) => { if (e.detail === 0) onActivate(date, h); }}
              className={`block h-11 w-full border-b border-line/60 last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue ${inSel ? 'bg-primary/25' : 'bg-blue/5 hover:bg-blue/15'}`}
            />
          ) : (
            <div
              key={h}
              className="h-11 border-b border-line/60 opacity-70 last:border-b-0"
              style={{ background: 'repeating-linear-gradient(135deg, transparent 0 6px, var(--line) 6px 7px)' }}
            />
          );
        })}
        {blocks.map((b) => (
          <div
            key={b.id}
            title={`${hm(b.startMin)}–${hm(b.endMin)} · ${b.reason}`}
            className="pointer-events-none absolute inset-x-0.5 overflow-hidden rounded-md bg-fg/85 px-1 py-0.5 text-[12px] leading-tight text-card"
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
  const [sel, setSel] = useState<Sel>(null);
  const [reason, setReason] = useState('');
  const dragging = useRef(false);

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addD(d.cycle.from, i)), [d.cycle.from]);
  const requiredOpenFromRaw = addD(d.today, REQUIRED_NOTICE_DAYS);
  const requiredOpenFrom = requiredOpenFromRaw < d.cycle.from ? d.cycle.from : requiredOpenFromRaw;
  const lockedDays = Math.min(14, Math.max(0,
    Math.round((Date.parse(`${requiredOpenFrom}T00:00:00Z`) - Date.parse(`${d.cycle.from}T00:00:00Z`)) / 86400000),
  ));
  const openDays = 14 - lockedDays;
  const allLocked = requiredOpenFrom > d.cycle.to;
  const cutoffEnd = addD(d.today, REQUIRED_NOTICE_DAYS - 1);

  const onDown = (date: string, h: number) => { dragging.current = true; setSel({ date, a: h, b: h }); };
  const onEnter = (date: string, h: number) => { if (dragging.current && sel && sel.date === date) setSel({ ...sel, b: h }); };
  const onActivate = (date: string, h: number) => { dragging.current = false; setSel({ date, a: h, b: h }); };
  const onUp = () => { dragging.current = false; };
  const range = sel ? { start: Math.min(sel.a, sel.b) * 60, end: (Math.max(sel.a, sel.b) + 1) * 60 } : null;

  const reasonLength = reason.trim().length;

  return (
    <div onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp}>
      <ScreenHeader
        title="불가 시간"
        sub={`입사일 기준 ${d.cycle.index}번째 2주 · ${mdDow(d.cycle.from)} – ${mdDow(d.cycle.to)}`}
      />

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Button size="sm" className="min-h-11" aria-label="이전 2주" onClick={() => { setAnchor(addD(d.cycle.from, -14)); setSel(null); }}>← 이전 2주</Button>
        <Button size="sm" className="min-h-11" aria-label="현재 2주" variant={anchor === undefined ? 'primary' : 'secondary'} onClick={() => { setAnchor(undefined); setSel(null); }}>지금 설정 가능한 주</Button>
        <Button size="sm" className="min-h-11" aria-label="다음 2주" onClick={() => { setAnchor(addD(d.cycle.from, 14)); setSel(null); }}>다음 2주 →</Button>
        <span className="ml-auto text-[12px] text-fg-subtle">
          이 2주 등록 {d.blocks.length}건 · 10일 기준 입력 가능 {openDays}일
        </span>
      </div>

      <Banner className="mt-3" tone={allLocked ? 'warning' : 'info'}>
        {allLocked
          ? '이 2주는 10일 전 입력 기준을 모두 지났습니다 — 「다음 2주」에서 초안을 작성해 주세요.'
          : `${mdDow(requiredOpenFrom)}부터 초안을 작성할 수 있습니다. 칸을 누르거나 끌어 시간대를 선택해 주세요.`}
      </Banner>

      <div className="mt-2 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-[12px] leading-relaxed text-fg">
        <b>대상 날짜 10일 전까지 등록해야 합니다.</b> 오늘부터 {mdDow(cutoffEnd)}까지의 갑작스러운 사정은
        TN Academy 강사 단톡방에 바로 올려 주세요. 관리자가 확인하고 직접 조정합니다.
      </div>

      <Banner className="mt-2" tone="warning" title="저장 기능 준비 중">
        10일 기준·사유 15자·실제 배정 수업 충돌을 함께 확인하는 기능을 준비 중입니다.
        입력 초안과 기존 내역 조회만 제공하며, 등록·삭제는 충돌 확인 기능이 준비된 뒤 사용할 수 있습니다.
      </Banner>

      <Panel className="mt-4" title="2주 격자 · 08:00 – 23:00" sub="날짜별 10일 전부터 초안 입력 · 저장 기능 준비 중">
        <div className="overflow-x-auto">
          <div className="flex min-w-[1400px] select-none">
            <div className="w-12 shrink-0">
              <div className="border-b border-transparent px-1 py-1.5 text-[12px]">&nbsp;</div>
              {Array.from({ length: H1 - H0 }, (_, i) => (
                <div key={i} className="flex h-11 items-start justify-end pr-1.5 text-[12px] text-fg-subtle">{hm((H0 + i) * 60)}</div>
              ))}
            </div>
            {days.map((date) => (
              <DayColumn
                key={date}
                date={date}
                open={date >= requiredOpenFrom}
                blocks={d.blocks.filter((b) => b.onDate === date)}
                sel={sel}
                onDown={onDown}
                onEnter={onEnter}
                onActivate={onActivate}
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
              <Button size="sm" className="ml-2 min-h-11" onClick={() => setSel(null)}>선택 해제</Button>
            </div>
            <label htmlFor="teacher-unavailable-reason" className="text-[12px] font-bold text-fg">불가 사유</label>
            <textarea
              id="teacher-unavailable-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="예) 목요일 저녁은 아이 하원 및 돌봄 시간입니다."
              className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px] text-fg"
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[12px] ${reasonLength >= REQUIRED_REASON_LENGTH ? 'text-green' : 'text-fg-subtle'}`}>
                {reasonLength}/500자 · {reasonLength >= REQUIRED_REASON_LENGTH ? '입력 완료' : `최소 ${REQUIRED_REASON_LENGTH}자`}
              </span>
              <Button className="ml-auto min-h-11" variant="primary" disabled title="10일 기준·사유 길이·배정 수업 충돌 확인 기능이 준비된 뒤 사용할 수 있습니다">
                저장 기능 준비 중
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
        {d.blocks.length === 0
          ? <p className="px-1 py-4 text-center text-[13px] text-fg-subtle">이 2주에 등록한 불가 시간이 없습니다.</p>
          : (
            <ul>
              {d.blocks.map((b) => (
                <li key={b.id} className="flex items-center gap-3 border-b border-line px-1 py-2.5 last:border-b-0">
                  <div className="w-32 shrink-0 text-[13px] font-bold text-fg">{mdDow(b.onDate)}</div>
                  <div className="w-28 shrink-0 text-[13px] text-fg">{hm(b.startMin)} – {hm(b.endMin)}</div>
                  <div className="min-w-0 grow truncate text-[12.5px] text-fg-subtle" title={b.reason}>{b.reason}</div>
                  <Button size="sm" className="min-h-11" disabled title={b.canDelete
                    ? '10일 삭제 기준이 준비된 뒤 사용할 수 있습니다'
                    : '서버가 마감된 기존 등록으로 판정했습니다'}>
                    {b.canDelete ? '삭제 기능 준비 중' : '삭제 불가'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
      </Panel>
    </div>
  );
}

export default function TeacherUnavailablePage() {
  const router = useRouter();
  const search = useSearchParams();
  const anchor = queryIsoDate(search.get('anchor')) ?? undefined;
  const q = useTeacherUnav(anchor);
  const setAnchor = (next: string | undefined) => {
    router.replace(next ? `/teacher/unavailable?anchor=${encodeURIComponent(next)}` : '/teacher/unavailable', { scroll: false });
  };
  return (
    <RequireAuth>
      <AppShell>
        {/* 강사 정책은 화면 최상단 (대표 결정 2026-09-25) — 강사로 로그인했을 때만 선다 */}
        <TeacherPolicyBar
          screen="unavailable"
          className="mb-3"
          override={{
            title: '불가 시간 등록 규칙',
            lines: [
              '대상 날짜 10일 전까지 초안을 등록합니다.',
              '사유는 앞뒤 공백을 제외하고 15자 이상 적습니다.',
              '실제 배정 수업 충돌을 서버가 검사하는 동안 등록과 삭제는 준비 중입니다.',
            ],
          }}
        />
        {q.isError ? (
          <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-line bg-card p-8 text-center">
            <p className="text-base font-bold text-fg">불가 시간을 불러오지 못했습니다</p>
            <p className="text-xs text-fg-subtle">{errText(q.error)}</p>
            <Button className="mt-2 min-h-11" onClick={() => void q.refetch()}>다시 시도</Button>
          </div>
        ) : (
          <QueryState query={q} isEmpty={() => false}>
            {(d) => <Body d={d} anchor={anchor} setAnchor={setAnchor} />}
          </QueryState>
        )}
      </AppShell>
    </RequireAuth>
  );
}
