/** @file-guide
 * 목적: LessonDetail.tsx — LessonDetailProps, LessonDetail (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §12 수업 상세 — 준비 8단계 · §79 수강 학생.
 *
 * 일정 확정 → 강사 → 강의실/줌 → 교재 → 안내 → 줌 안내 → 리포트 → 피드백
 *
 * **모달·버튼·범위 선택을 새로 만들지 않는다.** 창은 공용 `WideDialog`(원문 §12·§79 는 오른쪽 서랍이 아니라
 * 화면 가운데 큰 창 · 두 칸 · 바닥 단추 줄이다), 버튼은 `Button`, 반복 범위는 `RecurrenceScope`,
 * 겹침 안내는 `ConflictGuard` 를 그대로 쓴다 — 같은 모양을 두 번 만들면 한쪽만 고쳐진다 (`AGENT.md §6.0`).
 *
 * 이 화면이 저장할 때 부르는 것은 `useScheduleWrite` 하나다. 3범위 판정은 서버가 한다.
 * 「일정 수정」도 새 창을 만들지 않는다 — 새 일정 창(`SessionEditor`)의 편집 모드다 (원문 §12 바닥 주 단추).
 */
'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Banner, Button, Chip, ConflictGuard, Dialog, RecurrenceScope, Segmented } from '../ui';
import { WideDialog } from '../ui/WideDialog';
import { SearchField, type SearchFieldHandle } from '../ui/SearchField';
import { SearchEmpty } from '../ui/SearchEmpty';
import { hhmm, longDateLabel, studentOverlapLines } from '@/lib/calendar';
import { MASKED, won } from '@/lib/money';
import { useLessonTracking, useScheduleWrite } from '@/api/queries';
import Link from 'next/link';
import { apiMessage } from '@/api/client';
import { useCan } from '@/store/useSession';
import type { LessonTracking, Meta, Occurrence, RosterPatch, RosterResult, Scope } from '@/api/types';
import { AttendanceControl } from './AttendanceControl';
import { StudentTracking } from './StudentTracking';
import { CancelLessonDialog, type CancelLessonInput } from './CancelLessonDialog';
import { SessionEditor } from '../cal/SessionEditor';
import { LessonTodoButton } from '../drawer/TodoCreateDialog';

/**
 * 준비 줄은 **서버가 만든다** — 줄 이름도, 됐는지도, 「준비 6 / 9」도 (C82-b).
 *
 * 전에는 이 파일이 `STEPS` 표를 들고 `doneOf()` 로 스스로 판정했다. 그러면 같은 회차를 두고
 * 현황판은 「됐다」, 상세는 「아직」이라 말할 수 있고, 실제로 세 줄은 판정을 못 해
 * 「현황판에서 판정」이라고 적고 있었다 — 화면이 모른다고 고백하는 자리였다.
 *
 * 지금은 `LessonTrackingDto.prep` 이 원문 §12(온라인 9줄)·§79(현장 7줄) 그대로 내려온다.
 * 「대표 지시 할 일」은 **그 회차에 걸린 지시가 있을 때만** 서고, 「줌 안내」는 온라인에만 선다.
 */
type PrepRow = LessonTracking['prep'][number];

/**
 * 원문 §12 「단계 클릭 → 그 자리에서 처리 · 각 단계에 바로가기」 — 줄마다 ▶ 가 그 일을 하는 화면으로 간다.
 * 주소는 이미 있는 화면뿐이다(새 목적지를 만들지 않는다). 수업 리포트는 §47 이 `serId·onDate` 로 그 리포트를 연다.
 * 줌 안내(강사·학부모)는 §43 수업 안내의 「매번」 줄에서 보낸다.
 */
const PREP_LINK: Partial<Record<string, (o: Occurrence) => string>> = {
  book: () => '/books',
  guide: () => '/guides',
  zacc: () => '/zoom',
  zoomNoti: () => '/guides',
  feedback: (o) => `/reports?serId=${o.serId}&onDate=${o.onDate}`,
};

/** 시간·강사·강의실 줄은 「그 자리에서」 — 같은 창의 「일정 수정」을 연다(서버 PATCH 가 받는 칸이 바로 이 셋이다). */
const PREP_EDIT = new Set(['fixed', 'teacher', 'room']);

/** 수강 학생 줄은 이동이 아니라 **펼침**이다 — 원문 §79 는 이 줄이 ▼ 로 열려 그 안에 명단이 선다 */
const ROSTER_ROW = 'roster';

/**
 * 「+ 학생 넣기」 후보 칩을 한 번에 그리는 수 — 원문 §79 컷은 두세 줄의 칩을 보여 준다.
 * 더 있으면 이름으로 좁히라고 말한다. 표시 상한일 뿐이라 명단·권한 판정과 무관하다.
 */
