/** @file-guide
 * 목적: ConsultingSessionDialog.tsx — ConsultingSessionDialog (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §31 「+ 회차 기록」 — 날짜 여러 개를 한 번에 잡는다 (C95 · 테스트 시나리오 I-91 「회차 기록 — 날짜 3개 고르기」).
 *
 * 화면이 보내는 것은 **날짜들 · 시각 · 담당 · 방식 · 「무엇을」 한 줄**뿐이다. 순번 · 그날 시간표에 이미 있는 회차에 연결되는지 ·
 * 새 회차가 되는지 · 「한 회차」인지(오늘 이하) · 불가 시간 알림은 서버가 **같은 트랜잭션을 돌리고 되돌린 미리보기**로 준다(D-R37).
 * 「회차 확정」은 **지금 입력 그대로** 미리 본 뒤에만 선다 — 날짜를 더하거나 빼면 다시 본다(C91·C93 과 같은 모양).
 * 겹치면 서버가 409 로 거절하고 아무것도 남지 않는다 — 문장에 어느 날짜인지가 있다.
 */
'use client';
import { useEffect, useId, useState } from 'react';
import { Banner, Button, Chip, Dialog, Input, Label, Segmented, Select } from '../ui';
import { apiMessage } from '@/api/client';
import { useAddConsultingSessions, useMeta } from '@/api/queries';
import type { ConsSessionCreate, ConsSessionsResult, ConsultingDetail } from '@/api/types';
import { hhmm, parseHm, unavailableLines } from '@/lib/calendar';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const md = (iso: string) => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;

export interface ConsultingSessionDialogProps {
  open: boolean;
  detail: ConsultingDetail;
  onClose: () => void;
  onDone?: (result: ConsSessionsResult) => void;
}

