/** @file-guide
 * 목적: KakaoCopyText.tsx — 서버가 만든 안내문을 카카오톡 대화창에 붙일 글로 한 번에 복사한다 (테스트 시나리오 I-95).
 * 책임/재사용: 글은 받은 그대로 복사한다(화면이 다시 짓지 않는다). 카카오 발송 채널이 아니다 — 발송은 이메일 · SENS(N-42 · DQ3).
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useState } from 'react';
import { Button } from '../ui';

/**
 * I-95 「카카오로 보낼 수 있는 문구」 — 담당이 카카오톡으로 직접 보낼 때 쓰는 복사 단추.
 * 보낸 척하지 않는다 — 누르면 클립보드에 글만 들어가고, 발송 기록(PNOTI.sent_at)은 바뀌지 않는다.
 */
export function KakaoCopyText({ text, className }: { text: string; className?: string }) {
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setSaid({ ok: true, text: '복사했습니다 — 카카오톡 대화창에 붙여 넣으세요' });
    } catch {
      setSaid({ ok: false, text: '복사하지 못했습니다 — 브라우저 권한을 확인하거나 글을 직접 골라 복사하세요' });
    }
  };
  return (
    <div role="group" aria-label="카카오톡 문구" className={className ?? 'mt-2 flex flex-wrap items-center gap-2'}>
      <Button type="button" size="sm" variant="secondary" onClick={() => void copy()}>카카오톡 문구 복사</Button>
      <span className="text-[11px] text-fg-subtle">카카오톡으로는 보내지 않습니다 — 글만 복사합니다</span>
      {said ? <span role="status" className={`text-[11px] ${said.ok ? 'text-green' : 'text-red'}`}>{said.text}</span> : null}
    </div>
  );
}
