/** @file-guide
 * 목적: LeadPlanSection.tsx — LeadPlanSection, leadPlanSummary (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 상담 상세 서랍의 「배치안」 + 보류 「재확인 · 연장 +2일」 (23-16 · 24-07).
 *
 * 원본 §23 카드의 「SAT Reading 주2 · Rebecca」가 이 줄이다 — 한 줄의 낱말(`label`)은 서버가 만든다(D-R18).
 * 적는 것은 **과목 · 주 N회 · 강사**뿐이다. 단가는 단가표(RATE)가 정본이라 적지 않고, 금액을 볼 수 있으면 서버가 붙여 준 값을 그린다(D-R39).
 * 「등록 확정」 창이 이 줄로 채워지고 §24 「당시 배치안」도 같은 줄이다. 보류 건은 재확인 날짜(서버가 센 유효값)와 「연장 +2일」이 선다.
 * 끝난 건(등록 · 등록 실패)은 읽기만 한다 — 서버도 409 로 막는다. 부모는 `key={lead.id}` 로 세운다.
 */
'use client';
import { useId, useState } from 'react';
import { Banner, Button, Input, Label, Select } from '../ui';
import { apiMessage } from '@/api/client';
import { useExtendLeadHold, useMeta, useSaveLeadPlan } from '@/api/queries';
import type { Lead, LeadPlanLine } from '@/api/types';
import { won } from '@/lib/money';

/** 카드의 한 줄 — 서버 낱말을 「 · 」로 잇는다(원본 「MAP Reading 주3 · Allissa · Writing 주2 · Kim」) */
export const leadPlanSummary = (plan: readonly LeadPlanLine[] | undefined) => (plan ?? []).map((p) => p.label).join(' · ');

interface Draft { key: number; kindKey: string; subKey: string; perWeek: string; teacherId: string }
let seq = 0;
const toDraft = (p?: LeadPlanLine): Draft => ({
  key: ++seq, kindKey: p?.kindKey ?? '', subKey: p?.subKey ?? '', perWeek: String(p?.perWeek ?? 1), teacherId: p?.teacherId ? String(p.teacherId) : '',
});

export interface LeadPlanSectionProps {
  lead: Lead;
  /** 깔때기 안(서버의 퍼널 단계)인가 — 아니면 읽기만 */
  editable: boolean;
  onDone?: (message: string) => void;
}

