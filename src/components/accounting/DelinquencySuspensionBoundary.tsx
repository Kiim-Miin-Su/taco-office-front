/** @file-guide
 * 목적: 최종 관리자 수정사항 p101·p107·p113과 Figma A25의 연체 aging·수강 정지·해제를 제공한다. (component)
 * 책임/재사용: 생성 계약과 공용 Query mutation만 소비하며 후보·권한·해제 가능 여부·영향 수업을 화면에서 재계산하지 않는다.
 * 검증/작업 지침: docs/sprint/TBO-55/features/BOC-11C-DELINQUENCY-SUSPENSION-2026-10-09.md · docs/AGENT.md
 */
'use client';
import { useId, useState } from 'react';
import { apiMessage } from '@/api/client';
import {
  useDelinquencySuspensions,
  useRemindDelinquencyBatch,
  useTransitionDelinquencySuspension,
  useWriteDelinquencyPolicy,
} from '@/api/queries';
import type { DelinquencyPolicy, DelinquencySuspensionItem } from '@/api/types';
import {
  Banner, Button, Chip, Dialog, FieldError, Input, Label, Panel, QueryState, Textarea,
} from '@/components/ui';
import { kstDateTime } from '@/lib/calendar';
import { won } from '@/lib/money';

type SingleAction = 'suspend' | 'release';
type ActionTarget = { kind: 'single'; action: SingleAction; item: DelinquencySuspensionItem } | { kind: 'bulk' };

const requestKey = () => globalThis.crypto.randomUUID();
const actionLabel: Record<SingleAction, string> = { suspend: '수강 정지', release: '정지 해제' };
const eventActionLabel: Record<DelinquencySuspensionItem['events'][number]['action'], string> = {
  reminded: '납입 독촉 기록',
  suspended: '수강 정지',
  released: '정지 해제',
};
const stateTone = (state: DelinquencySuspensionItem['state']): 'warning' | 'danger' | 'neutral' => (
  state === 'suspended' ? 'danger' : state === 'candidate' ? 'warning' : 'neutral'
);

function PolicyEditor({ policy, pending, onSave }: {
  policy: DelinquencyPolicy;
  pending: boolean;
  onSave: (thresholdDays: number) => void;
}) {
  const id = useId();
  const [thresholdText, setThresholdText] = useState(String(policy.thresholdDays));
  const threshold = Number(thresholdText);
  const invalid = !Number.isInteger(threshold) || threshold < 1 || threshold > 365;
  const unchanged = threshold === policy.thresholdDays;
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-inset p-3">
      <div className="w-40">
        <Label htmlFor={`${id}-threshold`} hint="1~365일">보류 기준 일</Label>
        <Input id={`${id}-threshold`} type="number" min={1} max={365} step={1} inputMode="numeric"
          value={thresholdText} error={invalid} aria-invalid={invalid} disabled={!policy.canChange || pending}
          onChange={(event) => setThresholdText(event.target.value)} />
        <FieldError>{invalid ? '1~365 사이의 정수로 적어 주세요' : undefined}</FieldError>
      </div>
      <div className="pb-1 text-[12px] text-fg-2">
        <p>일 이상 연체한 학생을 검토합니다 · 정책 v{policy.version}</p>
        <p className="mt-1 text-fg-subtle">
          {policy.updatedAt ? `${policy.updatedBy ?? '담당자'} · ${kstDateTime(policy.updatedAt) ?? policy.updatedAt}` : '초기 기준'}
        </p>
      </div>
      <Button className="ml-auto" size="sm" disabled={!policy.canChange || pending || invalid || unchanged}
        title={policy.canChange ? undefined : '서버가 기준 변경 권한을 허용하지 않았습니다'}
        onClick={() => onSave(threshold)}>기준 저장</Button>
    </div>
  );
}

function ItemActions({ item, pending, onHistory, onRemind, onAction }: {
  item: DelinquencySuspensionItem;
  pending: boolean;
  onHistory: () => void;
  onRemind: () => void;
  onAction: (action: SingleAction) => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={onHistory}>이력 {item.events.length}</Button>
      <Button size="sm" variant="secondary" disabled={pending || !item.canRemind} onClick={onRemind}>독촉 기록</Button>
      {item.state === 'suspended' ? (
        <Button size="sm" disabled={pending || !item.canRelease} title={item.releaseBlockedReason ?? undefined}
          onClick={() => onAction('release')}>정지 해제</Button>
      ) : item.state === 'candidate' ? (
        <Button size="sm" disabled={pending || !item.canSuspend} onClick={() => onAction('suspend')}>수강 정지</Button>
      ) : null}
    </div>
  );
}

