/** @file-guide
 * 목적: 원문 §31 「항목 수정」 창 — 해야 할 항목을 더하고 · 이름을 바꾸고 · 빼는 입력을 모아 한 번에 보낸다 (N-18-a DQ5 대안 · W11).
 * 책임/재사용: 공용 Dialog · Input · Checkbox 로 입력만 모은다. 무엇을 바꿀 수 있는지는 서버 단추(canRename · canRemove)가 정하고 판정은 서버가 다시 한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 「항목 수정」 — 원문 §31 해야 할 항목 머리의 단추 (31-05).
 *
 * 9유형 기본 항목표는 아직 없다(대표 · 운영만 아는 체크리스트 — 보류). 그동안 담당이 계약마다 항목을 직접 채운다(DQ5 대안).
 * 창은 **바꾸는 것만** 보낸다 — 더할 줄 · 이름을 바꾼 줄 · 뺄 줄 · 기한을 바꾼 줄(I-94 · 지우면 null). 목록 통째로 보내면 그 사이 다른 사람이 더한 항목이 지워진다.
 * 끝낸 항목 · 기본 항목 · 파일이 붙은 항목의 빼기는 서버가 막는다 — 단추도 서버 값(canRemove)으로만 선다 (D-R39).
 */
'use client';
import { useEffect, useState } from 'react';
import { apiMessage } from '@/api/client';
import { useEditConsultingItems } from '@/api/queries';
import type { ConsItem, ConsItemsEdit } from '@/api/types';
import { Banner, Button, Checkbox, Chip, Dialog, Input } from '@/components/ui';

interface NewRow { key: number; label: string; required: boolean; dueOn: string }

