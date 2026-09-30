/** @file-guide
 * 목적: StudentRead.test.tsx — 학생 화면→실제 읽기 훅→Axios 요청/세션 캐시 경계 회귀
 * 책임/재사용: HTTP adapter만 대역으로 쓰고 생성 DTO·TanStack Query·실제 화면을 검증한다. 실제 브라우저/DB QA와 구분한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import { sessionQueryKey } from '@/api/queries';
import { studentKeys, useStudentDirectory, type StudentDirectory, type StudentRead } from '@/api/students';
import type { Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import { StudentDirectory as Directory } from './StudentDirectory';
import { StudentDetail } from './StudentDetail';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
const me: Me = { id: 3, name: '매니저', role: 'manager', roleLabel: '매니저', title: null,
  canAdminPage: true, canCrudAll: true, canSeeProfit: false, canCrudAttendance: false,
  canMoney: false, canWage: false, canApprove: false, canHide: false, canGpaPack: false };
const student = { id: 21, name: '학생A', label: '학생A · G8', tag: 'G8', grade: 'G8', school: '학교A', gender: null,
  genderLabel: null, createdAt: '2026-09-30T12:00:00+09:00', guardianNames: ['보호자A'] };
const directory: StudentDirectory = { items: [student], total: 11, page: 1, pageSize: 10, grades: ['G8', 'G9'] };
const detail: StudentRead = { ...student, startedOn: '2026-09-01', targetExam: null, guidance: null, lang: null,
  guardians: [{ id: 1, name: '보호자A', relation: '어머니', active: true, isPrimary: true }], guardianTotal: 1,
  enrollments: [{ id: 2, kindName: '수업종류A', subjectName: null, sessions: 4, startedOn: '2026-09-01', endedOn: null }], enrollmentTotal: 1,
  history: [{ id: 3, entity: 'STU', entityId: 21, action: 'withdraw', actionLabel: '퇴원 처리', actorId: 8, actorName: '담당자B', at: '2026-09-30T01:00:00Z' }],
  historyTotal: 51, historyLimit: 50 };
const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
let requests: InternalAxiosRequestConfig[];

beforeEach(() => {
  requests = [];
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  useSession.getState().signIn('unit-fixture', me);
  api.defaults.adapter = async config => {
    requests.push(config);
    return { config, status: 200, statusText: 'OK', headers: {},
      data: config.url === '/students' ? { ...directory, page: config.params?.page ?? 1 } : detail };
  };
});
afterEach(() => {
  cleanup(); clients.splice(0).forEach(client => client.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut(); vi.restoreAllMocks(); push.mockReset();
});
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

describe('학생 목록과 생성 계약', () => {
  it('기본10명 요청과 생성일을 구분하고 이름·행 클릭이 상세로 연결된다', async () => {
    const view = render(<Directory />, setup());
    const link = await view.findByRole('link', { name: student.label });
    expect(link.getAttribute('href')).toBe('/students/21');
    expect(view.getByText('학생 DB 생성일 (KST)')).toBeTruthy();
    expect(view.getByText('보호자A')).toBeTruthy();
    expect(view.getByText(/상담 중인 리드 통합 검색/)).toBeTruthy();
    expect(requests[0]).toMatchObject({ method: 'get', url: '/students', params: { page: 1 } });
    expect(requests[0].signal).toBeDefined();
    fireEvent.click(view.getByText('학교A'));
    expect(push).toHaveBeenCalledWith('/students/21');
    expect(view.queryByRole('checkbox')).toBeNull();
    expect(view.queryByRole('button', { name: '삭제' })).toBeNull();
  });

  it('검색은 제출할 때 적용하고 학년/검색 변경은 첫 페이지로 돌아간다', async () => {
    const view = render(<Directory />, setup());
    await view.findByRole('link', { name: student.label });
    fireEvent.click(view.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(requests.at(-1)?.params.page).toBe(2));
    await view.findByText('총 11명 · 2 / 2페이지');
    fireEvent.change(view.getByLabelText('이름·학교·학년 검색'), { target: { value: ' 학생A ' } });
    expect(requests.at(-1)?.params.q).toBeUndefined();
    fireEvent.submit(view.getByRole('form', { name: '학생 검색' }));
    await waitFor(() => expect(requests.at(-1)?.params).toMatchObject({ q: '학생A', page: 1 }));
    await view.findByRole('link', { name: student.label });
    fireEvent.change(view.getByLabelText('학년'), { target: { value: 'G9' } });
    await waitFor(() => expect(requests.at(-1)?.params).toMatchObject({ q: '학생A', grade: 'G9', page: 1 }));
  });

  it('빈 결과에서도 필터와 전체 건수 및 초기화를 유지한다', async () => {
    api.defaults.adapter = async config => ({ config, status: 200, statusText: 'OK', headers: {}, data: { ...directory, items: [], total: 0 } });
    const view = render(<Directory />, setup());
    await view.findByText('조건에 맞는 학생이 없습니다.');
    expect(view.getByText('총 0명 · 1 / 1페이지')).toBeTruthy();
    expect(view.getByLabelText('학년')).toBeTruthy();
    expect(view.getByRole('button', { name: '초기화' })).toBeTruthy();
  });

  it('조회 실패는 오류/재시도를 제공하고 데이터 성공으로 가장하지 않는다', async () => {
    let fail = true;
    api.defaults.adapter = async config => {
      if (fail) throw new AxiosError('fixture', 'ERR_NETWORK', config);
      return { config, status: 200, statusText: 'OK', headers: {}, data: directory };
    };
    const view = render(<Directory />, setup());
    await view.findByRole('alert');
    expect(view.queryByRole('link', { name: student.label })).toBeNull();
    fail = false;
    fireEvent.click(view.getByRole('button', { name: '다시 시도' }));
    await view.findByRole('link', { name: student.label });
  });

  it.each(['teacher', 'anonymous'] as const)('%s는 API 조회와 캐시 노출이 없다', async kind => {
    useSession.getState().setMe(kind === 'anonymous' ? null : { ...me, canAdminPage: false, canCrudAll: false });
    const config = setup();
    config.client.setQueryData(sessionQueryKey(studentKeys.list({ page: 1 }), me.id), directory);
    const view = render(<Directory />, config);
    expect(view.getByText('학생 목록을 조회할 권한이 없습니다.')).toBeTruthy();
    expect(view.queryByText(student.label)).toBeNull();
    await act(async () => {});
    expect(requests).toHaveLength(0);
  });

  it('계정별 캐시 키와 AbortSignal로 이전 사용자의 pending 응답을 재사용하지 않는다', async () => {
    const gates: Array<() => void> = [];
    api.defaults.adapter = async config => {
      requests.push(config);
      const n = requests.length;
      await new Promise<void>(resolve => { gates.push(resolve); });
      return { config, status: 200, statusText: 'OK', headers: {}, data: { ...directory, total: n } };
    };
    const config = setup();
    const hook = renderHook(() => useStudentDirectory({ page: 1 }), config);
    await waitFor(() => expect(requests).toHaveLength(1));
    act(() => useSession.getState().signIn('next-fixture', { ...me, id: 4 }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0].signal?.aborted).toBe(true);
    await act(async () => { gates[0](); gates[1](); });
    await waitFor(() => expect(hook.result.current.data?.total).toBe(2));
    expect(config.client.getQueryData(sessionQueryKey(studentKeys.list({ page: 1 }), 3))).toBeUndefined();
    expect(config.client.getQueryData(sessionQueryKey(studentKeys.list({ page: 1 }), 4))).toMatchObject({ total: 2 });
  });
});

describe('학생 상세 — 현재 사실과 제한된 기록', () => {
  it('기본 화면은 학생 정보이며 기록/시간표는 내부 선택으로 열린다', async () => {
    const view = render(<StudentDetail studentId={21} />, setup());
    await view.findByRole('heading', { name: student.label });
    expect(view.getByRole('button', { name: '기본 정보' }).getAttribute('aria-pressed')).toBe('true');
    expect(view.getByText('종료일 미기록')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '기록' }));
    expect(view.getByText('전체 CRUD 변경 이력은 아직 제공하지 않습니다.')).toBeTruthy();
    expect(view.getByText('담당자B (#8)')).toBeTruthy();
    expect(view.getByText('2026-09-30 10:00')).toBeTruthy();
    expect(view.getByText('퇴원 처리')).toBeTruthy();
    expect(view.getByText('기존 감사 51건')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '시간표' }));
    expect(view.getByRole('link', { name: '학생 시간표 열기' }).getAttribute('href')).toBe('/schedule?studentId=21');
    expect(requests).toHaveLength(1);
  });

  it('404는 빈 학생 성공이나 무한 로딩 대신 목록 복귀를 제공한다', async () => {
    api.defaults.adapter = async config => { throw new AxiosError('fixture', 'ERR_BAD_REQUEST', config, undefined,
      { config, status: 404, statusText: 'Not Found', headers: {}, data: { code: 'STUDENT_NOT_FOUND', message: '학생 없음' } }); };
    const view = render(<StudentDetail studentId={777} />, setup());
    await view.findByText('학생을 찾을 수 없습니다.');
    expect(view.getByRole('link', { name: '학생 목록' }).getAttribute('href')).toBe('/students');
  });

  it.each([null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('잘못된 ID %s는 요청하지 않는다', async studentId => {
    const view = render(<StudentDetail studentId={studentId} />, setup());
    expect(view.getByText('잘못된 학생 주소입니다.')).toBeTruthy();
    await act(async () => {});
    expect(requests).toHaveLength(0);
  });
});
