/** @file-guide
 * 목적: TeacherSettingRequest.tsx — SettingKind, SettingRequestForm, SettingRequestList, MySettingsPanel (component)
 * 책임/재사용: 강사 시간대 · 기본 시급 변경 요청 칸(바라는 값 + 사유 → POST /teacher/requests)과 최근 요청 목록을 한 벌로 소유한다. 홈 「내 설정」 패널과 마이 페이지 대화상자가 같은 부품을 쓴다. 승인 · 「한 달에 한 번」 판정은 서버 플래그만 읽는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 강사 덱 §8 우측 레일 「내 설정」과 강사 PPTX p98 · p136 마이 페이지의 [변경 요청] · [변경 신청]은 **같은 요청**이다.
 * 전에는 홈 화면(app/teacher/page.tsx)에만 있었다 — 마이 페이지가 같은 칸을 다시 적지 않게 여기로 옮겼다(AUTH-SELF-01 · S3).
 * 요청 쓰기 훅(useCreateSettingRequest)은 부르는 쪽이 하나 들고 내려 준다 — 보내는 동안 바깥 단추도 함께 잠근다.
 */
'use client';
import { useId, useState } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import { apiMessage } from '@/api/client';
import { useCreateSettingRequest } from '@/api/queries';
import type { TeacherSettingReqCreate, TeacherSettingRequest, TeacherSettings } from '@/api/types';
import { Banner, Button, Chip, Input, Label, Panel, Select, type Tone } from '@/components/ui';
import { won } from '@/lib/money';

export type SettingKind = 'wage' | 'tz';
export type SettingAsk = UseMutationResult<TeacherSettingRequest, unknown, TeacherSettingReqCreate>;

const REQ_STATE: Record<string, { label: string; tone: Tone }> = {
  pending: { label: '승인 대기', tone: 'info' },
  approved: { label: '승인', tone: 'success' },
  rejected: { label: '반려', tone: 'danger' },
};

