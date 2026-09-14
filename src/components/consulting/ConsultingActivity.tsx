/** @file-guide
 * 목적: §31 컨설팅 진행 항목과 회차 5W1H 기록을 계약 모달 안에서 재사용한다.
 * 책임/재사용: 목록 응답의 서버 projection을 표시하고 항목 체크 훅만 연결한다. 완료 회차나 진행률을 별도 저장하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';
import { apiMessage } from '@/api/client';
import { useToggleConsultingItem } from '@/api/queries';
import type { Consulting } from '@/api/types';
import { Banner, Chip, Panel } from '@/components/ui';
import { ConsultingProgress } from './ConsultingProgress';

export function ConsultingActivity({ item }: { item: Consulting }) {
  const toggle = useToggleConsultingItem();
  const done = item.items.filter((row) => row.done).length;
  return <div className="grid gap-3 lg:grid-cols-2">
    <Panel title={`진행 항목 — ${done}/${item.items.length}`} sub="진행 항목과 기록 회차는 서로 다른 서버 원장입니다.">
      {item.items.length === 0 ? <p className="text-[12px] text-fg-subtle">이 유형의 기본 진행 항목은 아직 확정되지 않았습니다.</p> : <>
        <ConsultingProgress value={done} max={item.items.length} label={`진행 항목 ${done}/${item.items.length}`} />
        <ul className="mt-3 divide-y divide-line">
          {item.items.map((row) => <li key={row.id} className="flex items-center gap-2 py-2">
            <button type="button" aria-pressed={row.done} disabled={toggle.isPending || item.stage === 'done'}
              title={item.stage === 'done' ? '종료된 컨설팅입니다' : row.done ? '완료 해제' : '완료 처리'}
              onClick={() => toggle.mutate({ consId: item.id, itemId: row.id, done: !row.done })}
              className={`grid h-5 w-5 shrink-0 place-items-center rounded border text-[11px] font-bold ${row.done ? 'border-green bg-green text-white' : 'border-line text-transparent'}`}>✓</button>
            <span className={`min-w-0 grow text-[12px] ${row.done ? 'text-fg-subtle line-through' : 'text-fg'}`}>{row.label}</span>
            {row.required ? <Chip tone="warning">필수</Chip> : null}
          </li>)}
        </ul>
      </>}
      {toggle.isError ? <Banner tone="danger" className="mt-2">{apiMessage(toggle.error)}</Banner> : null}
    </Panel>
    <Panel title={`회차 기록 — ${item.sessionsLog.length}건`} sub="누가 · 무엇을 · 왜 · 어떻게">
      {item.sessionsLog.length === 0 ? <p className="text-[12px] text-fg-subtle">아직 기록된 회차가 없습니다.</p> : <ol className="divide-y divide-line">
        {item.sessionsLog.map((session) => <li key={session.id} className="py-3">
          <div className="mb-2 flex items-center gap-2"><Chip tone="info">{session.seq}회차</Chip><span className="text-[11px] text-fg-subtle">{session.onDate ?? '날짜 미정'}</span></div>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {([['누가', session.who], ['무엇을', session.what], ['왜', session.why], ['어떻게', session.how]] as const).map(([label, value]) => <div key={label}>
              <dt className="text-[10px] font-bold text-fg-subtle">{label}</dt><dd className="text-[12px]">{value ?? '—'}</dd>
            </div>)}
          </dl>
        </li>)}
      </ol>}
    </Panel>
  </div>;
}
