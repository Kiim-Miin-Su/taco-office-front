/** @file-guide
 * 목적: UX-16 구성원 행의 더블클릭/키보드 상세 진입과 기존 canEdit 수정 경로를 회귀 검증한다. (test)
 * 책임/재사용: 실제 MembersPane·MemberEditButton·Dialog를 사용하고 HTTP만 대체한다. 새 권한/API 규칙을 테스트에 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Member, MemberGroup, TzGroup } from '@/api/types';
import { Dialog } from '@/components/ui';
import { MembersPane } from './panes';

const member: Member = {
  id: 7, name: '구성원 검증', loginId: 'member-seven', email: 'member@example.test', role: 'teacher', title: '영어 담당',
  tz: 'Asia/Seoul', active: true, phone: '01000000000', hiredOn: '2026-03-02', canEdit: true,
  canChangeRole: false, canResetPassword: false, canToggleActive: false, canDelete: false,
  wageRate: 50000, wageable: true, wageFrom: '2026-03-02',
};
const tzGroups: TzGroup[] = [{ id: 1, name: '서울', tz: 'Asia/Seoul' }];
const groups = (value = member): MemberGroup[] => [{ role: 'teacher', label: '강사', count: 1, members: [value] }];
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.restoreAllMocks(); });

function paint(value = member, inDrawer = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>
    {inDrawer ? <Dialog open onClose={() => {}} title="구성원 서랍">{children}</Dialog> : children}
  </QueryClientProvider>;
  const view = render(<MembersPane groups={groups(value)} tzGroups={tzGroups} tz="Asia/Seoul" />, { wrapper });
  const row = view.getByText(value.name).closest('li')!;
  return { view, row };
}

it('한 번 클릭은 상세를 열지 않고, 행을 두 번 클릭하면 기존 DTO의 읽기 상세만 연다', () => {
  const patch = vi.spyOn(api, 'patch');
  const { view, row } = paint();
  fireEvent.click(row);
  expect(view.queryByRole('dialog')).toBeNull();
  fireEvent.doubleClick(row);
  const detail = view.getByRole('dialog', { name: '구성원 검증 · 상세' });
  expect(within(detail).getByText('member-seven')).toBeTruthy();
  expect(within(detail).getByText('member@example.test')).toBeTruthy();
  expect(within(detail).getByText('01000000000')).toBeTruthy();
  expect(within(detail).getByText('2026-03-02')).toBeTruthy();
  expect(within(detail).getByRole('button', { name: '수정' })).toBeTruthy();
  expect(within(detail).queryByText(/50,000/)).toBeNull(); // canWage를 받지 않은 상세에는 급여를 새로 노출하지 않는다.
  expect(patch).not.toHaveBeenCalled();
});

it.each(['Enter', ' '])('%s로 상세를 열고 Esc로 닫으면 열었던 행으로 초점을 돌려준다', (key) => {
  const { view, row } = paint();
  expect(row.tabIndex).toBe(0);
  row.focus();
  fireEvent.keyDown(row, { key });
  const detail = view.getByRole('dialog', { name: '구성원 검증 · 상세' });
  expect(detail.contains(document.activeElement)).toBe(true);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(view.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(row);
});

it('상위 워크스페이스 서랍이 dialog여도 행 더블클릭은 상세를 연다', () => {
  const { view, row } = paint(member, true);
  fireEvent.doubleClick(row);
  expect(view.getByRole('dialog', { name: '구성원 검증 · 상세' })).toBeTruthy();
  expect(view.getByRole('dialog', { name: '구성원 서랍' })).toBeTruthy();
});

it('내부 수정 버튼/checkbox의 클릭·키 입력·더블클릭은 행 상세 진입으로 번지지 않는다', () => {
  const { view, row } = paint();
  const edit = within(row).getByRole('button', { name: '수정' });
  fireEvent.keyDown(edit, { key: 'Enter' });
  fireEvent.doubleClick(edit);
  expect(view.queryByRole('dialog', { name: '구성원 검증 · 상세' })).toBeNull();
  // 현재 목록에는 checkbox가 없다. 향후 선택 입력과 충돌하지 않는 event 경계만 합성 자식으로 검증한다.
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  row.append(checkbox);
  fireEvent.click(checkbox);
  expect(checkbox.checked).toBe(true);
  fireEvent.doubleClick(checkbox);
  fireEvent.keyDown(checkbox, { key: ' ' });
  expect(view.queryByRole('dialog', { name: '구성원 검증 · 상세' })).toBeNull();
  fireEvent.click(edit);
  const editing = view.getByRole('dialog', { name: '구성원 검증 · 수정' });
  fireEvent.doubleClick(within(editing).getByRole('heading', { name: '구성원 검증 · 수정' }));
  expect(view.queryByRole('dialog', { name: '구성원 검증 · 상세' })).toBeNull();
});

it('상세의 수정은 기존 writer로 바뀐 칸만 저장하고 서버 재조회 값이 같은 상세에 반영된다', async () => {
  const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { ...member, title: '수정된 직함' } });
  const { view, row } = paint();
  fireEvent.doubleClick(row);
  const detail = view.getByRole('dialog', { name: '구성원 검증 · 상세' });
  fireEvent.click(within(detail).getByRole('button', { name: '수정' }));
  const edit = view.getByRole('dialog', { name: '구성원 검증 · 수정' });
  fireEvent.change(within(edit).getByLabelText('직함'), { target: { value: '수정된 직함' } });
  fireEvent.click(within(edit).getByRole('button', { name: '저장' }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith('/drawer/staff/7', { title: '수정된 직함' }));
  await waitFor(() => expect(view.queryByRole('dialog', { name: '구성원 검증 · 수정' })).toBeNull());
  view.rerender(<MembersPane groups={groups({ ...member, title: '수정된 직함' })} tzGroups={tzGroups} tz="Asia/Seoul" />);
  expect(within(detail).getByText('수정된 직함')).toBeTruthy();
});

it('중첩 수정 창의 Esc는 상세를 함께 닫지 않고 수정 단추로, 두 번째 Esc는 행으로 돌아간다', () => {
  const { view, row } = paint();
  fireEvent.doubleClick(row);
  const detail = view.getByRole('dialog', { name: '구성원 검증 · 상세' });
  const editButton = within(detail).getByRole('button', { name: '수정' });
  editButton.focus();
  fireEvent.click(editButton);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(view.queryByRole('dialog', { name: '구성원 검증 · 수정' })).toBeNull();
  expect(view.getByRole('dialog', { name: '구성원 검증 · 상세' })).toBe(detail);
  expect(document.activeElement).toBe(editButton);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(view.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(row);
});

it('서버 canEdit가 없거나 회수되면 상세 읽기는 가능하지만 수정 단추는 없다', () => {
  const { view, row } = paint();
  fireEvent.doubleClick(row);
  const detail = view.getByRole('dialog', { name: '구성원 검증 · 상세' });
  view.rerender(<MembersPane groups={groups({ ...member, canEdit: false })} tzGroups={tzGroups} tz="Asia/Seoul" />);
  expect(within(detail).queryByRole('button', { name: '수정' })).toBeNull();
  expect(within(detail).getByText('member-seven')).toBeTruthy();
});

function paintEdit(value = member) {
  const { view, row } = paint(value);
  fireEvent.click(within(row).getByRole('button', { name: '수정' }));
  const edit = view.getByRole('dialog', { name: `${value.name} · 수정` });
  const refresh = (next: Member) => view.rerender(<MembersPane groups={groups(next)} tzGroups={tzGroups} tz="Asia/Seoul" />);
  return { view, row, edit, refresh };
}

it('같은 값의 새 member 객체가 재조회되어도 미저장 초안을 보존한다', async () => {
  const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: member });
  const { edit, refresh } = paintEdit();
  fireEvent.change(within(edit).getByLabelText('직함'), { target: { value: '내가 작성 중인 직함' } });
  refresh({ ...member });
  expect((within(edit).getByLabelText('직함') as HTMLInputElement).value).toBe('내가 작성 중인 직함');
  expect(within(edit).queryByText(/다른 변경 사항이 있습니다/)).toBeNull();
  fireEvent.click(within(edit).getByRole('button', { name: '저장' }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith('/drawer/staff/7', { title: '내가 작성 중인 직함' }));
});

it('다른 사람이 이메일을 바꾸어도 초안을 고정하고 내가 바꾼 직함만 PATCH한다', async () => {
  const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: member });
  const { edit, refresh } = paintEdit();
  fireEvent.change(within(edit).getByLabelText('직함'), { target: { value: '내 초안' } });
  refresh({ ...member, email: 'remote@example.test' });
  expect((within(edit).getByLabelText('직함') as HTMLInputElement).value).toBe('내 초안');
  expect((within(edit).getByLabelText('이메일 (선택)') as HTMLInputElement).value).toBe(member.email);
  expect(within(edit).getByText(/다른 변경 사항이 있습니다/)).toBeTruthy();
  fireEvent.click(within(edit).getByRole('button', { name: '저장' }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith('/drawer/staff/7', { title: '내 초안' }));
});

it('같은 칸의 원격 변경과 내 초안이 충돌하면 초안을 보존하고 저장을 막는다', () => {
  const patch = vi.spyOn(api, 'patch');
  const { edit, refresh } = paintEdit();
  fireEvent.change(within(edit).getByLabelText('직함'), { target: { value: '내 초안' } });
  refresh({ ...member, title: '다른 사람이 저장한 직함' });
  expect((within(edit).getByLabelText('직함') as HTMLInputElement).value).toBe('내 초안');
  expect(within(edit).getByText(/같은 항목이 다른 곳에서 변경/)).toBeTruthy();
  const save = within(edit).getByRole('button', { name: '저장' }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.click(save); expect(patch).not.toHaveBeenCalled();
});

it('수정 창을 닫았다 다시 열면 최신 값을 새 기준으로 사용하고 바꾸지 않은 값은 저장하지 않는다', () => {
  const { edit, row, view, refresh } = paintEdit();
  fireEvent.change(within(edit).getByLabelText('직함'), { target: { value: '버릴 초안' } });
  refresh({ ...member, title: '최신 직함' });
  expect((within(edit).getByLabelText('직함') as HTMLInputElement).value).toBe('버릴 초안');
  fireEvent.click(within(edit).getByRole('button', { name: '취소 (Esc)' }));
  fireEvent.click(within(row).getByRole('button', { name: '수정' }));
  const reopened = view.getByRole('dialog', { name: '구성원 검증 · 수정' });
  expect((within(reopened).getByLabelText('직함') as HTMLInputElement).value).toBe('최신 직함');
  expect((within(reopened).getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true);
  expect(within(reopened).queryByText(/다른 변경 사항이 있습니다|같은 항목이 다른 곳에서 변경/)).toBeNull();
});

const memberWithPerms: Member = { ...member, canEditPerms: true, perms: [
  { key: 'canMoney', label: '회계 권한', override: null, roleDefault: false, effective: false },
  { key: 'canWage', label: '시급 권한', override: null, roleDefault: false, effective: false },
] };

it('권한 초안도 재조회로 덮지 않고 원격에서 바뀐 다른 권한은 PATCH에 넣지 않는다', async () => {
  const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: memberWithPerms });
  const { edit, refresh } = paintEdit(memberWithPerms);
  const money = within(within(edit).getByRole('group', { name: '회계 권한' }));
  fireEvent.click(money.getByRole('button', { name: '켬' }));
  refresh({ ...memberWithPerms, perms: memberWithPerms.perms!.map(p => p.key === 'canWage' ? { ...p, override: true, effective: true } : p) });
  expect(money.getByRole('button', { name: '켬' }).getAttribute('aria-pressed')).toBe('true');
  expect(within(edit).getByText(/다른 변경 사항이 있습니다/)).toBeTruthy();
  fireEvent.click(within(edit).getByRole('button', { name: '저장' }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith('/drawer/staff/7', { perms: { canMoney: true } }));
});

it('같은 권한의 원격 변경과 초안 충돌은 저장하지 않는다', () => {
  const patch = vi.spyOn(api, 'patch');
  const { edit, refresh } = paintEdit(memberWithPerms);
  const money = within(within(edit).getByRole('group', { name: '회계 권한' }));
  fireEvent.click(money.getByRole('button', { name: '켬' }));
  refresh({ ...memberWithPerms, perms: memberWithPerms.perms!.map(p => p.key === 'canMoney' ? { ...p, override: false } : p) });
  expect(money.getByRole('button', { name: '켬' }).getAttribute('aria-pressed')).toBe('true');
  expect(within(edit).getByText(/같은 항목이 다른 곳에서 변경/)).toBeTruthy();
  const save = within(edit).getByRole('button', { name: '저장' }) as HTMLButtonElement;
  expect(save.disabled).toBe(true); fireEvent.click(save); expect(patch).not.toHaveBeenCalled();
});

it('초안이 원격 최신 값과 같아졌으면 해당 칸을 재전송하지 않는다', () => {
  const { edit, refresh } = paintEdit();
  fireEvent.change(within(edit).getByLabelText('직함'), { target: { value: '같은 변경' } });
  refresh({ ...member, title: '같은 변경' });
  expect((within(edit).getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true);
  expect(within(edit).queryByText(/같은 항목이 다른 곳에서 변경/)).toBeNull();
});

it('서버 저장 오류와 초안은 동일 값 재조회가 와도 사라지지 않는다', async () => {
  vi.spyOn(api, 'patch').mockRejectedValue({ response: { status: 409, data: { message: '동일 이름을 확인해 주세요' } } });
  const { edit, refresh } = paintEdit();
  fireEvent.change(within(edit).getByLabelText('직함'), { target: { value: '저장 실패 초안' } });
  fireEvent.click(within(edit).getByRole('button', { name: '저장' }));
  await waitFor(() => expect(within(edit).getByText('동일 이름을 확인해 주세요')).toBeTruthy());
  refresh({ ...member });
  expect((within(edit).getByLabelText('직함') as HTMLInputElement).value).toBe('저장 실패 초안');
  expect(within(edit).getByText('동일 이름을 확인해 주세요')).toBeTruthy();
});