/** 바라는 시급 · 시간대 + 사유 → 「요청 올리기」. 열 때마다 새로 선다(초안은 이 칸이 소유하고 닫으면 버린다) */
export function SettingRequestForm({ s, kind, ask, onClose }: {
  s: TeacherSettings;
  kind: SettingKind;
  ask: SettingAsk;
  /** 취소 · 올리기 성공 — 부르는 쪽이 칸을 닫고 ask.reset() 한다 */
  onClose: () => void;
}) {
  const id = useId();
  const [rate, setRate] = useState('');
  const [tz, setTz] = useState('');
  const [reason, setReason] = useState('');
  const why = reason.trim() ? { reason: reason.trim() } : {};

  const submit = () => {
    if (kind === 'wage') {
      const n = Number(rate);
      if (!Number.isInteger(n) || n <= 0) {
        return;
      }
      ask.mutate({ reqType: 'wage_change', rate: n, ...why }, { onSuccess: onClose });
    } else if (tz) {
      ask.mutate({ reqType: 'tz_change', timezone: tz, ...why }, { onSuccess: onClose });
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-line bg-inset p-3">
      {kind === 'wage' ? (
        <span>
          <Label htmlFor={`${id}-rate`} hint="원/시간">바라는 시급</Label>
          <Input id={`${id}-rate`} type="number" min={1} inputMode="numeric" value={rate}
            placeholder={s.wageRate === null || s.wageRate === undefined ? '' : String(s.wageRate)}
            onChange={(e) => setRate(e.target.value)} />
        </span>
      ) : (
        <span>
          <Label htmlFor={`${id}-tz`}>바라는 시간대</Label>
          <Select id={`${id}-tz`} value={tz} onChange={(e) => setTz(e.target.value)}>
            <option value="">선택</option>
            {s.timezones.filter((t) => t.tz !== s.timezone).map((t) => (
              <option key={t.tz} value={t.tz}>{t.name} · {t.tz}</option>
            ))}
          </Select>
        </span>
      )}
      <span>
        <Label htmlFor={`${id}-reason`} hint="선택">사유</Label>
        <Input id={`${id}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="한 줄로 적어 주세요" />
      </span>
      <span className="flex gap-2">
        <Button variant="primary" disabled={ask.isPending || (kind === 'wage' ? rate === '' : tz === '')} onClick={submit}>
          {ask.isPending ? '올리는 중…' : '요청 올리기'}
        </Button>
        <Button onClick={onClose}>취소</Button>
      </span>
      {ask.isError ? <Banner tone="danger">{apiMessage(ask.error)}</Banner> : null}
    </div>
  );
}

/** 최근 내 설정 요청 — 상태 칩 · 무엇을 바랐는지 · 올린 날, 반려 사유는 서버 문장 그대로 */
export function SettingRequestList({ requests }: { requests: TeacherSettings['requests'] }) {
  if (requests.length === 0) {
    return null;
  }
  const rejected = requests.find((r) => r.state === 'rejected' && r.rejectReason);
  return (
    <ol className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
      {requests.map((r) => (
        <li key={r.id} className="flex items-center gap-2 text-[12px]">
          <Chip size="compact" tone={REQ_STATE[r.state]?.tone ?? 'neutral'}>{REQ_STATE[r.state]?.label ?? r.state}</Chip>
          <span className="min-w-0 grow truncate text-fg">{r.label} {r.asked ? `→ ${r.asked}` : ''}</span>
          <span className="shrink-0 text-fg-subtle">{r.createdOn.slice(5)}</span>
        </li>
      ))}
      {rejected ? <li className="text-[12px] text-red">반려 사유 — {rejected.rejectReason}</li> : null}
    </ol>
  );
}

/**
 * 홈 우측 레일 「내 설정」 — 시간대 / 기본 시급, **각각 변경 요청 버튼**.
 * 원문 그대로 「관리자 승인 후 적용」이고 시급은 **한 달에 한 번**이다 — 두 판정 다 서버가 한다.
 */
export function MySettingsPanel({ s, initialOpen = null }: { s: TeacherSettings; initialOpen?: SettingKind | null }) {
  const ask = useCreateSettingRequest();
  const [open, setOpen] = useState<SettingKind | null>(
    initialOpen === 'wage' && !s.canAskWage ? null : initialOpen === 'tz' && !s.canAskTz ? null : initialOpen,
  );
  const close = () => { setOpen(null); ask.reset(); };

  return (
    <Panel title="내 설정" sub="관리자 승인 후 적용 · 시급은 한 달에 한 번 신청할 수 있습니다">
      <dl className="text-[13px]">
        <dt className="text-fg-subtle">시간대</dt>
        <dd className="mb-2 flex items-center justify-between font-bold text-fg">
          {s.timezone === 'Asia/Seoul' ? 'Seoul UTC+9' : s.timezone}
          <Button
            size="sm"
            disabled={!s.canAskTz || ask.isPending}
            title={s.canAskTz ? undefined : '올린 요청이 처리 중입니다'}
            onClick={() => setOpen(open === 'tz' ? null : 'tz')}
          >
            변경 요청
          </Button>
        </dd>
        <dt className="text-fg-subtle">기본 시급 · 나만 볼 수 있습니다</dt>
        <dd className="flex items-center justify-between font-bold text-fg">
          {s.wageRate === null || s.wageRate === undefined ? '—' : `${won(s.wageRate)}/시간`}
          <Button
            size="sm"
            disabled={!s.canAskWage || ask.isPending}
            title={s.canAskWage ? undefined : `${s.wageAskableOn}부터 다시 신청할 수 있습니다`}
            onClick={() => setOpen(open === 'wage' ? null : 'wage')}
          >
            변경 신청
          </Button>
        </dd>
        {s.wageFrom ? <dd className="mt-1 text-[12px] text-fg-subtle">{s.wageFrom} 적용</dd> : null}
        {!s.canAskWage && s.wageAskableOn ? (
          <dd className="mt-1 text-[12px] text-fg-subtle">시급은 한 달에 한 번 — {s.wageAskableOn}부터 다시 됩니다</dd>
        ) : null}
      </dl>
      {/* 갈래가 바뀌면 칸을 새로 세운다 — 시간대 초안이 시급 칸에 남지 않게(key) */}
      {open ? <SettingRequestForm key={open} s={s} kind={open} ask={ask} onClose={close} /> : null}
      <SettingRequestList requests={s.requests} />
    </Panel>
  );
}
