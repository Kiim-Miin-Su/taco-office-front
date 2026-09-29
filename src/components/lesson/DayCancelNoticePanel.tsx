/** @file-guide
 * 목적: 학원 사유 휴강(N-133 전일 휴원 · C-32 한 회차 학원 사정 휴강) 직후 학생별 학부모 안내 준비행을 실제 보호자 선택 발송으로 잇는다.
 * 책임/재사용: 서버가 만든 본문/대상만 표시하고 기존 GuardianSendDialog에 보호자·채널 선택과 발송 원장을 위임한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';

import { useState } from 'react';
import type { DayCancelParentNotice, GuardianSendResult } from '@/api/types';
import { GuardianSendDialog } from '@/components/guardians/GuardianSendDialog';
import { Banner, Button, Chip, Panel } from '@/components/ui';

export function DayCancelNoticePanel({ notices, onDismiss }: {
  notices: DayCancelParentNotice[];
  onDismiss: () => void;
}) {
  const [target, setTarget] = useState<DayCancelParentNotice | null>(null);
  const [sent, setSent] = useState<Set<number>>(() => new Set(
    notices.filter((notice) => notice.sentAt !== null).map((notice) => notice.id),
  ));

  const onSent = (result: GuardianSendResult) => {
    if (result.counts.sent > 0) {
      setSent((before) => new Set(before).add(result.pnotiId ?? target?.id ?? -1));
    }
  };

  return (
    <Panel
      title={`학부모 일괄 안내 · ${notices.length}명`}
      right={<Button size="sm" variant="ghost" onClick={onDismiss}>나중에</Button>}
    >
      <Banner tone="warning">
        휴강과 안내 준비는 저장됐습니다. 보호자와 이메일·문자 채널을 확인해 학생별로 실제 발송하세요.
      </Banner>
      <ul className="mt-3 flex flex-wrap gap-2">
        {notices.map((notice) => {
          const done = sent.has(notice.id);
          return (
            <li key={notice.id} className="flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-2">
              <b className="text-[12px]">{notice.studentName}</b>
              <Chip tone={done ? 'success' : 'warning'}>{done ? '발송 완료' : '발송 대기'}</Chip>
              <Button size="sm" disabled={done} onClick={() => setTarget(notice)}>
                {done ? '보냄' : '안내 보내기'}
              </Button>
            </li>
          );
        })}
      </ul>
      {target ? (
        <GuardianSendDialog
          open
          student={{ id: target.studentId, name: target.studentName }}
          pnotiId={target.id}
          defaultBody={target.body}
          title={`${target.title} — ${target.studentName}`}
          onSent={onSent}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </Panel>
  );
}
