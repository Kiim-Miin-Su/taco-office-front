/** @file-guide
 * 목적: GuardianSendDialog.tsx — GuardianSendDialog (component)
 * 책임/재사용: 보호자 선택 발송 창(보호자 체크 · 채널 칩 · 내용 · 보호자×채널 결과)을 공용 ui와 queries 훅으로 그린다. 발송 판정·결과 낱말은 서버가 한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 보호자 선택 발송 — DQ3 대표 답변 (2026-09-25): 「복수 보호자 + 선택 발송, 메일과 SENS 만」.
 *
 * 여는 쪽이 학생과 내용을 준다 — §43 회차 학부모 안내(`pnotiId` 와 그 본문) · §44 안내문 등.
 * 대표 보호자가 미리 체크되고, 채널 칩은 **서버 설정이 없으면 잠기고 까닭이 붙는다**(`GET /guardians/channels`).
 *
 * 결과는 서버 원장 그대로다 — 보호자×채널마다 「보냈습니다 / 보내지 못했습니다 / 설정 없음 — 보내지 않았습니다」.
 * 화면은 결과를 짓지 않는다: 보낸 척하지 않는 것은 서버가 지키고, 여기는 그 말을 옮긴다.
 *
 * 같은 「보내기」의 재시도(네트워크 끊김·더블클릭)는 **같은 요청 키**로 간다 — 서버가 두 번 보내지 않고 앞선
 * 결과를 돌려준다. 받는 사람·채널·내용을 바꾸면 새 키다.
 */
'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useGuardianChannels, useGuardians, useSendToGuardians } from '@/api/queries';
import { apiMessage } from '@/api/client';
import type { GuardianChannel, GuardianSendItem, GuardianSendResult } from '@/api/types';
import { Banner, Button, Checkbox, Chip, ChipButton, CountedTextarea, Dialog, Input, Label, type Tone } from '../ui';

type ChannelKey = GuardianChannel['channel'];

const STATUS_TONE: Record<GuardianSendItem['status'], Tone> = {
  sent: 'success',
  failed: 'danger',
  not_configured: 'warning',
};

function newKey(): string {
  return crypto.randomUUID();
}

