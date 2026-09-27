/** @file-guide
 * 목적: §15 할 일의 주간 기본값·기간 그룹·생성·완료 삭제 UI 회귀를 검증한다.
 * 책임/재사용: 실제 TodosPane과 생성 OpenAPI 타입을 사용하고 서버 권한 판정은 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { DrawerTodo } from '@/api/types';
import { addDays, dowOf, KO_DOW, mondayOf, todayKst } from '@/lib/calendar';
import { TodosPane } from './panes';

afterEach(cleanup);

const monday = mondayOf(todayKst());
const todos: DrawerTodo[] = [
  {
    id: 1, title: '회의록 정리', fromId: 2, fromName: '김민수', toId: 1, toName: '김민선',
    dueOn: monday, done: false, src: 'meeting', srcLabel: '회의', overdueDays: 0, go: '/ops', clearable: true, clearBlockedReason: null,
  },
  {
    id: 2, title: '완료된 점검', fromId: 1, fromName: '김민선', toId: 1, toName: '김민선',
    dueOn: addDays(monday, 1), done: true, src: 'manual', srcLabel: '직접 등록', overdueDays: 0, go: null, clearable: true, clearBlockedReason: null,
  },
  {
    id: 3, title: '다음 주 작업', fromId: 1, fromName: '김민선', toId: 1, toName: '김민선',
    dueOn: addDays(monday, 8), done: false, src: 'plan', srcLabel: '기획', overdueDays: 0, go: null, clearable: true, clearBlockedReason: null,
  },
  // 이번 주 밖에서 이미 끝난 것 — 화면에 안 보이므로 「끝난 것 지우기」가 건드리면 안 된다 (S4)
  {
    id: 4, title: '지난 달에 끝낸 것', fromId: 1, fromName: '김민선', toId: 1, toName: '김민선',
    dueOn: addDays(monday, -40), done: true, src: 'manual', srcLabel: '직접 등록', overdueDays: 0, go: null, clearable: true, clearBlockedReason: null,
  },
  // 남의 끝난 것 — 매니저 서랍에는 목록으로 오지만 다른 묶음(수신함)에 있다
  {
    id: 5, title: '남의 끝난 것', fromId: 2, fromName: '김민수', toId: 2, toName: '김민수',
    dueOn: addDays(monday, 1), done: true, src: 'manual', srcLabel: '직접 등록', overdueDays: 0, go: null, clearable: true, clearBlockedReason: null,
  },
];

function setup() {
  const props: Parameters<typeof TodosPane>[0] = {
    todos,
    members: [
      { id: 1, name: '김민선', loginId: 'ceo@tnacademy.kr', email: 'ceo@tnacademy.kr', role: 'ceo', active: true },
      { id: 2, name: '김민수', loginId: 'admin@tnacademy.kr', email: 'admin@tnacademy.kr', role: 'admin', active: true },
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
  // 요일 머리는 원문 §15 그대로 「월 17」 모양이다 (g2 15-3)
  const heads = view.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
  expect(heads).toHaveLength(7);
  expect(heads[0]).toBe(`월 ${Number(monday.slice(8))}`);
  expect(heads[6]).toBe(`일 ${Number(addDays(monday, 6).slice(8))}`);
});

/* g2 대조 15-1 — 원문 요약은 한 줄이다: 「N건 [안 끝난 것 N] [기한 지남 N] … [끝난 것 지우기]」 */
it('요약은 한 줄 — 건수 · 칩 둘 · 오른쪽 「끝난 것 지우기」 · 기간 낱말은 「MM-DD ~ MM-DD」', () => {
  const { view } = setup();
  const clear = view.getByRole('button', { name: '끝난 것 지우기' });
  const line = clear.parentElement!;
  // 전체 묶음 · 이번 주 — 회의록 정리(열림) · 완료된 점검 · 남의 끝난 것 = 3건, 안 끝난 것 1
  expect(line.textContent).toContain('3건');
  expect(within(line).getByText('안 끝난 것 1')).toBeTruthy();
  expect(within(line).getByText('기한 지남 0')).toBeTruthy();
  expect(line.className).toContain('border-b');
  expect(view.container.textContent).toContain(`${monday.slice(5)} ~ ${addDays(monday, 6).slice(5)}`);
  // 통계 카드 석 장은 없어졌다
  expect(view.queryByText('할 일', { selector: 'p' })).toBeNull();
});