export function LeadPlanSection({ lead, editable, onDone }: LeadPlanSectionProps) {
  const id = useId();
  const plan = lead.plan ?? [];
  const [editing, setEditing] = useState(false);
  const [lines, setLines] = useState<Draft[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const meta = useMeta(editing);
  const save = useSaveLeadPlan();
  const extend = useExtendLeadHold();
  const pending = save.isPending;

  const open = () => { setLines(plan.length ? plan.map(toDraft) : [toDraft()]); setErr(null); setEditing(true); };
  const patch = (key: number, p: Partial<Draft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const issue = lines.some((l) => !l.kindKey) ? '줄마다 종류를 고르세요'
    : lines.some((l) => !/^[1-7]$/.test(l.perWeek)) ? '주 1~7회입니다' : null;
  const submit = () => {
    if (issue) return;
    setErr(null);
    save.mutate({
      id: lead.id,
      lines: lines.map((l) => ({
        kindKey: l.kindKey, subKey: l.subKey || null, perWeek: Number(l.perWeek), teacherId: l.teacherId ? Number(l.teacherId) : null,
      })),
    }, {
      onSuccess: () => { setEditing(false); onDone?.('배치안을 저장했습니다'); },
      onError: (e) => setErr(apiMessage(e)),
    });
  };

  return (
    <section aria-label="배치안" className="rounded-lg border border-line bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="text-[12px] font-bold text-fg">배치안 {plan.length ? `· ${plan.length}줄` : ''}</span>
        {editable && !editing ? <Button type="button" size="sm" variant="secondary" onClick={open}>{plan.length ? '고치기' : '+ 배치안'}</Button> : null}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2 border-b border-line bg-inset px-3 py-2">
          {lines.map((l, i) => (
            <div key={l.key} className="grid grid-cols-[1fr_1fr_72px_1fr_auto] items-end gap-2">
              <div>
                <Label htmlFor={`${id}-k${l.key}`}>종류</Label>
                <Select id={`${id}-k${l.key}`} aria-label={`배치안 ${i + 1} 종류`} value={l.kindKey} disabled={pending} onChange={(e) => patch(l.key, { kindKey: e.target.value })}>
                  <option value="">고르세요</option>
                  {(meta.data?.kinds ?? []).map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor={`${id}-s${l.key}`}>과목</Label>
                <Select id={`${id}-s${l.key}`} aria-label={`배치안 ${i + 1} 과목`} value={l.subKey} disabled={pending} onChange={(e) => patch(l.key, { subKey: e.target.value })}>
                  <option value="">없음</option>
                  {(meta.data?.subs ?? []).map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor={`${id}-w${l.key}`}>주 N회</Label>
                <Input id={`${id}-w${l.key}`} aria-label={`배치안 ${i + 1} 주 N회`} type="number" min={1} max={7} value={l.perWeek} disabled={pending} onChange={(e) => patch(l.key, { perWeek: e.target.value })} />
              </div>
              <div>
                <Label htmlFor={`${id}-t${l.key}`}>강사</Label>
                <Select id={`${id}-t${l.key}`} aria-label={`배치안 ${i + 1} 강사`} value={l.teacherId} disabled={pending} onChange={(e) => patch(l.key, { teacherId: e.target.value })}>
                  <option value="">미정</option>
                  {(meta.data?.staff ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </div>
              <button type="button" className="pb-2 text-[11px] text-fg-subtle hover:text-red" disabled={pending} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>줄 빼기</button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="secondary" disabled={pending || lines.length >= 8} onClick={() => setLines((ls) => [...ls, toDraft()])}>+ 줄</Button>
            <span className="text-[11px] text-fg-subtle">단가는 단가표에서 붙습니다 · 요일·시각은 등록 확정 때 잡습니다</span>
          </div>
          {issue && lines.length ? <p className="text-[11.5px] text-amber">{issue}</p> : null}
          {err ? <Banner tone="danger">{err}</Banner> : null}
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={submit} disabled={pending || issue !== null}>{pending ? '저장 중…' : '저장'}</Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { setEditing(false); setErr(null); }}>취소</Button>
          </div>
        </div>
      ) : null}
      {plan.length === 0 ? (
        <p className="px-3 py-2 text-[12px] text-fg-subtle">아직 배치안이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-line">
          {plan.map((p) => (
            <li key={p.seq} className="flex items-baseline justify-between gap-2 px-3 py-1.5 text-[12px]">
              <span className="font-bold text-fg">{p.label}</span>
              {p.unitPrice != null ? <span className="text-fg-2">{won(p.unitPrice)}</span> : null}
            </li>
          ))}
        </ul>
      )}
      {/* 보류 — 재확인 날짜는 서버가 센 유효값(적어 둔 날짜 · 없으면 보류에 들어온 날 + 2일). 「연장 +2일」도 서버가 센다 */}
      {lead.stage === 'hold' ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2">
          <span className="text-[12px] font-bold text-red">{lead.recheckOn ? `재확인 ${lead.recheckOn}` : '재확인 날짜 기록 없음'}</span>
          <Button
            type="button" size="sm" variant="secondary" disabled={extend.isPending}
            onClick={() => extend.mutate({ id: lead.id }, { onSuccess: (row) => onDone?.(`재확인 날짜를 ${row.recheckOn ?? ''}(으)로 늘렸습니다`) })}
          >
            연장 +2일
          </Button>
          {extend.isError ? <Banner tone="danger" className="w-full">{apiMessage(extend.error)}</Banner> : null}
        </div>
      ) : null}
    </section>
  );
}