function Results({ result }: { result: GuardianSendResult }) {
  return (
    <section aria-label="보낸 결과" className="flex flex-col gap-2">
      <Banner tone={result.counts.sent > 0 ? 'success' : 'warning'}>
        <p role="status">{result.summary}</p>
      </Banner>
      <ul className="flex flex-col gap-1.5">
        {result.items.map((item) => (
          <li key={`${item.guardianId}-${item.channel}`} className="rounded-lg border border-line px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <b className="text-[12.5px] text-fg">{item.guardianName}</b>
              {item.relation ? <span className="text-[11px] text-fg-subtle">{item.relation}</span> : null}
              <Chip>{item.channelLabel}</Chip>
              <span className="text-[11.5px] text-fg-2">{item.toMasked}</span>
              <Chip className="ml-auto" tone={STATUS_TONE[item.status]}>{item.statusLabel}</Chip>
            </div>
            {item.error && item.status !== 'sent' ? <p className="mt-1 text-[11px] text-fg-subtle">{item.error}</p> : null}
          </li>
        ))}
        {result.skipped.map((s) => (
          <li key={`${s.guardianId}-${s.channel}-skip`} className="rounded-lg border border-dashed border-line px-3 py-2 text-[11.5px] text-fg-subtle">
            {s.guardianName} · {s.channelLabel} — {s.reason}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GuardianSendDialog({
  open, student, pnotiId = null, defaultBody, defaultSubject = '', title, onClose, onSent,
}: {
  open: boolean;
  student: { id: number; name: string };
  /** §43 회차 학부모 안내 줄 — 실제로 나간 것이 있으면 서버가 그 줄을 「보냄」으로 찍는다 */
  pnotiId?: number | null;
  /** 여는 쪽이 채워 주는 내용 — 창에서 고칠 수 있다 */
  defaultBody: string;
  defaultSubject?: string;
  title?: string;
  onClose: () => void;
  onSent?: (result: GuardianSendResult) => void;
}) {
  const id = useId();
  const guardiansQ = useGuardians(student.id, open);
  const channelsQ = useGuardianChannels(open);
  const send = useSendToGuardians();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [channels, setChannels] = useState<Set<ChannelKey>>(new Set());
  const [body, setBody] = useState(defaultBody);
  const [subject, setSubject] = useState(defaultSubject);
  const [result, setResult] = useState<GuardianSendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);
  const seeded = useRef(false);

  const active = (guardiansQ.data?.guardians ?? []).filter((g) => g.active);
  const channelRows = channelsQ.data?.channels ?? [];

  /* 처음 받은 목록으로 한 번만 미리 고른다 — 대표 보호자, 그리고 그 사람이 받는 채널 중 지금 보낼 수 있는 것 */
  useEffect(() => {
    if (seeded.current || !guardiansQ.data || !channelsQ.data) return;
    seeded.current = true;
    const primary = guardiansQ.data.guardians.filter((g) => g.active && g.isPrimary);
    setPicked(new Set(primary.map((g) => g.id)));
    const receives = new Set(primary.flatMap((g) => g.receives));
    setChannels(new Set(channelsQ.data.channels.filter((c) => c.ready && receives.has(c.channel)).map((c) => c.channel)));
  }, [guardiansQ.data, channelsQ.data]);

  /** 무엇을 보낼지가 바뀌면 새 요청이다 — 앞선 키를 버린다 */
  const touched = () => { keyRef.current = null; setError(null); };
  const toggleGuardian = (gid: number) => {
    touched();
    setPicked((prev) => { const next = new Set(prev); if (next.has(gid)) next.delete(gid); else next.add(gid); return next; });
  };
  const toggleChannel = (c: ChannelKey) => {
    touched();
    setChannels((prev) => { const next = new Set(prev); if (next.has(c)) next.delete(c); else next.add(c); return next; });
  };

  const chosen = active.filter((g) => picked.has(g.id));
  // 고른 채널을 하나도 받지 않는 보호자 — 서버가 거절하므로 먼저 알린다(판정 재료는 서버가 준 receives).
  // 채널을 **하나라도 고른 뒤에만** 따진다 — 보낼 수 있는 채널이 없어 아무것도 못 고른 상태에서 「고른 채널로 받지 않습니다」는
  // 틀린 말이고 따를 수도 없는 안내다(QA 0925 G3). 그 상태는 위의 「보낼 수 있는 채널이 없습니다」가 말한다.
  const mismatch = channels.size === 0 ? [] : chosen.filter((g) => !g.receives.some((c) => channels.has(c)));
  const readyChannels = channelRows.filter((c) => c.ready);
  const canSend = !send.isPending && result === null && chosen.length > 0 && channels.size > 0
    && mismatch.length === 0 && body.trim() !== '';

  const submit = () => {
    if (!canSend) return;
    keyRef.current ??= newKey();
    setError(null);
    send.mutate({
      studentId: student.id,
      pnotiId,
      guardianIds: chosen.map((g) => g.id),
      channels: channelRows.filter((c) => channels.has(c.channel)).map((c) => c.channel),
      subject: subject.trim() || null,
      body,
      requestKey: keyRef.current,
    }, {
      onSuccess: (r) => { setResult(r); onSent?.(r); },
      onError: (e) => setError(apiMessage(e)),
    });
  };

  const loading = guardiansQ.isPending || channelsQ.isPending;
  const loadError = guardiansQ.isError ? guardiansQ.error : channelsQ.isError ? channelsQ.error : null;

  return (
    <Dialog open={open} onClose={onClose} title={title ?? `보호자에게 보내기 — ${student.name}`} width={620}
      footer={result ? (
        <Button onClick={onClose}>닫기</Button>
      ) : (
        <>
          <Button variant="ghost" onClick={onClose} disabled={send.isPending}>취소</Button>
          <Button variant="primary" onClick={submit} disabled={!canSend}>{send.isPending ? '보내는 중…' : '보내기'}</Button>
        </>
      )}>
      {result ? <Results result={result} /> : (
        <div className="flex flex-col gap-3">
          {loading ? <p role="status" className="text-[12px] text-fg-subtle">보호자를 불러오는 중입니다.</p> : null}
          {loadError ? <Banner tone="danger">{apiMessage(loadError)}</Banner> : null}

          {!loading && !loadError ? (
            <>
              <fieldset>
                <legend className="mb-1 text-[11px] font-bold text-fg-subtle">받는 사람</legend>
                {active.length === 0 ? (
                  <Banner tone="warning">등록한 보호자가 없습니다. 학생 카드의 「보호자」에서 먼저 추가해 주세요.</Banner>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {active.map((g) => (
                      <li key={g.id} className="flex flex-wrap items-center gap-2">
                        <Checkbox label={`${g.name}${g.relation ? ` (${g.relation})` : ''}`} checked={picked.has(g.id)}
                          onChange={() => toggleGuardian(g.id)} />
                        {g.isPrimary ? <Chip tone="info">대표</Chip> : null}
                        {g.receives.map((c) => {
                          const label = channelRows.find((x) => x.channel === c)?.label;
                          return label ? <Chip key={c}>{label}</Chip> : null;
                        })}
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>

              <div>
                <div role="group" aria-label="보낼 채널" className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[11px] font-bold text-fg-subtle">보낼 채널</span>
                  {channelRows.map((c) => (
                    <ChipButton key={c.channel} pressed={channels.has(c.channel)} disabled={!c.ready}
                      title={c.reason ?? undefined} onClick={() => toggleChannel(c.channel)}>
                      {c.label}
                    </ChipButton>
                  ))}
                </div>
                {channelRows.filter((c) => !c.ready).map((c) => (
                  <p key={c.channel} className="mt-1 text-[11px] text-fg-subtle">{c.label} · {c.reason}</p>
                ))}
                {readyChannels.length === 0 && channelRows.length > 0 ? (
                  <Banner tone="warning" className="mt-2">지금은 보낼 수 있는 채널이 없습니다.</Banner>
                ) : null}
              </div>

              {mismatch.length > 0 ? (
                <Banner tone="warning">
                  {mismatch.map((g) => g.name).join(', ')} 님은 고른 채널로 받지 않습니다. 채널을 더 고르거나 체크를 풀어 주세요.
                </Banner>
              ) : null}

              {channels.has('email') ? (
                <div>
                  <Label htmlFor={`${id}-subject`} hint="비우면 학생 이름으로 제목을 붙입니다">메일 제목</Label>
                  <Input id={`${id}-subject`} value={subject} maxLength={120} onChange={(e) => { touched(); setSubject(e.target.value); }} />
                </div>
              ) : null}
              <div>
                <Label htmlFor={`${id}-body`}>보낼 내용</Label>
                <CountedTextarea id={`${id}-body`} value={body} max={2000} onChange={(v) => { touched(); setBody(v); }} />
              </div>
            </>
          ) : null}

          {error ? <Banner tone="danger"><p role="alert">{error}</p></Banner> : null}
        </div>
      )}
    </Dialog>
  );
}