export function ConsultingItemsEditor({ open, consId, items, onClose }: {
  open: boolean;
  consId: number;
  items: ConsItem[];
  onClose: () => void;
}) {
  const edit = useEditConsultingItems();
  const [labels, setLabels] = useState<Record<number, string>>({});
  /** I-94 기한 — 빈 글이면 기한 없음. 이름과 같이 안 끝낸 항목(canRename)만 바꾼다 */
  const [dues, setDues] = useState<Record<number, string>>({});
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [added, setAdded] = useState<NewRow[]>([]);
  const [seq, setSeq] = useState(0);

  useEffect(() => {
    if (!open) return;
    setLabels(Object.fromEntries(items.map((row) => [row.id, row.label])));
    setDues(Object.fromEntries(items.map((row) => [row.id, row.dueOn ?? ''])));
    setRemoved(new Set());
    setAdded([]);
    edit.reset();
    // 창을 열 때 한 번만 채운다 — 열린 동안 목록이 다시 와도 적던 것을 덮지 않는다
  }, [open, consId]);

  const body: ConsItemsEdit = {};
  const rename = items
    .filter((row) => row.canRename && !removed.has(row.id))
    .map((row) => ({ id: row.id, label: (labels[row.id] ?? row.label).trim(), before: row.label }))
    .filter((x) => x.label !== '' && x.label !== x.before)
    .map(({ id, label }) => ({ id, label }));
  const add = added
    .filter((x) => x.label.trim() !== '')
    .map((x) => ({ label: x.label.trim(), required: x.required, ...(x.dueOn ? { dueOn: x.dueOn } : {}) }));
  // 바꾼 기한만 — 지우면 null (I-94)
  const due = items
    .filter((row) => row.canRename && !removed.has(row.id))
    .map((row) => ({ id: row.id, dueOn: (dues[row.id] ?? row.dueOn ?? '') || null, before: row.dueOn ?? null }))
    .filter((x) => x.dueOn !== x.before)
    .map(({ id, dueOn }) => ({ id, dueOn }));
  if (add.length) body.add = add;
  if (rename.length) body.rename = rename;
  if (removed.size) body.remove = [...removed];
  if (due.length) body.due = due;
  const changed = add.length + rename.length + removed.size + due.length > 0;

  const toggleRemove = (itemId: number) => setRemoved((prev) => {
    const next = new Set(prev);
    if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
    return next;
  });
  const addRow = () => { setAdded((rows) => [...rows, { key: seq, label: '', required: true, dueOn: '' }]); setSeq((n) => n + 1); };
  const save = () => edit.mutate({ consId, body }, { onSuccess: onClose });

  return (
    <Dialog open={open} onClose={onClose} title="항목 수정" width={620}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={edit.isPending}>취소</Button>
          <Button variant="primary" onClick={save} disabled={!changed || edit.isPending}>{edit.isPending ? '저장 중…' : '저장'}</Button>
        </>
      )}>
      <ul className="flex flex-col gap-2" aria-label="지금 항목">
        {items.map((row) => {
          const out = removed.has(row.id);
          return (
            <li key={row.id} className="flex items-center gap-2">
              <Input aria-label={`${row.label} 이름`} value={labels[row.id] ?? row.label} maxLength={80}
                disabled={!row.canRename || out || edit.isPending} className={out ? 'line-through opacity-60' : undefined}
                onChange={(e) => { const v = e.target.value; setLabels((m) => ({ ...m, [row.id]: v })); }} />
              <Input type="date" aria-label={`${row.label} 기한`} value={dues[row.id] ?? row.dueOn ?? ''} className="w-[150px] shrink-0"
                disabled={!row.canRename || out || edit.isPending}
                onChange={(e) => { const v = e.target.value; setDues((m) => ({ ...m, [row.id]: v })); }} />
              {row.required ? <Chip tone="warning" size="compact">필수</Chip> : null}
              {row.done ? <Chip tone="success" size="compact">끝냄</Chip> : null}
              <Button size="sm" variant={out ? 'secondary' : 'ghost'} disabled={!row.canRemove || edit.isPending}
                aria-label={`${row.label} ${out ? '되살리기' : '빼기'}`} onClick={() => toggleRemove(row.id)}>
                {out ? '되살리기' : '빼기'}
              </Button>
            </li>
          );
        })}
        {added.map((row, i) => (
          <li key={`new-${row.key}`} className="flex items-center gap-2">
            <Input aria-label={`새 항목 ${i + 1} 이름`} value={row.label} maxLength={80} placeholder="항목 이름" disabled={edit.isPending}
              onChange={(e) => { const v = e.target.value; setAdded((rows) => rows.map((x) => (x.key === row.key ? { ...x, label: v } : x))); }} />
            <Input type="date" aria-label={`새 항목 ${i + 1} 기한`} value={row.dueOn} className="w-[150px] shrink-0" disabled={edit.isPending}
              onChange={(e) => { const v = e.target.value; setAdded((rows) => rows.map((x) => (x.key === row.key ? { ...x, dueOn: v } : x))); }} />
            <Checkbox label="필수" checked={row.required} disabled={edit.isPending}
              onChange={() => setAdded((rows) => rows.map((x) => (x.key === row.key ? { ...x, required: !x.required } : x)))} />
            <Button size="sm" variant="ghost" aria-label={`새 항목 ${i + 1} 지우기`} disabled={edit.isPending}
              onClick={() => setAdded((rows) => rows.filter((x) => x.key !== row.key))}>지우기</Button>
          </li>
        ))}
      </ul>
      <Button className="mt-3" size="sm" onClick={addRow} disabled={edit.isPending}>+ 항목 더하기</Button>
      <p className="mt-3 text-[11px] text-fg-subtle">
        필수 항목은 끝내야 종료할 수 있습니다. 끝낸 항목과 기본 항목은 빼지 않고, 파일이 붙은 항목은 파일을 먼저 뺍니다.
        기한을 적으면 진행 화면에 D-day 가 섭니다(비우면 기한 없음 · 끝낸 항목의 기한은 바꾸지 않습니다).
      </p>
      {edit.isError ? <Banner tone="danger" className="mt-3">{apiMessage(edit.error)}</Banner> : null}
    </Dialog>
  );
}
