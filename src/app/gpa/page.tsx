/** @file-guide
 * 목적: page.tsx — GpaPage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * GPA 관리 — v2 §4.5·§82 (N-13 채택 · C34). 4주 사이클 포인트제.
 * 잔여(배정−사용−대기)·초과·잠금 판정은 전부 서버 — 화면은 값만 그리고 거절 메시지를 그대로 보인다.
 * 학부모 비공개(D-R30) — 내부 자료. 배정 초과는 붉게 표시하고 추가 결제/다음 사이클 조정을 안내한다.
 */
'use client';
import { useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { apiMessage } from '@/api/client';
import { Banner, Button, Chip, PageHeader, Panel, QueryState, StatCard } from '@/components/ui';
import {
  useCreateGpaUse, useDeleteGpaUse, useGpaBoard, usePutGpaAlloc, useSetGpaUseState,
} from '@/api/queries';
import type { GpaBoard, GpaStudent } from '@/api/types';
import { hm } from '@/components/teacher/format';

const addD = (iso: string, n: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const md = (iso: string): string => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`;

function AllocEditor({ s, cycleId, closed }: { s: GpaStudent; cycleId: number; closed: boolean }) {
  const put = usePutGpaAlloc();
  const [value, setValue] = useState(String(s.alloc));
  const dirty = Number(value) !== s.alloc;
  return (
    <span className="flex items-center justify-end gap-1">
      <input
        type="number"
        min={0}
        value={value}
        disabled={closed || put.isPending}
        onChange={(e) => setValue(e.target.value)}
        className="w-16 rounded border border-line bg-card px-1.5 py-0.5 text-right text-[12px] text-fg"
        aria-label={`${s.name} 배정 포인트`}
      />
      <Button
        size="sm"
        disabled={closed || !dirty || put.isPending || Number(value) < 0 || !Number.isInteger(Number(value))}
        onClick={() => put.mutate({ cycleId, studentId: s.studentId, points: Number(value) })}
      >
        저장
      </Button>
    </span>
  );
}

function Board({ d, anchor, setAnchor }: { d: GpaBoard; anchor: string | undefined; setAnchor: (a: string | undefined) => void }) {
  const [pickedId, setPickedId] = useState<number | null>(null);
  const create = useCreateGpaUse();
  const setState = useSetGpaUseState();
  const remove = useDeleteGpaUse();
  const [form, setForm] = useState({ studentId: '', svcKey: 'hw', onDate: '', startMin: '', noteUrl: '' });
  const [armedId, setArmedId] = useState<number | null>(null);

  if (!d.cycle) {
    return (
      <>
        <PageHeader title="GPA 관리" sub="학부모 비공개 · 내부 자료 (D-R30)" />
        <Banner className="mt-3" tone="info">등록된 GPA 사이클이 없습니다 — 사이클은 운영에서 만들어집니다.</Banner>
      </>
    );
  }
  const cy = d.cycle;
  const picked = d.students.find((s) => s.studentId === pickedId) ?? null;
  const uses = picked ? d.uses.filter((u) => u.studentId === picked.studentId) : [];
  let running = picked ? picked.alloc : 0;

  const submit = () => {
    if (!form.studentId || !form.onDate || create.isPending) return;
    create.mutate({
      cycleId: cy.id,
      studentId: Number(form.studentId),
      svcKey: form.svcKey,
      onDate: form.onDate,
      ...(form.startMin === '' ? {} : { startMin: (() => { const [h, m] = form.startMin.split(':').map(Number); return h * 60 + (m || 0); })() }),
      ...(form.noteUrl.trim() ? { noteUrl: form.noteUrl.trim() } : {}),
    }, { onSuccess: () => setForm((f) => ({ ...f, onDate: '', startMin: '', noteUrl: '' })) });
  };

  return (
    <>
      <PageHeader
        title="GPA 관리"
        sub={`${cy.no}차 사이클 · ${md(cy.from)} – ${md(cy.to)} (4주) · 학부모 비공개 — 내부 자료 (D-R30)`}
      />

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Button size="sm" disabled={!d.hasPrev} onClick={() => { setAnchor(addD(cy.from, -1)); setPickedId(null); }}>← 이전 사이클</Button>
        <Button size="sm" variant={anchor === undefined ? 'primary' : 'secondary'} onClick={() => { setAnchor(undefined); setPickedId(null); }}>현재 사이클</Button>
        <Button size="sm" disabled={!d.hasNext} onClick={() => { setAnchor(addD(cy.to, 1)); setPickedId(null); }}>다음 사이클 →</Button>
        <span className="ml-auto flex items-center gap-1.5 text-[12px] text-fg-subtle">
          규정: {d.services.map((s) => `${s.name} ${s.point}p`).join(' · ')}
        </span>
      </div>

      {cy.closed ? (
        <Banner className="mt-3" tone="warning">닫힌 사이클입니다 — 이월 없이 잔여가 소멸했고, 기록·승인·배정을 바꿀 수 없습니다.</Banner>
      ) : null}

      <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="배정" value={`${d.totalAlloc}p`} />
        <StatCard label="사용 (승인)" value={`${d.totalUsed}p`} />
        <StatCard label="승인 대기" value={`${d.totalWait}p`} tone="warning" />
        <StatCard label="잔여" value={`${d.totalRemain}p`} tone={d.totalRemain < 0 ? 'danger' : 'success'} note="배정 − 사용 − 대기" />
      </div>

      <Panel title={`학생별 잔여 · ${d.students.length}명`} sub="초과는 붉게 — 추가 결제 또는 다음 사이클 조정을 안내해 주세요">
        {d.students.length === 0
          ? <p className="px-1 py-5 text-center text-[13px] text-fg-subtle">이 사이클에 배정·소비가 없습니다.</p>
          : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[11.5px] text-fg-subtle">
                  <th className="py-1.5">학생</th><th>담당</th>
                  <th className="text-right">배정</th><th className="text-right">사용</th>
                  <th className="text-right">대기</th><th className="text-right">잔여</th><th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {d.students.map((s) => (
                  <tr key={s.studentId} className={`border-b border-line/60 last:border-b-0 ${picked?.studentId === s.studentId ? 'bg-primary/5' : ''}`}>
                    <td className="py-1.5 font-bold text-fg">
                      {s.name} {s.grade ? <span className="text-[11px] font-normal text-fg-subtle">{s.grade}</span> : null}
                      {s.over ? <Chip className="ml-1.5" size="compact" tone="danger">초과</Chip> : null}
                    </td>
                    <td className="text-fg-subtle">{s.coordName ?? '—'}</td>
                    <td className="text-right"><AllocEditor s={s} cycleId={cy.id} closed={cy.closed} /></td>
                    <td className="text-right">{s.used}p</td>
                    <td className="text-right text-amber">{s.wait}p</td>
                    <td className={`text-right font-bold ${s.remain < 0 ? 'text-red' : 'text-fg'}`}>
                      {s.remain}p
                      {s.over ? <div className="text-[10.5px] font-normal text-red">추가 결제 또는 다음 사이클 조정</div> : null}
                    </td>
                    <td className="text-right">
                      <Button size="sm" variant={picked?.studentId === s.studentId ? 'primary' : 'secondary'} onClick={() => setPickedId(s.studentId)}>타임라인</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Panel>

      {picked ? (
        <Panel className="mt-4" title={`${picked.name} · 소비 타임라인`} sub="대기(점선)는 잔여에서 이미 빠져 있습니다 — 승인은 확정 표시입니다">
          {(setState.isError || remove.isError) ? (
            <Banner tone="danger" className="mb-2">{apiMessage(setState.isError ? setState.error : remove.error)}</Banner>
          ) : null}
          {uses.length === 0
            ? <p className="px-1 py-4 text-center text-[13px] text-fg-subtle">이 사이클 소비 기록이 없습니다.</p>
            : (
              <ol className="flex flex-col gap-1.5">
                {uses.map((u) => {
                  running -= u.points;
                  const svc = d.services.find((s) => s.key === u.svcKey);
                  return (
                    <li
                      key={u.id}
                      className={`flex items-center gap-3 rounded-lg border bg-card px-3 py-2 ${u.state === 'wait' ? 'border-dashed border-amber' : 'border-line'}`}
                    >
                      <span className="w-24 shrink-0 text-[12px] font-bold text-fg">{md(u.onDate)}{u.startMin != null ? ` ${hm(u.startMin)}` : ''}</span>
                      <span className="min-w-0 grow truncate text-[12.5px] text-fg">
                        {svc?.name ?? u.svcKey} <b className="text-red">−{u.points}p</b>
                        {u.noteUrl ? <span className="ml-1.5 text-[11px] text-fg-subtle">기록지 있음</span> : null}
                      </span>
                      <span className={`w-20 shrink-0 text-right text-[12px] font-bold ${running < 0 ? 'text-red' : 'text-fg-subtle'}`}>잔여 {running}p</span>
                      <Chip size="compact" tone={u.state === 'ok' ? 'success' : 'warning'}>{u.state === 'ok' ? '승인' : '대기'}</Chip>
                      {cy.closed ? null : u.state === 'wait' ? (
                        <span className="flex shrink-0 gap-1">
                          <Button size="sm" disabled={setState.isPending} onClick={() => setState.mutate({ id: u.id, state: 'ok' })}>승인</Button>
                          <Button
                            size="sm"
                            variant={armedId === u.id ? 'primary' : 'secondary'}
                            disabled={remove.isPending}
                            onClick={() => { if (armedId === u.id) remove.mutate(u.id, { onSettled: () => setArmedId(null) }); else setArmedId(u.id); }}
                          >
                            {armedId === u.id ? '한 번 더 누르면 삭제' : '삭제'}
                          </Button>
                        </span>
                      ) : (
                        <Button size="sm" disabled={setState.isPending} onClick={() => setState.mutate({ id: u.id, state: 'wait' })}>되돌림</Button>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
        </Panel>
      ) : null}

      <Panel className="mt-4" title="회차 소비 기록" sub="wait 로 들어가고, 포인트는 규정에서 서버가 스냅샷합니다 — 초과는 막지 않습니다">
        {cy.closed ? (
          <p className="px-1 py-4 text-center text-[13px] text-fg-subtle">닫힌 사이클에는 기록할 수 없습니다.</p>
        ) : (
          <div className="flex flex-wrap items-end gap-2.5 text-[12.5px]">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-fg-subtle">학생</span>
              <select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} className="rounded border border-line bg-card px-2 py-1.5 text-fg">
                <option value="">선택</option>
                {d.students.map((s) => <option key={s.studentId} value={s.studentId}>{s.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-fg-subtle">서비스</span>
              <select value={form.svcKey} onChange={(e) => setForm({ ...form, svcKey: e.target.value })} className="rounded border border-line bg-card px-2 py-1.5 text-fg">
                {d.services.map((s) => <option key={s.key} value={s.key}>{s.name} ({s.point}p)</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-fg-subtle">날짜 (사이클 안)</span>
              <input type="date" value={form.onDate} min={cy.from} max={cy.to} onChange={(e) => setForm({ ...form, onDate: e.target.value })} className="rounded border border-line bg-card px-2 py-1.5 text-fg" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-fg-subtle">시작 (선택)</span>
              <input type="time" value={form.startMin} onChange={(e) => setForm({ ...form, startMin: e.target.value })} className="rounded border border-line bg-card px-2 py-1.5 text-fg" />
            </label>
            <label className="flex min-w-[180px] grow flex-col gap-1">
              <span className="text-[11px] text-fg-subtle">기록지 URL (선택)</span>
              <input value={form.noteUrl} onChange={(e) => setForm({ ...form, noteUrl: e.target.value })} className="rounded border border-line bg-card px-2 py-1.5 text-fg" placeholder="https://…" />
            </label>
            <Button variant="primary" disabled={!form.studentId || !form.onDate || create.isPending} onClick={submit}>
              {create.isPending ? '기록 중…' : '기록 (대기)'}
            </Button>
          </div>
        )}
        {create.isError ? <Banner tone="danger" className="mt-2">{apiMessage(create.error)}</Banner> : null}
      </Panel>
    </>
  );
}

export default function GpaPage() {
  const [anchor, setAnchor] = useState<string | undefined>(undefined);
  const q = useGpaBoard(anchor);
  return (
    <RequireAuth>
      <AppShell>
        <QueryState query={q} isEmpty={() => false}>
          {(d) => <Board d={d} anchor={anchor} setAnchor={setAnchor} />}
        </QueryState>
      </AppShell>
    </RequireAuth>
  );
}
