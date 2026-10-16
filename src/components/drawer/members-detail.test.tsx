/** @file-guide
 * 목적: UX-16 구성원 행의 더블클릭/키보드 상세 진입과 기존 canEdit 수정 경로를 회귀 검증한다. (test)
 * 책임/재사용: 실제 MembersPane·MemberEditButton·Dialog를 사용하고 HTTP만 대체한다. 새 권한/API 규칙을 테스트에 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Member, MemberGroup, TzGroup } from '@/api/types';
import { Dialog } from '@/components/ui';
import { todayKst } from '@/lib/calendar';
import { MembersPane } from './panes';
import type { TeachingOptions } from './StaffTeachingFields';

const member: Member = {
  id: 7, name: '구성원 검증', loginId: 'member-seven', email: 'member@example.test', role: 'teacher', title: '영어 담당',
  tz: 'Asia/Seoul', active: true, phone: '01000000000', hiredOn: '2026-03-02', canEdit: true,
  canChangeRole: false, canResetPassword: false, canToggleActive: false, canDelete: false,
  wageRate: 50000, wageable: true, wageFrom: '2026-03-02',
};
const tzGroups: TzGroup[] = [{ id: 1, name: '서울', tz: 'Asia/Seoul' }];
/** 서버 DrawerDto 의 가능 과목 묶음·학력 코드표(p8 결정 2026-10-16) — GPA 과목은 서버가 애초에 싣지 않는다 */
const teaching: TeachingOptions = {
  subjectGroups: [
    { kindKey: 'class', kindName: '수업', subjects: [{ key: 'map-read', name: 'MAP Reading' }, { key: 'sat-read', name: 'SAT Reading' }, { key: 'writing', name: 'Writing' }] },
    { kindKey: 'mock', kindName: '모의수업', subjects: [{ key: 'mock-sat', name: '모의수업 A' }] },
    { kindKey: 'study', kindName: '자습', subjects: [{ key: 'study-room', name: '학습실' }] },
  ],
  degrees: ['전문학사', '학사', '석사', '박사', '기타'],
  statuses: ['재학', '휴학', '수료', '졸업', '중퇴'],
};
const groups = (value = member): MemberGroup[] => [{ role: 'teacher', label: '강사', count: 1, members: [value] }];
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.restoreAllMocks(); });

