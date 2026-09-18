/** @file-guide
 * 목적: LeadTouchLog.tsx — LeadTouchLog (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §23 카드의 접촉 원장 + 「+ 기록」 (C90 · N-44 · 테스트 시나리오 A-02 상담 예약 · A-03 예약 불참).
 *
 * 줄은 서버가 준 `lead.touches`(최근 것이 앞)를 그대로 그린다 — 「어떻게」 낱말은 `intakeHead.touchKinds`(D-R18).
 * 「다음은 언제」를 적으면 서버가 「상담 오늘·지남」·「사후 관리 임박·밀림」을 다시 센다 — 화면은 날짜를 빼지 않는다(D-R37).
 * 끝난 건에도 적을 수 있다 — 등록 뒤 해피콜, 실패 뒤 재연락이 사후 관리다. 부모는 `key={lead.id}` 로 세운다.
 */
'use client';
import { useId, useState } from 'react';
import { Banner, Button, Chip, Input, Label, Select, Textarea } from '../ui';
import { apiMessage } from '@/api/client';
import { useAddLeadTouch } from '@/api/queries';
import type { IntakeWord, Lead, LeadTouchWrite } from '@/api/types';

export interface LeadTouchLogProps {
  lead: Lead;
  kinds: IntakeWord[];
  onDone?: (row: Lead) => void;
}

const fmtAt = (iso: string) => iso.replace('T', ' ').slice(5, 16);

export function LeadTouchLog({ lead, kinds, onDone }: LeadTouchLogProps) {
  const id = useId();
  const write = useAddLeadTouch();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<LeadTouchWrite['kind'] | ''>('');
  const [note, setNote] = useState('');
  const [nextOn, setNextOn] = useState('');
  const [err, setErr] = useState<string | null>(null);
  // 건이 바뀌면 부모가 key 로 다시 세운다 — 쓰다 만 줄이 다른 건에 붙지 않는다

  const pending = write.isPending;
  const canSubmit = !!kind && note.trim().length > 0 && !pending;
  const submit = () => {
    if (!canSubmit || !kind) return;
    setErr(null);
    write.mutate({ id: lead.id, kind, note: note.trim(), ...(nextOn ? { nextOn } : {}) }, {
      onSuccess: (row) => { setAdding(false); setKind(''); setNote(''); setNextOn(''); onDone?.(row); },
      onError: (e) => setErr(apiMessage(e)),
    });
  };

  return (
    <section aria-label="접촉 원장" className="rounded-lg border border-line bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="text-[12px] font-bold text-fg">접촉 원장 {lead.touches.length ? `· ${lead.touches.length}건` : ''}</span>
        <div className="flex items-center gap-2">
          {lead.nextLabel ? <Chip tone={(lead.nextTone as 'danger' | 'warning' | 'info' | null) ?? 'neutral'} size="compact">{lead.nextLabel}</Chip> : null}
          {!adding ? <Button type="button" size="sm" variant="secondary" onClick={() => setAdding(true)}>+ 기록</Button> : null}
        </div>
      </div>
      {adding ? (
        <div className="flex flex-col gap-2 border-b border-line bg-inset px-3 py-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`${id}-kind`}>어떻게</Label>
              <Select id={`${id}-kind`} value={kind} disabled={pending} onChange={(e) => setKind(e.target.value as LeadTouchWrite['kind'] | '')}>
                <option value="">고르세요</option>
                {kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor={`${id}-next`} hint="상담 예약이면 상담 날짜 — 지나면 붉게 셉니다">다음은 언제 (선택)</Label>
              <Input id={`${id}-next`} type="date" value={nextOn} disabled={pending} onChange={(e) => setNextOn(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor={`${id}-note`}>한 줄</Label>
            <Textarea id={`${id}-note`} rows={2} maxLength={500} value={note} disabled={pending} onChange={(e) => setNote(e.target.value)} placeholder="토 11:00 방문 상담 · 어머니와 통화" />
          </div>
          {err ? <Banner tone="danger">{err}</Banner> : null}
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={submit} disabled={!canSubmit}>{pending ? '적는 중…' : '기록'}</Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { setAdding(false); setErr(null); }}>취소</Button>
          </div>
        </div>
      ) : null}
      {lead.touches.length === 0 ? (
        <p className="px-3 py-2 text-[12px] text-fg-subtle">아직 접촉 기록이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-line">
          {lead.touches.map((t) => (
            <li key={t.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-1.5 text-[12px]">
              <Chip tone="neutral" size="compact">{t.kindLabel}</Chip>
              <span className="text-fg">{t.note}</span>
              {t.nextOn ? <span className="text-fg-subtle">→ {t.nextOn.slice(5).replace('-', '/')}</span> : null}
              <span className="ml-auto text-[11px] text-fg-subtle">{t.byName ?? '—'} · {fmtAt(t.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
