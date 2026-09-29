/** @file-guide
 * 목적: page.tsx — IntakePage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §23 상담 단계 보드 · §24 등록 실패 — 중단 지점 분류 + 실패 지정/되살리기 input (N-25 · C35).
 * C90 (N-45 · N-44): 「+ 신규 문의」 · 카드의 「다음 단계 →」 · 유입 경로 칩 줄 · 접촉 원장(「+ 기록」) · 「사후 관리 임박」 타일 · 경고 둘.
 * DQ1 (2026-09-25): 서랍의 「진단 점수」(점수 셋 · 담당자가 고른 레벨·교재 · 이력)와 카드의 「진단 62·71·58 · Practice」 칩 — 값은 서버의 latestDiag 그대로다.
 *
 * 「그냥 실패」로 묶으면 고칠 곳을 못 찾는다. 어디서 멈췄는지를 세어 둔다.
 * 실패 전이 순간의 이전 단계는 서버가 fail_from 으로 명시 기록한다 — 화면은 추정하지 않는다.
 * 유입 경로·다음 단계·「상담 오늘」 칩도 전부 서버가 준 것을 그린다 — 화면은 날짜를 빼지도 전이표를 들지도 않는다 (D-R18 · D-R37).
 * TBO-52 1:1 대조: 카드 상세는 보드 아래 패널이 아니라 공용 `Drawer`(23-14) · §24 는 표 대신 분류 카드 + 실패 카드(24-02) ·
 * 사용자 글에는 절·결정 번호·필드명·오류 코드를 적지 않는다(23-20 — 근거 번호는 이런 주석에만 둔다).
 * wave 3: 머리 오른쪽 7탭(23-01 · 24-01) · 카드 오른쪽 위 유입 경로 배지(23-13) · 학년 칩(23-10) · 단계 기한 띠(23-12) ·
 * §24 실패 카드의 실패일 · 재연락 · 사유 분류(24-04~06) · 「실패 사유 N건」 막대(24-05) · 원문 안내 상자 둘(24-08) · 「바로 수업 등록」(24-07).
 * 띠 · 재연락 · 사유 분류의 낱말과 날짜 셈은 전부 서버가 준 것이다(D-R18 · D-R37) — 화면은 날짜를 빼지 않는다.
 * 카드의 배치안 한 줄 · 2차/진단 일정 줄(「미생성」) · 보류 재확인 날짜와 §24 「당시 배치안」(23-15 · 23-16 · 24-07)도 서버 값 그대로 그리고,
 * 적는 곳은 상세 서랍의 「2차 · 진단 일정」·「배치안」 두 칸이다.
 * wave 5: 등록 카드의 사후 관리 줄(청구서 · 교재 · 안내 · 23-18) — 서버 `aftercare` 그대로. 등록률 산식(23-19)은 서버 한 곳이다.
 * wave 6: 등록 카드의 「등록 수업」 한 줄(23-11 · 서버 `lessons`) · 카드 단계별 단추 줄(23-14 · 서버 `cardActions`) — 카드는 몸통 단추와
 * 단추 줄이 **형제**다(단추 안에 단추 없음). 입력이 필요한 단추는 상세 서랍의 그 칸을 열어 초점을 옮긴다(`drawerFocus`).
 * W11: §24 중단 지점은 **실패 당시 단계**에서 서버가 읽는다(N-87 — `failStopKey`·`failStopLabel` · 원문 넷 · 판정 없는 옛 건은 「미분류」) —
 * 실패 지정 창은 중단 지점을 묻지 않는다. 등록 카드의 해피콜 · 월간 줄과 띠는 담당의 할 일을 읽는다(N-86 · 서버 `aftercare` · `stageDue`).
 */
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Board, BoardColumn, Button, Chip, Drawer, Input, Label, PageHeader, Panel, Segmented, Select, StatCard, Table, Textarea, cn, type ChipTone, type Column, type Tone } from '@/components/ui';
import { useFailLead, useOps, useResumeLead } from '@/api/queries';
import { apiMessage } from '@/api/client';
import type { Lead, LeadFail, LeadResume } from '@/api/types';
import { SearchField, type SearchFieldHandle } from '@/components/ui/SearchField';
import { SearchEmpty } from '@/components/ui/SearchEmpty';
import { FAILURE_SEARCH_LABEL, filterLeadsByQuery } from '@/lib/intake-search';
import { LeadEnrollDialog } from '@/components/ops/LeadEnrollDialog';
import { LeadCreateButton } from '@/components/intake/LeadCreateDialog';
import { LeadStageMove } from '@/components/intake/LeadStageMove';
import { LeadTouchLog, touchAtLabel } from '@/components/intake/LeadTouchLog';
import { LeadDiagSection, diagScoresLabel } from '@/components/intake/LeadDiagSection';
import { IntakeChannelBadge } from '@/components/intake/IntakeChannelBadge';
import { LeadPlanSection, leadPlanSummary } from '@/components/intake/LeadPlanSection';
import { LeadApptSection, leadApptLine } from '@/components/intake/LeadApptSection';
import { LeadCardActions, type LeadCardFocus } from '@/components/intake/LeadCardActions';
import { LeadCoreEditor } from '@/components/intake/LeadCoreEditor';
import { won } from '@/lib/money';
import { positiveQueryId } from '@/lib/url-state';
import { hrefForStudentTimetable } from '@/lib/report-links';
import { useCan } from '@/store/useSession';
import { useWorkspace } from '@/store/useWorkspace';

/**
 * 칸의 **색만** 화면이 정한다 — 이름도 순서도 서버의 `intakeHead.funnel` 이 쥔다 (D-R18 · D-R25).
 * 여기 이름을 한 벌 더 두면 퍼널 띠와 보드가 **같은 화면에서 다른 낱말**을 쓰게 된다 (C86-b).
 */
// 원문 §23 단계색(23-04): 1차 파랑 · 2차 대기 청록 · 2차 상담 주황 · 보류 빨강 · 등록 초록 · 등록 실패 회색
const STAGE_TONE: Record<string, ChipTone> = {
  first: 'info', wait2nd: 'teal', second: 'orange', hold: 'danger', enrolled: 'success', failed: 'neutral',
};
/** 퍼널 띠 칸의 윗선·숫자 색 — 톤은 위 `STAGE_TONE` 한 벌에서만 가져온다(23-03) */
const FUNNEL_LOOK: Record<ChipTone, { line: string; num: string }> = {
  neutral: { line: 'border-t-fg-subtle', num: 'text-fg-subtle' },
  info: { line: 'border-t-blue', num: 'text-blue' },
  success: { line: 'border-t-green', num: 'text-green' },
  warning: { line: 'border-t-amber', num: 'text-amber' },
  danger: { line: 'border-t-red', num: 'text-red' },
  purple: { line: 'border-t-violet', num: 'text-violet' },
  teal: { line: 'border-t-teal', num: 'text-teal' },
  orange: { line: 'border-t-orange', num: 'text-orange' },
};

/**
 * 중단 지점 넷의 **낱말 · 순서 · 설명 한 줄은 서버가 준다**(`intakeHead.stops` · C86-b).
 * W11 · N-87: 원문 슬라이드 24 「fail.from 필드로 중단 단계 판정 · 없으면 at{} 기록을 역순으로」 그대로 — 건마다의 분류(`failStopKey`)와
 * 낱말(`failStopLabel`)도 서버가 판정해 준다. 판정 없는 옛 건은 추정 이관 없이 「미분류」(키 `none`)이고, 옛 중단 지점(`stopAtLabel`)은 읽기 전용 기록이다.
 */