function paint(value = member, inDrawer = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>
    {inDrawer ? <Dialog open onClose={() => {}} title="구성원 서랍">{children}</Dialog> : children}
  </QueryClientProvider>;
  const view = render(<MembersPane groups={groups(value)} tzGroups={tzGroups} teaching={teaching} tz="Asia/Seoul" />, { wrapper });
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

it('서버가 프로필 열람을 허용하지 않은 서랍에서는 생년월일과 학력을 표시하지 않는다', () => {
  const hidden: Member = { ...member, canViewStaffProfile: false, birthOn: '1990-01-01',
    education: [{ school: '비공개 학교', major: null, degree: null, status: null }] };
  const { view, row } = paint(hidden);
  fireEvent.doubleClick(row);
  const detail = view.getByRole('dialog', { name: '구성원 검증 · 상세' });
  expect(within(detail).queryByText('1990-01-01')).toBeNull();
  expect(within(detail).queryByText('비공개 학교')).toBeNull();
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
  const refresh = (next: Member) => view.rerender(<MembersPane groups={groups(next)} tzGroups={tzGroups} teaching={teaching} tz="Asia/Seoul" />);
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

it('가능 과목은 서버가 준 과목 칩만 보이고 100% 영어·과목·학력 변경만 PATCH한다', async () => {
  const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: member });
  const { edit } = paintEdit();
  expect(within(edit).queryByRole('button', { name: 'GPA 관리' })).toBeNull();
  fireEvent.click(within(within(edit).getByRole('group', { name: '100% 영어 수업' })).getByRole('button', { name: '가능' }));
  fireEvent.click(within(edit).getByRole('button', { name: '모의수업 A' }));
  fireEvent.click(within(edit).getByRole('button', { name: '+ 학력 추가' }));
  fireEvent.change(within(edit).getByLabelText('학교'), { target: { value: '검증 학교' } });
  fireEvent.click(within(edit).getByRole('button', { name: '저장' }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith('/drawer/staff/7', {
    englishOnly: true, teachingSubjectKeys: ['mock-sat'],
    education: [{ school: '검증 학교', major: null, degree: null, status: null }],
  }));
});

it('강사에서 매니저로 역할 변경 시 숨긴 강사 프로필 초안을 PATCH하지 않는다', async () => {
  const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { ...member, role: 'manager' } });
  const { edit } = paintEdit({ ...member, canChangeRole: true });
  fireEvent.click(within(within(edit).getByRole('group', { name: '100% 영어 수업' })).getByRole('button', { name: '가능' }));
  fireEvent.click(within(edit).getByRole('button', { name: '+ 학력 추가' }));
  const roles = within(edit).getByRole('group', { name: '역할' });
  fireEvent.click(within(roles).getByRole('button', { name: '매니저' }));
  expect(within(edit).queryByRole('group', { name: '100% 영어 수업' })).toBeNull();
  expect(within(edit).queryByRole('button', { name: '+ 학력 추가' })).toBeNull();
  fireEvent.click(within(edit).getByRole('button', { name: '저장' }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith('/drawer/staff/7', { role: 'manager' }));
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

/**
 * S5a(2026-10-16) — 10/14 PPTX p8·p9 「수정본」 낱말·배치 회귀.
 * 가능 과목은 사용자 결정(2026-10-16 「PPTX대로 과목 칩」)대로 수업·모의수업·자습으로 묶은 실제 과목(SUB) 칩이다.
 * 학력 학위·상태는 서버 코드표 드롭다운이고, 이미 저장된 옛 자유 입력 값은 그대로 보인다.
 */
describe('10/14 PPTX p8·p9 구성원 강사 정보 (S5a)', () => {
  const profiled: Member = { ...member, canViewStaffProfile: true, birthOn: '1996-08-21', englishOnly: true,
    teachingSubjects: [{ key: 'map-read', name: 'MAP Reading', kindKey: 'class', kindName: '수업' },
      { key: 'sat-read', name: 'SAT Reading', kindKey: 'class', kindName: '수업' }, { key: 'writing', name: 'Writing', kindKey: 'class', kindName: '수업' }],
    education: [{ school: '학교A', major: '전공A', degree: '학사', status: '졸업' }, { school: '학교B', major: '전공B', degree: '석사', status: '수료' }] };

  it('p8 구성원 추가 창은 강사 정보·100% 영어 수업 3단·종류별 과목 칩·학력 드롭다운·저장 전 안내를 보이고 선택값을 보낸다', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    clients.push(client);
    const view = render(<QueryClientProvider client={client}><MembersPane groups={groups()} tzGroups={tzGroups} teaching={teaching} tz="Asia/Seoul" canAddMember canWage /></QueryClientProvider>);
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { ...member, id: 9, name: '이하나' } } as never);
    fireEvent.click(view.getByRole('button', { name: '+ 구성원' }));
    const dialog = within(view.getByRole('dialog', { name: '구성원 추가' }));
    expect(dialog.getByText('지난 날짜도 됩니다 · 불가 시간 2주 회차의 기산점')).toBeTruthy();
    expect(dialog.getByRole('group', { name: /^강사 정보/ })).toBeTruthy();
    expect(dialog.getByText('연 · 월 · 일을 고릅니다')).toBeTruthy();
    const english = dialog.getByRole('group', { name: '100% 영어 수업' });
    expect([...english.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['가능', '불가', '미확인']);
    expect(within(english).getByRole('button', { name: '미확인' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(english).getByRole('button', { name: '가능' }));
    expect(dialog.getByRole('group', { name: /^강사 정보/ }).textContent).toContain('학력 · 100% 영어 수업 · 가능 과목 · 생년월일');
    // 종류(수업·모의수업·자습)별 줄에 실제 과목 칩 — 수정본 p8 ④
    const groupsShown = dialog.getAllByRole('group', { name: /^가능 과목 · / });
    expect(groupsShown.map((group) => group.getAttribute('aria-label'))).toEqual(['가능 과목 · 수업', '가능 과목 · 모의수업', '가능 과목 · 자습']);
    expect([...groupsShown[0].querySelectorAll('button')].map((button) => button.textContent)).toEqual(['MAP Reading', 'SAT Reading', 'Writing']);
    expect(dialog.getByText('0개 고름 · 수업 배정 때 참고합니다')).toBeTruthy();
    fireEvent.click(dialog.getByRole('button', { name: 'MAP Reading' }));
    fireEvent.click(dialog.getByRole('button', { name: '학습실' }));
    expect(dialog.getByRole('button', { name: 'MAP Reading' }).getAttribute('aria-pressed')).toBe('true');
    expect(dialog.getByText('2개 고름 · 수업 배정 때 참고합니다')).toBeTruthy();
    expect(dialog.getByText('최대 5줄 · 적은 차례대로 보입니다')).toBeTruthy();
    fireEvent.click(dialog.getByRole('button', { name: '+ 학력 추가' }));
    fireEvent.change(dialog.getByLabelText('학교'), { target: { value: '연세대학교' } });
    const degree = dialog.getByLabelText('학위') as HTMLSelectElement;
    expect(degree.tagName).toBe('SELECT');
    expect([...degree.options].map((option) => option.textContent)).toEqual(['학위', '전문학사', '학사', '석사', '박사', '기타']);
    expect([...(dialog.getByLabelText('상태') as HTMLSelectElement).options].map((option) => option.textContent))
      .toEqual(['상태', '재학', '휴학', '수료', '졸업', '중퇴']);
    fireEvent.change(degree, { target: { value: '학사' } });
    expect(dialog.getByRole('button', { name: '빼기' })).toBeTruthy();
    fireEvent.change(dialog.getByLabelText('이름'), { target: { value: '이하나' } });
    fireEvent.change(dialog.getByLabelText('아이디'), { target: { value: 'hana.lee' } });
    fireEvent.change(dialog.getByLabelText('임시 비밀번호'), { target: { value: 'Temp-pass-9' } });
    fireEvent.change(dialog.getByLabelText('입사일 년'), { target: { value: '2024' } });
    fireEvent.change(dialog.getByLabelText('입사일 월'), { target: { value: '03' } });
    fireEvent.change(dialog.getByLabelText('입사일 일'), { target: { value: '04' } });
    fireEvent.change(dialog.getByLabelText('기본 시급 (선택)'), { target: { value: '42000' } });
    expect(dialog.getByText(`입사일 2024-03-04은 그대로 저장됩니다 · 시급은 오늘(${todayKst()})부터 붙습니다 (소급 없음)`)).toBeTruthy();
    fireEvent.click(dialog.getByRole('button', { name: '만들기' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/drawer/staff', expect.objectContaining({
      hiredOn: '2024-03-04', englishOnly: true, teachingSubjectKeys: ['map-read', 'study-room'], wageRate: 42000,
      education: [{ school: '연세대학교', major: null, degree: '학사', status: null }],
    })));
  });

  it('p9 목록 줄은 입사일·100% 영어·과목 수 칩을, 상세는 생년월일·100% 영어 수업·가능 과목·학력을 수정본 낱말로 보인다', () => {
    const { view, row } = paint(profiled);
    expect(row.textContent).toContain('입사 2026-03-02');
    expect(within(row).getByText('100% 영어')).toBeTruthy();
    expect(within(row).getByText('과목 3')).toBeTruthy();
    expect(row.textContent).not.toContain('영어 전용');
    fireEvent.doubleClick(row);
    const detail = within(view.getByRole('dialog', { name: '구성원 검증 · 상세' }));
    const terms = [...view.getByRole('dialog', { name: '구성원 검증 · 상세' }).querySelectorAll('dt')].map((dt) => dt.textContent);
    expect(terms.slice(-4)).toEqual(['생년월일', '100% 영어 수업', '가능 과목', '학력']);
    expect(detail.getByText('1996-08-21')).toBeTruthy();
    expect(detail.getByText('MAP Reading · SAT Reading · Writing')).toBeTruthy();
    expect(detail.getByText('학교A 전공A 학사(졸업) / 학교B 전공B 석사(수료)')).toBeTruthy();
  });

  it('p9 수정 창 — 저장된 옛 자유 입력 학위는 드롭다운에 「기존 입력」으로 남고, 과목이 없고 127 수업 유형만 있으면 이전 입력을 알린다', () => {
    const legacy: Member = { ...member, canViewStaffProfile: true,
      teachingKinds: [{ key: 'class', name: '수업' }], teachingSubjects: [],
      education: [{ school: 'KAIST', major: '화학', degree: '공학사', status: '졸업' }] };
    const { edit } = paintEdit(legacy);
    const degree = within(edit).getByLabelText('학위') as HTMLSelectElement;
    expect(degree.value).toBe('공학사');
    expect([...degree.options].map((option) => option.textContent)).toContain('공학사 (기존 입력)');
    expect(within(edit).getByText('이전 입력(수업 유형): 수업 — 과목으로 다시 골라 주세요')).toBeTruthy();
  });
});
