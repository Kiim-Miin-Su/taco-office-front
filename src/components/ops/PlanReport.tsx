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
 *
 * **창 모양은 원문 §65 그대로 가운데 큰 창이다** (65-1) — 520px 서랍에 문서를 접어 넣지 않는다.
 * 닫기는 머리의 「×」 하나이고, 결재 단추 줄은 바닥에 고정돼 본문을 내려도 따라 흐르지 않는다.
 * 단계 칩은 제목 옆에 선다 (65-6).
 *
 * **과제 줄은 체크박스다** (65-3). 과제는 TODO 한 줄이라 서랍·운영 할 일과 **같은 쓰기**
 * (`useDrawerWrite({kind:'todo'})` → `PATCH /drawer/todos/:id`)를 그대로 부른다 — 새 경로를 만들지 않는다.
 * 누가 체크할 수 있는지는 서버(`patchTodo` 의 canSeeAll·보낸 사람·받은 사람)가 정하고, 이 창을 여는 권한
 * (`canAdminPage`+`canCrudAll`)이 이미 canSeeAll 이다. 성공하면 `family.ops` 무효화가 이 보고서(`['ops','plan',id]`)까지 걷는다.
 *
 * **w5 · 65-2 레터헤드** — 원문 §65 본문은 문서 한 장이다: 왼쪽 「보고」 동그라미 · 주황 윗줄 · 「TN ACADEMY · 기획 보고」 ·
 * 작성일 · 큰 제목 · 담당/마감/과제 격자 · 굵은 구분선. 값은 전부 `PlanDetailDto` 에 이미 있는 것이다(새 계산 0).
 * 큰 제목은 제목 **글**이지 제목 **요소**가 아니다 — 창의 제목(heading)이 이미 같은 글을 갖는다.
 * **w5 · 65-4 「+ 대표 지시」** — 과제 하나를 더한다. 창은 서랍·운영 할 일과 **같은 창**(`TodoCreateDialog`)이고
 * 서는지와 막힌 이유는 서버의 `canAddTask`·`addTaskBlockedReason` 이다 (D-R39).
 */
'use client';
import { useEffect, useState } from 'react';
import { Banner, Button, Checkbox, Chip, Label, Textarea } from '../ui';
import { WideDialog } from '../ui/WideDialog';
import { TodoCreateDialog, type TodoPerson } from '../drawer/TodoCreateDialog';
import { apiMessage } from '@/api/client';
import {
  useDecidePlanDue, useDrawerWrite, useMovePlanStage, usePatchPlan, usePlanDetail, useReviewPlan,
} from '@/api/queries';
import { useAddPlanTask } from './ops-queries';
import { useSession } from '@/store/useSession';
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

/** 단계 색 — 원문 §61 칸 색 그대로(작성 중 회색 · 검토 요청 주황 · 보완 요청 빨강 · 승인 파랑 · 완료 초록 · w5 61-7) */
const STAGE_TONE: Record<string, 'neutral' | 'info' | 'danger' | 'success' | 'warning'> = {
  draft: 'neutral', review: 'warning', rework: 'danger', approved: 'info', done: 'success',
};

