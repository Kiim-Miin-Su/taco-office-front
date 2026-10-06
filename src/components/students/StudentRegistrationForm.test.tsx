/** @file-guide
 * 목적: StudentRegistrationForm.test.tsx — BOC-03a 신규 학생 15절 초안·검증·계약 대기 경계를 회귀한다.
 * 책임/재사용: 실제 화면/useMeta/세션을 사용하고 HTTP adapter만 대역으로 둔다. DTO·DB 저장 완료를 주장하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import { StudentRegistrationForm } from './StudentRegistrationForm';

const me: Me = { id: 3, name: '매니저', role: 'manager', roleLabel: '매니저', title: null,
  canAdminPage: true, canCrudAll: true, canSeeProfit: false, canCrudAttendance: false,
  canMoney: false, canWage: false, canApprove: false, canHide: false, canGpaPack: false };
const meta = {
  kinds: [], subs: [], rooms: [], zaccs: [], staff: [], students: [], invTypes: [], cancelReasons: [], cancelTreats: [], lateReportTiers: [], teacherPolicies: [],
  genders: [{ key: 'female', label: '여' }, { key: 'male', label: '남' }],
  educationGrades: [
    { value: 'G5', system: 'US', systemLabel: '미국 Grade', optionLabel: 'G5 (= Y6)', equivalenceHint: '= Y6 · 초5', listLabel: 'G5 · Y6', sort: 5 },
    { value: 'Y6', system: 'GB', systemLabel: '영국 Year', optionLabel: 'Y6 (= G5)', equivalenceHint: '= G5 · 초5', listLabel: 'G5 · Y6', sort: 5 },
  ],
};
const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
let requests: InternalAxiosRequestConfig[];

beforeEach(() => {
  requests = [];
  useSession.getState().signIn('student-registration-fixture', me);
  api.defaults.adapter = async config => {
    requests.push(config);
    return { config, status: 200, statusText: 'OK', headers: {}, data: meta };
  };
});
afterEach(() => {
  cleanup(); clients.splice(0).forEach(client => client.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut(); vi.restoreAllMocks();
});
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return render(<StudentRegistrationForm />, { wrapper });
}

describe('BOC-03a 학생 신규 등록 초안', () => {
  it('15절을 원문 순서로 그리고 실제 입력에 배열 경로를 붙인다', async () => {
    const view = setup();
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({ method: 'get', url: '/meta' });
    const headings = view.getAllByRole('heading', { level: 2 }).map(node => node.textContent);
    expect(headings).toEqual([
      '1. 초기 이력', '2. 이름', '3. 성별', '4. 학교', '5. 교육체계와 학년',
      '6. 학생 연락수단', '7. 거주 국가와 시간대', '8. 생년월일', '9. 시민권', '10. 보호자',
      '11. 현금영수증', '12. 형제·자매', '13. 알게 된 경로', '14. 담당자', '15. 기타',
    ]);
    expect(view.getByLabelText('학생 이름').getAttribute('data-field-path')).toBe('name');
    expect(view.getByLabelText('보호자 1 연락처 1 값').getAttribute('data-field-path')).toBe('guardians[0].contacts[0].value');
    const paths = [...view.container.querySelectorAll<HTMLElement>('[data-field-path]')].map(node => node.dataset.fieldPath);
    expect(paths).toHaveLength(25);
    expect(new Set(paths).size).toBe(paths.length);
    expect(view.getByRole('button', { name: '학생 등록 계약 연결 대기' }).hasAttribute('disabled')).toBe(true);
    expect(view.queryByText(/등록되었습니다/)).toBeNull();
  });

  it('빈 초안을 검토하면 필수 오류를 절별로 보여 주고 쓰기 요청은 만들지 않는다', async () => {
    const view = setup();
    await waitFor(() => expect(requests).toHaveLength(1));
    fireEvent.click(view.getByRole('button', { name: '입력 검토' }));
    expect(view.getByText('학생 이름을 입력해 주세요.')).toBeTruthy();
    expect(view.getByText('성별을 선택해 주세요.')).toBeTruthy();
    expect(view.getByText('교육체계와 학년을 선택해 주세요.')).toBeTruthy();
    expect(view.getByText('거주 국가 선택 계약 연결이 필요합니다.')).toBeTruthy();
    expect(view.getByText('보호자 관계를 선택해 주세요.')).toBeTruthy();
    expect(view.getByText('보호자 연락처를 입력해 주세요.')).toBeTruthy();
    expect(requests.filter(request => request.method !== 'get')).toHaveLength(0);
  });

  it('보호자와 연락처를 반복 추가·제거해도 최소 한 행과 index 경로를 유지한다', async () => {
    const view = setup();
    await waitFor(() => expect(requests).toHaveLength(1));
    fireEvent.click(view.getByRole('button', { name: '+ 보호자 추가' }));
    expect(view.getByLabelText('보호자 2 관계').getAttribute('data-field-path')).toBe('guardians[1].relation');
    fireEvent.click(view.getByRole('button', { name: '보호자 1 연락처 추가' }));
    expect(view.getByLabelText('보호자 1 연락처 2 값').getAttribute('data-field-path')).toBe('guardians[0].contacts[1].value');
    expect(view.container.querySelectorAll('[data-field-path]')).toHaveLength(34);
    fireEvent.click(view.getByRole('button', { name: '보호자 1 연락처 2 제거' }));
    expect(view.queryByLabelText('보호자 1 연락처 2 값')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: '보호자 2 제거' }));
    expect(view.queryByLabelText('보호자 2 관계')).toBeNull();
    expect(view.container.querySelectorAll('[data-field-path]')).toHaveLength(25);
    expect(view.getByRole('button', { name: '보호자 1 제거' }).hasAttribute('disabled')).toBe(true);
    expect(view.getByRole('button', { name: '보호자 1 연락처 1 제거' }).hasAttribute('disabled')).toBe(true);
  });

  it('선택 입력인 학생 연락처는 마지막 행도 제거해 다시 0개로 만들 수 있다', async () => {
    const view = setup();
    await waitFor(() => expect(requests).toHaveLength(1));
    fireEvent.click(view.getByRole('button', { name: '+ 학생 연락수단 추가' }));
    const remove = view.getByRole('button', { name: '학생 연락처 1 제거' });
    expect(remove.hasAttribute('disabled')).toBe(false);
    fireEvent.click(remove);
    expect(view.queryByLabelText('학생 연락처 1 값')).toBeNull();
    expect(view.getByRole('button', { name: '+ 학생 연락수단 추가' })).toBeTruthy();
  });

  it('미래 생일·잘못된 email·복수 주보호자를 검토하되 다른 입력은 보존한다', async () => {
    const view = setup();
    await waitFor(() => expect(requests).toHaveLength(1));
    fireEvent.change(view.getByLabelText('학생 이름'), { target: { value: '김학생' } });
    fireEvent.change(view.getByLabelText('생년월일'), { target: { value: '2999-01-01' } });
    fireEvent.change(view.getByLabelText('보호자 1 관계'), { target: { value: 'mother' } });
    fireEvent.change(view.getByLabelText('보호자 1 연락처 1 종류'), { target: { value: 'email' } });
    fireEvent.change(view.getByLabelText('보호자 1 연락처 1 값'), { target: { value: 'wrong-email' } });
    fireEvent.click(view.getByLabelText('보호자 1 주보호자'));
    fireEvent.click(view.getByRole('button', { name: '+ 보호자 추가' }));
    fireEvent.change(view.getByLabelText('보호자 2 관계'), { target: { value: 'father' } });
    fireEvent.change(view.getByLabelText('보호자 2 연락처 1 값'), { target: { value: '010-2222-3333' } });
    fireEvent.click(view.getByLabelText('보호자 2 주보호자'));
    fireEvent.click(view.getByRole('button', { name: '입력 검토' }));
    expect(view.getByText('생년월일은 오늘보다 늦을 수 없습니다.')).toBeTruthy();
    expect(view.getByText('이메일 형식을 확인해 주세요.')).toBeTruthy();
    expect(view.getByText('주보호자는 한 명만 선택할 수 있습니다.')).toBeTruthy();
    expect((view.getByLabelText('학생 이름') as HTMLInputElement).value).toBe('김학생');
  });

  it('권한 없는 계정은 폼과 meta 요청을 모두 열지 않는다', async () => {
    useSession.getState().setMe({ ...me, role: 'teacher', canAdminPage: false, canCrudAll: false });
    const view = setup();
    expect(view.getByText('학생 등록을 준비할 권한이 없습니다.')).toBeTruthy();
    expect(view.queryByRole('heading', { name: '2. 이름' })).toBeNull();
    await act(async () => {});
    expect(requests).toHaveLength(0);
  });

  it('기본 레이아웃은 좁은 폭 1열이며 보호자 묶음의 controls가 고정 폭을 강제하지 않는다', async () => {
    const view = setup();
    await waitFor(() => expect(requests).toHaveLength(1));
    const section = view.getByRole('region', { name: '학생 보호자 입력' });
    const grid = within(section).getByTestId('guardian-fields-0');
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('md:grid-cols-2');
    expect(grid.className).not.toMatch(/min-w-\[/);
  });
});