/* g2 대조 15-2 — 요일마다 카드: 머리 + 「끝낸 것/전체」 배지, 빈 날은 한 줄 「—」, 오늘 카드는 갈색 테두리 */
it('요일 카드는 끝낸 것/전체 배지를 달고, 빈 날은 「—」 한 줄로 접히며, 오늘 카드는 갈색 테두리다', () => {
  const { view } = setup();
  const card = (day: string) =>
    view.getByRole('heading', { name: `${KO_DOW[dowOf(day)]} ${Number(day.slice(8))}` }).closest('section')!;
  // 화요일 — 완료된 점검 · 남의 끝난 것 둘 다 끝났다
  expect(within(card(addDays(monday, 1))).getByText('2/2')).toBeTruthy();
  // 월요일 — 회의록 정리 하나, 안 끝났다
  expect(within(card(monday)).getByText('0/1')).toBeTruthy();
  // 수요일은 비었다 — 한 줄 「—」 이고 항목 목록이 없다
  const empty = card(addDays(monday, 2));
  expect(empty.textContent).toContain('—');
  expect(empty.querySelector('ul')).toBeNull();
  // 오늘 카드만 갈색 테두리다
  const today = card(todayKst());
  expect(today.className).toContain('border-primary');
  expect(card(todayKst() === monday ? addDays(monday, 1) : monday).className).not.toContain('border-primary');
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

/* W11 A' · N-86 — 상담 사후 관리(해피콜 · 월간 상담)는 끝나도 이력이다. 지울지 말지 · 까닭은 서버가 준다 */
it('끝낸 사후 관리 줄은 「끝난 것 지우기」가 보내지 않는다 — 서버 플래그 · 서버 문장 그대로 · 점은 상담 청록 · 「원본」은 그 상담 건', () => {
  const care: DrawerTodo = {
    id: 9, title: '해피콜 — 박시온', fromId: 2, fromName: '김민수', toId: 1, toName: '김민선',
    dueOn: addDays(monday, 1), done: true, src: 'lead', srcLabel: '상담', overdueDays: 0, go: '/intake?lead=31',
    clearable: false, clearBlockedReason: '상담 사후 관리(해피콜 · 월간 상담)는 끝나도 이력으로 남습니다',
  };
  const { props } = setup();
  cleanup(); // setup 이 이미 한 벌 그렸다
  const view = render(<TodosPane {...props} todos={[...props.todos, care]} />);
  const clear = view.getByRole('button', { name: '끝난 것 지우기' });
  expect(clear.getAttribute('title')).toBe(care.clearBlockedReason);
  fireEvent.click(clear);
  // 같은 화요일에 끝난 셋 중 사후 관리(9)만 빠진다 — 보내는 목록과 단추의 수가 같은 배열이다
  expect(props.onClear).toHaveBeenCalledWith([2, 5]);

  // 사후 관리만 끝나 있으면 단추가 잠기고 까닭이 선다
  cleanup();
  const only = render(<TodosPane {...props} todos={[care]} />);
  const locked = only.getByRole('button', { name: '끝난 것 지우기' }) as HTMLButtonElement;
  expect(locked.disabled).toBe(true);
  expect(locked.getAttribute('title')).toBe(care.clearBlockedReason);
  // 출처 점은 상담 갈래의 청록 · 「원본」은 서버가 준 그 상담 건
  const row = only.getByText('해피콜 — 박시온').closest('li')!;
  expect(row.querySelector('.bg-teal')).not.toBeNull();
  expect(within(row).getByRole('link', { name: '원본' }).getAttribute('href')).toBe('/intake?lead=31');
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

it('기한 편집이 생겨도 생성의 빈 날짜는 생략하고 서랍에는 기한 고치기를 열지 않는다', () => {
  const { props, view } = setup();
  expect(view.queryByRole('button', { name: /기한 고치기$/ })).toBeNull();
  fireEvent.click(view.getByRole('button', { name: '+ 할 일' }));
  fireEvent.change(view.getByLabelText('할 일'), { target: { value: '기한 미정' } });
  fireEvent.change(view.getByLabelText('기한'), { target: { value: '' } });
  fireEvent.click(view.getByRole('button', { name: '만들기' }));
  expect(props.onCreate).toHaveBeenCalledWith({ title: '기한 미정', toId: 1 });
  expect(view.queryByRole('dialog')).toBeNull();
});
