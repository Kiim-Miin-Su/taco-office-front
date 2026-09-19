/** @file-guide
 * 목적: TodoCreateDialog.tsx — TodoCreateDialog, TodoPerson (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 「할 일 만들기」 창 — 서랍 §17 과 운영 §64 가 **같은 창**을 쓴다 (C96).
 *
 * 경로는 하나다(`POST /drawer/todos` · C76) — §64 의 「+ 할 일 주기」는 **새 경로가 아니라**
 * 그 경로를 운영 화면에 잇는 일이다. 그래서 창도 하나여야 한다: 서랍 안에 붙어 있던 것을 꺼냈다.
 * 꺼내면서 입력 id 를 `useId` 로 바꿨다 — 전에는 `todo-title` 로 못 박혀 있어서 두 곳이 같이 열리면
 * `<label for>` 가 어느 칸을 가리키는지 흐려졌다.
 *
 * **다른 사람 배정은 `canCrudAll` 만** — 그 판정은 서버가 한다(C76). 화면은 고를 사람 목록만 받는다.
 */
'use client';
import { useEffect, useId, useState } from 'react';
import { Button, Dialog, Input, Label, Select } from '../ui';
import type { DrawerTodoCreate } from '@/api/types';
import { todayKst } from '@/lib/calendar';

/** 담당으로 고를 수 있는 사람 — 서랍은 `members`, 운영은 `GET /meta` 의 `staff` 를 준다 */
export interface TodoPerson {
  id: number;
  name: string;
}

export function TodoCreateDialog({ open, people, meId, busy = false, onClose, onCreate }: {
  open: boolean;
  people: readonly TodoPerson[];
  meId: number | null;
  busy?: boolean;
  onClose: () => void;
  onCreate: (body: DrawerTodoCreate) => void;
}) {
  const id = useId();
  const [title, setTitle] = useState('');
  const [toId, setToId] = useState(meId ? String(meId) : '');
  const [dueOn, setDueOn] = useState(todayKst);

  useEffect(() => {
    if (!open) return;
    setTitle(''); setToId(meId ? String(meId) : ''); setDueOn(todayKst());
  }, [open, meId]);

  const submit = () => {
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
      onClose={onClose}
      title="할 일 만들기"
      footer={(
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" disabled={busy || !title.trim()} onClick={submit}>만들기</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-3">
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
        <div>
          <Label htmlFor={`${id}-due`}>기한</Label>
          <Input id={`${id}-due`} type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}