type ReasonKindKey = NonNullable<LeadFail['reasonKind']>;
type ResumeKey = NonNullable<LeadResume['to']>;
/** 판정 없는 실패의 분류 키 — 서버 `intakeFailStop` 의 그것(낱말은 그런 건의 failStopLabel) */
const STOP_UNSET = 'none';
/**
 * 되살릴 단계 판정 근거 라벨 — 판정 자체는 서버 응답(revivalStage/Source)만 그린다.
 * 사용자에게는 업무 낱말만 보인다 — 「명시값」·「역순 판정」 같은 개발 낱말을 쓰지 않는다 (23-20).
 * explicit = 실패 전이 순간 서버가 lead.fail_from 에 남긴 값 · log = lead_stage_log 를 거슬러 찾은 값.
 */
const REVIVAL_SOURCE: Record<string, string> = {
  explicit: '실패로 분류할 때 남긴 단계',
  log: '단계 이동 기록',
};

/**
 * §24 실패 카드 한 장 (24-04 · 24-05 · 24-06 · 24-07) — 원본 컷 그대로: 이름 · 학년 · 학교 · 유입 경로 배지 · 재연락 칩 /
 * 사유 분류 칩 + 설명 / 「실패 날짜 · 그 전 단계」 · 「재연락 날짜 (D-N)」 · 담당 / 최근 접촉 한 줄 / 단추 셋.
 * 중단 지점은 카드에 칩으로 따로 세우지 않는다 — 원문 카드에 없고, 「· 보류 단계」 줄과 위 분류 카드가 같은 말을 한다(W11 1:1 · N-87).
 * 그 전 단계는 서버 판정 그대로다(명시값 → 도달 기록 · `failFrom` → `revivalStage`).
 * 실패일 · 재연락 · 사유 분류 낱말은 서버가 준 것이다. 실패 시각이 없는 옛 건은 「날짜 기록 없음」이라 적고 지어내지 않는다(N-25).
 * 「내역 · 상태 저장」·「단계로 되살리기」는 같은 상세 서랍(접촉 기록 · 되살리기)을 연다. 「바로 수업 등록」은 되살리기 없이 등록 확정 창으로 간다.
 */
