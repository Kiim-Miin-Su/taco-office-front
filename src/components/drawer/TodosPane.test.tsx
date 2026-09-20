/** @file-guide
 * 목적: §15 할 일의 주간 기본값·기간 그룹·생성·완료 삭제 UI 회귀를 검증한다.
 * 책임/재사용: 실제 TodosPane과 생성 OpenAPI 타입을 사용하고 서버 권한 판정은 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { DrawerTodo } from '@/api/types';
import { addDays, mondayOf, todayKst } from '@/lib/calendar';
import { TodosPane } from './panes';

afterEach(cleanup);

const monday = mondayOf(todayKst());
const todos: DrawerTodo[] = [
  {
    id: 1, title: '회의록 정리', fromId: 2, fromName: '김민수', toId: 1, toName: '김민선',
    dueOn: monday, done: false, src: 'meeting', srcLabel: '회의', overdueDays: 0, go: '/ops',
  },
  {
    id: 2, title: '완료된 점검', fromId: 1, fromName: '김민선', toId: 1, toName: '김민선',
    dueOn: addDays(monday, 1), done: true, src: 'manual', srcLabel: '직접 등록', overdueDays: 0, go: null,
  },
  {
    id: 3, title: '다음 주 작업', fromId: 1, fromName: '김민선', toId: 1, toName: '김민선',
    dueOn: addDays(monday, 8), done: false, src: 'plan', srcLabel: '기획', overdueDays: 0, go: null,
  },
  // 이번 주 밖에서 이미 끝난 것 — 화면에 안 보이므로 「끝난 것 지우기」가 건드리면 안 된다 (S4)
  {
    id: 4, title: '지난 달에 끝낸 것', fromId: 1, fromName: '김민선', toId: 1, toName: '김민선',
    dueOn: addDays(monday, -40), done: true, src: 'manual', srcLabel: '직접 등록', overdueDays: 0, go: null,
  },
  // 남의 끝난 것 — 매니저 서랍에는 목록으로 오지만 다른 묶음(수신함)에 있다
  {
    id: 5, title: '남의 끝난 것', fromId: 2, fromName: '김민수', toId: 2, toName: '김민수',
    dueOn: addDays(monday, 1), done: true, src: 'manual', srcLabel: '직접 등록', overdueDays: 0, go: null,
  },
];

function setup() {
  const props: Parameters<typeof TodosPane>[0] = {
    todos,
    members: [
      { id: 1, name: '김민선', email: 'ceo@tnacademy.kr', role: 'ceo', active: true },
      { id: 2, name: '김민수', email: 'admin@tnacademy.kr', role: 'admin', active: true },
    ],
    meId: 1, box: 'all', onBox: vi.fn(), onToggle: vi.fn(), onCreate: vi.fn(), onClear: vi.fn(), busy: false,
  };
  return { props, view: render(<TodosPane {...props} />) };
}

it('기본은 이번 주 월~일이고 같은 응답에서 벗어난 다음 주 행은 숨긴다', () => {
  const { view } = setup();
  expect(view.container.textContent).toContain('회의록 정리');
  expect(view.container.textContent).toContain('완료된 점검');
  expect(view.container.textContent).not.toContain('다음 주 작업');
  expect(view.container.textContent).toContain('월요일');
  expect(view.container.textContent).toContain('일요일');
});

it('완료 체크와 끝난 것 지우기는 상위 mutation 한 벌로 위임한다', () => {
  const { props, view } = setup();
  fireEvent.click(view.getByLabelText('회의록 정리 완료'));
  expect(props.onToggle).toHaveBeenCalledWith(1, true);
  fireEvent.click(view.getByRole('button', { name: '끝난 것 지우기' }));
  expect(props.onClear).toHaveBeenCalledOnce();
});

it('「끝난 것 지우기」는 **지금 보이는 그 줄들**만 넘긴다 — 기간 밖·다른 묶음은 안 간다 (S4)', () => {
  const { props, view } = setup();
  // 전체 묶음 · 이번 주 — 끝난 것은 2(내 것)와 5(남의 것) 둘이고 4(지난 달)는 화면에 없다
  fireEvent.click(view.getByRole('button', { name: '끝난 것 지우기' }));
  expect(props.onClear).toHaveBeenCalledWith([2, 5]);

  // 수신함으로 좁히면 남의 것이 빠진다 — 단추의 숫자와 보내는 목록이 같은 배열에서 나온다
  cleanup();
  const inbox = render(<TodosPane {...props} box="in" />);
  fireEvent.click(inbox.getByRole('button', { name: '끝난 것 지우기' }));
  expect(props.onClear).toHaveBeenLastCalledWith([2]);
});

it('보이는 끝난 것이 하나도 없으면 단추가 잠긴다 — 눌러서 「전부」가 되는 길이 없다 (S4)', () => {
  const { props } = setup();
  cleanup(); // setup 이 이미 한 벌 그렸다 — 같은 단추가 둘이면 찾지 못한다
  const view = render(<TodosPane {...props} todos={props.todos.filter((t) => !t.done)} />);
  expect((view.getByRole('button', { name: '끝난 것 지우기' }) as HTMLButtonElement).disabled).toBe(true);
});

it('공용 Dialog·Field로 만든 할 일을 DTO 형상 그대로 넘긴다', () => {
  const { props, view } = setup();
  fireEvent.click(view.getByRole('button', { name: '+ 할 일' }));
  fireEvent.change(view.getByLabelText('할 일'), { target: { value: '  계약 확인  ' } });
  fireEvent.change(view.getByLabelText('담당자'), { target: { value: '2' } });
  fireEvent.change(view.getByLabelText('기한'), { target: { value: addDays(monday, 3) } });
  fireEvent.click(view.getByRole('button', { name: '만들기' }));
  expect(props.onCreate).toHaveBeenCalledWith({ title: '계약 확인', toId: 2, dueOn: addDays(monday, 3) });
});
