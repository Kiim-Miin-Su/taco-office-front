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
import { useState } from 'react';
import { Drawer, Chip, Banner } from '@/components/ui';
import { useDrawer, useDrawerWrite } from '@/api/queries';
import { useSession } from '@/store/useSession';
import type { ChangeReqResult } from '@/api/types';
import {
  ApprovalsPane, ChangeReqForm, ChangeReqsPane, EMPTY_DRAFT, KindsPane, MembersPane,
  NotisPane, TodosPane, ZoomPane, type ChangeReqDraft, type TodoBox,
} from './panes';

/** 여덟 칸 — Figma `Spec/02 우측 서랍` 의 순서 그대로 */
const PANES = [
  { key: 'approvals', label: '승인' },
  { key: 'todos', label: '할 일' },
  { key: 'notis', label: '알림' },
  { key: 'members', label: '구성원' },
  { key: 'kinds', label: '종류' },
  { key: 'chreqNew', label: '변경 요청' },
  { key: 'chreqs', label: '이력' },
  { key: 'zoom', label: '줌' },
] as const;
type PaneKey = (typeof PANES)[number]['key'];

export function AppDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pane, setPane] = useState<PaneKey>('approvals');
  const [box, setBox] = useState<TodoBox>('in');
  const [draft, setDraft] = useState<ChangeReqDraft>(EMPTY_DRAFT);
  const [conflicts, setConflicts] = useState<ChangeReqResult['conflicts']>([]);
  const [sent, setSent] = useState(false);

  const meId = useSession((s) => s.me?.id ?? null);
  // 닫혀 있으면 부르지 않는다 — 모든 화면이 서랍을 들고 있으므로 열 때만 읽는다
  const { data, isLoading, isError } = useDrawer(open);
  const write = useDrawerWrite();

  async function submitChangeReq() {
    setSent(false);
    const res = await write.mutateAsync({
      kind: 'changeReq',
      body: {
        reqType: draft.reqType,
        serId: draft.serId ? Number(draft.serId) : undefined,
        onDate: draft.onDate || undefined,
        reason: draft.reason,
        payload: draft.reqType === 'time_move' && draft.startMin && draft.endMin
          ? { startMin: Number(draft.startMin), endMin: Number(draft.endMin) }
          : undefined,
      },
    }) as ChangeReqResult;
    setConflicts(res.conflicts);
    if (res.conflicts.length === 0) { setSent(true); setDraft(EMPTY_DRAFT); }
  }

  const count = data?.approvals.count ?? 0;
  const unread = data?.notis.filter((n) => !n.read).length ?? 0;

  return (
    <Drawer
      open={open} onClose={onClose} width={560}
      title="서랍"
      sub={data ? `결재 ${count}건 · 안 읽은 알림 ${unread}건 · 모든 시각 ${data.tz}` : undefined}
    >
      <nav className="mb-4 flex flex-wrap gap-1 border-b border-line pb-2">
        {PANES.map((p) => {
          const badge = p.key === 'approvals' ? count : p.key === 'notis' ? unread : 0;
          return (
            <button
              key={p.key} type="button" onClick={() => setPane(p.key)}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[12px] font-bold transition-colors ${
                pane === p.key ? 'bg-blue text-white' : 'text-fg-subtle hover:bg-inset hover:text-fg-2'}`}
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
          {pane === 'approvals' ? <ApprovalsPane flow={data.approvals} onGo={onClose} /> : null}
          {pane === 'todos' ? (
            <TodosPane
              todos={data.todos} meId={meId} box={box} onBox={setBox}
              busy={write.isPending}
              onToggle={(id, done) => write.mutate({ kind: 'todo', id, done })}
            />
          ) : null}
          {pane === 'notis' ? (
            <NotisPane
              notis={data.notis} busy={write.isPending}
              onRead={(id) => write.mutate({ kind: 'notiRead', id })}
            />
          ) : null}
          {pane === 'members' ? (
            <MembersPane members={data.members} tzGroups={data.tzGroups} tz={data.tz} />
          ) : null}
          {pane === 'kinds' ? <KindsPane kinds={data.kinds} /> : null}
          {pane === 'chreqNew' ? (
            <ChangeReqForm
              draft={draft} onDraft={(d) => { setDraft(d); setConflicts([]); setSent(false); }}
              onSubmit={() => void submitChangeReq()}
              conflicts={conflicts} busy={write.isPending} sent={sent}
            />
          ) : null}
          {pane === 'chreqs' ? <ChangeReqsPane rows={data.changeReqs} /> : null}
          {pane === 'zoom' ? <ZoomPane rows={data.zoomAccounts} /> : null}
        </>
      ) : null}
    </Drawer>
  );
}

/** 상단 바의 여는 단추 — 배지는 서랍이 여닫혀도 보여야 하므로 여기서도 읽는다 */
export function DrawerButton({ onOpen }: { onOpen: () => void }) {
  const { data } = useDrawer(true);
  const count = data?.approvals.count ?? 0;
  const unread = data?.notis.filter((n) => !n.read).length ?? 0;
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
