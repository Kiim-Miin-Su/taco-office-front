/** @file-guide
 * 목적: MarketingCreateDialog.tsx — MarketingCreateButton, MarketingEditDialog (component)
 * 책임/재사용: 등록·수정이 같은 MarketingEditorDialog 입력을 사용한다. 서버 업무 판정과 목록 갱신은 API/query가 소유한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §59 마케팅 활동 등록·수정. 채널·항목 낱말은 GET /ops, 담당 후보는 GET /meta가 정본이다.
 * 등록과 수정은 같은 입력 컴포넌트를 사용하며, 수정은 달라진 칸만 PATCH한다.
 */
'use client';
import { useEffect, useId, useState } from 'react';
import { Banner, Button, Dialog, Input, Label, Select } from '../ui';
import { apiMessage } from '@/api/client';
import { useCreateMarketing, useMeta, usePatchMarketing } from '@/api/queries';
import type { CplWord, Marketing, MarketingCreate, MarketingPatch } from '@/api/types';

type Draft = {
  title: string; memo: string; channel: string; item: string;
  url: string; onDate: string; byId: string;
};

const emptyDraft = (): Draft => ({ title: '', memo: '', channel: '', item: '', url: '', onDate: '', byId: '' });
const draftOf = (row?: Marketing | null): Draft => row ? ({
  title: row.title ?? row.name, memo: row.memo ?? '', channel: row.channel, item: row.item,
  url: row.url ?? '', onDate: row.onDate ?? '', byId: row.byId == null ? '' : String(row.byId),
}) : emptyDraft();

