/** @file-guide
 * 목적: AppDrawer.tsx — DrawerPane, AppDrawer, DrawerButton (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 우측 서랍 — 탭 02 (§14~§21).
 *
 * **전역**이다. 어느 탭에서 열든 같은 것이 보인다. 그래서 `AppShell` 이 한 벌만 들고 있고,
 * 데이터도 `useDrawer()` 한 번으로 여덟 칸을 다 받는다 — 칸마다 부르면
 * 배지에는 3건인데 목록에는 2건인 상태가 생긴다.
 *
 * 껍데기는 `ui/Overlay` 의 `Drawer` 를 그대로 쓴다. 서랍을 새로 그리지 않는다 —
 * 수업 상세(§12)와 같은 폭·같은 닫기·같은 Esc 여야 한다.
 */
'use client';
import { useEffect, useRef, useState } from 'react';
import { Drawer, Chip, Banner } from '@/components/ui';
import { useDrawer, useDrawerWrite, useMeta, useZoom } from '@/api/queries';
import { ApiError, apiMessage } from '@/api/client';
import { browserLog } from '@/lib/browser-log';
import { useSession } from '@/store/useSession';
import type { ChangeReqResult } from '@/api/types';
import {
  ApprovalsPane, changeReqBody, ChangeReqForm, ChangeReqsPane, EMPTY_DRAFT, KindsPane, MembersPane,
  NotisPane, TodosPane, ZoomPane, type ChangeReqDraft, type TodoBox,
} from './panes';

/**
 * 여덟 칸 — Figma `Spec/02 우측 서랍` 의 순서 그대로.
 *
 * **이름이 두 벌이면 안 된다.** 오른쪽 레일은 「승인 대기함」·「프로그램」·「줌 계정」이라 부르는데
 * 여기 탭은 「승인」·「종류」·「줌」이라 줄여 부르고 있었다 — **같은 칸을 같은 화면이 두 이름으로**
 * 불렀다. 레일의 낱말이 컷의 낱말이므로 그쪽으로 맞춘다.
 *
 * `title` 은 **창의 제목**이다. 전에는 어느 칸을 열든 제목이 「서랍」이었다 — 컷은 칸마다
 * 제목이 다르다(승인 대기함 · 알림 · 구성원 · 시간대 …). 「서랍」은 이 창이 무엇인지가 아니라
 * 이 창이 **어떻게 생겼는지**를 말하는 이름이다.
 */
const PANES = [
  { key: 'approvals', label: '승인 대기함', title: '승인 대기함' },
  { key: 'todos', label: '할 일', title: '할 일 · 피드백' },
  { key: 'notis', label: '알림', title: '알림' },
  { key: 'members', label: '구성원', title: '구성원 · 시간대' },
  { key: 'kinds', label: '프로그램', title: '프로그램 · 과목' },
  { key: 'chreqNew', label: '변경 요청', title: '변경 요청' },
  { key: 'chreqs', label: '이력', title: '변경 요청 · 이력' },
  { key: 'zoom', label: '줌 계정', title: '줌 계정' },
] as const;
export type DrawerPane = (typeof PANES)[number]['key'];