export function ConsultingSessionDialog({ open, detail, onClose, onDone }: ConsultingSessionDialogProps) {
  const id = useId();
  const meta = useMeta(open);
  const write = useAddConsultingSessions();
  const [dates, setDates] = useState<string[]>(['']);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [staffId, setStaffId] = useState('');
  const [mode, setMode] = useState<'offline' | 'online'>('offline');
  const [what, setWhat] = useState('');
  const [preview, setPreview] = useState<ConsSessionsResult | null>(null);
  const [previewOf, setPreviewOf] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDates(['']); setStart(''); setEnd(''); setStaffId(detail.ownerId ? String(detail.ownerId) : ''); setMode('offline'); setWhat('');
    setPreview(null); setPreviewOf(''); setErr(null);
  }, [open, detail.id, detail.ownerId]);

  const staff = meta.data?.staff ?? [];
  const build = (): { body: ConsSessionCreate } | { issue: string } => {
    const picked = dates.filter((d) => d !== '');
    if (!picked.length) return { issue: '날짜를 하나는 고르세요' };
    if (picked.some((d) => !ISO.test(d))) return { issue: '날짜를 넣어 주세요' };
    if (new Set(picked).size !== picked.length) return { issue: '같은 날짜가 두 번 있습니다' };
    if (!staffId) return { issue: '담당을 고르세요' };
    const startMin = start === '' ? null : parseHm(start);
    const endMin = end === '' ? null : parseHm(end);
    if ((start !== '' && startMin === null) || (end !== '' && endMin === null)) return { issue: '시각은 HH:MM 입니다' };
    if ((startMin === null) !== (endMin === null)) return { issue: '시작과 끝을 함께 적으세요' };
    if (startMin !== null && endMin !== null && endMin <= startMin) return { issue: '끝이 시작보다 뒤여야 합니다' };
    return {
      body: {
        dates: [...picked].sort(), staffId: Number(staffId), mode,
        ...(startMin !== null && endMin !== null ? { startMin, endMin } : {}),
        ...(what.trim() ? { what: what.trim() } : {}),
      },
    };
  };
  const built = build();
  const bodyKey = 'body' in built ? JSON.stringify(built.body) : '';
  const pending = write.isPending;
  const canPreview = 'body' in built && !pending;
  const canApply = canPreview && preview !== null && previewOf === bodyKey;

  const run = (kind: 'preview' | 'apply') => {
    if (!('body' in built)) return;
    const body = built.body;
    setErr(null);
    write.mutate({ consId: detail.id, kind, body }, {
      onSuccess: (r) => {
        if (kind === 'preview') { setPreview(r); setPreviewOf(JSON.stringify(body)); }
        else { onDone?.(r); onClose(); }
      },
      onError: (e) => { setPreview(null); setErr(apiMessage(e)); },
    });
  };

  const setDate = (i: number, v: string) => setDates((ds) => ds.map((d, j) => (j === i ? v : d)));
  const removeDate = (i: number) => setDates((ds) => (ds.length === 1 ? [''] : ds.filter((_, j) => j !== i)));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`회차 기록 — ${detail.studentNames.join(' · ') || '학생 미정'}`}
      width={640}
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>취소 (Esc)</Button>
          <Button type="button" variant="secondary" onClick={() => run('preview')} disabled={!canPreview}>{pending ? '서버에 묻는 중…' : '미리 보기'}</Button>
          <Button type="button" onClick={() => run('apply')} disabled={!canApply} title={!canApply ? '지금 입력 그대로 먼저 미리 봅니다' : undefined}>회차 확정</Button>
        </>
      )}
    >
      <p className="mb-3 text-[12px] text-fg-subtle">
        날짜마다 회차 한 줄 · 담당의 할 일 · 시간표 회차가 선다. 그날 담당의 컨설팅 회차가 시간표에 이미 있으면 그 회차에 연결하고, 없으면 적은 시각으로 하루짜리 회차를 만든다.
        약정 {detail.sessions ?? '—'}회 · 지금까지 {detail.sessionsDone}회{detail.sessionsPlanned ? ` · 잡힌 날짜 ${detail.sessionsPlanned}` : ''}.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>날짜 {dates.filter((d) => d !== '').length ? `· ${dates.filter((d) => d !== '').length}개` : ''}</Label>
          <ul className="space-y-1.5">
            {dates.map((d, i) => (
              <li key={i} className="flex items-center gap-2">
                <Input type="date" aria-label={`날짜 ${i + 1}`} value={d} onChange={(e) => setDate(i, e.target.value)} className="max-w-[200px]" />
                <Button type="button" size="sm" variant="ghost" onClick={() => removeDate(i)} aria-label={`날짜 ${i + 1} 빼기`}>빼기</Button>
              </li>
            ))}
          </ul>
          <Button type="button" size="sm" variant="secondary" className="mt-1.5" onClick={() => setDates((ds) => [...ds, ''])} disabled={dates.length >= 31}>+ 날짜 더하기</Button>
        </div>
        <div>
          <Label htmlFor={`${id}-start`} hint="시간표에 없는 날짜만 쓴다">시작</Label>
          <Input id={`${id}-start`} value={start} onChange={(e) => setStart(e.target.value)} placeholder="17:00" />
        </div>
        <div>
          <Label htmlFor={`${id}-end`}>끝</Label>
          <Input id={`${id}-end`} value={end} onChange={(e) => setEnd(e.target.value)} placeholder="18:00" />
        </div>
        <div>
          <Label htmlFor={`${id}-staff`}>담당</Label>
          <Select id={`${id}-staff`} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">고르세요</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <div>
          <Label>방식</Label>
          <Segmented ariaLabel="방식" value={mode} onChange={setMode} options={[{ value: 'offline', label: '현장' }, { value: 'online', label: '온라인' }]} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor={`${id}-what`} hint="회차마다 다르면 잡은 뒤 따로 적는다">무엇을 (선택)</Label>
          <Input id={`${id}-what`} value={what} onChange={(e) => setWhat(e.target.value)} maxLength={500} placeholder="공통 에세이 초안 점검" />
        </div>
      </div>

      {'issue' in built ? <p className="mt-2 text-[11px] text-fg-subtle">{built.issue}</p> : null}
      {err ? <Banner tone="danger" className="mt-3">{err}</Banner> : null}

      {preview ? (
        <div className="mt-3 rounded-lg border border-line bg-inset p-3" aria-label="회차 미리보기">
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="font-bold">{preview.staffName} · {preview.studentNames.join(' · ')}</span>
            <Chip tone="info" size="compact">새 회차 {preview.created}</Chip>
            <Chip tone="neutral" size="compact">연결 {preview.linked}</Chip>
            <Chip tone={preview.overContract ? 'warning' : 'neutral'} size="compact">회차 {preview.sessionsDone} / 약정 {preview.sessions ?? '—'}{preview.sessionsPlanned ? ` · 잡힌 날짜 ${preview.sessionsPlanned}` : ''}</Chip>
          </div>
          <ol className="mt-2 space-y-1 text-[12px]">
            {preview.rows.map((r) => (
              <li key={r.date} className="flex flex-wrap items-center gap-1.5">
                <span className="font-bold">{r.seq}회차</span>
                <span>{md(r.date)} {hhmm(r.startMin)}–{hhmm(r.endMin)}</span>
                <Chip tone={r.linked ? 'neutral' : 'info'} size="compact">{r.linked ? '시간표 회차에 연결' : '새 회차'}</Chip>
                {!r.done ? <Chip tone="warning" size="compact">앞으로</Chip> : null}
              </li>
            ))}
          </ol>
          {preview.overContract ? <p className="mt-2 text-[11px] text-amber">약정 회차를 넘깁니다 — 막지는 않습니다.</p> : null}
          {preview.unavailable.length ? <Banner tone="warning" className="mt-2">{unavailableLines(preview.unavailable).join(' · ')}</Banner> : null}
          {preview.notified ? <p className="mt-2 text-[11px] text-fg-subtle">담당에게 알림이 갑니다.</p> : null}
        </div>
      ) : null}
    </Dialog>
  );
}
