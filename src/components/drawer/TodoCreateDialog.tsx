/** @file-guide
 * 목적: TodoCreateDialog.tsx — TodoCreateDialog, TodoPerson (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 「할 일 만들기」 창 — 서랍 §15 와 운영 §64 가 **같은 창**을 쓴다 (C96).
 * 운영의 기한 고치기도 이 창의 날짜 입력을 쓴다. 제목·담당은 읽기 전용이며 성공 후 닫는다.
 *
 * 경로는 하나다(`POST /drawer/todos` · C76) — §64 의 「+ 할 일 주기」는 **새 경로가 아니라**
 * 그 경로를 운영 화면에 잇는 일이다. 그래서 창도 하나여야 한다: 서랍 안에 붙어 있던 것을 꺼냈다.
 * 꺼내면서 입력 id 를 `useId` 로 바꿨다 — 전에는 `todo-title` 로 못 박혀 있어서 두 곳이 같이 열리면
 * `<label for>` 가 어느 칸을 가리키는지 흐려졌다.
 *
 * **다른 사람 배정은 `canCrudAll` 만** — 그 판정은 서버가 한다(C76). 화면은 고를 사람 목록만 받는다.
 */
'use client';
import { useId, useRef, useState } from 'react';
import { Banner, Button, Dialog, Input, Label, Select } from '../ui';
import { apiMessage } from '@/api/client';
import type { DrawerTodo, DrawerTodoCreate, DrawerTodoPatch } from '@/api/types';
import { todayKst } from '@/lib/calendar';

/** 담당으로 고를 수 있는 사람 — 서랍은 `members`, 운영은 `GET /meta` 의 `staff` 를 준다 */
export interface TodoPerson {
  id: number;
  name: string;
}

type TodoDialogProps = {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
} & ({
  editing?: never;
  onSave?: never;
  people: readonly TodoPerson[];
  meId: number | null;
  onCreate: (body: DrawerTodoCreate) => void;
} | {
  editing: Pick<DrawerTodo, 'id' | 'title' | 'toName' | 'dueOn'>;
  onSave: (body: DrawerTodoPatch) => Promise<unknown>;
  people?: never;
  meId?: never;
  onCreate?: never;
});

/** 창을 닫거나 다른 행으로 바꾸면 초안을 새로 만든다. 조회 갱신은 편집 중인 초안을 덮지 않는다. */
export function TodoCreateDialog(props: TodoDialogProps) {
  return props.open ? <TodoForm key={props.editing?.id ?? 'create'} {...props} /> : null;
}

function TodoForm({ open, people, meId, busy = false, onClose, onCreate, editing, onSave }: TodoDialogProps) {
  const id = useId();
  const submitting = useRef(false);
  const [title, setTitle] = useState('');
  const [toId, setToId] = useState(meId ? String(meId) : '');
  const [dueOn, setDueOn] = useState(() => editing ? editing.dueOn ?? '' : todayKst());
  const [error, setError] = useState<string | null>(null);
  const close = () => { if (!busy && !submitting.current) onClose(); };

  const submit = async () => {
    if (busy || submitting.current) return;
    if (editing) {
      submitting.current = true;
      setError(null);
      try {
        await onSave({ dueOn: dueOn || null });
        onClose();
      } catch (e) {
        setError(apiMessage(e));
      } finally {
        submitting.current = false;
      }
      return;
    }
    const clean = title.trim();
    if (!clean) return;
    onCreate({
      title: clean,
      ...(toId ? { toId: Number(toId) } : {}),
      ...(dueOn ? { dueOn } : {}),
    });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={editing ? '할 일 기한 고치기' : '할 일 만들기'}
      footer={(
        <>
          <Button disabled={busy} onClick={close}>취소</Button>
          <Button variant="primary" disabled={busy || (!editing && !title.trim())} onClick={() => void submit()}>{editing ? '저장' : '만들기'}</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-3">
        {error ? <Banner tone="danger">{error}</Banner> : null}
        {editing ? (
          <div className="text-[12px]">
            <p className="font-bold">{editing.title}</p>
            <p className="mt-1 text-fg-subtle">담당 · {editing.toName ?? '담당 없음'}</p>
          </div>
        ) : (
          <>
            <div>
              <Label htmlFor={`${id}-title`}>할 일</Label>
              <Input id={`${id}-title`} value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label htmlFor={`${id}-to`}>담당자</Label>
              <Select id={`${id}-to`} value={toId} onChange={(e) => setToId(e.target.value)}>
                {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </Select>
            </div>
          </>
        )}
        <div>
          <Label htmlFor={`${id}-due`}>기한</Label>
          <Input id={`${id}-due`} type="date" value={dueOn} disabled={busy} onChange={(e) => setDueOn(e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}
