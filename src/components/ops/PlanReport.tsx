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
 *
 * **W11** — ① 기한 결정은 **대표가 본 날짜**를 함께 보낸다(PB-12-2 · 그 사이 옮겨졌으면 서버가 409 로 새 날짜를 말한다).
 * ② 반려된 기한은 사라지지 않고 「기한 반려 날짜 · 누가」로 남고, 담당이 새 기한을 내면 비워진다(N-95).
 * ③ 공개 범위(전체 공개 · 지정 공개)와 지정된 사람을 머리에 적고, 바꿀 수 있는 사람(`canEditShare`)에게만 고르는 칸이 선다(N-72).
 *    낱말은 운영 화면이 준 서버 낱말(`planShares`)이다 — 화면이 이름표를 들지 않는다 (D-R18).
 */
'use client';
import { useEffect, useState } from 'react';
import { Banner, Button, Checkbox, Chip, Input, Label, Segmented, Select, Textarea } from '../ui';
import { WideDialog } from '../ui/WideDialog';
import { TodoCreateDialog, type TodoPerson } from '../drawer/TodoCreateDialog';
import { apiMessage } from '@/api/client';
import {
  useAddPlanTask, useDecidePlanDue, useDrawerWrite, useMovePlanStage, usePatchPlan, usePatchPlanOwner, usePlanDetail, useReviewPlan,
} from '@/api/queries';
import { useSession } from '@/store/useSession';
import { objectParticle } from '@/lib/calendar';
import type { PlanDetail, PlanPatch, PlanShareWord, PlanTask } from '@/api/types';

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

/** 기한 상태 칩 색 — 승인 초록 · 제안 주황 · 반려 빨강(원문 §61 「기한 반려」 칩 · N-95) */
const DUE_STATE_TONE: Record<string, 'success' | 'warning' | 'danger'> = {
  approved: 'success', proposed: 'warning', rejected: 'danger',
};

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
      // 조사는 낱말 끝소리로 고른다 — 「리서치을(를)」처럼 둘 다 적지 않는다(W11 실브라우저 QA · C99 와 같은 lib/calendar.objectParticle)
      onChange={(e) => onChange(e.target.value)} placeholder={`${label}${objectParticle(label)} 적습니다`} />
  );
}

/**
 * 새 기한 내기 (N-95) — 기한이 없거나 반려된 기획에서 담당이 다시 낸다. 내면 반려 표시는 서버가 비우고
 * 다시 「기한 제안」이 된다. 쓰기는 본문 고치기와 같은 PATCH(`dueOn`)다 — 새 경로를 만들지 않는다.
 */