function MarketingEditorDialog({ open, title, submitLabel, channels, items, initial, pending, error, onClose, onSubmit }: {
  open: boolean; title: string; submitLabel: string; channels: CplWord[]; items: CplWord[];
  initial?: Marketing | null; pending: boolean; error: string | null; onClose: () => void; onSubmit: (draft: Draft) => void;
}) {
  const id = useId();
  const meta = useMeta(open);
  const [draft, setDraft] = useState<Draft>(() => draftOf(initial));
  useEffect(() => { if (open) setDraft(draftOf(initial)); }, [open, initial?.id]);
  const issue = !draft.title.trim() ? '무엇을 했는지 적어 주세요'
    : !draft.channel ? '어디에 올렸는지 고르세요'
      : !draft.item ? '항목을 고르세요' : null;
  const set = (key: keyof Draft, value: string) => setDraft((prev) => ({ ...prev, [key]: value }));
  const legacyChannel = initial && !channels.some((c) => c.key === initial.channel) ? initial : null;
  const legacyItem = initial && !items.some((c) => c.key === initial.item) ? initial : null;
  return (
    <Dialog open={open} onClose={onClose} title={title} width={560} footer={(
      <>
        <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>취소 (Esc)</Button>
        <Button type="button" variant="primary" onClick={() => !issue && onSubmit(draft)} disabled={!!issue || pending}>
          {pending ? '저장 중…' : submitLabel}
        </Button>
      </>
    )}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor={`${id}-title`}>무엇을</Label>
          <Input id={`${id}-title`} value={draft.title} maxLength={120} disabled={pending}
            onChange={(e) => set('title', e.target.value)} placeholder="학습실 하루 · 30초 릴스" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor={`${id}-memo`} hint="카드 제목 아래 한 줄 — 비워도 됩니다">메모</Label>
          <Input id={`${id}-memo`} value={draft.memo} maxLength={120} disabled={pending}
            onChange={(e) => set('memo', e.target.value)} placeholder="상담 예약 4건 전환" />
        </div>
        <div>
          <Label htmlFor={`${id}-channel`}>어디에</Label>
          <Select id={`${id}-channel`} value={draft.channel} disabled={pending} onChange={(e) => set('channel', e.target.value)}>
            <option value="">고르세요</option>
            {legacyChannel ? <option value={legacyChannel.channel}>{legacyChannel.channelLabel} (옛 값)</option> : null}
            {channels.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor={`${id}-item`}>항목</Label>
          <Select id={`${id}-item`} value={draft.item} disabled={pending} onChange={(e) => set('item', e.target.value)}>
            <option value="">고르세요</option>
            {legacyItem ? <option value={legacyItem.item}>{legacyItem.itemLabel} (옛 값)</option> : null}
            {items.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor={`${id}-url`} hint="올린 글·광고의 주소 — 비워도 됩니다">URL</Label>
          <Input id={`${id}-url`} value={draft.url} maxLength={2000} disabled={pending}
            onChange={(e) => set('url', e.target.value)} placeholder="https://" />
        </div>
        <div>
          <Label htmlFor={`${id}-date`} hint={initial ? '비우면 날짜 없음' : '비우면 오늘'}>날짜</Label>
          <Input id={`${id}-date`} type="date" value={draft.onDate} disabled={pending} onChange={(e) => set('onDate', e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`${id}-by`} hint="대표 코멘트에 답하는 사람">담당</Label>
          <Select id={`${id}-by`} value={draft.byId} disabled={pending} onChange={(e) => set('byId', e.target.value)}>
            <option value="">{initial ? '담당 없음' : '나'}</option>
            {(meta.data?.staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
      </div>
      {issue ? <p className="mt-2 text-[11px] text-fg-subtle">{issue}</p> : null}
      {error ? <Banner tone="danger" className="mt-3">{error}</Banner> : null}
    </Dialog>
  );
}

export interface MarketingCreateButtonProps {
  channels: CplWord[]; items: CplWord[]; can: boolean; onDone?: (row: Marketing) => void;
}

export function MarketingCreateButton({ channels, items, can, onDone }: MarketingCreateButtonProps) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const write = useCreateMarketing();
  if (!can) return null;
  return <>
    <Button type="button" variant="primary" onClick={() => { setErr(null); setOpen(true); }}>+ 오늘 한 것</Button>
    <MarketingEditorDialog open={open} onClose={() => setOpen(false)} title="오늘 한 것" submitLabel="적기"
      channels={channels} items={items} pending={write.isPending} error={err}
      onSubmit={(draft) => {
        const body: MarketingCreate = {
          title: draft.title.trim(), channel: draft.channel as MarketingCreate['channel'], item: draft.item as MarketingCreate['item'],
          ...(draft.memo.trim() ? { memo: draft.memo.trim() } : {}), ...(draft.url.trim() ? { url: draft.url.trim() } : {}),
          ...(draft.onDate ? { onDate: draft.onDate } : {}), ...(draft.byId ? { byId: Number(draft.byId) } : {}),
        };
        setErr(null);
        write.mutate(body, { onSuccess: (row) => { setOpen(false); onDone?.(row); }, onError: (e) => setErr(apiMessage(e)) });
      }} />
  </>;
}

export function MarketingEditDialog({ row, channels, items, onClose, onDone }: {
  row: Marketing | null; channels: CplWord[]; items: CplWord[]; onClose: () => void; onDone?: (row: Marketing) => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const write = usePatchMarketing();
  // 같은 편집 세션에서 목록이 재조회돼도 비교 기준을 바꾸지 않는다. 기준만 새 행으로 바뀌면
  // 사용자가 건드리지 않은 옛 초안이 다른 사람의 최신 수정을 되돌려 보내게 된다.
  const [original, setOriginal] = useState<Draft>(() => draftOf(row));
  useEffect(() => { setOriginal(draftOf(row)); }, [row?.id]);
  useEffect(() => { setErr(null); }, [row?.id]);
  return <MarketingEditorDialog open={row !== null} onClose={onClose} title="마케팅 활동 수정" submitLabel="저장"
    channels={channels} items={items} initial={row} pending={write.isPending} error={err}
    onSubmit={(draft) => {
      if (!row) return;
      const body: MarketingPatch = {};
      if (draft.title.trim() !== original.title) body.title = draft.title.trim();
      if (draft.channel !== original.channel) body.channel = draft.channel as MarketingCreate['channel'];
      if (draft.item !== original.item) body.item = draft.item as MarketingCreate['item'];
      if (draft.url.trim() !== original.url) body.url = draft.url.trim() || null;
      if (draft.onDate !== original.onDate) body.onDate = draft.onDate || null;
      if (draft.byId !== original.byId) body.byId = draft.byId ? Number(draft.byId) : null;
      if (draft.memo.trim() !== original.memo) body.memo = draft.memo.trim() || null;
      if (!Object.keys(body).length) { onClose(); return; }
      setErr(null);
      write.mutate({ id: row.id, ...body }, { onSuccess: (saved) => { onClose(); onDone?.(saved); }, onError: (e) => setErr(apiMessage(e)) });
    }} />;
}