function FailedLeadCard({ lead: l, selected, onPick, onEnroll, failFromLabel }: {
  lead: Lead; selected: boolean; onPick: () => void; onEnroll: () => void; failFromLabel: string | null;
}) {
  const last = l.touches[0];
  return (
    <article className={cn('flex h-full flex-col gap-2 rounded-xl border border-line bg-card p-3', selected ? 'outline outline-2 outline-blue' : '')}>
      <div className="flex items-start gap-2">
        <button type="button" aria-pressed={selected} onClick={onPick} className="min-w-0 grow text-left">
          <b className="text-[13px] text-fg">{l.name}</b>{' '}
          <span className="text-[11px] text-fg-subtle">{[l.grade, l.school].filter(Boolean).join(' · ') || '—'}</span>
        </button>
        <IntakeChannelBadge source={l.source} label={l.sourceLabel} />
        {l.recontact ? <Chip tone={l.recontact.tone as Tone} styleKind="solid" size="compact">{l.recontact.label}</Chip> : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {l.reasonKindLabel ? <Chip styleKind="solid" size="compact">{l.reasonKindLabel}</Chip> : null}
        {l.reason ? <span className="text-[12px] text-fg-2">{l.reason}</span> : null}
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
        <div><dt className="text-[10.5px] text-fg-subtle">실패</dt><dd className="text-fg">{l.failedAt ?? '날짜 기록 없음'}{failFromLabel ? ` · ${failFromLabel} 단계` : ''}</dd></div>
        <div><dt className="text-[10.5px] text-fg-subtle">재연락</dt><dd className="text-fg">{l.recontact?.on ? `${l.recontact.on} (${l.recontact.dueLabel})` : '—'}</dd></div>
        <div><dt className="text-[10.5px] text-fg-subtle">담당</dt><dd className="text-fg">{l.ownerName ?? '미배정'}</dd></div>
      </dl>
      {/* 원본 §24 「당시 배치안」 — 배치안 줄 그대로 · 단가는 금액을 볼 수 있을 때만 서버가 준다. 월 합계는 산식이 정해지지 않아 싣지 않는다 */}
      {l.plan?.length ? (
        <section aria-label="당시 배치안" className="rounded-lg bg-inset p-2">
          <h4 className="mb-1 text-[11.5px] font-bold text-fg">당시 배치안</h4>
          <ul className="flex flex-col gap-1">
            {l.plan.map((p) => (
              <li key={p.seq} className="rounded-md bg-card px-2 py-1 text-[11.5px] font-bold text-fg-2">
                {p.label}{p.unitPrice != null ? ` · ${won(p.unitPrice)}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {last ? (
        <p className="border-l-2 border-line pl-2 text-[11.5px] text-fg-2">
          {last.byName ?? '—'} · {touchAtLabel(last.at)} — {last.note}
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
        <Button size="sm" onClick={onPick}>내역 · 상태 저장</Button>
        <Button size="sm" onClick={onPick}>단계로 되살리기</Button>
        <Button size="sm" variant="primary" onClick={onEnroll}>바로 수업 등록</Button>
      </div>
    </article>
  );
}

/** 원본 §24 오른쪽 안내 상자 — 사유마다 다시 여는 방법 (24-08). 사유 이름은 서버 낱말과 같은 말이다 */
const REOPEN_TIPS: ReadonlyArray<[string, string]> = [
  ['비용', '과목을 줄인 축소안으로 바로 등록해볼 수 있습니다'],
  ['일정 안 맞음', '강사·시간을 바꾸면 살아납니다. 등록 화면에서 빈 시간으로 다시 잡으세요'],
  ['타 학원 등록', '한 학기 뒤 재연락이 실무상 가장 잘 됩니다'],
  ['연락 두절', '다른 연락처가 있으면 상담 카드의 접촉 기록에 추가하세요'],
];

/**
 * 머리 오른쪽 7탭 (23-01 · 24-01) — 원본 §23 「단계 보드 · 상담 일정 · 사후 관리 · 미수·결제 · 등록 실패 내역 · 표 · 마케팅 유입」.
 * 본문 컷이 없는 셋은 **이미 있는 화면으로 보낸다**(상담 일정 → 시간표 · 미수·결제 → 회계 · 마케팅 유입 → 운영의 마케팅).
 * 사후 관리 · 표는 이 화면의 같은 응답을 다르게 늘어놓는다(새 질의 없음). 미수·결제는 금액 권한(서버 플래그)이 있을 때만 선다.
 */
type View = 'board' | 'followup' | 'failed' | 'table';
type Nav = 'schedule' | 'money' | 'marketing';
const NAV_TO: Record<Nav, string> = { schedule: '/schedule', money: '/accounting', marketing: '/ops?tab=mkt' };
const isNav = (v: string): v is Nav => v in NAV_TO;

/** 카드 바탕 — 기한 띠의 톤을 따른다(오늘 = 호박 · 지남 = 빨강 · 원본 §23) */
const DUE_CARD: Record<string, string> = { danger: 'bg-red/5', warning: 'bg-amber/10' };
const DUE_BAND: Record<string, string> = {
  danger: 'bg-red text-white', warning: 'bg-amber text-white', neutral: 'bg-inset text-fg-2',
};

/** 필터 칩 모양 — 고른 것은 진한 채움, 나머지는 흰 바탕 테두리(원본 §23 필터 판) */
const pickLook = (on: boolean) => (on
  ? { tone: 'neutral' as const, styleKind: 'solid' as const }
  : { tone: 'neutral' as const, styleKind: 'outline' as const, className: 'bg-card' });

/** 경고 칩의 앞머리 기호와 색 — 원본 §23 그대로(⚠ · ⛔ 빨강 / 💰 · 📅 · 💳 호박). 문장과 차례는 서버 것이다 (23-08) */
const ALERT_LOOK: Record<string, { icon: string; tone: 'red' | 'amber' }> = {
  consultDue: { icon: '⚠', tone: 'red' },
  followUpLate: { icon: '⛔', tone: 'red' },
  unpaid: { icon: '💰', tone: 'amber' },
  noSchedule: { icon: '📅', tone: 'amber' },
  noInvoice: { icon: '💳', tone: 'amber' },
};

export default function IntakePage() {
  const [view, setView] = useState<View>('board');
  const canMoney = useCan('canMoney');
  const [failureQuery, setFailureQuery] = useState('');
  /** §24 분류 카드의 선택 — '' 는 「전체」. 칩 줄(ChipRow)과 같은 규약: 고른 카드를 한 번 더 누르면 「전체」로 (24-02) */
  const [stopFilter, setStopFilter] = useState('');
  const searchRef = useRef<SearchFieldHandle>(null);
  const q = useOps();
  const router = useRouter();
  const head = q.data?.intakeHead;
  const all = useMemo(() => q.data?.leads ?? [], [q.data]);
  /** 담당 칩 — 0 은 「담당 없음」, null 은 「전체」. 좁히는 일이라 서버에 다시 묻지 않는다 */
  const [owner, setOwner] = useState<number | null>(null);
  /** 유입 경로 칩 (N-44) — 'none' 은 옛 건(경로 NULL), null 은 「전체」. 담당 칩과 같은 모양이고 둘은 겹친다 */
  const [source, setSource] = useState<string | null>(null);
  const leads = useMemo(
    () => all
      .filter((l) => owner === null || (l.ownerId ?? 0) === owner)
      .filter((l) => source === null || (l.source ?? 'none') === source),
    [all, owner, source],
  );
  /** 「+ 신규 문의」·단계 이동·접촉 기록 뒤 한 줄 — 카드가 옮겨 간 뒤에도 무엇이 됐는지 남긴다 */
  const [notice, setNotice] = useState<string | null>(null);

  // §24 실패 지정/되살리기 초안 — 서버 판정(코드) 결과만 소비하고, 성공하면 재조회로 갈아탄다.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reasonKind, setReasonKind] = useState<ReasonKindKey | ''>('');
  const [reason, setReason] = useState('');
  /** A-08 — 실패와 같은 요청/트랜잭션에 남길 재연락 예정일. */
  const [recontactOn, setRecontactOn] = useState('');
  const [resumeTo, setResumeTo] = useState<ResumeKey | ''>('');
  const [armed, setArmed] = useState<'fail' | 'resume' | null>(null);
  // 등록 확정 창 (C91 · A-05) — 열려 있는 동안만 코드표·교재를 읽는다
  const [enrolling, setEnrolling] = useState(false);
  const setHandoff = useWorkspace((w) => w.setHandoff);
  /** 카드 단추가 연 서랍의 칸 (23-14) — 실패의 사유 · 2차/진단 일정 · 접촉 기록 · 되살릴 단계. 서랍을 닫거나 다른 건을 고르면 비운다 */
  const [drawerFocus, setDrawerFocus] = useState<LeadCardFocus | null>(null);
  const fail = useFailLead();
  const resume = useResumeLead();
  const selected = leads.find((l) => l.id === selectedId) ?? null;

  const pick = (l: Lead) => {
    setSelectedId((cur) => (cur === l.id ? null : l.id));
    setReasonKind(''); setReason(''); setRecontactOn(''); setResumeTo(''); setArmed(null); setNotice(null); setDrawerFocus(null);
    fail.reset(); resume.reset();
  };
  /** 카드 단추가 서랍을 연다 (23-14) — 이미 열린 건이면 닫지 않고 그 칸으로만 옮긴다 */
  const openLead = (l: Lead, focus: LeadCardFocus) => {
    if (selectedId !== l.id) pick(l);
    setDrawerFocus(focus);
  };
  /*
    서랍 할 일의 「원본」(상담 사후 관리 — 해피콜 · 월간 상담 · W11 A' · N-86) — 서버가 준 `/intake?lead=<id>` 가 그 건을 연다.
    이 화면에 있는 채로 다른 건의 「원본」을 눌러도(주소만 바뀐다) 그 건으로 옮긴다. 형식만 거르고(url-state)
    볼 수 있는 건인지는 서버 목록이 정한다 — 목록에 없는 번호면 아무것도 열리지 않는다.
  */
  const queryLeadId = positiveQueryId(useSearchParams().get('lead'));
  useEffect(() => {
    if (queryLeadId === null) return;
    setSelectedId(queryLeadId);
    setReasonKind(''); setReason(''); setResumeTo(''); setArmed(null); setNotice(null); setDrawerFocus(null);
    fail.reset(); resume.reset();
    // 주소의 번호가 바뀔 때만 연다(의존은 번호 하나) — 같은 번호로 다시 그려질 때마다 닫은 서랍을 되여는 일이 없게
  }, [queryLeadId]);
  // 서랍이 그려진 뒤 그 칸으로 초점을 옮긴다 — 실패는 사유 분류(중단 지점은 묻지 않는다 · N-87), 되살리기는 단계 고르기, 일정은 그 칸 머리
  useEffect(() => {
    const target = drawerFocus === 'fail' ? 'lead-reason-kind' : drawerFocus === 'resume' ? 'lead-resume-to' : drawerFocus === 'appt' ? 'lead-drawer-appt' : null;
    if (!target || selectedId === null) return;
    const t = window.setTimeout(() => {
      const el = document.getElementById(target);
      el?.scrollIntoView?.({ block: 'center' });
      el?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [drawerFocus, selectedId]);
  /** 「바로 수업 등록」(24-07) — 그 건을 고르고(되살리지 않고) 곧장 등록 확정 창을 연다 */
  const enrollNow = (l: Lead) => {
    if (selectedId !== l.id) pick(l);
    setEnrolling(true);
  };

  // 칸의 이름·순서는 서버의 퍼널 그대로다 — 화면은 색과 담을 것만 정한다 (D-R18 · D-R25)
  const stages = head?.funnel ?? [];
  const columns: Array<BoardColumn<Lead>> = stages.map((s, i) => ({
    key: s.key, label: s.label, tone: STAGE_TONE[s.key] ?? 'neutral',
    // 「보류」|「등록」 사이 구분선 — 퍼널 띠의 `⇒` 와 같은 서버 `funnel` 경계다. 「등록」 칸만 초록 바탕(23-09)
    divideBefore: i > 0 && stages[i - 1].funnel && !s.funnel,
    fill: s.key === 'enrolled',
    // 칸 아래 한 줄은 **다음에 무엇을 하는지**다 (원본 §23) — 문장도 서버가 쥔다
    sub: s.sub,
    items: leads.filter((l) => l.stage === s.key),
  }));
  /** 되살릴 수 있는 단계 — 깔때기 안(결과 칸이 아닌 것)만이다. 그 판정도 서버가 준 값이다 */
  const activeStages = stages.filter((s) => s.funnel);
  const stageLabel = (key: string | null | undefined) =>
    stages.find((s) => s.key === key)?.label ?? key ?? '—';
  /** 실패 지정 창의 안내 — 지금 단계로 실패하면 서는 분류(서버 낱말 · 키가 단계 코드다 · N-87) */
  const stopOfStage = (stage: string) => (head?.stops ?? []).find((t) => t.key === stage)?.label ?? null;

  const failed = useMemo(() => leads.filter((l) => l.stage === 'failed'), [leads]);
  const matchingFailed = useMemo(() => filterLeadsByQuery(failed, failureQuery), [failed, failureQuery]);
  const showSearch = view === 'failed' && !q.isLoading && !q.isError;
  /** 실패 사유 막대 (24-05) — 분류와 이름은 서버가 센 것이다. 막대 폭의 분모도 서버 수의 합이다 */
  const failReasons = head?.failReasons ?? [];
  const failReasonTotal = failReasons.reduce((n, r) => n + r.count, 0);
  /** 사후 관리 — 다음 연락·상담 날짜가 적힌 건을 날짜 순으로 (같은 응답 · 새 질의 없음) */
  const followUps = useMemo(
    () => leads.filter((l) => l.nextOn).sort((a, b) => (a.nextOn ?? '').localeCompare(b.nextOn ?? '') || a.id - b.id),
    [leads],
  );
  const tableCols: Array<Column<Lead>> = [
    { key: 'n', head: '이름', cell: (l) => <span className="font-bold">{l.name}</span> },
    { key: 'g', head: '학년', width: 70, cell: (l) => l.grade ?? '—' },
    { key: 's', head: '학교', cell: (l) => l.school ?? '—' },
    { key: 'src', head: '유입 경로', width: 110, cell: (l) => l.sourceLabel ?? '경로 없음' },
    { key: 'st', head: '단계', width: 100, cell: (l) => <Chip tone={STAGE_TONE[l.stage] ?? 'neutral'}>{stageLabel(l.stage)}</Chip> },
    { key: 'o', head: '담당', width: 90, cell: (l) => l.ownerName ?? '미배정' },
    { key: 'c', head: '접수', width: 100, cell: (l) => l.createdAt },
    { key: 'nx', head: '다음', width: 150, cell: (l) => l.stageDue ? [l.stageDue.task, l.stageDue.dueLabel].filter(Boolean).join(' · ') : (l.nextLabel ?? '—') },
  ];
  const followCols: Array<Column<Lead>> = [
    { key: 'd', head: '다음 날짜', width: 110, cell: (l) => <span className="font-bold">{l.nextOn}</span> },
    { key: 'n', head: '이름', cell: (l) => l.name },
    { key: 'st', head: '단계', width: 100, cell: (l) => stageLabel(l.stage) },
    { key: 'k', head: '다음', width: 150, cell: (l) => (l.recontact?.dueLabel ?? l.nextLabel) ? <Chip tone={((l.nextTone ?? l.recontact?.tone) as Tone | null) ?? 'neutral'} size="compact">{l.nextLabel ?? `재연락 ${l.recontact?.dueLabel}`}</Chip> : '—' },
    { key: 'o', head: '담당', width: 90, cell: (l) => l.ownerName ?? '미배정' },
    { key: 't', head: '최근 접촉', cell: (l) => l.touches[0] ? `${l.touches[0].kindLabel} · ${l.touches[0].note}` : '—' },
  ];

  /** 실패 건을 서버가 판정한 분류로 묶는다(N-87) — 화면은 단계를 읽어 분류를 짓지 않는다 */
  const stopRows = useMemo(() => {
    const g = new Map<string, Lead[]>();
    for (const l of matchingFailed) {
      const k = l.failStopKey ?? STOP_UNSET;
      g.set(k, [...(g.get(k) ?? []), l]);
    }
    return [...g.entries()].map(([k, v]) => ({ key: k, count: v.length, items: v }));
  }, [matchingFailed]);

  /**
   * §24 분류 카드 (24-02) — 표 대신 「전체 + 서버의 네 분류」 카드. 묶음과 건수는 위 `stopRows` 그대로다.
   * 네 분류는 0 건이어도 선다(분류는 어휘다 — 칩 줄과 같은 규약) · 카드 아래 한 줄은 원문 설명 그대로(서버 `sub`).
   * 「미분류」는 그런 실패 건이 있을 때만 서고, 낱말은 그 건의 서버 낱말이다(N-87 · 대응표 이관 없음).
   * 건수는 검색이 적용된 실패 건을 센다 — 검색이 이 화면의 축이다 (C86-b).
   */
  const stopCards = useMemo(() => {
    const countOf = (key: string) => stopRows.find((r) => r.key === key)?.count ?? 0;
    const cards: Array<{ key: string; label: string; sub?: string; count: number }> =
      (head?.stops ?? []).map((t) => ({ key: t.key, label: t.label, sub: t.sub, count: countOf(t.key) }));
    const unset = failed.find((l) => (l.failStopKey ?? STOP_UNSET) === STOP_UNSET);
    return unset ? [...cards, { key: STOP_UNSET, label: unset.failStopLabel ?? '—', count: countOf(STOP_UNSET) }] : cards;
  }, [stopRows, head?.stops, failed]);
  /** 고른 분류가 사라졌으면(재조회) 「전체」로 읽는다 — 빈 목록을 남기지 않는다 */
  const activeStop = stopCards.some((c) => c.key === stopFilter) ? stopFilter : '';
  const shownFailed = activeStop === '' ? matchingFailed : (stopRows.find((r) => r.key === activeStop)?.items ?? []);

  return (
    <RequireAuth><AppShell>
      <PageHeader
        title="상담"
        sub="유입 즉시 1차 카드 생성 → 2차(진단고사) → 보류 · 등록 · 등록 실패"
        right={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Segmented<View | Nav>
              ariaLabel="상담 보기"
              className="max-w-full flex-wrap"
              value={view}
              onChange={(v) => { if (isNav(v)) router.push(NAV_TO[v]); else setView(v); }}
              options={[
                { value: 'board', label: '단계 보드' },
                { value: 'schedule', label: '상담 일정' },
                { value: 'followup', label: '사후 관리' },
                ...(canMoney ? [{ value: 'money' as const, label: '미수 · 결제' }] : []),
                { value: 'failed', label: '등록 실패 내역' },
                { value: 'table', label: '표' },
                { value: 'marketing', label: '마케팅 유입' },
              ]}
            />
            {head ? (
              <LeadCreateButton
                sources={head.sources}
                onDone={(row) => { setSelectedId(row.id); setNotice(`${row.name} 신규 문의 접수 — ${row.sourceLabel ?? '경로 없음'} · 1차 상담 칸`); }}
              />
            ) : null}
          </div>
        )}
      />

      {/*
        원본 §23 의 퍼널 띠 — 「1차 상담 › 2차 대기 › 2차 상담 › 보류 ⇒ 등록 | 등록 실패」.
        화살표가 `⇒` 로 바뀌는 자리에 뜻이 있다: 앞 넷은 아직 깔때기 안이고 뒤 둘은 끝난 결과다.
        칸 이름·순서·수는 전부 **서버가 준 것**이다 — 화면은 세지 않는다 (D-R18 · D-R37).
      */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {(head?.funnel ?? []).map((step, i, all) => (
          <span key={step.key} className="flex items-center gap-1.5">
            {i > 0 ? (
              <span aria-hidden className="px-0.5 text-[13px] text-line-2">
                {all[i - 1].funnel && !step.funnel ? '⇒' : step.funnel ? '›' : '|'}
              </span>
            ) : null}
            <span className={cn('inline-flex items-center gap-1.5 rounded-lg border border-t-[3px] border-line bg-card px-3 py-1.5', FUNNEL_LOOK[STAGE_TONE[step.key] ?? 'neutral'].line)}>
              <b className={cn('text-[15px]', FUNNEL_LOOK[STAGE_TONE[step.key] ?? 'neutral'].num)}>{step.count}</b>
              <span className="text-[12px] text-fg-subtle">{step.label}</span>
            </span>
          </span>
        ))}
        {/* 등록률 · 사후 관리 임박 — 원본은 초록 · 호박 바탕 타일에 큰 수 위 · 작은 이름 아래 (23-03) */}
        <span className="ml-2 inline-flex flex-col items-center rounded-lg border border-green/30 bg-green/10 px-3 py-1">
          <b className="text-[15px] text-green">{head?.enrollRate ?? 0}%</b>
          <span className="text-[11px] text-green">등록률</span>
        </span>
        {/* 「사후 관리 임박」 타일 (N-44) — 다음 예정일이 오늘~D+2 인 건. 수는 서버가 센다 */}
        <span className="inline-flex flex-col items-center rounded-lg border border-amber/30 bg-amber/10 px-3 py-1" title="다음 접촉·상담 예정일이 오늘부터 이틀 안인 건">
          <b className="text-[15px] text-amber">{head?.followUpSoon ?? 0}</b>
          <span className="text-[11px] text-amber">사후 관리 임박</span>
        </span>
      </div>

      {/*
        필터 한 판 (23-05 · 23-06 · 23-07) — 원본 순서 그대로 한 줄: 「유입 경로」(글자 배지 + 서버가 센 수 · 「전체 N」) → 「담당」(이름만).
        그 아래 오른쪽 정렬로 경고 줄. 담당 · 유입 경로 칩은 서로 겹쳐 걸린다. 사람 · 경로 · 수는 서버가 준다.
      */}
      <div className="mb-3 rounded-xl border border-line bg-inset px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] text-fg-subtle">유입 경로</span>
          <Chip {...pickLook(source === null)}>
            <button type="button" onClick={() => setSource(null)}>전체 {all.length}</button>
          </Chip>
          {(head?.sources ?? []).map((s) => (
            <Chip key={s.key} {...pickLook(source === s.key)}>
              <button type="button" onClick={() => setSource(s.key)} className="inline-flex items-center gap-1">
                <IntakeChannelBadge source={s.key} label={s.label} decorative />{s.label} {s.count}
              </button>
            </Chip>
          ))}
          <span className="ml-3 mr-1 text-[12px] text-fg-subtle">담당</span>
          <Chip {...pickLook(owner === null)}>
            <button type="button" onClick={() => setOwner(null)}>전체</button>
          </Chip>
          {(head?.owners ?? []).map((o) => (
            <Chip key={String(o.id ?? 'none')} {...pickLook(owner === (o.id ?? 0))}>
              <button type="button" onClick={() => setOwner(o.id ?? 0)}>{o.name}</button>
            </Chip>
          ))}
        </div>

        {/* 경고 줄 — 누르면 그 화면으로 간다 (D-R27). 문장 · 차례는 서버가 만든다. 앞머리 기호와 색(상담·사후 관리 = 빨강 · 돈·시간표·청구서 = 호박)만 화면이 정한다 (23-08) */}
        {(head?.alerts ?? []).some((a) => a.count > 0) ? (
          <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
            {(head?.alerts ?? []).filter((a) => a.count > 0).map((a) => {
              const look = ALERT_LOOK[a.key] ?? { icon: '', tone: 'amber' as const };
              return (
                <button key={a.key} type="button" onClick={() => { if (a.go !== '/intake') router.push(a.go); }}
                  className={cn('inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-bold transition-colors',
                    look.tone === 'red' ? 'bg-red/10 text-red hover:bg-red/15' : 'bg-amber/10 text-amber hover:bg-amber/15')}>
                  {look.icon ? <span aria-hidden>{look.icon}</span> : null}{a.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* 신규 문의 · 단계 이동 · 접촉 기록 뒤 한 줄 — 카드가 다른 칸으로 옮겨 가도 무엇이 됐는지 남는다. 상세 서랍이 열려 있으면 그 안에 선다 */}
      {notice && !selected ? <Banner tone="success" className="mb-3">{notice}</Banner> : null}

      {/* 탭 왕복·재조회 오류 복구 때 입력과 FQ를 함께 보존하되, 비활성 상태에는 숨긴다. */}
      <div hidden={!showSearch} className={showSearch ? 'mb-3 flex flex-wrap items-center justify-between gap-3' : 'hidden'}>
        <span id="failure-search-status" role="status" className="text-[12px] text-fg-2">
          검색 결과 {matchingFailed.length}건 / 전체 {failed.length}건
        </span>
        <div className="w-full sm:w-[360px]">
          <SearchField ref={searchRef} label={FAILURE_SEARCH_LABEL} placeholder={FAILURE_SEARCH_LABEL}
            onQueryChange={setFailureQuery} controls="failure-search-results" />
        </div>
      </div>

      {q.isLoading ? <Banner tone="neutral">불러오는 중…</Banner>
        // 실패 문장은 서버 말 그대로다 — 모든 실패를 「권한 없음」으로 바꿔 말하지 않는다 (23-20 · 컨설팅과 같은 규약)
        : q.isError ? <Banner tone="danger">{apiMessage(q.error)}</Banner>
        : view === 'board' ? (
          <Board
            columns={columns}
            // 원문 §23 칸 머리: 윗선 단계색 3px · 건수는 이름 바로 옆 숫자(23-09)
            accent
            countStyle="inline"
            itemKey={(l) => l.id}
            renderCard={(l) => (
              // 카드 한 장 = 몸통 단추(누르면 상세 서랍) + 단계별 단추 줄(23-14) — 둘은 형제다. 단추 안에 단추를 두지 않는다(접근성)
              <div
                className={cn(
                  '-m-2.5 rounded-lg p-2.5',
                  l.stageDue ? DUE_CARD[l.stageDue.tone] : '',
                  selectedId === l.id ? 'outline outline-2 outline-blue' : '',
                )}
              >
              <button
                type="button"
                aria-pressed={selectedId === l.id}
                onClick={() => pick(l)}
                className="block w-full text-left"
              >
                {/* 이름 · 학년 칩 · 오른쪽 위 유입 경로 배지 (23-10 · 23-13) — 접수 경과 「N일」은 원문에 없어 뺐다 */}
                <div className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="text-[12px] font-bold text-fg">{l.name}</span>
                    {l.grade ? <Chip size="compact">{l.grade}</Chip> : null}
                  </span>
                  <IntakeChannelBadge source={l.source} label={l.sourceLabel} />
                </div>
                {/* 학교 · 담당 — 학교를 모르면 「—」 자리를 남긴다(원본 §23 등록 카드 「— · 김민선」 · W11 1:1) */}
                <div className="mt-0.5 text-[10.5px] text-fg-subtle">{`${l.school || '—'} · ${l.ownerName ?? '미배정'}`}</div>
                {/* 카드 한 줄 메모 (23-11) — 실패 건은 사유(기울임), 1차는 「원하는 것」, 그 밖은 배치안.
                    「원하는 것」은 이제 LEAD 칸이다(A-01 · v4.57) — 접촉 원장 글이 아니라 연락처가 섞이지 않는다(전에 카드에 안 올린 까닭이 사라졌다) */}
                {l.stage === 'first' && l.want ? (
                  <p className="mt-1 border-l-2 border-line pl-1.5 text-[10.5px] text-fg-2"><span className="sr-only">원하는 것: </span>{l.want}</p>
                ) : null}
                {l.stage === 'failed' && l.reason ? (
                  <p className="mt-1 border-l-2 border-line pl-1.5 text-[10.5px] italic text-fg-2">{l.reason}</p>
                ) : null}
                {/* 실패 카드의 「상태」 한 줄 — 원본 §23 「상태 · 재연락 완료 · 09-18」. 낱말 · 날짜는 서버의 재연락 판정 그대로(24-06 과 같은 값 · W11 1:1) */}
                {l.stage === 'failed' && l.recontact ? (
                  <div className="mt-1 flex items-center gap-2 rounded bg-inset px-1.5 py-0.5 text-[10px] text-fg-2">
                    <span className="w-9 shrink-0 font-bold">상태</span>
                    <span className="min-w-0 grow truncate">{l.recontact.label}{l.recontact.on ? ` · ${l.recontact.on.slice(5)}` : ''}</span>
                  </div>
                ) : null}
                {/* 배치안 한 줄 (23-16) — 원본 「SAT Reading 주2 · Rebecca」. 낱말은 서버의 줄 label 을 잇는다 */}
                {l.stage !== 'failed' && l.stage !== 'enrolled' && l.plan?.length ? (
                  <p className="mt-1 border-l-2 border-line pl-1.5 text-[10.5px] font-bold text-fg-2">{leadPlanSummary(l.plan)}</p>
                ) : null}
                {/* 등록 카드의 「등록 수업」 한 줄 (23-11) — 원본 「모의수업 A 주1 · KJ」. 그 학생의 지금 명단을 서버가 낱말로 만든다(배치안과 같은 모양) ·
                    등록 건에만 선다 */}
                {l.lessons?.length ? (
                  <p className="mt-1 border-l-2 border-line pl-1.5 text-[10.5px] font-bold text-fg-2">
                    <span className="sr-only">등록 수업: </span><span>{l.lessons.join(' · ')}</span>
                  </p>
                ) : null}
                {/* 2차 · 진단 일정 (23-15) — 시간표에 아직 없으면 「미생성」. 판정은 서버의 scheduled */}
                {l.appts?.length ? (
                  <ul aria-label={`${l.name} 일정`} className="mt-1 flex flex-col gap-0.5">
                    {l.appts.map((a) => (
                      <li key={a.kind} className={cn('flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px]', a.scheduled ? 'bg-inset text-fg-2' : 'bg-red/5 text-red')}>
                        <span className="w-6 shrink-0 font-bold">{a.kindLabel}</span>
                        <span className="min-w-0 grow truncate">{leadApptLine(a)}</span>
                        {a.scheduled ? null : <Chip tone="danger" styleKind="solid" size="compact">미생성</Chip>}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {/* 등록 카드의 사후 관리 줄 (23-18) — 원본 §23 「해피콜 완료 08-15 · 월간 완료 · 청구서 없음 · 교재 없음 · 안내 없음」. 낱말까지 서버가 준다.
                    됨은 초록 · 아직은 회색. 해피콜 · 월간은 등록 확정이 만든 담당의 할 일을 읽는다(W11 · N-86 — 할 일을 끝내면 「완료」) */}
                {l.aftercare?.length ? (
                  <ul aria-label={`${l.name} 사후 관리`} className="mt-1 flex flex-col gap-0.5">
                    {l.aftercare.map((a) => (
                      <li key={a.key} className={cn('flex items-center gap-2 rounded px-1.5 py-0.5 text-[10px]', a.done ? 'bg-green/10 text-green' : 'bg-inset text-fg-2')}>
                        <span className="w-9 shrink-0 font-bold">{a.label}</span>
                        <span className="min-w-0 grow truncate">{a.value}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {/* 보류 재확인 날짜 (23-16) — 서버가 센 유효값 */}
                {l.stage === 'hold' && l.recheckOn ? (
                  <p className="mt-1 text-[10.5px] font-bold text-red">재확인 {l.recheckOn}</p>
                ) : null}
                {/* 단계 기한 띠 (23-12) — 할 일 · 기한은 서버가 만든다. 들어온 날을 모르는 옛 건은 띠가 없다 */}
                {l.stageDue ? (
                  <div className={cn('mt-1.5 flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[10.5px] font-bold', DUE_BAND[l.stageDue.tone] ?? DUE_BAND.neutral)}>
                    <span className="min-w-0 truncate" title={l.stageDue.task}>{l.stageDue.task}</span>
                    {l.stageDue.dueLabel ? <span className="shrink-0">{l.stageDue.dueLabel}</span> : null}
                  </div>
                ) : null}
                {/* 재촉 칩 — 실패 건에는 서버가 싣지 않는다. 실패 카드에 중단 지점 칩은 원문에 없다(§24 분류 카드가 말한다 · W11 1:1) */}
                <div className="mt-1.5 flex items-center justify-end gap-1">
                  {l.nextLabel ? <Chip tone={(l.nextTone as 'danger' | 'warning' | 'info' | null) ?? 'neutral'} size="compact">{l.nextLabel}</Chip> : null}
                </div>
                {/* 최신 진단 한 줄 (DQ1) — 영어·수학·인터뷰 차례 · 레벨은 담당자가 고른 값이 있을 때만 */}
                {l.latestDiag ? (
                  <div className="mt-1">
                    <Chip tone="neutral" size="compact">진단 {diagScoresLabel(l.latestDiag)}{l.latestDiag.levelLabel ? ` · ${l.latestDiag.levelLabel}` : ''}</Chip>
                  </div>
                ) : null}
              </button>
              {/* 단계별 단추 줄 (23-14) — 서는 단추 · 낱말 · 도착 단계는 서버 `cardActions` 그대로. 입력이 필요한 단추는 서랍의 그 칸을 연다 */}
              <LeadCardActions lead={l} onOpen={(focus) => openLead(l, focus)} onEnroll={() => enrollNow(l)} onDone={setNotice} />
              </div>
            )}
          />
        ) : view === 'followup' ? (
          <Panel title={`사후 관리 ${followUps.length}건`} sub="다음 연락·상담 날짜가 적힌 건 — 날짜 순">
            <Table columns={followCols} rows={followUps} rowKey={(l) => l.id} onRowClick={(l) => pick(l)} empty="다음 날짜가 적힌 건이 없습니다" />
          </Panel>
        ) : view === 'table' ? (
          <Panel title={`상담 ${leads.length}건`}>
            <Table columns={tableCols} rows={leads} rowKey={(l) => l.id} onRowClick={(l) => pick(l)} empty="상담 건이 없습니다" />
          </Panel>
        ) : (
          <>
            <div id="failure-search-results" aria-describedby="failure-search-status">
              {/* 원본 §24 「어느 단계에서 멈췄는지 · 전체 N명」 — 누르면 그 분류만 남는다 (24-02 · 24-09 · 슬라이드 24 「분류 클릭 → FSTOP 필터」) */}
              <Panel className="mb-3" title="어느 단계에서 멈췄는지" sub={`전체 ${failed.length}명`}>
                <div role="group" aria-label="중단 지점으로 거르기" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {[{ key: '', label: '전체', count: matchingFailed.length }, ...stopCards].map((c) => {
                    const on = activeStop === c.key;
                    return (
                      <button
                        key={c.key || 'all'}
                        type="button"
                        aria-pressed={on}
                        aria-label={`${c.label} ${c.count}건`}
                        onClick={() => setStopFilter(on && c.key !== '' ? '' : c.key)}
                        className={cn('rounded-xl text-left', on ? 'ring-2 ring-primary ring-offset-1 ring-offset-bg' : '')}
                      >
                        <StatCard label={c.label} value={c.count} tone={c.key === '' ? 'neutral' : 'danger'}
                          note={'sub' in c ? c.sub : undefined} className={on ? 'bg-inset' : undefined} />
                      </button>
                    );
                  })}
                </div>
              </Panel>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div>
                  {failureQuery.trim() && matchingFailed.length === 0
                    ? <SearchEmpty onClear={() => searchRef.current?.clear()} />
                    : shownFailed.length === 0
                      ? <p className="rounded-xl border border-line bg-card p-6 text-center text-[12px] text-fg-subtle">
                        {failed.length === 0 ? '실패한 상담이 없습니다' : '이 분류에 해당하는 실패 건이 없습니다'}
                      </p>
                      : (
                        <ul aria-label="실패한 상담" className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          {shownFailed.map((l) => (
                            <li key={l.id}>
                              <FailedLeadCard lead={l} selected={selectedId === l.id} onPick={() => pick(l)} onEnroll={() => enrollNow(l)}
                                failFromLabel={(l.failFrom ?? l.revivalStage) ? stageLabel(l.failFrom ?? l.revivalStage) : null} />
                            </li>
                          ))}
                        </ul>
                      )}
                </div>
                <aside className="flex flex-col gap-3">
                  {/* 원본 §24 오른쪽 「실패 사유 N건」 — 분류마다 막대와 이름 칩. 수는 서버가 센다 (24-05) */}
                  <Panel title={`실패 사유 ${failReasonTotal}건`}>
                    <ul aria-label="실패 사유" className="flex flex-col gap-2.5">
                      {failReasons.map((r) => (
                        <li key={r.key}>
                          <div className="flex items-center gap-2 text-[12px]">
                            <span className="w-24 shrink-0 font-bold text-fg">{r.label}</span>
                            <span aria-hidden className="h-1.5 grow overflow-hidden rounded-full bg-line-2">
                              <span className="block h-full rounded-full bg-fg-2" style={{ width: `${failReasonTotal ? (r.count / failReasonTotal) * 100 : 0}%` }} />
                            </span>
                            <span className="w-8 shrink-0 text-right text-fg-2">{r.count}건</span>
                          </div>
                          {r.names.length ? (
                            <div className="mt-1 flex flex-wrap gap-1 pl-[104px]">
                              {r.names.map((n, i) => <Chip key={`${n}-${i}`} size="compact">{n}</Chip>)}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </Panel>
                  {/* 원본 §24 안내 상자 둘 (24-08) */}
                  <section className="rounded-xl border border-green/30 bg-green/5 p-3">
                    <h3 className="mb-1.5 text-[13px] font-bold text-green">사유마다 다시 여는 방법이 다릅니다</h3>
                    <ul className="list-disc space-y-1 pl-4 text-[12px] text-fg-2">
                      {REOPEN_TIPS.map(([k, v]) => <li key={k}><b className="text-fg">{k}</b> — {v}</li>)}
                    </ul>
                  </section>
                  <section className="rounded-xl border border-amber/30 bg-amber/5 p-3">
                    <h3 className="mb-1.5 text-[13px] font-bold text-amber">바로 수업 등록</h3>
                    <ul className="list-disc space-y-1 pl-4 text-[12px] text-fg-2">
                      <li>되살리기 없이 등록 확정 화면으로 바로 갑니다</li>
                      <li>당시 배치안이 그대로 채워지고, 요일·시간만 다시 잡으면 됩니다</li>
                      <li>실패 이력은 남습니다</li>
                    </ul>
                  </section>
                </aside>
              </div>
            </div>
          </>
        )}

      {/*
        카드 상세 (23-14) — 예전에는 보드 아래 패널이라 1600×1000 첫 화면 밖(y≈960)에 열렸다.
        공용 `Drawer` 로 옮겨 카드를 누르면 바로 옆에서 동작(단계 이동 · 접촉 기록 · 등록 확정 · 실패 분류 · 되살리기)이 보인다.
        안의 부품(LeadStageMove · LeadTouchLog · LeadEnrollDialog · 실패/되살리기)은 그대로 쓴다.
      */}
      <Drawer
        open={selected !== null}
        onClose={() => { if (selected) pick(selected); }}
        width={560}
        title={selected ? `${selected.name} — ${stageLabel(selected.stage)}${selected.sourceLabel ? ` · ${selected.sourceLabel}` : ''}` : undefined}
        sub="단계 이동 · 접촉 기록 · 진단 점수 · 등록 확정 · 실패 분류"
      >
        {selected ? (
          <>
            {notice ? <Banner tone="success" className="mb-2">{notice}</Banner> : null}
            <div className="mb-3">
              <LeadCoreEditor lead={selected} sources={head?.sources ?? []} onDone={(row) => setNotice(`${row.name} 문의 정보를 고쳤습니다`)} />
            </div>
            {/* 단계 이동 (C90 · N-45) — 갈 수 있는 곳이 없으면(등록 · 등록 실패) 서지 않는다 */}
            <div className="mb-3">
              <LeadStageMove
                key={`${selected.id}-${selected.stage}`}
                lead={selected}
                onDone={(row) => setNotice(`${row.name} → ${stageLabel(row.stage)} — 도달 기록에 남겼습니다`)}
              />
            </div>
            {/* 접촉 원장 (C90 · N-44) — 끝난 건에도 적는다 (사후 관리) */}
            <div className="mb-3">
              <LeadTouchLog
                // 카드의 「사후 관리」(23-14)가 열었으면 「+ 기록」 칸을 연 채로 다시 세운다
                key={`${selected.id}-${drawerFocus === 'touch' ? 'add' : 'view'}`}
                defaultAdding={drawerFocus === 'touch'}
                lead={selected}
                kinds={head?.touchKinds ?? []}
                onDone={(row) => setNotice(row.nextLabel ? `기록했습니다 — ${row.nextLabel}` : '기록했습니다')}
              />
            </div>
            {/* 진단 점수 (DQ1) — 점수만 적고 레벨·교재는 담당자가 고른다. 끝난 건에도 적는다(등록 뒤에는 그 학생의 진단으로 읽힌다) */}
            <div className="mb-3">
              <LeadDiagSection key={selected.id} lead={selected} onDone={() => setNotice('진단 점수를 기록했습니다')} />
            </div>
            {/* 2차 · 진단 일정 · 「스케줄에 N건 만들기」 (23-15) · 배치안 · 보류 「연장 +2일」 (23-16) — 깔때기 안에서만 적는다(서버도 409) */}
            {/* 카드의 「2차 · 진단 잡기」(23-14)가 초점을 옮기는 자리 */}
            <div className="mb-3" id="lead-drawer-appt" tabIndex={-1}>
              <LeadApptSection key={selected.id} lead={selected} kinds={head?.apptKinds ?? []}
                editable={activeStages.some((s) => s.key === selected.stage)} onDone={setNotice} />
            </div>
            <div className="mb-3">
              <LeadPlanSection key={selected.id} lead={selected}
                editable={activeStages.some((s) => s.key === selected.stage)} onDone={setNotice} />
            </div>
            {selected.stage === 'enrolled' ? (
              // 서버도 409 ENROLLED_LOCKED 로 막는다 — 사람에게는 코드가 아니라 뜻을 적는다 (23-20)
              <p className="p-1 text-[12.5px] text-fg-2">등록 완료된 건입니다 — 실패로 바꿀 수 없습니다.</p>
            ) : selected.stage === 'failed' ? (
              <div className="flex flex-col gap-3">
                <p className="text-[12.5px] text-fg-2">
                  중단 지점 <b>{selected.failStopLabel ?? '—'}</b>
                  {selected.reason ? <> · 사유 「{selected.reason}」</> : null}
                  {/* 옛 중단 지점 — 대응표로 옮기지 않은 예전 기록을 그대로 읽는다(N-87 · 읽기 전용) */}
                  {selected.stopAtLabel ? <span className="text-fg-subtle"> · 예전 기록 「{selected.stopAtLabel}」</span> : null}
                </p>
                {selected.revivalStage ? (
                  <Banner tone="info">
                    되살리면 <b>{stageLabel(selected.revivalStage)}</b> 단계로 돌아갑니다 —
                    근거: {REVIVAL_SOURCE[selected.revivalSource ?? ''] ?? '—'}.
                  </Banner>
                ) : (
                  // 실패 전 단계를 지어내지 않는다(N-25 · 추정 이관 금지) — 사용자에게는 그 결과만 말한다
                  <Banner tone="warning">
                    미분류 — 실패 전 단계 기록이 없는 예전 건입니다. 되살릴 단계를 직접 골라 주세요.
                  </Banner>
                )}
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-52">
                    <Label htmlFor="lead-resume-to">되살릴 단계{selected.revivalStage ? ' (비우면 기록된 단계)' : ' (지정 필수)'}</Label>
                    <Select id="lead-resume-to" value={resumeTo}
                      onChange={(e) => { setResumeTo(e.target.value as ResumeKey | ''); setArmed(null); }}>
                      <option value="">{selected.revivalStage ? `기록된 단계 — ${stageLabel(selected.revivalStage)}` : '단계 선택'}</option>
                      {activeStages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </Select>
                  </div>
                  <Button
                    size="sm"
                    variant={armed === 'resume' ? 'primary' : 'secondary'}
                    disabled={resume.isPending || (!selected.revivalStage && !resumeTo)}
                    title={!selected.revivalStage && !resumeTo ? '미분류 — 단계를 지정해야 합니다' : undefined}
                    onClick={() => {
                      if (armed === 'resume') {
                        resume.mutate({ id: selected.id, ...(resumeTo ? { to: resumeTo } : {}) }, { onSettled: () => setArmed(null) });
                      } else setArmed('resume');
                    }}
                  >
                    {armed === 'resume' ? '한 번 더 누르면 되살리기' : '단계로 되살리기'}
                  </Button>
                  {/* 원본 §24 「바로 수업 등록」 (24-07) — 되살리기 없이 등록 확정 창으로. 실패 이력은 서버가 남긴다 */}
                  <Button size="sm" variant="primary" onClick={() => setEnrolling(true)}>바로 수업 등록</Button>
                </div>
                {resume.isError ? <Banner tone="danger">{apiMessage(resume.error)}</Banner> : null}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {/* 등록 확정 (C91 · A-05) — 깔때기 안의 어느 단계에서든(보류 → 등록도 같은 길 · A-12). 일곱 가지는 서버가 한 번에 한다 */}
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-inset px-3 py-2">
                  <Button size="sm" onClick={() => setEnrolling(true)}>등록 확정</Button>
                  <span className="text-[11px] text-fg-subtle">배치안을 적고 미리 본 뒤 — 학생 · 등록 · 시간표 · 첫 달 청구서 · 교재 · 안내 초안 · 알림이 한 번에 만들어집니다</span>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  {/* 사유 분류 다섯 (24-05) — 낱말은 서버의 failReasons. 비우면 기존 분류 유지. 중단 지점은 묻지 않는다(지금 단계에서 서버가 판정 · N-87) */}
                  <div className="w-44">
                    <Label htmlFor="lead-reason-kind">사유 분류</Label>
                    <Select id="lead-reason-kind" value={reasonKind} onChange={(e) => setReasonKind(e.target.value as ReasonKindKey | '')}>
                      <option value="">분류 선택</option>
                      {failReasons.filter((r) => r.key !== 'none').map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </Select>
                  </div>
                  <div className="min-w-60 grow">
                    <Label htmlFor="lead-fail-reason" hint="비우면 기존 사유 유지">사유 (선택 · 500자)</Label>
                    <Textarea id="lead-fail-reason" rows={2} maxLength={500} className="min-h-[44px]"
                      value={reason} onChange={(e) => setReason(e.target.value)} />
                  </div>
                  <div className="w-48">
                    <Label htmlFor="lead-fail-recontact" hint="비우면 재연락 일정을 만들지 않습니다">재연락 예정일 (선택)</Label>
                    <Input id="lead-fail-recontact" type="date" value={recontactOn}
                      onChange={(e) => setRecontactOn(e.target.value)} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={armed === 'fail' ? 'danger' : 'secondary'}
                    disabled={fail.isPending}
                    onClick={() => {
                      if (armed === 'fail') {
                        fail.mutate(
                          {
                            id: selected.id,
                            ...(reasonKind ? { reasonKind } : {}),
                            ...(reason.trim() ? { reason: reason.trim() } : {}),
                            ...(recontactOn ? { nextOn: recontactOn } : {}),
                          },
                          { onSettled: () => setArmed(null) },
                        );
                      } else setArmed('fail');
                    }}
                  >
                    {armed === 'fail' ? '한 번 더 누르면 실패 확정' : '실패로 분류'}
                  </Button>
                  {/* 서버가 실패 순간의 단계를 lead.fail_from 에 남기고 그 단계가 곧 중단 지점이다(N-87) — 사람에게는 필드명 대신 그 뜻을 적는다 (23-20) */}
                  <span className="text-[11px] text-fg-subtle">
                    지금 단계 「{stageLabel(selected.stage)}」{stopOfStage(selected.stage) ? ` — 「${stopOfStage(selected.stage)}」으로 분류되고` : ' —'} 되살릴 때 이 단계로 돌아갑니다.
                  </span>
                </div>
                {fail.isError ? <Banner tone="danger">{apiMessage(fail.error)}</Banner> : null}
              </div>
            )}
          </>
        ) : null}
      </Drawer>
      {/* 등록 확정 창 — 깔때기 안의 건과 **등록 실패 건**(「바로 수업 등록」 · 24-07). 등록된 건만 빠진다 */}
      {selected && selected.stage !== 'enrolled' ? (
        <LeadEnrollDialog
          open={enrolling}
          lead={selected}
          onClose={() => setEnrolling(false)}
          onDone={(r) => {
            /*
              PDF A-05 「화면이 그 학생 주간 시간표로 이동한다」(all160 2026-09-30) — 가장 이른 첫 수업의 주로 학생별 시간표를 연다.
              무엇이 만들어졌는지 한 줄(C91)은 이 화면이 사라지므로 셸에 넘겨 목적지가 한 번 보여 준다.
            */
            const firstOn = r.series.map((x) => x.firstLessonOn).filter((d): d is string => Boolean(d)).sort()[0] ?? null;
            setHandoff({ to: '/schedule', text: `${r.studentName} 등록 확정 — 수업 ${r.series.length}개${firstOn ? ` · 첫 수업 ${firstOn}` : ''}${r.invoice ? ` · 청구서 ${r.invoice.yearMonth}` : ''} · 안내 초안 ${r.guideDrafts}건${r.aftercare?.happyCallOn ? ` · 해피콜 ${r.aftercare.happyCallOn}` : ''}${r.aftercare?.monthlyOn ? ` · 첫 월간 상담 ${r.aftercare.monthlyOn}` : ''}` });
            router.push(hrefForStudentTimetable(r.studentId, firstOn));
          }}
        />
      ) : null}
    </AppShell></RequireAuth>
  );
}