function DueProposal({ busy, onPropose }: { busy: boolean; onPropose: (dueOn: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <span className="ml-auto flex items-center gap-1">
      {/* 너비는 감싼 칸이 정한다 — 공용 Input 은 늘 w-full 이라 className 너비가 이기지 못한다 (CODEX §5-18) */}
      <span className="w-40">
        <Input type="date" aria-label="새 기한" value={value} disabled={busy}
          onChange={(e) => setValue(e.target.value)} />
      </span>
      <Button size="sm" variant="primary" disabled={busy || !value} onClick={() => onPropose(value)}>새 기한 내기</Button>
    </span>
  );
}

/**
 * 공개 범위 고르기 (N-72) — 두 값과 지정된 사람. 지정 공개가 아니면 사람을 보내지 않는다(서버가 409 로 막는다).
 * 담당 · 결재권자는 지정하지 않아도 늘 본다 — 고르는 것은 **그 밖에** 볼 사람이다.
 */
function ShareEditor({ detail, words, people, busy, onSave, onCancel }: {
  detail: PlanDetail;
  words: readonly PlanShareWord[];
  people: readonly TodoPerson[];
  busy: boolean;
  onSave: (body: PlanPatch) => void;
  onCancel: () => void;
}) {
  const [share, setShare] = useState<PlanShareWord['key'] | ''>(detail.share ?? '');
  const [picks, setPicks] = useState<number[]>(detail.pickIds);
  const toggle = (id: number, on: boolean) => setPicks((prev) => (on ? [...prev, id] : prev.filter((v) => v !== id)));
  return (
    <div className="mt-2 rounded-lg border border-line bg-bg-2 p-3">
      <Segmented ariaLabel="공개 범위" value={share} disabled={busy}
        options={words.map((w) => ({ value: w.key, label: w.label }))} onChange={setShare} />
      {share === 'picked' ? (
        <fieldset className="mt-2">
          <legend className="text-[11px] text-fg-subtle">볼 사람 — 담당과 결재권자는 늘 봅니다</legend>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {people.map((p) => (
              <label key={p.id} className="flex items-center gap-1 text-[12px]">
                <Checkbox checked={picks.includes(p.id)} disabled={busy}
                  onChange={(e) => toggle(p.id, e.currentTarget.checked)} aria-label={`${p.name} 지정`} />
                {p.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="mt-2 flex justify-end gap-1">
        <Button size="sm" variant="secondary" disabled={busy} onClick={onCancel}>취소</Button>
        <Button size="sm" variant="primary" disabled={busy || !share}
          onClick={() => { if (share) onSave(share === 'picked' ? { share, pickIds: picks } : { share }); }}>공개 범위 저장</Button>
      </div>
    </div>
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

export function PlanReport({ planId, staff, shareWords, onClose }: {
  planId: number | null;
  /** 「+ 대표 지시」 담당 · 지정 공개로 볼 사람을 고르는 목록 — 운영 화면이 `GET /meta` 의 staff 를 준다 */
  staff?: readonly TodoPerson[];
  /** 공개 범위 두 값의 낱말 — 운영 화면이 서버의 `planShares` 를 준다 (N-72 · D-R18) */
  shareWords?: readonly PlanShareWord[];
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
  const ownerWrite = usePatchPlanOwner();
  const move = useMovePlanStage();
  const todoWrite = useDrawerWrite();
  const [todoError, setTodoError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [armed, setArmed] = useState<'rework' | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const d = q.data;
  const [ownerId, setOwnerId] = useState('');

  /* 서버가 준 글에서 시작한다 — 다른 기획을 열거나 단계가 바뀌면 초안을 버린다
     (지난 기획의 초안이 남아 있으면 남의 글을 저장하게 된다) */
  const [draft, setDraft] = useState<Draft>(() => draftOf(d));
  /* 일부러 `d` 전체가 아니라 **어느 기획의 어느 단계인가**만 본다 — 저장 뒤 다시 읽어올 때마다
     초안을 되돌리면 적고 있던 글이 사라진다 */
  useEffect(() => { setDraft(draftOf(d)); }, [d?.id, d?.stage]);
  // 다른 기획을 열면 공개 범위 고르기를 닫는다 — 지난 기획의 고르기가 남아 있으면 남의 기획에 저장한다
  useEffect(() => { setShareOpen(false); }, [d?.id]);
  useEffect(() => { setOwnerId(d?.ownerId == null ? '' : String(d.ownerId)); }, [d?.id, d?.ownerId]);

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
      // 원문 §65 머리 「홍지승 작성 · 2026-08-15 · 전체 공개」(공개 범위는 색 글자) — 옛 기획(공개 범위 없음)은 그 칸이 없다 (N-72)
      sub={d ? (
        <>
          {`${d.ownerName ?? '담당 없음'} 작성 · ${d.createdOn}`}
          {d.shareLabel ? <> · <b className={d.share === 'picked' ? 'text-orange' : 'text-green'}>{d.shareLabel}</b></> : null}
        </>
      ) : undefined}
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
              <dd className="text-[14px] font-bold text-fg">
                {d.canChangeOwner && staff?.length ? (
                  <span className="flex items-center gap-1">
                    <Select aria-label="기획 담당" value={ownerId} disabled={ownerWrite.isPending}
                      onChange={(e) => setOwnerId(e.target.value)}>
                      <option value="">고르세요</option>
                      {(d.ownerId != null && !staff.some((p) => p.id === d.ownerId))
                        ? <option value={d.ownerId}>{d.ownerName ?? d.ownerId}</option> : null}
                      {staff.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                    <Button size="sm" variant="secondary" disabled={!ownerId || Number(ownerId) === d.ownerId || ownerWrite.isPending}
                      onClick={() => ownerWrite.mutate({ id: d.id, ownerId: Number(ownerId) })}>담당 저장</Button>
                  </span>
                ) : d.ownerName ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[10.5px] text-fg-subtle">마감</dt>
              <dd className="flex items-baseline gap-2">
                <b className={`text-[14px] ${d.overdueDays > 0 ? 'text-red' : 'text-fg'}`}>{d.dueOn ?? '미정'}</b>
                {d.overdueDays > 0 ? <span className="text-[11px] text-fg-subtle">{d.overdueDays}일 지남</span> : null}
              </dd>
              {d.dueState === 'none' ? null
                : <Chip className="mt-1" size="compact" styleKind="solid" tone={DUE_STATE_TONE[d.dueState] ?? 'warning'}>{d.dueStateLabel}</Chip>}
            </div>
            {/* 공개 범위 (N-72) — 옛 기획은 칸이 없다(모두에게 보이고 칩이 없다) */}
            {d.shareLabel ? (
              <div>
                <dt className="text-[10.5px] text-fg-subtle">공개</dt>
                <dd className="flex flex-wrap items-baseline gap-2">
                  <b className="text-[14px] text-fg">{d.shareLabel}</b>
                  {d.pickNames.length ? <span className="text-[11px] text-fg-subtle">{d.pickNames.join(', ')}</span> : null}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-[10.5px] text-fg-subtle">과제</dt>
              <dd className="text-[14px] font-bold text-fg" aria-label={`과제 ${d.taskDone}/${d.tasks.length}`}>{d.taskDone}/{d.tasks.length}</dd>
            </div>
          </dl>
          {ownerWrite.isError ? <Banner tone="danger" className="mt-2">{apiMessage(ownerWrite.error)}</Banner> : null}
          {d.canEditShare && shareWords?.length ? (
            shareOpen ? (
              <ShareEditor detail={d} words={shareWords} people={staff ?? []} busy={patch.isPending}
                onCancel={() => setShareOpen(false)}
                onSave={(b) => patch.mutate({ id: d.id, ...b }, { onSuccess: () => setShareOpen(false) })} />
            ) : (
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => setShareOpen(true)}>
                {d.shareLabel ? '공개 범위 바꾸기' : '공개 범위 정하기'}
              </Button>
            )
          ) : null}
          <hr className="mt-5 border-t-2 border-fg" />

          {/* 원문의 기한 띠 — 승인 전에만 뜬다 */}
          {d.dueState === 'proposed' ? (
            <Banner tone="warning" className="mt-2">
              <div className="flex flex-wrap items-center gap-2">
                {/* 원문 §65 띠 — 「기한 제안」 칩 · 굵은 날짜 · 한 줄, 단추는 그 아래 줄 (W11 재대조) */}
                <Chip size="compact" styleKind="solid" tone="warning">{d.dueStateLabel}</Chip>
                <b>{d.dueOn}</b>
                <span className="text-[12px]">대표 확인을 기다립니다</span>
                {d.canDecideDue ? (
                  <span className="flex basis-full gap-1">
                    {/* 원문 §65 — 「기한 승인」 갈색 주 단추 · 「기한 반려」 테두리 붉은 글자 (65-8) */}
                    {/* 대표가 **본 날짜**를 함께 보낸다 — 그 사이 옮겨졌으면 서버가 409 로 새 날짜를 말한다 (PB-12-2) */}
                    <Button size="sm" variant="primary" disabled={due.isPending || !d.dueOn}
                      onClick={() => d.dueOn && due.mutate({ id: d.id, approve: true, dueOn: d.dueOn })}>기한 승인</Button>
                    <Button size="sm" variant="secondary" className="text-red" disabled={due.isPending || !d.dueOn}
                      onClick={() => d.dueOn && due.mutate({ id: d.id, approve: false, dueOn: d.dueOn })}>기한 반려</Button>
                  </span>
                ) : null}
              </div>
            </Banner>
          ) : null}
          {d.dueState === 'approved' && d.dueApprovedByName ? (
            <p className="mt-1 text-[11px] text-fg-subtle">기한은 {d.dueApprovedByName} 님이 승인했습니다.</p>
          ) : null}
          {/* 반려된 기한은 사라지지 않는다 — 무엇을 누가 반려했는지 남고, 새 기한을 내면 비워진다 (N-95) */}
          {d.dueState === 'rejected' || (d.dueState === 'none' && d.canEdit) ? (
            <Banner tone={d.dueState === 'rejected' ? 'danger' : 'neutral'} className="mt-2">
              <div className="flex flex-wrap items-center gap-2">
                {d.dueState === 'rejected' ? (
                  <>
                    <Chip size="compact" styleKind="solid" tone="danger">{d.dueStateLabel}</Chip>
                    <b>{d.dueRejectedOn}</b>
                    <span className="text-[12px]">
                      {d.dueRejectedByName ? `${d.dueRejectedByName} 님이 반려했습니다 · ` : ''}새 기한을 내면 다시 대표 확인을 기다립니다
                    </span>
                  </>
                ) : <span className="text-[12px]">기한이 없습니다 — 기한을 내면 대표 확인을 기다립니다</span>}
                {d.canEdit ? (
                  <DueProposal busy={patch.isPending} onPropose={(dueOn) => patch.mutate({ id: d.id, dueOn })} />
                ) : null}
              </div>
            </Banner>
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
