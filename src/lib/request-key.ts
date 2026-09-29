/** @file-guide
 * 목적: request-key.ts — 한 번의 「보내기」에 붙는 요청 키(useRequestKey · lib)
 * 책임/재사용: 입금 기록 · 청구서 없는 입금 · 컨설팅 수납이 같은 규약을 쓴다. 판정(같은 키 · 같은 내용이면 수렴)은 서버가 한다 — 화면은 키를 고르기만 한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { useMemo, useRef } from 'react';

/**
 * 안건 N-132 — 같은 부분 입금을 두 번 보내면(끊긴 응답의 재시도 · 더블클릭 · 두 창) 두 줄이 되던 것을 막는다.
 *
 * - **같은 내용이면 같은 키** — 실패 뒤 다시 누르거나 두 번 눌러도 서버가 앞선 줄로 수렴한다(보호자 발송 · 리포트 발송과 같은 규약).
 * - **내용을 고치면 새 키** — 다른 입금을 앞선 키에 묶지 않는다(같은 키 · 다른 내용은 서버가 409 로 막는다).
 * - **성공하면 `reset`** — 다음 보내기는 새 입금이다. 같은 금액을 한 번 더 받는 일은 막지 않는다.
 *
 * 내용 비교는 보내는 본문 그대로다 — 부르는 쪽이 같은 모양의 객체를 넘긴다.
 */
export function useRequestKey(): { keyFor: (body: unknown) => string; reset: () => void } {
  const ref = useRef<{ key: string; sig: string } | null>(null);
  return useMemo(() => ({
    keyFor(body: unknown): string {
      const sig = JSON.stringify(body);
      if (ref.current?.sig !== sig) ref.current = { key: crypto.randomUUID(), sig };
      return ref.current.key;
    },
    reset(): void { ref.current = null; },
  }), []);
}