const ROSTER_CANDIDATE_MAX = 15;

/** 이름 찾기 — 한글 조합형·대소문자를 같은 모양으로 맞춘다 (상담 실패 검색과 같은 규칙) */
const nameKey = (v: string) => v.normalize('NFC').toLowerCase();

/** 원문 §12 머리 「1시간」·「1.5시간」 — 분을 시간으로 적되 끝의 0 은 떼어 낸다 */
const hoursLabel = (min: number) => `${Number((min / 60).toFixed(2))}시간`;

/** 원문 §79 의 빼기 단추 둘은 연한 빨강 **테두리** 단추다 — 공용 Button 위에 색만 얹는다(새 변형을 만들지 않는다) */
const DROP_LOOK = '!border-red/40 !bg-card !text-red hover:!bg-red/5';

export interface LessonDetailProps {
  occ: Occurrence | null;
  /** 종류 이름 — 코드표에서 온다. `class` 같은 코드값을 화면에 찍지 않는다 (D-R18) */
  kindName?: string;
  subName?: string;
  /** 반복 수업이면 범위를 묻는다. 단발이면 묻지 않는다 (D-R16) */
  recurring?: boolean;
  /** 명단에 넣을 수 있는 전체 학생 — 코드표(meta)에서 온다 */
  allStudents?: Array<{ id: number; name: string; grade?: string | null }>;
  /** 휴강 창의 사유·처리 목록 — 코드표(meta)에서 온다 (C92 · D-R18). 없으면 창이 「읽는 중」이라 말한다 */
  cancelReasons?: Meta['cancelReasons'];
  cancelTreats?: Meta['cancelTreats'];
  /** 「일정 수정」 창의 강사·강의실 목록 — 코드표(meta)에서 온다. 없으면 목록이 빈 채 열린다 */
  meta?: Meta;
  /**
   * 삭제·휴강이 **성공했다**는 사실을 부르는 쪽에 돌려준다 (N-138 · C99).
   * 지금까지 이 창은 성공하면 `onClose()` 만 불러 **서버가 준 되돌리기 토큰을 버리고 있었다** —
   * 실수로 지운 사람에게 아무것도 남지 않았다.
   */
  onWritten?: (result: unknown, label: string, detail?: readonly string[]) => void;
  onClose: () => void;
}

/** 수업 상세의 방식 토글 — 「일정 수정」 창의 방식 칸과 같은 두 낱말이다 (N-56) */
const MODE_TOGGLE: Array<{ value: Occurrence['mode']; label: string }> = [
  { value: 'offline', label: '현장' },
  { value: 'online', label: '온라인' },
];

/**
 * 준비 한 줄 — 원문 §12: 완료는 초록 바탕 + 채운 초록 원 ✓, 미완은 분홍 바탕 + 빈 원.
 * 오른쪽 끝의 ▶/▼ 는 누를 수 있는 줄에만 선다 — 못 가는 줄에 화살표를 그리면 눌리지 않는 단추가 된다.
 */
function PrepLine({ row, glyph }: { row: PrepRow; glyph?: '▶' | '▼' }) {
  return (
    <>
      <span
        aria-hidden
        className={`grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-bold ${
          row.done ? 'bg-green text-white' : 'border border-line-2 bg-card text-transparent'
        }`}
      >
        ✓
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[13px] font-bold text-fg">{row.label}</span>
        {/* 부제도 서버의 낱말이다 — 「1명 / 정원 4명 · 이담흔」 (D-R18) */}
        {row.detail ? <span className="truncate text-[11.5px] text-fg-2" title={row.detail}>{row.detail}</span> : null}
      </span>
      {glyph ? <span aria-hidden className="shrink-0 text-[10px] text-fg-subtle">{glyph}</span> : null}
    </>
  );
}

const prepTone = (done: boolean) => (done ? 'border-green/25 bg-green/[0.07]' : 'border-red/20 bg-red/[0.06]');

/**
 * 원문 §79 명단 머리 「3명 [정원 4명 · 1명 더 넣을 수 있습니다] [1인 ₩0 · 수업당 ₩210,000]」.
 * 숫자와 문장은 서버가 만든 것 그대로이고(D-R37) 금액은 볼 수 있는 사람에게만 선다(D-R39).
 * 학생 트래킹과 **같은 질의**(`useLessonTracking`)를 읽는다 — 요청이 늘지 않는다 (C55).
 */