/** 선택 pane은 셸이 소유한다. 닫기/다른 pane 이동에도 초안과 세부 선택은 여기 남는다. */
export function AppDrawer({ open, onClose, pane, onPaneChange }: {
  open: boolean;
  onClose: () => void;
  pane: DrawerPane;
  onPaneChange: (pane: DrawerPane) => void;
}) {
  const [box, setBox] = useState<TodoBox>('in');
  const [draft, setDraft] = useState<ChangeReqDraft>(EMPTY_DRAFT);
  const [conflicts, setConflicts] = useState<ChangeReqResult['conflicts']>([]);
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** §16 — 보여 주는 범위. 지우는 규칙이 아니다 (N-7 · D-16) */
  const [notiWindow, setNotiWindow] = useState<'month' | 'all'>('month');
  /** 서버가 거절한 말을 **그대로** 띄운다 — 화면이 이유를 다시 지어내지 않는다 */
  const [reviewError, setReviewError] = useState<string | null>(null);
  const paneRetryInFlight = useRef(false);
  const previousPane = useRef<DrawerPane>(pane);

  const meId = useSession((s) => s.me?.id ?? null);
  // 닫혀 있으면 부르지 않는다 — 모든 화면이 서랍을 들고 있으므로 열 때만 읽는다
  const { data, isLoading, isError, refetch } = useDrawer(open, notiWindow);
  const { data: meta } = useMeta(open && pane === 'chreqNew');
  /*
   * §21 격자는 서랍 payload 에 없다 — **칸을 열 때만** 부른다.
   * 여덟 칸에 얹으면 §21 을 안 여는 사람도 매번 점유 질의를 치른다.
   * 「줌 계정 관리」와 같은 훅이므로 두 화면의 「지금 가능」이 갈리지 않는다.
   */
  const zoom = useZoom(undefined, open && pane === 'zoom');
  const write = useDrawerWrite();

  /**
   * 같은 drawer snapshot 안에서 pane만 옮겨도 query key는 바뀌지 않는다. 그래서 오류가 보이는
   * 동안의 pane 전환을 명시적 재시도로 해석한다. 이 전환은 내부 탭뿐 아니라 AppShell의 우측
   * rail에서도 들어오므로, 클릭 핸들러가 아닌 제어형 `pane` 변경 한 곳에서 감시한다.
   */
  useEffect(() => {
    const fromPane = previousPane.current;
    previousPane.current = pane;
    if (!open || fromPane === pane || !isError || paneRetryInFlight.current) return;

    const details = { fromPane, toPane: pane, notiWindow } as const;
    paneRetryInFlight.current = true;
    browserLog('drawer.fetch.retry.requested', details);
    void refetch().then((result) => {
      if (!result.isError) {
        browserLog('drawer.fetch.retry.succeeded', details);
        return;
      }

      const error = result.error;
      browserLog('drawer.fetch.retry.failed', {
        ...details,
        errorCode: error instanceof ApiError ? error.code : 'UNKNOWN',
        status: error instanceof ApiError ? error.status : 0,
      }, 'warn');
    }).finally(() => {
      paneRetryInFlight.current = false;
    });
  }, [isError, notiWindow, open, pane, refetch]);

  async function submitChangeReq() {
    setSent(false);
    setSubmitError(null);
    try {
      const res = await write.mutateAsync({
        kind: 'changeReq',
        body: changeReqBody(draft),
      }) as ChangeReqResult;
      setConflicts(res.conflicts);
      if (res.conflicts.length === 0) { setSent(true); setDraft(EMPTY_DRAFT); }
    } catch (error) {
      setSubmitError(apiMessage(error));
    }
  }

  const count = data?.approvals.inboxCount ?? 0;
  const unread = data?.notis.filter((n) => !n.read).length ?? 0;
  // 시간대는 사람의 이름으로 적는다 — 「Asia/Seoul」은 저장값이지 낱말이 아니다 (D-R18)
  const tzName = data ? (data.tzGroups.find((g) => g.tz === data.tz)?.name ?? data.tz) : '';

  return (
    <Drawer
      open={open} onClose={onClose} width={560}
      title={PANES.find((p) => p.key === pane)?.title ?? '서랍'}
      sub={data ? `결재 ${count}건 · 안 읽은 알림 ${unread}건 · 모든 시각 ${tzName}` : undefined}
    >
      <nav aria-label="서랍 메뉴" className="mb-4 flex flex-wrap gap-1 border-b border-line pb-2">
        {PANES.map((p) => {
          const badge = p.key === 'approvals' ? count : p.key === 'notis' ? unread : 0;
          return (
            <button
              key={p.key} type="button" onClick={() => onPaneChange(p.key)} aria-pressed={pane === p.key}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[12px] font-bold transition-colors ${
                pane === p.key ? 'bg-primary text-white' : 'text-fg-subtle hover:bg-inset hover:text-fg-2'}`}
            >
              {p.label}
              {badge > 0 ? (
                <span className={`rounded-full px-1.5 text-[10px] ${
                  pane === p.key ? 'bg-white/25' : 'bg-red text-white'}`}>{badge}</span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {isLoading ? <p className="py-10 text-center text-[12px] text-fg-subtle">읽는 중…</p> : null}
      {isError ? <Banner tone="danger">서랍을 읽지 못했습니다. 잠시 뒤 다시 열어 주세요.</Banner> : null}

      {data ? (
        <>
          {pane === 'approvals' ? (
            <ApprovalsPane
              flow={data.approvals} onGo={onClose} busy={write.isPending}
              error={reviewError}
              onReview={(v) => {
                setReviewError(null);
                // 갈래마다 경로가 다르다 — 어느 줄인지는 서버가 준 kind 로 안다
                write.mutate(
                  v.kind === 'chreq'
                    ? { kind: 'chreqReview', id: v.id, decision: v.decision, reason: v.reason }
                    : { kind: 'reqReview', id: v.id, decision: v.decision, reason: v.reason },
                  { onError: (e) => setReviewError(apiMessage(e)) },
                );
              }}
            />
          ) : null}
          {pane === 'todos' ? (
            <TodosPane
              todos={data.todos} members={data.members} meId={meId} box={box} onBox={setBox}
              busy={write.isPending}
              onToggle={(id, done) => write.mutate({ kind: 'todo', id, done })}
              onCreate={(body) => write.mutate({ kind: 'todoCreate', body })}
              onClear={() => write.mutate({ kind: 'todoClear' })}
            />
          ) : null}
          {pane === 'notis' ? (
            <NotisPane
              notis={data.notis} meId={meId} busy={write.isPending}
              categories={data.notiCategories}
              windowDays={data.notiWindowDays}
              olderCount={data.notiOlderCount}
              widened={notiWindow === 'all'}
              onWiden={(all) => setNotiWindow(all ? 'all' : 'month')}
              onReadAll={() => write.mutate({ kind: 'notiReadAll' })}
              onRead={(id) => write.mutate({ kind: 'notiRead', id })}
            />
          ) : null}
          {pane === 'members' ? (
            <MembersPane groups={data.memberGroups} tzGroups={data.tzGroups} tz={data.tz} />
          ) : null}
          {pane === 'kinds' ? <KindsPane kinds={data.kinds} /> : null}
          {pane === 'chreqNew' ? (
            <ChangeReqForm
              draft={draft} onDraft={(d) => {
                setDraft(d); setConflicts([]); setSent(false); setSubmitError(null);
              }}
              onSubmit={() => void submitChangeReq()}
              conflicts={conflicts} busy={write.isPending} sent={sent} error={submitError}
              staff={meta?.staff ?? []} rooms={meta?.rooms ?? []} zaccs={meta?.zaccs ?? []}
            />
          ) : null}
          {pane === 'chreqs' ? <ChangeReqsPane rows={data.changeReqs} /> : null}
          {pane === 'zoom' ? <ZoomPane rows={data.zoomAccounts} board={zoom.data} loading={zoom.isLoading} /> : null}
        </>
      ) : null}
    </Drawer>
  );
}

/** 상단 바의 여는 단추 — 숫자는 AppShell이 공용 drawer snapshot에서 내려준다. */
export function DrawerButton({
  onOpen,
  count,
  unread,
}: {
  onOpen: () => void;
  count: number;
  unread: number;
}) {
  const total = count + unread;
  return (
    <button
      type="button" onClick={onOpen}
      className="ml-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold text-line-2 hover:bg-white/10"
      aria-label={`서랍 열기${total > 0 ? ` — ${total}건` : ''}`}
    >
      서랍
      {total > 0 ? <Chip tone="danger" styleKind="solid">{total}</Chip> : null}
    </button>
  );
}
