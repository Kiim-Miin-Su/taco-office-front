/** @file-guide
 * 목적: CodeRequest.tsx — CodeChannel, useResendCountdown, CodeRequestButton (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 인증 코드 받기 줄 — 첫 설정(W8)과 비밀번호 찾기(N-101 · 대표 결정 2026-09-26)가 같이 쓴다.
 *
 * 단추 낱말(「메일로 코드 받기」)과 못 보내는 까닭은 서버 채널 표 그대로, 다시 받기 초읽기는 서버가 준 초로 센다.
 * 거절 문장은 **누른 단추 바로 아래**에 선다 — 폼 맨 아래 띠 하나만 두면 393px 휴대폰에서 화면 밖이라
 * 아무 일도 없던 것처럼 보인다(QA 0926 UX-1). 코드 · 받는 곳의 판정은 서버가 한다.
 */
'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Button } from '../ui';
import type { OnboardingChannel } from '@/api/types';

export type CodeChannel = OnboardingChannel['channel'];

/** 채널별 다시 받기 초읽기 — 초읽기가 남아 있을 때만 1초마다 다시 그린다(다 끝나면 타이머를 두지 않는다) */
export function useResendCountdown() {
  const [resendAt, setResendAt] = useState<Partial<Record<CodeChannel, number>>>({});
  const [now, setNow] = useState(() => Date.now());
  const counting = Object.values(resendAt).some((at) => (at ?? 0) > now);
  useEffect(() => {
    if (!counting) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [counting]);
  /** 서버가 준 resendAfterSeconds 로 그 채널의 초읽기를 건다 */
  const start = useCallback((channel: CodeChannel, seconds: number) => {
    const at = Date.now();
    setNow(at);
    setResendAt((prev) => ({ ...prev, [channel]: at + seconds * 1_000 }));
  }, []);
  /** 그 채널을 다시 받기까지 남은 초 — 0 이면 받을 수 있다 */
  const left = (channel: CodeChannel) => Math.max(0, Math.ceil(((resendAt[channel] ?? 0) - now) / 1_000));
  return { start, left };
}

export function CodeRequestButton({ spec, left, busy, disabled, onSend, error, note, devCode }: {
  /** 서버 채널 표의 그 줄 — 이름 · 준비 여부 · 못 보내는 까닭 */
  spec: OnboardingChannel | undefined;
  /** 다시 받기까지 남은 초 */
  left: number;
  /** 이 채널을 보내는 중인가 */
  busy: boolean;
  /** 받을 곳이 없거나 다른 일이 진행 중일 때 */
  disabled: boolean;
  onSend: () => void;
  /** 이 채널을 눌렀을 때의 서버 거절 문장 */
  error?: string | null;
  /** 보낸 뒤 안내 — 첫 설정은 가린 받는 곳, 비밀번호 찾기는 서버 문장 */
  note?: ReactNode;
  /** 서버가 개발용 되돌려 주기를 켰을 때만 온다(운영 응답에는 없다) */
  devCode?: string;
}) {
  const label = left > 0 ? `다시 받기 (${left}초)` : `${spec?.label ?? ''}로 코드 받기`;
  return (
    <div className="mt-2">
      <Button size="sm" className="w-full sm:w-auto" disabled={!spec?.ready || left > 0 || disabled} onClick={onSend}>
        {busy ? '보내는 중…' : label}
      </Button>
      {error ? <p role="alert" className="mt-1 text-[12px] font-bold text-red">{error}</p> : null}
      {spec && !spec.ready && spec.notReadyReason ? (
        <p className="mt-1 text-[11px] font-bold text-red">{spec.notReadyReason}</p>
      ) : null}
      {note ? <p className="mt-1 text-[11px] text-fg-subtle">{note}</p> : null}
      {devCode ? <p className="mt-1 text-[11px] font-bold text-fg">개발용 코드: {devCode}</p> : null}
    </div>
  );
}