export function DelinquencySuspensionBoundary() {
  const id = useId();
  const query = useDelinquencySuspensions();
  const policyWrite = useWriteDelinquencyPolicy();
  const transition = useTransitionDelinquencySuspension();
  const batchRemind = useRemindDelinquencyBatch();
  const [action, setAction] = useState<ActionTarget | null>(null);
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState<DelinquencySuspensionItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const pending = policyWrite.isPending || transition.isPending || batchRemind.isPending;

  const refresh = async () => {
    const refreshed = await query.refetch();
    if (!refreshed.data) return;
    if (action?.kind === 'single') {
      const current = refreshed.data.items.find((item) => item.studentId === action.item.studentId);
      if (current) setAction({ ...action, item: current });
    }
    if (history) {
      const current = refreshed.data.items.find((item) => item.studentId === history.studentId);
      setHistory(current ?? null);
    }
  };

  const remind = (item: DelinquencySuspensionItem) => {
    setError(null); setSuccess(null);
    transition.mutate({ studentId: item.studentId, action: 'remind', body: {
      expectedVersion: item.version, requestKey: requestKey(),
    } }, {
      onSuccess: ({ replayed }) => setSuccess(
        replayed ? `${item.studentName} 학생의 기존 독촉 기록을 확인했습니다.` : `${item.studentName} 학생의 납입 독촉 이력을 기록했습니다.`,
      ),
      onError: (cause) => setError(apiMessage(cause)),
    });
  };

  const openAction = (item: DelinquencySuspensionItem, next: SingleAction) => {
    setAction({ kind: 'single', action: next, item });
    setReason(''); setError(null); setSuccess(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1"><Chip tone="info">서버 원장 연결</Chip></div>
            <h2 className="text-[15px] font-bold text-fg">연체 수강 정지 · 해제</h2>
            <p className="mt-1 text-[12px] text-fg-subtle">기본 기준은 후보만 만들며, 실제 정지와 해제는 담당자가 처리합니다</p>
          </div>
          <Button size="sm" variant="secondary" disabled={pending || !query.data?.items.some((item) => item.canRemind)}
            onClick={() => { setAction({ kind: 'bulk' }); setError(null); setSuccess(null); }}>전부 독촉 기록</Button>
        </header>

        <Banner tone="warning" className="mb-4">
          <b>독촉은 외부 발송 완료가 아니라 내부 처리 이력입니다.</b> 기존 일정은 유지하고 정지 뒤 새 일정·복사·이동·명단 추가만 서버와 DB가 차단합니다.
        </Banner>
        {error && !action ? <Banner tone="danger" className="mb-3"><div className="flex flex-wrap items-center justify-between gap-2"><span>{error}</span><Button size="sm" variant="ghost" onClick={() => void refresh()}>최신 원장 다시 불러오기</Button></div></Banner> : null}
        {success ? <Banner tone="success" className="mb-3">{success}</Banner> : null}

        <QueryState query={query}>
          {(data) => <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-6" aria-label="연체 요약">
              <div className="rounded-xl border border-line bg-card p-3"><span className="block text-[12px] text-fg-subtle">전체 미수</span><b className="mt-1 block text-[15px] text-fg">{won(data.totalReceivable)}</b></div>
              <div className="rounded-xl border border-line bg-card p-3"><span className="block text-[12px] text-fg-subtle">기한 경과</span><b className="mt-1 block text-[15px] text-red">{won(data.totalOverdue)}</b></div>
              {data.aging.map((bucket) => <div key={bucket.key} className="rounded-xl border border-line bg-card p-3">
                <span className="block text-[12px] text-fg-subtle">{bucket.label} · {bucket.studentCount}명</span>
                <b className="mt-1 block text-[15px] text-fg">{won(bucket.outstanding)}</b>
              </div>)}
            </div>

            <PolicyEditor key={data.policy.version} policy={data.policy} pending={pending} onSave={(thresholdDays) => {
              setError(null); setSuccess(null);
              policyWrite.mutate({ thresholdDays, expectedVersion: data.policy.version, requestKey: requestKey() }, {
                onSuccess: (policy) => setSuccess(`연체 후보 기준을 ${policy.thresholdDays}일로 저장했습니다.`),
                onError: (cause) => setError(apiMessage(cause)),
              });
            }} />

            {data.items.length === 0 ? (
              <div className="rounded-xl border border-line bg-card p-8 text-center">
                <p className="text-base font-bold text-fg">표시할 항목이 없습니다</p>
                <p className="mt-1 text-xs text-fg-subtle">현재 기준에 해당하는 연체 후보나 정지 학생이 없습니다.</p>
              </div>
            ) : <>
            <div className="hidden overflow-x-auto rounded-xl border border-line lg:block">
              <table className="w-full min-w-[1120px] border-collapse text-[12px]" aria-label="연체 수강 정지 원장">
                <thead className="bg-inset text-fg-subtle"><tr>
                  <th className="border-b border-line px-3 py-2 text-left">학생</th>
                  <th className="border-b border-line px-3 py-2 text-left">연체</th>
                  <th className="border-b border-line px-3 py-2 text-right">미수</th>
                  <th className="border-b border-line px-3 py-2 text-left">연락처</th>
                  <th className="border-b border-line px-3 py-2 text-left">영향 수업</th>
                  <th className="border-b border-line px-3 py-2 text-left">상태</th>
                  <th className="border-b border-line px-3 py-2 text-right">작업</th>
                </tr></thead>
                <tbody>{data.items.map((item) => <tr key={item.studentId} className="border-b border-line last:border-0">
                  <td className="px-3 py-2"><b className="text-fg">{item.studentName}</b><span className="ml-1 text-fg-subtle">{item.studentTag}</span></td>
                  <td className="px-3 py-2"><b className="text-red">{item.overdueDays}일</b><span className="ml-1 text-fg-subtle">· {item.overdueInvoiceCount}건</span></td>
                  <td className="px-3 py-2 text-right font-bold text-fg">{won(item.outstanding)}</td>
                  <td className="px-3 py-2 text-fg-2">{item.contact ?? '등록 연락처 없음'}</td>
                  <td className="max-w-[220px] px-3 py-2 text-fg-2"><span title={item.affectedSeries.join(', ')}>{item.affectedSeriesCount}개 · {item.affectedSeries.join(', ') || '현재 수업 없음'}</span></td>
                  <td className="px-3 py-2"><Chip tone={stateTone(item.state)}>{item.stateLabel}</Chip><span className="ml-1 text-fg-subtle">v{item.version}</span></td>
                  <td className="px-3 py-2"><ItemActions item={item} pending={pending}
                    onHistory={() => setHistory(item)} onRemind={() => remind(item)} onAction={(next) => openAction(item, next)} /></td>
                </tr>)}</tbody>
              </table>
            </div>
            <div className="flex flex-col gap-2 lg:hidden" aria-label="연체 수강 정지 카드">
              {data.items.map((item) => <article key={item.studentId} className="rounded-xl border border-line bg-card p-3">
                <header className="flex items-start justify-between gap-2">
                  <b className="text-[13px] text-fg">{item.studentName}<span className="ml-1 font-normal text-fg-subtle">{item.studentTag}</span></b>
                  <span><Chip tone={stateTone(item.state)}>{item.stateLabel}</Chip><span className="ml-1 text-[12px] text-fg-subtle">v{item.version}</span></span>
                </header>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                  <div><dt className="text-fg-subtle">연체</dt><dd className="font-bold text-red">{item.overdueDays}일 · {item.overdueInvoiceCount}건</dd></div>
                  <div><dt className="text-fg-subtle">미수</dt><dd className="font-bold text-fg">{won(item.outstanding)}</dd></div>
                  <div><dt className="text-fg-subtle">연락처</dt><dd className="break-words text-fg-2">{item.contact ?? '등록 연락처 없음'}</dd></div>
                  <div><dt className="text-fg-subtle">영향 수업</dt><dd className="break-words text-fg-2">{item.affectedSeriesCount}개 · {item.affectedSeries.join(', ') || '현재 수업 없음'}</dd></div>
                </dl>
                <div className="mt-3"><ItemActions item={item} pending={pending}
                  onHistory={() => setHistory(item)} onRemind={() => remind(item)} onAction={(next) => openAction(item, next)} /></div>
              </article>)}
            </div>
            </>}
          </div>}
        </QueryState>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="수강 정지 효력" sub="기존 일정은 보존하고 일정 확대 경로만 같은 잠금 안에서 차단합니다">
          <ul className="flex list-disc flex-col gap-2 pl-4 text-[12px] text-fg-2">
            <li>신규 수업·복사·학생 대체·이동·명단 추가·재가입·되돌리기를 차단합니다.</li>
            <li>취소·삭제·학생 제거는 허용하며 기존 회계와 월마감·급여는 바꾸지 않습니다.</li>
          </ul>
        </Panel>
        <Panel title="입금 확인 뒤 해제" sub="현재 기한 경과 미수 잔액이 0인지 서버가 다시 확인합니다">
          <ul className="flex list-disc flex-col gap-2 pl-4 text-[12px] text-fg-2">
            <li>일부 납부 뒤 잔액이 남으면 해제를 거절합니다.</li>
            <li>해제 성공 뒤 새 일정 저장 경로가 즉시 다시 열립니다.</li>
          </ul>
        </Panel>
      </div>

      {action ? <Dialog open closeX onClose={() => setAction(null)}
        title={action.kind === 'bulk' ? '전체 납입 독촉 기록' : actionLabel[action.action]}
        sub={action.kind === 'bulk' ? '현재 원장의 독촉 가능 학생에게 내부 이력을 남깁니다' : `${action.item.studentName} · ${action.item.overdueDays}일 연체 · v${action.item.version}`}
        footer={<div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setAction(null)}>닫기</Button>
          <Button disabled={pending || (action.kind === 'single' && reason.trim().length < 2)} onClick={() => {
            setError(null); setSuccess(null);
            if (action.kind === 'bulk') {
              const targets = query.data?.items.filter((item) => item.canRemind) ?? [];
              batchRemind.mutate({ items: targets.map((item) => ({
                studentId: item.studentId, expectedVersion: item.version, requestKey: requestKey(),
              })) }, {
                onSuccess: ({ remindedCount, replayedCount }) => {
                  setSuccess(replayedCount === remindedCount
                    ? `${remindedCount}명의 기존 납입 독촉 기록을 확인했습니다.`
                    : `${remindedCount}명의 납입 독촉 이력을 기록했습니다.`);
                  setAction(null);
                },
                onError: (cause) => setError(apiMessage(cause)),
              });
              return;
            }
            transition.mutate({ studentId: action.item.studentId, action: action.action, body: {
              expectedVersion: action.item.version, reason: reason.trim(), requestKey: requestKey(),
            } }, {
              onSuccess: ({ item }) => {
                setSuccess(`${item.studentName} 학생을 ${actionLabel[action.action]} 처리했습니다.`);
                setAction(null); setReason('');
              },
              onError: (cause) => setError(apiMessage(cause)),
            });
          }}>{action.kind === 'bulk' ? '전체 기록' : actionLabel[action.action]}</Button>
        </div>}>
        {error ? <Banner tone="danger" className="mb-3"><div className="flex flex-wrap items-center justify-between gap-2"><span>{error}</span><Button size="sm" variant="ghost" onClick={() => void refresh()}>최신 원장 다시 불러오기</Button></div></Banner> : null}
        {action.kind === 'bulk' ? <p className="text-[13px] text-fg-2">외부 문자나 전화 발송 완료로 표시하지 않습니다. 각 학생의 현재 version을 서버가 확인한 뒤 실제 처리자와 시각을 기록합니다.</p> : <>
          <p className="mb-3 text-[13px] text-fg-2">현재 미수와 원장 version을 서버가 다시 확인한 뒤 처리합니다.</p>
          <Label htmlFor={`${id}-reason`}>처리 사유</Label>
          <Textarea id={`${id}-reason`} rows={3} maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="두 글자 이상 적어 주세요" />
          <FieldError>{reason.length > 0 && reason.trim().length < 2 ? '두 글자 이상 적어 주세요' : undefined}</FieldError>
        </>}
      </Dialog> : null}

      {history ? <Dialog open closeX onClose={() => setHistory(null)} title="연체 수강 정지 이력"
        sub={`${history.studentName} · 현재 ${history.stateLabel} v${history.version}`}
        footer={<div className="flex justify-end"><Button variant="ghost" onClick={() => setHistory(null)}>닫기</Button></div>}>
        {history.events.length === 0 ? <p className="text-[13px] text-fg-subtle">아직 처리 이력이 없습니다.</p>
          : <ol className="space-y-2">{history.events.map((event, index) => <li key={`${event.createdAt}-${index}`} className="rounded-lg border border-line px-3 py-2 text-[12px] text-fg-2">
            <div className="flex items-center justify-between gap-2"><b className="text-fg">{eventActionLabel[event.action]} · v{event.version}</b><span>{kstDateTime(event.createdAt) ?? event.createdAt}</span></div>
            <p className="mt-1">{event.actor} · {event.overdueDays}일 · {won(event.outstanding)} · 영향 {event.affectedSeriesCount}개{event.reason ? ` · ${event.reason}` : ''}</p>
          </li>)}</ol>}
      </Dialog> : null}
    </div>
  );
}
