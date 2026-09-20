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
 *
 * **S6 — 여기서 처음으로 글을 씁니다.** 「1 · 목표」「3 · 리서치」「4 · 결정 요청」은 그동안
 * 읽기만 했고 `research` 는 시드 말고는 아무도 채우지 못해 영원히 「—」였습니다.
 * 고칠 수 있는지(`canEdit`)와 갈 수 있는 단계(`nextStages`)도 서버가 정합니다 — 화면이 단계를
 * 비교하면 단추와 서버의 답이 갈립니다 (D-R39). 못 고치면 **칸을 없애지 않고 잠그고 이유를 답니다**
 * (단추만 닫으면 다 적고 나서야 안 된다는 것을 압니다 — S5 의 대표 보고 메모 칸과 같은 자리).
 */
'use client';
import { useEffect, useState } from 'react';
import { Banner, Button, Chip, Drawer, Label, Textarea } from '../ui';
import { apiMessage } from '@/api/client';
import {
  useDecidePlanDue, useMovePlanStage, usePatchPlan, usePlanDetail, useReviewPlan,
} from '@/api/queries';
import type { PlanDetail, PlanPatch, PlanTask } from '@/api/types';

/** 화면이 들고 있는 초안 — 서버가 준 글에서 시작하고, 달라진 칸만 보낸다 */
type Draft = { goal: string; research: string; ask: string };
const draftOf = (d: PlanDetail | undefined): Draft => ({
  goal: d?.goal ?? '', research: d?.research ?? '', ask: d?.ask ?? '',
});
/** 보낸 칸만 고친다 — 안 고친 칸까지 되돌려 보내면 §65 를 나눠 쓰는 자리에서 남의 줄을 덮는다 */
function changed(draft: Draft, d: PlanDetail): PlanPatch {
  const body: PlanPatch = {};
  if (draft.goal !== (d.goal ?? '')) body.goal = draft.goal.trim() || null;
  if (draft.research !== (d.research ?? '')) body.research = draft.research.trim() || null;
  if (draft.ask !== (d.ask ?? '')) body.ask = draft.ask.trim() || null;
  return body;
}

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

/**
 * §65 본문 한 칸 — 고칠 수 있으면 적는 칸, 아니면 읽는 글이다.
 * 잠겼을 때 **칸을 없애지 않는 것**이 요점이다 (이유는 머리에 한 번 적는다).
 */
