/** @file-guide
 * 목적: AcctPrivacySwitches.tsx — AcctPrivacySwitches (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 회계 탭 줄 오른쪽 「시급 비공개 · 컨설팅 비공개」 (N-94 · W11 M2 · 원문 §52~§57 컷 탭 줄 · 슬라이드 57 · 77).
 *
 * 켜고 끄는 사람은 **대표 판정**이다 — 단추가 눌리는지는 서버의 `canSet` 하나로 본다(D-R39 · 화면은 role 을 보지 않는다).
 * 켜면 그 **줄 금액**이 비공개 열람(`canHide`)이 없는 사람에게 가려지고 합계는 그대로다. **가리는 일은 서버가 한다** —
 * 이 단추는 스위치를 적을 뿐 화면이 금액을 지우지 않는다. 무엇이 가려지는지 한 문장(`scope`)도 서버 낱말이다(D-R18).
 * 누가 · 언제 켜고 껐는지는 감사 줄(ACCT_PRIVACY)과 창의 「마지막으로 바꾼 사람」에 남는다.
 * 켜고 끄기 전에 창이 무엇이 가려지는지 먼저 말한다 — 다른 사람의 화면이 바뀌는 쓰기다.
 */
'use client';
import { useEffect, useState } from 'react';
import { Banner, Button, Dialog } from '@/components/ui';
import { apiMessage } from '@/api/client';
import { useAcctPrivacy, useSetAcctPrivacy } from '@/api/queries';
import type { AcctPrivacySwitch } from '@/api/types';

export function AcctPrivacySwitches() {
  const q = useAcctPrivacy();
  const write = useSetAcctPrivacy();
  const [target, setTarget] = useState<AcctPrivacySwitch | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setErr(null); }, [target]);
  const d = q.data;
  // 스위치 목록을 읽지 못하면(권한 · 연결) 자리를 세우지 않는다 — 켜져 있는지 모르는 단추를 그리지 않는다
  if (!d?.switches) return null;
  const turnOn = target ? !target.private : false;
  const close = () => { if (!write.isPending) setTarget(null); };
  return (
    <>
      {d.switches.map((s) => (
        <Button
          key={s.key}
          size="sm"
          variant={s.private ? 'dark' : 'secondary'}
          aria-pressed={s.private}
          disabled={!d.canSet || write.isPending}
          title={d.canSet ? s.scope : `켜고 끄는 것은 대표만 합니다 — 지금 ${s.private ? '켜져' : '꺼져'} 있습니다`}
          onClick={() => setTarget(s)}
        >
          {s.label}
        </Button>
      ))}
      <Dialog
        open={target !== null}
        onClose={close}
        title={target ? `${target.label} ${turnOn ? '켜기' : '끄기'}` : ''}
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={close} disabled={write.isPending}>취소 (Esc)</Button>
            <Button
              type="button" variant="primary" disabled={write.isPending || target === null}
              onClick={() => {
                if (!target) return;
                write.mutate({ key: target.key, private: turnOn }, { onSuccess: () => setTarget(null), onError: (e) => setErr(apiMessage(e)) });
              }}
            >
              {write.isPending ? '저장 중…' : turnOn ? '켜기' : '끄기'}
            </Button>
          </>
        )}
      >
        {target ? (
          <div className="flex flex-col gap-2 text-[12.5px] text-fg-2">
            <p>{turnOn ? `켜면 ${target.scope}` : '끄면 금액을 볼 수 있는 사람 모두에게 그 줄 금액이 다시 보입니다.'}</p>
            <p className="text-[11.5px] text-fg-subtle">
              {target.setByName ? `마지막으로 바꾼 사람 · ${target.setByName}${target.setAt ? ` · ${target.setAt}` : ''}` : '아직 켠 적이 없습니다'}
            </p>
            {err ? <Banner tone="danger">{err}</Banner> : null}
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
