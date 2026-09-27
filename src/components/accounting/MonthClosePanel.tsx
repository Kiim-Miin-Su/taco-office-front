/** @file-guide
 * 목적: MonthClosePanel.tsx — MonthClosePanel (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 「정리 · 기준 › 월 마감」 (W11 · N-37 ① — 원문 연동 「월 마감 시 정리·기준 탭에서 확정」).
 *
 * 쓰기와 판정은 그대로다(C92-d) — 서버의 `close` · `canClose` · `canReopen` 을 읽고, 배지 · 단추 · 창은
 * §54 에 있던 `MonthCloseControls` 를 그대로 쓴다. §54 표는 이제 배지만 그린다(원문 §54 컷에 마감 단추가 없다).
 * 달은 사람이 고른다 — 고르기 전에는 서버가 정한 이번 달이다(`GET /accounting/tuition` 의 기본값).
 */
'use client';
import { useState } from 'react';
import { apiMessage } from '@/api/client';
import { useMonthClose, useTuition } from '@/api/queries';
import { Banner, Input, Label, Panel } from '@/components/ui';
import { MonthCloseControls } from './TuitionTable';

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

export function MonthClosePanel() {
  // 빈 값 = 서버가 정하는 이번 달 — §54 탭과 같은 캐시를 쓴다
  const [month, setMonth] = useState('');
  const tuition = useTuition(YM.test(month) ? month : undefined);
  const monthClose = useMonthClose();
  const [error, setError] = useState<string | null>(null);
  const data = tuition.data;

  return (
    <Panel
      title="월 마감"
      sub="마감하면 그 달의 회차 · 휴강 · 출결 · 청구서 발행 · 이월 · 휴원을 아무도 고칠 수 없습니다. 고쳐야 하면 대표가 사유를 적고 해제합니다 — 해제 기록은 남습니다"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="close-month">달</Label>
          <Input id="close-month" type="month" value={month || data?.month || ''}
            onChange={(e) => { setMonth(e.target.value); setError(null); }} />
        </div>
        {data ? (
          <div className="flex flex-wrap items-center gap-2 pb-1.5">
            {/* 마감 전이면 배지가 없다 — 단추가 서는지는 서버가 정한다 */}
            {data.close ? null : <span className="text-[12px] text-fg-subtle">{Number(data.month.slice(5))}월은 마감 전입니다</span>}
            <MonthCloseControls
              data={data}
              pending={monthClose.isPending}
              error={error}
              onCloseMonth={() => {
                setError(null);
                monthClose.mutate({ kind: 'close', body: { month: data.month } }, { onError: (e) => setError(apiMessage(e)) });
              }}
              onReopenMonth={(reason) => {
                setError(null);
                monthClose.mutate({ kind: 'reopen', body: { month: data.month, reason } }, { onError: (e) => setError(apiMessage(e)) });
              }}
            />
          </div>
        ) : (
          <span className="pb-1.5 text-[12px] text-fg-subtle">{tuition.isLoading ? '불러오는 중…' : ''}</span>
        )}
      </div>
      {tuition.isError ? <Banner tone="danger" className="mt-3">{apiMessage(tuition.error)}</Banner> : null}
    </Panel>
  );
}
