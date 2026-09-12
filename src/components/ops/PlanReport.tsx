/** @file-guide
 * 목적: PlanReport.tsx — PlanReport (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §65 기획 보고서 — 목표 → 과제 → 리서치 → 결정 요청.
 *
 * **단추가 열리는지는 서버가 정합니다** (`canDecideDue` · `canReview`). 원문 §61·§65 의 규칙은
 * 「대표는 **기한을 먼저 승인해야** 최종 승인이 열립니다」인데, 이것을 화면에서 역할과 기한
 * 상태를 조합해 다시 만들면 단추 모양과 서버의 답이 갈립니다 (D-R39).
 * 막힌 이유(`reviewBlockedReason`)도 서버가 문장으로 줍니다 — 원문 바닥 단추의 이름이
 * 「기한부터 승인하세요」인 것이 그 문장입니다.
 */
'use client';
import { useState } from 'react';
import { Banner, Button, Chip, Drawer, Label, Textarea } from '../ui';
import { apiMessage } from '@/api/client';
import { useDecidePlanDue, usePlanDetail, useReviewPlan } from '@/api/queries';
import type { PlanTask } from '@/api/types';

const STAGE_TONE: Record<string, 'neutral' | 'info' | 'danger' | 'success' | 'purple'> = {
  draft: 'neutral', review: 'info', rework: 'danger', approved: 'success', done: 'purple',
};

function Section({ no, name, children }: { no: number; name: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="mb-1.5 border-b border-line pb-1 text-[11px] tracking-widest text-fg-subtle">
        {no} · {name}
      </h3>
      {children}
    </section>
  );
}

function TaskRow({ t }: { t: PlanTask }) {
  return (
    <li className={`flex flex-wrap items-center gap-2 rounded-lg px-2.5 py-2 ${
      t.done ? 'bg-green/5' : t.overdueDays > 0 ? 'bg-red/5' : 'bg-bg-2'}`}
    >
      <span className={t.done ? 'text-green' : 'text-line-2'}>{t.done ? '☑' : '☐'}</span>
      <span className={`flex-1 text-[12.5px] ${t.done ? 'text-fg-subtle line-through' : 'text-fg'}`}>{t.title}</span>
      <span className="text-[11px] text-fg-subtle">{t.toName ?? '미배정'}</span>
      {t.dueOn ? (
        <span className={`text-[11px] ${t.overdueDays > 0 ? 'font-bold text-red' : 'text-fg-subtle'}`}>
          {t.dueOn.slice(5)}{t.overdueDays > 0 ? ` · ${t.overdueDays}일 지남` : ''}
        </span>
      ) : null}
    </li>
  );
}

export function PlanReport({ planId, onClose }: { planId: number | null; onClose: () => void }) {
  const q = usePlanDetail(planId);
  const due = useDecidePlanDue();
  const review = useReviewPlan();
  const [reason, setReason] = useState('');
  const [armed, setArmed] = useState<'rework' | null>(null);
  const d = q.data;

  return (
    <Drawer open={planId !== null} onClose={onClose} title={d?.title ?? '기획 보고서'}
      sub={d ? `${d.ownerName ?? '담당 없음'} 작성 · ${d.createdOn}` : undefined}
    >
      {q.isLoading ? <Banner tone="neutral">불러오는 중…</Banner> : null}
      {q.isError ? <Banner tone="danger">{apiMessage(q.error)}</Banner> : null}

      {d ? (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={STAGE_TONE[d.stage] ?? 'neutral'} styleKind="solid">{d.stageLabel}</Chip>
            <span className="text-[12px] text-fg-2">
              마감 {d.dueOn ?? '미정'}
              {d.overdueDays > 0 ? <b className="ml-1 text-red">{d.overdueDays}일 지남</b> : null}
            </span>
            <Chip tone={d.dueState === 'approved' ? 'success' : 'warning'}>{d.dueStateLabel}</Chip>
            <span className="text-[12px] text-fg-2">과제 {d.taskDone}/{d.tasks.length}</span>
          </div>

          {/* 원문 §65 의 기한 띠 — 승인 전에만 뜬다 */}
          {d.dueState === 'proposed' ? (
            <Banner tone="warning" className="mt-2">
              <div className="flex flex-wrap items-center gap-2">
                <b>기한 제안 {d.dueOn}</b>
                <span className="text-[12px]">대표 확인을 기다립니다</span>
                {d.canDecideDue ? (
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" disabled={due.isPending}
                      onClick={() => due.mutate({ id: d.id, approve: true })}>기한 승인</Button>
                    <Button size="sm" variant="secondary" disabled={due.isPending}
                      onClick={() => due.mutate({ id: d.id, approve: false })}>기한 반려</Button>
                  </span>
                ) : null}
              </div>
            </Banner>
          ) : null}
          {d.dueState === 'approved' && d.dueApprovedByName ? (
            <p className="mt-1 text-[11px] text-fg-subtle">기한은 {d.dueApprovedByName} 님이 승인했습니다.</p>
          ) : null}
          {due.isError ? <Banner tone="danger" className="mt-2">{apiMessage(due.error)}</Banner> : null}

          <Section no={1} name="목표">
            <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-fg">{d.goal ?? '—'}</p>
          </Section>

          <Section no={2} name="과제">
            {d.tasks.length === 0 ? (
              <p className="text-[12px] text-fg-subtle">과제가 없습니다</p>
            ) : (
              <ul className="flex flex-col gap-1">{d.tasks.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
            )}
          </Section>

          <Section no={3} name="리서치">
            <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-fg">{d.research ?? '—'}</p>
          </Section>

          <Section no={4} name="결정 요청">
            <blockquote className="border-l-2 border-amber bg-amber/5 px-3 py-2 text-[12.5px] leading-relaxed text-fg">
              {d.ask ?? '—'}
            </blockquote>
          </Section>

          {armed === 'rework' ? (
            <div className="mt-4">
              <Label htmlFor="plan-reason">보완 요청 사유 (필수)</Label>
              <Textarea id="plan-reason" rows={3} maxLength={500} value={reason}
                onChange={(e) => setReason(e.target.value)} />
            </div>
          ) : null}
          {review.isError ? <Banner tone="danger" className="mt-3">{apiMessage(review.error)}</Banner> : null}

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            {/* 막힌 이유도 서버가 준 문장을 그대로 쓴다 — 화면이 조건을 다시 적지 않는다 */}
            {d.reviewBlockedReason ? (
              <span className="mr-auto text-[12px] text-fg-subtle">{d.reviewBlockedReason}</span>
            ) : null}
            <Button variant="ghost" onClick={onClose}>닫기</Button>
            <Button
              variant="secondary"
              disabled={!d.canReview || review.isPending || (armed === 'rework' && reason.trim() === '')}
              onClick={() => {
                if (armed === 'rework') {
                  review.mutate({ id: d.id, decision: 'rework', reason: reason.trim() },
                    { onSuccess: () => { setArmed(null); setReason(''); } });
                } else setArmed('rework');
              }}
            >
              {armed === 'rework' ? '보완 요청 보내기' : '보완 요청'}
            </Button>
            <Button
              disabled={!d.canReview || review.isPending}
              title={d.reviewBlockedReason ?? undefined}
              onClick={() => review.mutate({ id: d.id, decision: 'approve' })}
            >
              {d.canReview ? '최종 승인' : '기한부터 승인하세요'}
            </Button>
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}