function PlanField({ label, value, can, rows, onChange }: {
  label: string; value: string; can: boolean; rows: number; onChange: (v: string) => void;
}) {
  if (!can) {
    return <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-fg">{value || '—'}</p>;
  }
  return (
    <Textarea aria-label={label} rows={rows} maxLength={4000} value={value}
      onChange={(e) => onChange(e.target.value)} placeholder={`${label}을(를) 적습니다`} />
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
  const patch = usePatchPlan();
  const move = useMovePlanStage();
  const [reason, setReason] = useState('');
  const [armed, setArmed] = useState<'rework' | null>(null);
  const d = q.data;

  /* 서버가 준 글에서 시작한다 — 다른 기획을 열거나 단계가 바뀌면 초안을 버린다
     (지난 기획의 초안이 남아 있으면 남의 글을 저장하게 된다) */
  const [draft, setDraft] = useState<Draft>(() => draftOf(d));
  /* 일부러 `d` 전체가 아니라 **어느 기획의 어느 단계인가**만 본다 — 저장 뒤 다시 읽어올 때마다
     초안을 되돌리면 적고 있던 글이 사라진다 */
  useEffect(() => { setDraft(draftOf(d)); }, [d?.id, d?.stage]);

  const body = d ? changed(draft, d) : {};
  const dirty = Object.keys(body).length > 0;
  const busy = patch.isPending || move.isPending;
  const writeError = patch.isError ? patch.error : move.isError ? move.error : null;

  /** 올리기 전에 적은 것을 먼저 저장한다 — 안 그러면 대표가 옛 글을 본다 (C85-a 대표 보고와 같은 순서) */
  const send = (to: string) => {
    if (!d) return;
    const go = () => move.mutate({ id: d.id, to });
    if (d.canEdit && dirty) patch.mutate({ id: d.id, ...body }, { onSuccess: go });
    else go();
  };

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

          {/* 왜 되돌아왔나 — S6 전에는 `log` 에만 있어 담당자가 볼 데가 없었다 */}
          {d.reworkReason ? (
            <Banner tone="danger" className="mt-2">
              <b>보완 요청</b> — {d.reworkReason}
            </Banner>
          ) : null}
          {/* 못 고치면 칸을 없애지 않고 잠그고 이유를 적는다 (S5 의 대표 보고 메모 칸과 같다) */}
          {!d.canEdit && d.editBlockedReason ? (
            <p className="mt-2 text-[11px] text-fg-subtle">{d.editBlockedReason}</p>
          ) : null}

          <Section no={1} name="목표">
            <PlanField label="목표" value={draft.goal} can={d.canEdit} rows={3}
              onChange={(v) => setDraft((p) => ({ ...p, goal: v }))} />
          </Section>

          <Section no={2} name="과제">
            {d.tasks.length === 0 ? (
              <p className="text-[12px] text-fg-subtle">과제가 없습니다</p>
            ) : (
              <ul className="flex flex-col gap-1">{d.tasks.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
            )}
          </Section>

          <Section no={3} name="리서치">
            <PlanField label="리서치" value={draft.research} can={d.canEdit} rows={4}
              onChange={(v) => setDraft((p) => ({ ...p, research: v }))} />
          </Section>

          <Section no={4} name="결정 요청">
            {d.canEdit ? (
              <PlanField label="결정 요청" value={draft.ask} can rows={3}
                onChange={(v) => setDraft((p) => ({ ...p, ask: v }))} />
            ) : (
              <blockquote className="border-l-2 border-amber bg-amber/5 px-3 py-2 text-[12.5px] leading-relaxed text-fg">
                {d.ask ?? '—'}
              </blockquote>
            )}
          </Section>

          {armed === 'rework' ? (
            <div className="mt-4">
              <Label htmlFor="plan-reason">보완 요청 사유 (필수)</Label>
              <Textarea id="plan-reason" rows={3} maxLength={500} value={reason}
                onChange={(e) => setReason(e.target.value)} />
            </div>
          ) : null}
          {review.isError ? <Banner tone="danger" className="mt-3">{apiMessage(review.error)}</Banner> : null}

          {writeError ? <Banner tone="danger" className="mt-3">{apiMessage(writeError)}</Banner> : null}

          {/* 올린 쪽이 하는 일 — 저장하고, 올리고, 다 하면 완료로 (S6).
              갈 수 있는 곳은 서버가 준 `nextStages` 뿐이다: 화면이 전이표를 들면 서버와 갈린다. */}
          {d.canEdit || d.nextStages.length ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              {d.canEdit ? (
                <Button size="sm" variant="secondary" disabled={!dirty || busy}
                  onClick={() => patch.mutate({ id: d.id, ...body })}>
                  {dirty ? '저장' : '저장됨'}
                </Button>
              ) : null}
              {d.nextStages.map((n) => (
                <Button key={n.key} size="sm" disabled={busy} onClick={() => send(n.key)}>
                  {n.key === 'review' ? '검토 요청 보내기' : `${n.label} 처리`}
                </Button>
              ))}
              {d.canEdit && dirty && d.nextStages.length ? (
                <span className="text-[11px] text-fg-subtle">올리기 전에 적은 것을 먼저 저장합니다</span>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
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
            {/*
              **단추의 이름이 곧 막힌 이유다** — 원문 §65 바닥 단추가 「기한부터 승인하세요」인 것이
              그 규약이고, 그 문장은 서버가 준다 (S5 · D-R39).

              전에는 이름을 화면이 「기한부터 승인하세요」로 **박아** 두고 이유는 옆에 따로 적었다.
              그래서 대표가 아닌 사람이 **기한이 이미 승인된** 기획을 열면 단추는 「기한부터
              승인하세요」라 말하고 옆줄은 「기획 결재는 대표만 합니다」라 말했다 — 한 자리에서 두
              말이 났고, S6 이 「아직 검토 요청이 올라오지 않았습니다」를 더하면서 어긋남이 늘었다.
              이제 문장은 한 곳에서 오고 「기한부터 승인하세요」는 **그 이유일 때** 그대로 나온다.
            */}
            <Button
              disabled={!d.canReview || review.isPending}
              title={d.reviewBlockedReason ?? undefined}
              onClick={() => review.mutate({ id: d.id, decision: 'approve' })}
            >
              {d.canReview ? '최종 승인' : d.reviewBlockedReason}
            </Button>
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}
