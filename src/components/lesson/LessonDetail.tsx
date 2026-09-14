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
 * **모달·버튼·범위 선택을 새로 만들지 않는다.** 서랍은 `Drawer`, 버튼은 `Button`,
 * 반복 범위는 `RecurrenceScope`, 겹침 안내는 `ConflictGuard` 를 그대로 쓴다 —
 * 같은 모양을 두 번 만들면 한쪽만 고쳐진다 (`AGENT.md §6.0`).
 *
 * 이 화면이 저장할 때 부르는 것은 `useScheduleWrite` 하나다. 3범위 판정은 서버가 한다.
 */
'use client';
import { useEffect, useState } from 'react';
import { Banner, Button, Chip, ConflictGuard, Dialog, Drawer, RecurrenceScope, Select } from '../ui';
import { hhmm } from '@/lib/calendar';
import { useLessonTracking, useScheduleWrite } from '@/api/queries';
import Link from 'next/link';
import { apiMessage } from '@/api/client';
import { useCan } from '@/store/useSession';
import type { Occurrence, RosterPatch, RosterResult, Scope } from '@/api/types';
import { AttendanceControl } from './AttendanceControl';
import { StudentTracking } from './StudentTracking';

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

export interface LessonDetailProps {
  occ: Occurrence | null;
  /** 종류 이름 — 코드표에서 온다. `class` 같은 코드값을 화면에 찍지 않는다 (D-R18) */
  kindName?: string;
  subName?: string;
  /** 반복 수업이면 범위를 묻는다. 단발이면 묻지 않는다 (D-R16) */
  recurring?: boolean;
  /** 명단에 넣을 수 있는 전체 학생 — 코드표(meta)에서 온다 */
  allStudents?: Array<{ id: number; name: string; grade?: string | null }>;
  onClose: () => void;
}

