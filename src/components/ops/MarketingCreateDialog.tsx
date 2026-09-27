/** @file-guide
 * 목적: MarketingCreateDialog.tsx — MarketingCreateButton (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §59 「+ 오늘 한 것」 — 마케팅 활동 한 줄 · URL 첨부 (x5 · g6 59-3).
 *
 * 화면이 보내는 것은 **무엇을 · 메모 한 줄 · 어디에 · 어떤 항목 · URL · 날짜 · 담당**뿐이다(`MarketingCreateDto`).
 * 채널·항목의 낱말은 `GET /ops` 의 `mktChannels`·`mktItems` 다 (D-R18) — 원문 컷의 넷 · 넷(W11 · N-29 ①)이고 채널과 항목은 따로 고른다.
 * 날짜는 비우면 서버가 **오늘**로, 담당은 비우면 **나**로 정한다 — 화면이 그 기본값을 다시 적지 않는다.
 * 틀린 주소·그만둔 담당은 서버가 막고 그 문장을 그대로 띄운다(§63 「+ 회의 잡기」와 같은 모양).
 * 메모는 카드 제목 아래 한 줄이다(N-29 ② · 원문 「상담 예약 4건 전환」). 성과(노출·문의·등록·비용)는 받지 않는다.
 */
'use client';
import { useEffect, useId, useMemo, useState } from 'react';
import { Banner, Button, Dialog, Input, Label, Select } from '../ui';
import { apiMessage } from '@/api/client';
import { useCreateMarketing, useMeta } from '@/api/queries';
import type { CplWord } from '@/api/types';
import type { components } from '@/api/schema';

type MarketingCreate = components['schemas']['MarketingCreateDto'];
type MarketingRow = components['schemas']['MarketingDto'];

export interface MarketingCreateButtonProps {
  /** 채널 · 항목 — 원문 컷의 넷 · 넷 · 낱말은 서버가 만든다 (D-R18 · N-29 ①) */
  channels: CplWord[];
  items: CplWord[];
  /** 단추가 서는지도 서버가 정한다 (D-R39) */
  can: boolean;
  onDone?: (row: MarketingRow) => void;
}

export function MarketingCreateButton({ channels, items, can, onDone }: MarketingCreateButtonProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const meta = useMeta(open);
  const write = useCreateMarketing();
  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [channel, setChannel] = useState('');
  const [item, setItem] = useState('');
  const [url, setUrl] = useState('');
  const [onDate, setOnDate] = useState('');
  const [byId, setById] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(''); setMemo(''); setChannel(''); setItem(''); setUrl(''); setOnDate(''); setById(''); setErr(null);
  }, [open]);

  const built = useMemo((): { body: MarketingCreate } | { issue: string } => {
    if (!title.trim()) return { issue: '무엇을 했는지 적어 주세요' };
    if (!channel) return { issue: '어디에 올렸는지 고르세요' };
    if (!item) return { issue: '항목을 고르세요' };
    return {
      body: {
        title: title.trim(),
        // 고를 수 있는 값은 서버가 준 목록뿐이다 — 생성 타입의 enum 으로 좁힌다(모르는 값은 서버가 400)
        channel: channel as MarketingCreate['channel'], item: item as MarketingCreate['item'],
        ...(memo.trim() ? { memo: memo.trim() } : {}),
        ...(url.trim() ? { url: url.trim() } : {}),
        ...(onDate ? { onDate } : {}),
        ...(byId ? { byId: Number(byId) } : {}),
      },
    };
  }, [title, memo, channel, item, url, onDate, byId]);

  const pending = write.isPending;
  const canSubmit = 'body' in built && !pending;
  const submit = () => {
    if (!('body' in built) || pending) return;
    setErr(null);
    write.mutate(built.body, {
      onSuccess: (row) => { setOpen(false); onDone?.(row); },
      onError: (e) => setErr(apiMessage(e)),
    });
  };

  if (!can) return null;
  return (
    <>
      {/* 원문 §59 오른쪽 위 갈색 주 단추 (C-7) */}
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>+ 오늘 한 것</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="오늘 한 것"
        width={560}
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>취소 (Esc)</Button>
            <Button type="button" variant="primary" onClick={submit} disabled={!canSubmit}>{pending ? '적는 중…' : '적기'}</Button>
          </>
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor={`${id}-title`}>무엇을</Label>
            <Input id={`${id}-title`} value={title} maxLength={120} disabled={pending}
              onChange={(e) => setTitle(e.target.value)} placeholder="학습실 하루 · 30초 릴스" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor={`${id}-memo`} hint="카드 제목 아래 한 줄 — 비워도 됩니다">메모</Label>
            <Input id={`${id}-memo`} value={memo} maxLength={120} disabled={pending}
              onChange={(e) => setMemo(e.target.value)} placeholder="상담 예약 4건 전환" />
          </div>
          <div>
            <Label htmlFor={`${id}-channel`}>어디에</Label>
            <Select id={`${id}-channel`} value={channel} disabled={pending} onChange={(e) => setChannel(e.target.value)}>
              <option value="">고르세요</option>
              {channels.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor={`${id}-item`}>항목</Label>
            <Select id={`${id}-item`} value={item} disabled={pending} onChange={(e) => setItem(e.target.value)}>
              <option value="">고르세요</option>
              {items.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor={`${id}-url`} hint="올린 글·광고의 주소 — 비워도 됩니다">URL</Label>
            <Input id={`${id}-url`} value={url} maxLength={2000} disabled={pending}
              onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
          </div>
          <div>
            <Label htmlFor={`${id}-date`} hint="비우면 오늘">날짜</Label>
            <Input id={`${id}-date`} type="date" value={onDate} disabled={pending} onChange={(e) => setOnDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor={`${id}-by`} hint="대표 코멘트에 답하는 사람">담당</Label>
            <Select id={`${id}-by`} value={byId} disabled={pending} onChange={(e) => setById(e.target.value)}>
              <option value="">나</option>
              {(meta.data?.staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
        </div>
        {'issue' in built ? <p className="mt-2 text-[11px] text-fg-subtle">{built.issue}</p> : null}
        {err ? <Banner tone="danger" className="mt-3">{err}</Banner> : null}
      </Dialog>
    </>
  );
}