function RosterHead({ d }: { d: LessonTracking }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[15px] font-bold text-fg">{d.count}명</span>
      <Chip tone={d.canAdd > 0 ? 'info' : 'warning'}>{d.capLabel}</Chip>
      {d.priced ? (
        <Chip>
          1인 {d.canSeeAmounts && d.unitPrice != null ? won(d.unitPrice) : MASKED}
          {' · 수업당 '}
          {d.canSeeAmounts && d.total != null ? won(d.total) : MASKED}
        </Chip>
      ) : (
        <Chip tone="warning">단가표 미등록 — 가격은 표시하지 않습니다</Chip>
      )}
    </div>
  );
}

export function LessonDetail({
  occ, kindName, subName, recurring = true, allStudents, cancelReasons, cancelTreats, meta, onWritten, onClose,
}: LessonDetailProps) {
  const write = useScheduleWrite();
  const canEdit = useCan('canCrudAll');
  const canAdminPage = useCan('canAdminPage');
  const [ask, setAsk] = useState<null | { mode: 'edit' | 'delete'; run: (s: Scope) => void }>(null);
  const [askCancel, setAskCancel] = useState(false);
  /** 「일정 수정」 창 — 열 때마다 새로 그려 지난 오류·범위 선택이 남지 않는다 */
  const [editing, setEditing] = useState(false);
  /** 방식 토글로 열었으면 그 방식이 골라진 채 「일정 수정」 창이 선다 — 저장·범위는 그 창이 한다 (N-56) */
  const [presetMode, setPresetMode] = useState<Occurrence['mode'] | undefined>(undefined);
  /** 명단에 넣은 학생이 같은 시각 다른 수업에도 있다 — 막지 않고 알린다 (N-58) */
  const [overlapLines, setOverlapLines] = useState<string[]>([]);
  const [cancelErr, setCancelErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** 「+ 학생 넣기」 검색어 — 후보를 좁히기만 한다. 넣는 것은 칩을 누를 때 한 번이다 (원문 §79) */
  const [query, setQuery] = useState('');
  const searchRef = useRef<SearchFieldHandle>(null);
  const [rosterResult, setRosterResult] = useState<RosterResult | null>(null);
  /**
   * 「수강 학생」 줄의 펼침. 원문 §79(수강 학생 관리 컷)는 펼친 채이고 §12 는 접힌 채다 —
   * 명단을 고치려고 여는 창이 대부분이라 **펼친 채로** 열고, ▼ 를 누르면 접힌다.
   */
  const [rosterOpen, setRosterOpen] = useState(true);
  // 오른쪽 「학생 트래킹」 칸과 **같은 질의**다 — 키가 같아 요청이 한 번만 나간다 (C55)
  const tracking = useLessonTracking(occ?.serId ?? null, occ?.onDate ?? null, !!occ && canAdminPage);

  useEffect(() => {
    setRosterResult(null);
    setEditing(false);
    setPresetMode(undefined);
    setOverlapLines([]);
    setRosterOpen(true);
    // 검색 칸은 창과 함께 새로 그려져 비는데 검색어가 남으면 빈 칸이 후보를 몰래 좁힌다
    setQuery('');
  }, [occ?.serId, occ?.onDate]);

  if (!occ) return null;
  const prep = tracking.data?.prep ?? [];
  const lessonName = occ.title || subName || kindName || occ.kindKey;
  // 「일정 수정」이 설 수 있는 조건 한 곳 — 바닥 단추와 준비 줄 ▶ 가 같은 판정을 쓴다
  const canEditSchedule = canEdit && !occ.canceled && !!meta;

  /**
   * 수강 학생은 3범위가 아니라 **2범위**다 — 다이얼로그 없이 줄 버튼으로 바로 간다
   * (§5A.7 「확인창을 쓰지 않는다」 · D-R21). 판정과 명단 계산은 서버가 한다.
   */
  const roster = (op: RosterPatch['op'], studentId: number) => {
    if (!canEdit) return;
    setErr(null);
    setRosterResult(null);
    setOverlapLines([]);
    write.mutate(
      { kind: 'roster', serId: occ.serId, body: { op, onDate: occ.onDate, studentId } },
      {
        onError: (e) => setErr(apiMessage(e)),
        onSuccess: (result) => {
          // 그날 전체 휴강 결과도 count 를 들고 있다 — 명단 결과는 준비할 일 칸으로 가른다
          if ('needGuide' in result) setRosterResult(result);
          // 명단 넣기만 싣는다 — 판정(그날 명단 · 휴원 · 그날만 빠짐)은 서버 것이다 (N-58)
          if ('studentOverlaps' in result) setOverlapLines(studentOverlapLines(result.studentOverlaps ?? []));
        },
      },
    );
  };
  const enrolled = new Set(occ.students.map((st) => st.id));
  const addable = (allStudents ?? []).filter((st) => !enrolled.has(st.id));
  const needle = nameKey(query.trim());
  const candidates = needle ? addable.filter((st) => nameKey(st.name).includes(needle)) : addable;
  // 원문 §79 는 명단 줄에도 「교재 N · 안내 없음」을 붙인다. 오른쪽 트래킹 칸과 **같은 질의**라
  // 요청이 늘지 않는다 — 두 곳이 다른 곳에서 세면 숫자가 갈린다 (D-R37).
  const facts = new Map((tracking.data?.students ?? []).map((t) => [t.id, t]));

  /** 반복이면 범위를 먼저 묻고, 단발이면 바로 'this' 로 보낸다 */
  const withScope = (mode: 'edit' | 'delete', run: (s: Scope) => void) => {
    if (!canEdit) return;
    setErr(null);
    if (!recurring) { run('this'); return; }
    setAsk({ mode, run });
  };

  /**
   * 「휴강 · 수정」 — 이번 회차만이고 사유·처리(이월/차감/보강 이관 — 다른 날로 옮겨 잡는 것까지)·메모를 묻는다
   * (C92 · 테스트 시나리오 C-30~C-34). 시간·강사·강의실을 고치는 것은 옆의 「일정 수정」이다.
   * 「반복 끝내기…」 — 향후·모두는 수업 종료라 정책이 없다. 그 창에서 「이번만」을 고르면 다시 휴강 창으로 온다 —
   * 이번 회차의 취소가 두 길로 갈리면 한쪽만 사유가 남는다.
   */
  const openCancel = () => {
    if (!canEdit) return;
    setErr(null);
    setCancelErr(null);
    setAsk(null);
    setAskCancel(true);
  };
  const openEdit = () => { setErr(null); setPresetMode(undefined); setEditing(true); };
  /** 방식 토글 — 저장은 「일정 수정」 창이 한다(범위 · 겹침 · 줌 계정을 같은 창에서 · N-56) */
  const openModeSwitch = (mode: Occurrence['mode']) => {
    if (mode === occ.mode) return;
    setErr(null);
    setPresetMode(mode);
    setEditing(true);
  };
  const endSeries = () =>
    withScope('delete', (scope) => {
      if (scope === 'this') { openCancel(); return; }
      write.mutate(
        { kind: 'delete', serId: occ.serId, body: { scope, onDate: occ.onDate } },
        {
          onError: (e) => setErr(apiMessage(e)),
          onSuccess: (result) => { onWritten?.(result, scope === 'all' ? '수업 삭제' : '이후 수업 끝내기'); onClose(); },
        },
      );
      setAsk(null);
    });
  const submitCancel = (input: CancelLessonInput) => {
    if (!canEdit) return;
    setCancelErr(null);
    const label = input.wholeDay ? '그날 전체 휴강' : '휴강';
    const done = {
      onError: (e: unknown) => setCancelErr(apiMessage(e)),
      onSuccess: (result: unknown) => { onWritten?.(result, label); setAskCancel(false); onClose(); },
    };
    if (input.wholeDay) {
      // 그날 전체 — 서버가 그 날짜의 회차를 전부 한 트랜잭션에서 접는다. 화면은 날짜 하나만 보낸다 (C-33)
      write.mutate(
        { kind: 'dayCancel', body: { date: occ.date, cancelKind: input.cancelKind, cancelTreat: input.cancelTreat, memo: input.memo } },
        done,
      );
      return;
    }
    write.mutate(
      {
        kind: 'delete', serId: occ.serId,
        body: {
          scope: 'this', onDate: occ.onDate, cancelKind: input.cancelKind, cancelTreat: input.cancelTreat, memo: input.memo,
          makeup: input.makeup,
        },
      },
      done,
    );
  };

  /*
   * 원문 §12 머리 둘째 줄 「26년 8월 21일 금요일 08:00 – 09:00 · 1시간 · 온라인 · 이담흔」.
   * 날짜 모양은 공용 `longDateLabel`(서버 「일정 확정」 부제와 같은 표기), 장소는 블록과 같은 낱말이다.
   */
  const zaccName = occ.zaccId == null ? undefined : meta?.zaccs.find((z) => z.id === occ.zaccId)?.label;
  const place = occ.mode === 'online'
    ? `온라인${zaccName ? ` ${zaccName}` : ''}`
    : occ.roomName ? `현장 ${occ.roomName}` : '강의실 미정';
  const names = occ.students.filter((st) => !st.droppedOnce).map((st) => st.name).join(', ');
  const subLine = [
    `${longDateLabel(occ.date)} ${hhmm(occ.startMin)} – ${hhmm(occ.endMin)}`,
    hoursLabel(occ.endMin - occ.startMin),
    place,
    // 강사는 관리 화면에서는 준비 줄 「강사 배정」이 말한다. 준비를 못 읽는 화면(강사)에서만 머리에 적는다
    !canAdminPage ? (occ.teacherName ?? '강사 미정') : null,
    names || null,
  ].filter(Boolean).join(' · ');

  /* ── 수강 학생 명단 — 준비 줄 「수강 학생」의 펼침 안(원문 §79), 준비를 못 읽으면 따로 선다 ── */
  const rosterBody: ReactNode = (
    <div className="flex flex-col gap-2">
      {tracking.data ? <RosterHead d={tracking.data} /> : null}
      <p className="text-[12px] font-bold text-fg">
        수강 학생 {occ.students.filter((s) => !s.droppedOnce && !s.paused).length}명
        {occ.students.some((s) => s.droppedOnce)
          ? <span className="ml-1 font-normal text-fg-subtle">· 그날 빠짐 {occ.students.filter((s) => s.droppedOnce).length}</span>
          : null}
        {occ.students.some((s) => s.paused)
          ? <span className="ml-1 font-normal text-fg-subtle">· 휴원 {occ.students.filter((s) => s.paused).length}</span>
          : null}
      </p>
      <div className="flex flex-col gap-1">
        {/* 그날만 빠진 학생은 지우지 않고 회색으로 남긴다 (D-R21) */}
        {occ.students.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5">
            <span className={`text-[13px] font-bold ${s.droppedOnce ? 'text-fg-subtle' : 'text-fg'}`}>
              {s.droppedOnce ? <s>{s.name}</s> : s.name}
            </span>
            {s.grade ? <Chip>{s.grade}</Chip> : null}
            {facts.has(s.id) ? (
              <>
                <Chip tone={facts.get(s.id)!.bookCount > 0 ? 'neutral' : 'danger'}>
                  교재 {facts.get(s.id)!.bookCount}
                </Chip>
                <Chip tone={facts.get(s.id)!.guided ? 'success' : 'danger'}>
                  {facts.get(s.id)!.guided ? '안내 됨' : '안내 없음'}
                </Chip>
              </>
            ) : null}
            {s.droppedOnce ? <span className="text-[11px] text-fg-subtle">그날 빠짐</span> : null}
            {/* 휴원 중 — 명단에 남되 그날 인원·청구에서 빠진다. 기간·복귀는 오른쪽 학생 카드에서 (C92-c) */}
            {s.paused ? <Chip tone="warning">휴원</Chip> : null}
            {canEdit ? (
              <span className="ml-auto flex gap-1">
                {s.droppedOnce ? (
                  <Button size="sm" variant="ghost" disabled={write.isPending}
                    onClick={() => roster('undoOnce', s.id)}>되돌리기</Button>
                ) : (
                  <Button size="sm" className={DROP_LOOK} disabled={write.isPending}
                    title="이 회차에서만 뺍니다 — 다음 주는 그대로"
                    onClick={() => roster('dropOnce', s.id)}>이 회차만 빼기</Button>
                )}
                <Button size="sm" className={DROP_LOOK} disabled={write.isPending}
                  title="모든 회차에서 뺍니다"
                  onClick={() => roster('dropAll', s.id)}>아주 빼기</Button>
              </span>
            ) : null}
          </div>
        ))}
        {occ.students.length === 0 ? <span className="text-[12px] text-fg-subtle">명단이 없습니다</span> : null}

        {/* 원문 §79 「+ 학생 넣기 [이름으로 찾기 · 전체 N명]」 + 후보 칩 — 한 번 눌러 넣는다. 쓰기 길은 명단 roster 하나다 */}
        {canEdit && addable.length ? (
          <div className="mt-1 flex flex-col gap-2 rounded-lg border border-line bg-inset/40 p-2">
            <div className="grid grid-cols-[auto_1fr] items-center gap-2">
              <span className="text-[12px] font-bold text-fg">+ 학생 넣기</span>
              <SearchField key={`${occ.serId}|${occ.onDate}`} ref={searchRef} label="넣을 학생 이름으로 찾기"
                placeholder={`이름으로 찾기 · 전체 ${addable.length}명`} onQueryChange={setQuery} />
            </div>
            <div className="flex flex-wrap gap-1">
              {candidates.slice(0, ROSTER_CANDIDATE_MAX).map((st) => (
                <button key={st.id} type="button" disabled={write.isPending}
                  aria-label={`${st.name} 넣기`} title={`${st.name}${st.grade ? ` ${st.grade}` : ''} — 이 수업 명단에 넣습니다`}
                  onClick={() => roster('add', st.id)}
                  className="rounded-full disabled:opacity-50">
                  <Chip styleKind="outline">
                    {st.name}{st.grade ? <span className="ml-1 font-normal text-fg-subtle">{st.grade}</span> : null}
                  </Chip>
                </button>
              ))}
            </div>
            {candidates.length > ROSTER_CANDIDATE_MAX ? (
              <p className="text-[11px] text-fg-subtle">
                외 {candidates.length - ROSTER_CANDIDATE_MAX}명 — 이름으로 좁혀 주세요
              </p>
            ) : null}
            {needle && candidates.length === 0 ? (
              <SearchEmpty title={`「${query.trim()}」에 맞는 학생이 없습니다`}
                hint="이미 명단에 있는 학생은 후보에 나오지 않습니다" onClear={() => searchRef.current?.clear()} />
            ) : null}
          </div>
        ) : null}
      </div>

      {/* 원문 §79 의 초록 상자 — 넣고 빼는 단추 바로 아래에 있어야 읽힌다 */}
      {canEdit ? (
        <Banner tone="success" className="self-start">
          <b>넣거나 빼면 함께 일어납니다</b>
          <ul className="mt-1 list-disc pl-4 text-[11.5px] leading-relaxed">
            <li>학생 시간표에 이 수업이 바로 들어가거나 빠집니다</li>
            <li>수업 안내와 교재 배정이 필요하면 물어봅니다</li>
            <li>정원이 바뀌면 1인 단가가 다시 계산됩니다</li>
          </ul>
        </Banner>
      ) : null}
    </div>
  );
  const rosterInPrep = prep.some((row) => row.key === ROSTER_ROW);

  /** 준비 줄 한 칸 — 펼침(수강 학생) · 이동(▶ 링크) · 그 자리 편집(일정 수정) · 읽기 중 하나다 */
  const renderPrep = (row: PrepRow) => {
    const rowClass = `flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left ${prepTone(row.done)}`;
    if (row.key === ROSTER_ROW) {
      return (
        <li key={row.key} className="flex flex-col">
          <button type="button" aria-expanded={rosterOpen} onClick={() => setRosterOpen((v) => !v)}
            className={`${rowClass} transition-colors hover:brightness-[0.98] ${rosterOpen ? 'rounded-b-none' : ''}`}>
            <PrepLine row={row} glyph={rosterOpen ? '▼' : '▶'} />
          </button>
          {rosterOpen ? (
            <div className="rounded-b-lg border border-t-0 border-fg-subtle bg-card p-3">{rosterBody}</div>
          ) : null}
        </li>
      );
    }
    const href = PREP_LINK[row.key]?.(occ);
    if (href) {
      return (
        <li key={row.key}>
          <Link href={href} className={`${rowClass} transition-colors hover:brightness-[0.98]`} title={`${row.label} — 그 화면으로 갑니다`}>
            <PrepLine row={row} glyph="▶" />
          </Link>
        </li>
      );
    }
    if (PREP_EDIT.has(row.key) && canEditSchedule) {
      return (
        <li key={row.key}>
          <button type="button" onClick={openEdit} disabled={write.isPending}
            className={`${rowClass} transition-colors hover:brightness-[0.98]`} title={`${row.label} — 일정 수정 창을 엽니다`}>
            <PrepLine row={row} glyph="▶" />
          </button>
        </li>
      );
    }
    return <li key={row.key} className={rowClass}><PrepLine row={row} /></li>;
  };

  const footer = (
    <>
      <Button variant="secondary" className="mr-auto" onClick={onClose}>닫기</Button>
      {/* 「+ 할 일」 — 이 회차에 거는 할 일(W11 · N-71 · 공용 할 일 창). 휴강 회차에는 세우지 않는다(서버도 409) */}
      {canEdit && !occ.canceled ? (
        <LessonTodoButton people={meta?.staff ?? []}
          lesson={{ serId: occ.serId, onDate: occ.onDate, date: occ.date, label: `${lessonName} · ${occ.date} ${hhmm(occ.startMin)}` }} />
      ) : null}
      {canEdit && !occ.canceled ? (
        <Button variant="secondary" onClick={openCancel} disabled={write.isPending}
          title="이번 회차만 — 사유 · 처리(이월/차감/보강 이관) · 메모를 적습니다">
          {write.isPending ? '처리 중…' : '휴강 · 수정'}
        </Button>
      ) : null}
      {canEdit && recurring ? (
        <Button variant="ghost" onClick={endSeries} disabled={write.isPending}
          title="향후 전부 또는 모두 — 수업을 끝냅니다 (휴강이 아니라 종료)">
          반복 끝내기…
        </Button>
      ) : null}
      {/*
        원문 §12 바닥 주 단추. 휴강 회차에는 세우지 않는다 — 서버의 고치기(이번만)는 그 회차의
        휴강을 함께 푼다(리듀서가 canceled·사유·처리를 지운다). 「수정」 단추가 휴강을 몰래 풀지 않게 한다.
        코드표(meta)를 넘기지 않는 화면에서도 세우지 않는다 — 강사·강의실 목록 없는 편집 창은 반쪽이다.
      */}
      {canEditSchedule ? (
        <Button variant="primary" onClick={openEdit} disabled={write.isPending}>
          일정 수정
        </Button>
      ) : null}
    </>
  );

  return (
    <>
      {/* 원문 §12·§79 — 화면 가운데 큰 창 · 왼쪽 준비 단계 / 오른쪽 학생 트래킹 · 바닥 단추 줄 */}
      <WideDialog
        open={!!occ}
        onClose={onClose}
        width={canAdminPage ? 1240 : 760}
        title={lessonName}
        head={kindName && kindName !== lessonName ? <Chip styleKind="solid">{kindName}</Chip> : null}
        sub={subLine}
        footer={footer}
      >
        <div className={`grid gap-4 ${canAdminPage ? 'lg:grid-cols-[minmax(0,8fr)_minmax(0,7fr)]' : ''}`}>
          <div className="flex min-w-0 flex-col gap-4">
            {/* 사유·처리 낱말은 서버 것이다 — 옛 휴강(처리 없음)은 「휴강」만 적는다 (C92 · N-25) */}
            {occ.canceled || occ.makeupOfDate || occ.hasException ? (
              <div className="flex flex-wrap items-center gap-2">
                {occ.canceled ? (
                  <Chip tone="danger">
                    휴강{occ.cancelKindLabel ? ` · ${occ.cancelKindLabel}` : ''}{occ.cancelTreatLabel ? ` · ${occ.cancelTreatLabel}` : ''}
                    {occ.makeupDate ? ` → ${occ.makeupDate}${occ.makeupStartMin != null ? ` ${hhmm(occ.makeupStartMin)}` : ''}` : ''}
                  </Chip>
                ) : null}
                {/* 보강 회차 — 어느 회차의 보강인지 (C92-b · C-34) */}
                {occ.makeupOfDate ? <Chip tone="purple">보강 · {occ.makeupOfDate} 회차</Chip> : null}
                {occ.hasException ? <Chip tone="warning">이 회차만 다름</Chip> : null}
              </div>
            ) : null}

            {/* 회차 방식 전환(N-56) — 누르면 방식이 골라진 「일정 수정」 창이 선다. 휴강 회차에는 세우지 않는다(「일정 수정」과 같은 조건) */}
            {canEditSchedule ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-bold text-fg">수업 방식</span>
                <Segmented ariaLabel="이 회차 수업 방식" options={MODE_TOGGLE} value={occ.mode}
                  disabled={write.isPending} onChange={openModeSwitch} />
              </div>
            ) : null}

            {/* 회차 메모 — 그 회차 하나의 한 줄(N-57 · 원문 §08 블록의 메모 줄). 고치는 곳은 「일정 수정」이다 */}
            {occ.memo ? (
              <p data-occ-memo className="rounded-lg border-l-4 border-fg-subtle bg-inset px-3 py-2 text-[12px] text-fg">
                <b className="mr-1.5">회차 메모</b>{occ.memo}
              </p>
            ) : null}

            <section>
              {/* 머리와 막대는 서버가 센 값이다 — 화면이 prep 를 다시 세지 않는다 (D-R37) */}
              <div className="mb-2 flex items-baseline gap-2">
                <h3 className="text-[15px] font-bold text-fg">
                  준비 {tracking.data ? `${tracking.data.prepDone} / ${tracking.data.prepTotal}` : '—'}
                </h3>
                <span className="text-[12px] text-fg-subtle">{tracking.data?.prepRemainLabel ?? ''}</span>
              </div>
              {tracking.data && tracking.data.prepTotal > 0 ? (
                <div className="mb-2 h-1.5 overflow-hidden rounded bg-line">
                  <div
                    className="h-full rounded bg-green"
                    style={{ width: `${Math.round((tracking.data.prepDone / tracking.data.prepTotal) * 100)}%` }}
                  />
                </div>
              ) : null}
              <ol className="flex flex-col gap-1.5">
                {prep.map(renderPrep)}
                {prep.length === 0 ? (
                  <li className="rounded-lg border border-line px-3 py-2 text-[12px] text-fg-subtle">
                    {tracking.isLoading ? '준비를 읽는 중입니다…' : '준비 줄을 읽지 못했습니다.'}
                  </li>
                ) : null}
              </ol>
            </section>

            {/* 준비를 못 읽는 화면(강사 · 읽는 중 · 실패)에서도 명단은 선다 — 같은 명단 한 벌이다 */}
            {!rosterInPrep ? <section aria-label="수강 학생">{rosterBody}</section> : null}

            {/* 출결 취소는 청구를 바꾸지 않는다 — 청구는 휴강 창에서(N-48). 휴강을 쓸 수 있을 때만 그 창을 여는 단추를 준다 */}
            <AttendanceControl occ={occ} onOpenCancel={canEdit && !occ.canceled ? openCancel : undefined} />

            {occ.kindKey === 'gpa' && canAdminPage && canEdit ? (
              <p className="text-[12px]">
                <Link href="/gpa" className="font-bold text-primary underline">GPA 관리 보드 열기 →</Link>
                <span className="ml-1.5 text-fg-subtle">배정·잔여·회차 소비 (학부모 비공개)</span>
              </p>
            ) : null}
            {err ? <div role="alert"><Banner tone="danger">{err}</Banner></div> : null}
            {overlapLines.length ? (
              <div role="status" data-student-overlaps>
                {/* 학생은 겹침을 막는 축이 아니다 — 넣었고, 같은 시각 다른 수업에도 있다는 사실만 알린다 (N-58) */}
                <Banner tone="warning">
                  넣었습니다 — 다만 <b>같은 시각 다른 수업에도 있는 학생</b>입니다: {overlapLines.slice(0, 3).join(' · ')}
                  {overlapLines.length > 3 ? ` 외 ${overlapLines.length - 3}건` : ''}
                </Banner>
              </div>
            ) : null}
            {rosterResult ? (
              <ConflictGuard
                result="ok"
                message={`명단을 반영했습니다 · ${rosterResult.count}/${rosterResult.cap}명${
                  // N-17-a 표기 표본 — 대표 단가는 구간 값(예외 제외), 총액은 예외 합산 (서버 계산·§54)
                  rosterResult.priced && rosterResult.unitPrice != null && rosterResult.total != null
                    ? ` · 1인 ${won(rosterResult.unitPrice)}(${rosterResult.tierHeads}인 구간${
                        rosterResult.overrideCount ? ` · 예외 ${rosterResult.overrideCount}명` : ''
                      }) · 수업당 ${won(rosterResult.total)}`
                    : ' · 단가표 미등록 — 가격은 표시하지 않습니다'
                }`}
              />
            ) : null}
          </div>

          {/* §79 오른쪽 칸 — 관리자 화면에서 창을 열 때만 부른다 (C55 · D-R39) */}
          {canAdminPage ? (
            <div className="min-w-0 self-start rounded-xl border border-line bg-card p-3">
              <StudentTracking serId={occ.serId} onDate={occ.onDate} />
            </div>
          ) : null}
        </div>
      </WideDialog>

      {canEdit && editing && meta ? (
        <SessionEditor
          edit={{ occ, name: lessonName, presetMode }}
          meta={meta}
          onClose={() => { setEditing(false); setPresetMode(undefined); }}
          // 방식 전환은 함께 바뀐 것(「강의실을 비웠습니다」 …)을 서버 문장 그대로 알린다 (N-56 · WriteResult.log)
          onSaved={(result, saved) => (saved.modeChanged
            ? onWritten?.(result, '방식 전환', result.log)
            : onWritten?.(result, saved.memoOnly ? '회차 메모' : '일정 수정'))}
        />
      ) : null}

      <RecurrenceScope
        open={canEdit && !!ask}
        mode={ask?.mode ?? 'edit'}
        onPick={(s) => { if (canEdit) ask?.run(s); }}
        onClose={() => setAsk(null)}
      />

      <CancelLessonDialog
        open={canEdit && askCancel}
        title={`휴강 — ${lessonName} · ${occ.date}`}
        reasons={cancelReasons}
        treats={cancelTreats}
        allowWholeDay={canAdminPage}
        original={{ date: occ.date, startMin: occ.startMin, endMin: occ.endMin }}
        pending={write.isPending}
        error={cancelErr}
        onSubmit={submitCancel}
        onClose={() => setAskCancel(false)}
      />

      <Dialog
        open={!!rosterResult && (rosterResult.needGuide.length > 0 || rosterResult.needBook.length > 0)}
        onClose={() => setRosterResult(null)}
        title="명단 변경 후 준비할 일"
        footer={<Button onClick={() => setRosterResult(null)}>확인</Button>}
      >
        <div className="flex flex-col gap-3 text-[12px] text-fg-2">
          {rosterResult?.needGuide.length ? (
            <section>
              <p className="font-bold text-fg">수업 안내가 필요합니다</p>
              <p className="mt-1">{rosterResult.needGuide.join(' · ')}</p>
            </section>
          ) : null}
          {rosterResult?.needBook.length ? (
            <section>
              <p className="font-bold text-fg">교재 배부 확인이 필요합니다</p>
              <p className="mt-1">{rosterResult.needBook.join(' · ')}</p>
            </section>
          ) : null}
          <p className="text-fg-subtle">서버가 명단 저장과 같은 트랜잭션에서 확인한 결과입니다.</p>
        </div>
      </Dialog>
    </>
  );
}