function Section({ no, name, action, children }: { no: number; name: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-line pb-1">
        <h3 className="text-[11px] tracking-widest text-fg-subtle">{no} · {name}</h3>
        {action}
      </div>
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

function TaskRow({ t, busy, onToggle }: { t: PlanTask; busy: boolean; onToggle: (id: number, done: boolean) => void }) {
  return (
    <li className={`flex flex-wrap items-center gap-2 rounded-lg px-2.5 py-2 ${
      t.done ? 'bg-green/5' : t.overdueDays > 0 ? 'bg-red/5' : 'bg-bg-2'}`}
    >
      {/* 서랍 §15·운영 §64 의 할 일 줄과 같은 체크박스 — 이름도 같은 모양(「… 완료」)이다 */}
      <Checkbox checked={t.done} disabled={busy} aria-label={`${t.title} 완료`}
        onChange={(e) => onToggle(t.id, e.currentTarget.checked)} />
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

export function PlanReport({ planId, staff, onClose }: {
  planId: number | null;
  /** 「+ 대표 지시」 담당으로 고를 사람 — 운영 화면이 `GET /meta` 의 staff 를 준다 */
  staff?: readonly TodoPerson[];
  onClose: () => void;
}) {
  const q = usePlanDetail(planId);
  const addTask = useAddPlanTask();
  const [taskOpen, setTaskOpen] = useState(false);
  // 창의 담당 기본값 — 서랍 「할 일 만들기」와 같다(나). 고를 수 있는 사람은 운영 화면이 준 목록이다
  const meId = useSession((st) => st.me?.id ?? null);
  const due = useDecidePlanDue();
  const review = useReviewPlan();
  const patch = usePatchPlan();
  const move = useMovePlanStage();
  const todoWrite = useDrawerWrite();
  const [todoError, setTodoError] = useState<string | null>(null);
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

  /** 과제 체크 — 막히면 서버 문장을 그대로 보인다 */
  const toggleTask = (id: number, done: boolean) => {
    setTodoError(null);
    todoWrite.mutate({ kind: 'todo', id, done }, { onError: (e) => setTodoError(apiMessage(e)) });
  };

  /** 올리기 전에 적은 것을 먼저 저장한다 — 안 그러면 대표가 옛 글을 본다 (C85-a 대표 보고와 같은 순서) */
  const send = (to: string) => {
    if (!d) return;
    const go = () => move.mutate({ id: d.id, to });
    if (d.canEdit && dirty) patch.mutate({ id: d.id, ...body }, { onSuccess: go });
    else go();
  };

  /*
   * 바닥 줄 — 왼쪽은 **올린 쪽이 하는 일**(저장 · 올리기 · 완료), 오른쪽은 **결재하는 쪽**(보완 요청 · 최종 승인).
   * 원문에 없는 바닥 「닫기」는 두지 않는다 — 닫는 자리는 머리의 「×」 하나다 (65-8).
   */
  const footer = d ? (
    <>
      {/* 올린 쪽이 하는 일 — 저장하고, 올리고, 다 하면 완료로 (S6).
          갈 수 있는 곳은 서버가 준 `nextStages` 뿐이다: 화면이 전이표를 들면 서버와 갈린다. */}
      {d.canEdit || d.nextStages.length ? (
        <span className="mr-auto flex flex-wrap items-center gap-2">
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
        </span>
      ) : null}
      {/* 「보완 요청」은 **제 문**을 본다 — 원문 규칙이 막는 것은 최종 승인뿐이라 기한 승인 전에도 선다 (65-7 · x5).
          열리는지와 막힌 이유는 서버의 canRework · reworkBlockedReason 이다 (D-R39) */}
      <Button
        variant="secondary"
        title={d.reworkBlockedReason ?? undefined}
        disabled={!d.canRework || review.isPending || (armed === 'rework' && reason.trim() === '')}
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
        variant="primary"
        disabled={!d.canReview || review.isPending}
        title={d.reviewBlockedReason ?? undefined}
        onClick={() => review.mutate({ id: d.id, decision: 'approve' })}
      >
        {d.canReview ? '최종 승인' : d.reviewBlockedReason}
      </Button>
    </>
  ) : null;

  return (
    <WideDialog open={planId !== null} onClose={onClose} title={d?.title ?? '기획 보고서'}
      head={d ? <Chip tone={STAGE_TONE[d.stage] ?? 'neutral'} styleKind="solid">{d.stageLabel}</Chip> : null}
      sub={d ? `${d.ownerName ?? '담당 없음'} 작성 · ${d.createdOn}` : undefined}
      footer={footer}
    >
      {q.isLoading ? <Banner tone="neutral">불러오는 중…</Banner> : null}
      {q.isError ? <Banner tone="danger">{apiMessage(q.error)}</Banner> : null}

      {d ? (
        <div className="flex gap-3">
          {/* 원문 §65 왼쪽의 「보고」 동그라미 — 문서의 종류를 적는 표지다 */}
          <span aria-hidden className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fg text-[10px] font-bold text-white">보고</span>
          <article aria-label="기획 보고서 본문" className="min-w-0 flex-1 rounded-lg border border-line border-t-4 border-t-amber bg-card px-8 py-6 shadow-sm">
          {/* 레터헤드 (w5 · 65-2) — 값은 전부 서버가 준 것이다 (D-R37) */}
          <div className="flex items-baseline justify-between gap-2 text-[11px] font-bold tracking-[0.2em] text-fg-subtle">
            <span>TN ACADEMY · 기획 보고</span>
            <span className="tracking-normal">{d.createdOn.replaceAll('-', '.')}</span>
          </div>
          <p className="mt-5 text-[26px] font-bold leading-tight text-fg">{d.title}</p>
          <dl className="mt-3 flex flex-wrap gap-x-10 gap-y-2">
            <div>
              <dt className="text-[10.5px] text-fg-subtle">담당</dt>
              <dd className="text-[14px] font-bold text-fg">{d.ownerName ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[10.5px] text-fg-subtle">마감</dt>
              <dd className="flex items-baseline gap-2">
                <b className={`text-[14px] ${d.overdueDays > 0 ? 'text-red' : 'text-fg'}`}>{d.dueOn ?? '미정'}</b>
                {d.overdueDays > 0 ? <span className="text-[11px] text-fg-subtle">{d.overdueDays}일 지남</span> : null}
              </dd>
              {d.dueState === 'none' ? null
                : <Chip className="mt-1" size="compact" styleKind="solid" tone={d.dueState === 'approved' ? 'success' : 'warning'}>{d.dueStateLabel}</Chip>}
            </div>
            <div>
              <dt className="text-[10.5px] text-fg-subtle">과제</dt>
              <dd className="text-[14px] font-bold text-fg" aria-label={`과제 ${d.taskDone}/${d.tasks.length}`}>{d.taskDone}/{d.tasks.length}</dd>
            </div>
          </dl>
          <hr className="mt-5 border-t-2 border-fg" />

          {/* 원문의 기한 띠 — 승인 전에만 뜬다 */}
          {d.dueState === 'proposed' ? (
            <Banner tone="warning" className="mt-2">
              <div className="flex flex-wrap items-center gap-2">
                <b>기한 제안 {d.dueOn}</b>
                <span className="text-[12px]">대표 확인을 기다립니다</span>
                {d.canDecideDue ? (
                  <span className="ml-auto flex gap-1">
                    {/* 원문 §65 — 「기한 승인」 갈색 주 단추 · 「기한 반려」 테두리 붉은 글자 (65-8) */}
                    <Button size="sm" variant="primary" disabled={due.isPending}
                      onClick={() => due.mutate({ id: d.id, approve: true })}>기한 승인</Button>
                    <Button size="sm" variant="secondary" className="text-red" disabled={due.isPending}
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

          <Section no={2} name="과제" action={d.canAddTask ? (
            <Button size="sm" variant="primary" onClick={() => setTaskOpen(true)}>+ 대표 지시</Button>
          ) : null}>
            {d.tasks.length === 0 ? (
              <p className="text-[12px] text-fg-subtle">과제가 없습니다</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {d.tasks.map((t) => <TaskRow key={t.id} t={t} busy={todoWrite.isPending} onToggle={toggleTask} />)}
              </ul>
            )}
            {todoError ? <Banner tone="danger" className="mt-2">{todoError}</Banner> : null}
            {addTask.isError ? <Banner tone="danger" className="mt-2">{apiMessage(addTask.error)}</Banner> : null}
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

          {/* 바닥 「보완 요청」을 누르면 여기 사유 칸이 선다 — 본문 끝이라 초점을 옮겨 스크롤해 보인다 */}
          {armed === 'rework' ? (
            <div className="mt-4">
              <Label htmlFor="plan-reason">보완 요청 사유 (필수)</Label>
              <Textarea id="plan-reason" rows={3} maxLength={500} value={reason} autoFocus
                onChange={(e) => setReason(e.target.value)} />
            </div>
          ) : null}
          {review.isError ? <Banner tone="danger" className="mt-3">{apiMessage(review.error)}</Banner> : null}

          {writeError ? <Banner tone="danger" className="mt-3">{apiMessage(writeError)}</Banner> : null}
          </article>
        </div>
      ) : null}
      {/* 「+ 대표 지시」 — 서랍·운영 할 일과 **같은 창**이다(할 일 · 담당 · 기한). 경로만 기획의 과제 쓰기다 */}
      {d ? (
        <TodoCreateDialog
          open={taskOpen} busy={addTask.isPending} onClose={() => setTaskOpen(false)}
          meId={meId} people={staff ?? []}
          onCreate={(body) => {
            if (body.toId == null) return;
            addTask.mutate({ id: d.id, title: body.title, toId: body.toId, ...(body.dueOn ? { dueOn: body.dueOn } : {}) });
          }}
        />
      ) : null}
    </WideDialog>
  );
}