export function LessonDetail({ occ, kindName, subName, recurring = true, allStudents, onClose }: LessonDetailProps) {
  const write = useScheduleWrite();
  const canEdit = useCan('canCrudAll');
  const canAdminPage = useCan('canAdminPage');
  const [ask, setAsk] = useState<null | { mode: 'edit' | 'delete'; run: (s: Scope) => void }>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState('');
  const [rosterResult, setRosterResult] = useState<RosterResult | null>(null);
  // 아래 「학생 트래킹」 칸과 **같은 질의**다 — 키가 같아 요청이 한 번만 나간다 (C55)
  const tracking = useLessonTracking(occ?.serId ?? null, occ?.onDate ?? null, !!occ && canAdminPage);

  useEffect(() => {
    setRosterResult(null);
  }, [occ?.serId, occ?.onDate]);

  if (!occ) return null;
  const prep = tracking.data?.prep ?? [];

  /**
   * 수강 학생은 3범위가 아니라 **2범위**다 — 다이얼로그 없이 줄 버튼으로 바로 간다
   * (§5A.7 「확인창을 쓰지 않는다」 · D-R21). 판정과 명단 계산은 서버가 한다.
   */
  const roster = (op: RosterPatch['op'], studentId: number) => {
    if (!canEdit) return;
    setErr(null);
    setRosterResult(null);
    write.mutate(
      { kind: 'roster', serId: occ.serId, body: { op, onDate: occ.onDate, studentId } },
      {
        onError: (e) => setErr(apiMessage(e)),
        onSuccess: (result) => {
          if ('count' in result) setRosterResult(result);
        },
      },
    );
  };
  const enrolled = new Set(occ.students.map((st) => st.id));
  const addable = (allStudents ?? []).filter((st) => !enrolled.has(st.id));
  // 원문 §79 는 명단 줄에도 「교재 N · 안내 없음」을 붙인다. 아래 트래킹 칸과 **같은 질의**라
  // 요청이 늘지 않는다 — 두 곳이 다른 곳에서 세면 숫자가 갈린다 (D-R37).
  const facts = new Map((tracking.data?.students ?? []).map((t) => [t.id, t]));

  /** 반복이면 범위를 먼저 묻고, 단발이면 바로 'this' 로 보낸다 */
  const withScope = (mode: 'edit' | 'delete', run: (s: Scope) => void) => {
    if (!canEdit) return;
    setErr(null);
    if (!recurring) { run('this'); return; }
    setAsk({ mode, run });
  };

  const cancel = () =>
    withScope('delete', (scope) => {
      write.mutate(
        { kind: 'delete', serId: occ.serId, body: { scope, onDate: occ.onDate } },
        { onError: (e) => setErr(apiMessage(e)), onSuccess: onClose },
      );
      setAsk(null);
    });

  return (
    <>
      <Drawer
        open={!!occ}
        onClose={onClose}
        title={`${occ.title || subName || kindName || occ.kindKey} · ${occ.date}`}
        sub={kindName && kindName !== occ.title ? kindName : undefined}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="info">{hhmm(occ.startMin)}–{hhmm(occ.endMin)}</Chip>
            {occ.mode === 'online' ? <Chip tone="purple">온라인</Chip> : <Chip>{occ.roomName ?? '강의실 미정'}</Chip>}
            <Chip>{occ.teacherName ?? '강사 미정'}</Chip>
            {occ.canceled ? <Chip tone="danger">취소</Chip> : null}
            {occ.hasException ? <Chip tone="warning">이 회차만 다름</Chip> : null}
          </div>

          <section>
            {/* 머리와 막대는 서버가 센 값이다 — 화면이 prep 를 다시 세지 않는다 (D-R37) */}
            <div className="mb-2 flex items-baseline gap-2">
              <h3 className="text-[13px] font-bold text-fg">
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
            <ol className="flex flex-col gap-1">
              {prep.map((row) => (
                <li
                  key={row.key}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                    row.done ? 'border-green/30 bg-green/5' : 'border-red/30 bg-red/5'
                  }`}
                >
                  <span className={`text-[12px] ${row.done ? 'text-green' : 'text-fg-subtle'}`}>
                    {row.done ? '✓' : '○'}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[12px] font-bold text-fg">{row.label}</span>
                    {/* 부제도 서버의 낱말이다 — 「1명 / 정원 4명 · 이담흔」 (D-R18) */}
                    {row.detail ? <span className="text-[11px] text-fg-subtle">{row.detail}</span> : null}
                  </span>
                </li>
              ))}
              {prep.length === 0 ? (
                <li className="rounded-lg border border-line px-3 py-2 text-[12px] text-fg-subtle">
                  {tracking.isLoading ? '준비를 읽는 중입니다…' : '준비 줄을 읽지 못했습니다.'}
                </li>
              ) : null}
            </ol>
          </section>

          <AttendanceControl occ={occ} />

          <section>
            <h3 className="mb-2 text-[12px] font-bold text-fg">
              수강 학생 {occ.students.filter((s) => !s.droppedOnce).length}명
              {occ.students.some((s) => s.droppedOnce)
                ? <span className="ml-1 text-fg-subtle">· 그날 빠짐 {occ.students.filter((s) => s.droppedOnce).length}</span>
                : null}
            </h3>
            <div className="flex flex-col gap-1">
              {/* 그날만 빠진 학생은 지우지 않고 회색으로 남긴다 (D-R21) */}
              {occ.students.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-2 py-1.5">
                  <Chip tone={s.droppedOnce ? 'neutral' : 'info'}>
                    {s.droppedOnce ? <s>{s.name}</s> : s.name}
                  </Chip>
                  {s.grade ? <Chip>{s.grade}</Chip> : null}
                  {facts.has(s.id) ? (
                    <>
                      <Chip tone={facts.get(s.id)!.bookCount > 0 ? 'neutral' : 'warning'}>
                        교재 {facts.get(s.id)!.bookCount}
                      </Chip>
                      <Chip tone={facts.get(s.id)!.guided ? 'success' : 'warning'}>
                        {facts.get(s.id)!.guided ? '안내 됨' : '안내 없음'}
                      </Chip>
                    </>
                  ) : null}
                  {s.droppedOnce ? <span className="text-[11px] text-fg-subtle">그날 빠짐</span> : null}
                  {canEdit ? (
                    <span className="ml-auto flex gap-1">
                      {s.droppedOnce ? (
                        <Button size="sm" variant="ghost" disabled={write.isPending}
                          onClick={() => roster('undoOnce', s.id)}>되돌리기</Button>
                      ) : (
                        <Button size="sm" variant="ghost" disabled={write.isPending}
                          title="이 회차에서만 뺍니다 — 다음 주는 그대로 (D-R21)"
                          onClick={() => roster('dropOnce', s.id)}>이 회차만 빼기</Button>
                      )}
                      <Button size="sm" variant="danger" disabled={write.isPending}
                        title="모든 회차에서 뺍니다"
                        onClick={() => roster('dropAll', s.id)}>아주 빼기</Button>
                    </span>
                  ) : null}
                </div>
              ))}
              {occ.students.length === 0 ? <span className="text-[12px] text-fg-subtle">명단이 없습니다</span> : null}

              {canEdit && addable.length ? (
                <div className="mt-1 flex items-center gap-2">
                  <Select value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1">
                    <option value="">학생 넣기…</option>
                    {addable.map((st) => (
                      <option key={st.id} value={st.id}>{st.name}{st.grade ? ` · ${st.grade}` : ''}</option>
                    ))}
                  </Select>
                  <Button size="sm" disabled={!pick || write.isPending}
                    onClick={() => { roster('add', Number(pick)); setPick(''); }}>
                    넣기
                  </Button>
                </div>
              ) : null}
            </div>

            {/* 원문 §79 의 초록 상자 — 넣고 빼는 단추 바로 아래에 있어야 읽힌다 */}
            {canEdit ? (
              <Banner tone="success" className="mt-2">
                <b>넣거나 빼면 함께 일어납니다</b>
                <ul className="mt-1 list-disc pl-4 text-[11.5px] leading-relaxed">
                  <li>학생 시간표에 이 수업이 바로 들어가거나 빠집니다</li>
                  <li>수업 안내와 교재 배정이 필요하면 물어봅니다</li>
                  <li>정원이 바뀌면 1인 단가가 다시 계산됩니다</li>
                </ul>
              </Banner>
            ) : null}
          </section>

          {/* §79 오른쪽 칸 — 관리자 화면에서 창을 열 때만 부른다 (C55 · D-R39) */}
          {canAdminPage ? <StudentTracking serId={occ.serId} onDate={occ.onDate} /> : null}

          {occ.kindKey === 'gpa' ? (
            <p className="text-[12px]">
              <Link href="/gpa" className="font-bold text-primary underline">GPA 관리 보드 열기 →</Link>
              <span className="ml-1.5 text-fg-subtle">배정·잔여·회차 소비 (§82 · 학부모 비공개)</span>
            </p>
          ) : null}
          {err ? <div role="alert"><Banner tone="danger">{err}</Banner></div> : null}
          {rosterResult ? (
            <ConflictGuard
              result="ok"
              message={`명단을 반영했습니다 · ${rosterResult.count}/${rosterResult.cap}명${
                // N-17-a 표기 표본 — 대표 단가는 구간 값(예외 제외), 총액은 예외 합산 (서버 계산·§54)
                rosterResult.priced && rosterResult.unitPrice != null && rosterResult.total != null
                  ? ` · 1인 ${rosterResult.unitPrice.toLocaleString('ko-KR')}원(${rosterResult.tierHeads}인 구간${
                      rosterResult.overrideCount ? ` · 예외 ${rosterResult.overrideCount}명` : ''
                    }) · 수업당 ${rosterResult.total.toLocaleString('ko-KR')}원`
                  : ' · 단가표 미등록 — 가격은 표시하지 않습니다'
              }`}
            />
          ) : null}

          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>닫기</Button>
            {canEdit ? (
              <Button variant="danger" onClick={cancel} disabled={write.isPending}>
                {write.isPending ? '처리 중…' : '휴강 · 취소'}
              </Button>
            ) : null}
          </div>
        </div>
      </Drawer>

      <RecurrenceScope
        open={canEdit && !!ask}
        mode={ask?.mode ?? 'edit'}
        onPick={(s) => { if (canEdit) ask?.run(s); }}
        onClose={() => setAsk(null)}
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
