/** @file-guide
 * 목적: schedule-optimistic.ts — 여러 일정 훅의 겹친 낙관 변경/복구 수명 조정
 * 책임/재사용: QueryClient 캐시와 생성 ScheduleWrite만 사용한다. 서버 반복/권한/영속 규칙을 계산하지 않으며 임시 묶음은 정착·세션 전환 때 폐기한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { Query, QueryClient } from '@tanstack/react-query';
import type { ScheduleWrite } from './queries';
import type { OccurrenceList } from './types';

type Layer = { command: ScheduleWrite; pending: boolean; failed: boolean };
type Snapshot = { query: Query; base: OccurrenceList; rendered: OccurrenceList };
type Batch = { layers: Layer[]; snapshots: Map<string, Snapshot>; reconcile: boolean };
export type ScheduleOptimisticContext = { batch: Batch; layer: Layer };

// 컴포넌트별 useRef로 분리하면 서로의 변경을 모른다. 캐시 인스턴스 단위로만 공유한다.
const batches = new WeakMap<object, Batch>();
const occurrenceFilter = { queryKey: ['schedule', 'occurrences'] };

/** 세션 경계에서 늦은 응답과 다음 사용자의 mutation 묶음을 완전히 분리한다. */
export function resetScheduleOptimistic(client: object): void {
  batches.delete(client);
}

/** 기존 낙관 표시만 적용한다. future/all의 다른 회차와 신규 생성은 서버 조회에 맡긴다. */
function project(list: OccurrenceList, w: ScheduleWrite): OccurrenceList {
  if (w.kind === 'create' || w.kind === 'paste' || w.kind === 'roster') return list;
  const items = list.items.map((o) => {
    if (w.kind === 'moveMany') {
      const item = w.body.items.find((x) => x.source.serId === o.serId && x.source.onDate === o.onDate);
      return item ? { ...o, date: item.date, startMin: item.startMin, endMin: item.endMin,
        teacherId: item.teacherId === undefined ? o.teacherId : item.teacherId,
        roomId: item.roomId === undefined ? o.roomId : item.roomId } : o;
    }
    if (o.serId !== w.serId || o.onDate !== w.body.onDate) return o;
    if (w.kind === 'delete') return { ...o, canceled: true };
    const b = w.body;
    return { ...o, date: b.date ?? o.date, startMin: b.startMin ?? o.startMin,
      endMin: b.endMin ?? o.endMin,
      teacherId: b.teacherId === undefined ? o.teacherId : b.teacherId,
      roomId: b.roomId === undefined ? o.roomId : b.roomId };
  });
  return items.every((item, i) => item === list.items[i]) ? list : { ...list, items };
}

function render(client: QueryClient, batch: Batch): void {
  for (const entry of batch.snapshots.values()) {
    // 캐시가 제거되거나 같은 key가 새 Query로 교체됐다면 옛 snapshot을 부활시키지 않는다.
    if (client.getQueryCache().find({ queryKey: entry.query.queryKey, exact: true }) !== entry.query) continue;
    const current = entry.query.state.data as OccurrenceList | undefined;
    if (!current) continue;
    // 출결/리포트 등 다른 소비의 서버 재조회 결과를 rollback으로 덮지 않는다.
    if (current !== entry.rendered) entry.base = current;
    const next = batch.layers.reduce((list, layer) => layer.failed ? list : project(list, layer.command), entry.base);
    if (next !== current) client.setQueryData(entry.query.queryKey, next);
    // TanStack structural sharing 이후의 실제 참조를 기록한다.
    entry.rendered = entry.query.state.data as OccurrenceList;
  }
}

export async function beginScheduleOptimistic(client: QueryClient, command: ScheduleWrite): Promise<ScheduleOptimisticContext> {
  let batch = batches.get(client);
  if (!batch) {
    batch = { layers: [], snapshots: new Map(), reconcile: false };
    batches.set(client, batch);
  }
  const layer: Layer = { command, pending: true, failed: false };
  batch.layers.push(layer);
  if (command.kind !== 'create' && command.kind !== 'paste' && command.kind !== 'roster') {
    await client.cancelQueries(occurrenceFilter);
  }
  if (batches.get(client) === batch) {
    for (const query of client.getQueryCache().findAll(occurrenceFilter)) {
      const list = query.state.data as OccurrenceList | undefined;
      if (list && !batch.snapshots.has(query.queryHash)) {
        batch.snapshots.set(query.queryHash, { query, base: list, rendered: list });
      }
    }
    render(client, batch);
  }
  return { batch, layer };
}

/** 실패한 layer만 제거한다. 성공 layer는 다른 요청이 끝날 때까지 유지하고 마지막에만 재조회한다. */
export function settleScheduleOptimistic(
  client: QueryClient, context: ScheduleOptimisticContext, failed: boolean, reconcile: boolean,
): boolean {
  const { batch, layer } = context;
  if (batches.get(client) !== batch) return false;
  layer.pending = false;
  layer.failed = failed;
  batch.reconcile ||= reconcile;
  render(client, batch);
  if (batch.layers.some((item) => item.pending)) return false;
  batches.delete(client);
  return batch.reconcile;
}
