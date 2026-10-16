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
import { studentKeys, useStudentDirectory, type StudentDirectory, type StudentHub, type StudentRead } from '@/api/students';
import type { Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import { StudentDirectory as Directory } from './StudentDirectory';
import { STUDENT_HUB_TABS, StudentDetail, studentHubTabFromQuery } from './StudentDetail';

const { push, replace } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));
const me: Me = { id: 3, name: '매니저', role: 'manager', roleLabel: '매니저', title: null,
  canAdminPage: true, canCrudAll: true, canSeeProfit: false, canCrudAttendance: false,
  canMoney: false, canWage: false, canApprove: false, canHide: false, canGpaPack: false };
const student = { id: 21, name: '학생A', label: '학생A · G8', tag: 'G8', grade: 'G8', gradeDisplay: 'G8 · Y9', school: '학교A', gender: null,
  genderLabel: null, createdAt: '2026-09-30T12:00:00+09:00', guardianNames: ['보호자A'] };
const directory = { items: [student], total: 11, page: 1, pageSize: 10, grades: ['G8', 'G9'], educationGrades: [
  { value: 'G8', system: 'US', systemLabel: '미국 Grade', optionLabel: 'G8 (= Y9)', equivalenceHint: '= Y9 · 중2', listLabel: 'G8 · Y9', sort: 8 },
  { value: 'G9', system: 'US', systemLabel: '미국 Grade', optionLabel: 'G9 (= Y10)', equivalenceHint: '= Y10 · 중3', listLabel: 'G9 · Y10', sort: 9 },
] } as unknown as StudentDirectory;
const detail: StudentRead = { ...student, startedOn: '2026-09-01', targetExam: null, guidance: null, lang: null,
  guardians: [{ id: 1, name: '보호자A', relation: '어머니', active: true, isPrimary: true }], guardianTotal: 1,
  enrollments: [{ id: 2, kindName: '수업종류A', subjectName: null, sessions: 4, startedOn: '2026-09-01', endedOn: null }], enrollmentTotal: 1,
  history: [{ id: 3, entity: 'STU', entityId: 21, action: 'withdraw', actionLabel: '퇴원 처리', actorId: 8, actorName: '담당자B', at: '2026-09-30T01:00:00Z' }],
  historyTotal: 51, historyLimit: 50 };
const meta = { students: [
  { id: 21, name: '학생A', label: '학생A · G8', tag: 'G8', grade: 'G8', school: '학교A', gender: null },
  { id: 22, name: '학생B', label: '학생B · G9', tag: 'G9', grade: 'G9', school: '학교B', gender: null },
] };
const guide = {
  id: 31, serId: 4, studentId: 21, teacherId: 7, reason: 'new', kindLabel: '포괄 안내', state: 'ready', pending: true,
  canSend: true, canAck: false, sendBlockedReason: null, acknowledgedAfterSeconds: null, studentName: '학생A', teacherName: '강사A',
  previousTeacherId: null, previousTeacherName: null, serTitle: null, subName: 'Writing', kindName: '수업', startMin: 960, roomName: '1호',
  body: '학생A 안내 본문', direction: null, adminNote: null, dueOn: null, eventOn: '2026-10-07', sourceOccurrenceId: 41,
  createdBy: 3, createdByName: '매니저', createdAt: '2026-10-06T01:00:00Z', sentBy: null, sentByName: null, sentAt: null,
  acknowledgedBy: null, acknowledgedByName: null, acknowledgedAt: null, overdueDays: 0, deadline: null, siblingCount: 0, siblings: [], autoFill: null,
};
const guideStudents = { items: [{ studentId: 21, studentName: '학생A', grade: 'G8', guidance: null, lang: null, guideCount: 1,
  latestGuide: guide, books: [{ issueId: 8, libId: 9, versId: 10, code: 'BK-1', title: 'Writing Book', edition: '2판', seTe: null, subKey: 'writing', level: null }], diagnostic: null, scores: null }] };
const hub: StudentHub = {
  studentId: 21, canSeeAmounts: false, privateNoteCount: 1,
  teachers: [{ staffId: 7, name: '강사A', roleLabel: null, lessons: [{ serId: 4, kindName: '수업', subjectName: 'Writing',
    ruleLabel: '매주 수요일', startMin: 960, endMin: 1020, mode: 'online', fromDate: '2026-09-01', toDate: null }] }],
  commentLessons: [
    { serId: 4, teacherName: '강사A', kindName: '수업', subjectName: 'Writing', fromDate: '2026-09-01', toDate: null, ended: false },
    { serId: 3, teacherName: '예전 강사', kindName: '수업', subjectName: 'Math', fromDate: '2026-07-10', toDate: '2026-07-10', ended: true },
  ],
  nextActions: [
    { key: 'schedule', label: '스케줄', count: 2, stateLabel: '2회 예정', href: '/schedule?studentId=21' },
    { key: 'billing', label: '회계', count: 1, stateLabel: '1건 처리 중', href: '/students/21?tab=billing' },
    { key: 'consulting', label: '컨설팅', count: 0, stateLabel: '진행 중 컨설팅 없음', href: '/consulting?studentId=21' },
    { key: 'books', label: '교재', count: 1, stateLabel: '1종 사용 중', href: '/books?tab=tracking&studentId=21' },
    { key: 'guides', label: '안내', count: 1, stateLabel: '1건 확인 필요', href: '/guides?tab=students&studentId=21' },
    { key: 'lead', label: '상담 카드', count: 1, stateLabel: '1건 연결', href: '/intake' },
  ],
  reports: { total: 2, nextCursor: 'reports_next', items: [{ id: 51, onDate: '2026-10-07', kindName: '수업', subjectName: 'Writing', teacherName: '강사A', state: 'wait', stateLabel: '승인 대기', submittedAt: '2026-10-07T01:00:00Z' }] },
  comments: { total: 2, allTotal: 3, months: [{ month: '2026-10', total: 2 }, { month: '2026-09', total: 1 }], nextCursor: 'comments_next',
    items: [{ id: 61, serId: 4, authorId: 3, authorName: '매니저', body: '학생 코멘트', createdAt: '2026-10-07T01:00:00Z' }] },
  invoices: { total: 2, nextCursor: 'invoices_next', items: [{ id: 71, yearMonth: '2026-10', invType: 'tuition', invTypeLabel: '수업료 청구', title: '10월 수업료', state: 'partial', stateLabel: '일부 납부', dueOn: '2026-10-10', amount: null, paidAmount: null, remainingAmount: null }] },
};
const privateNotes = { studentId: 21, items: [{ id: 81, studentId: 21, studentName: '학생A', serId: 4,
  onDate: '2026-10-07', version: 2, createdAt: '2026-10-07T01:00:00Z', updatedAt: '2026-10-08T01:00:00Z',
  authorId: 7, authorName: '강사A', body: '관리자가 확인할 학생 특이사항' }] };
const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
let requests: InternalAxiosRequestConfig[];
let addedNote: { id: number; serId: number | null; authorId: number; authorName: string; body: string; createdAt: string } | null;

beforeEach(() => {
  requests = [];
  addedNote = null;
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  useSession.getState().signIn('unit-fixture', me);
  api.defaults.adapter = async config => {
    requests.push(config);
    if (config.url === '/schedule/tracking/notes' && config.method === 'post') {
      const body = JSON.parse(config.data as string) as { studentId: number; serId?: number; body: string };
      addedNote = { id: 62, serId: body.serId ?? null, authorId: 3, authorName: '매니저', body: body.body,
        createdAt: '2026-10-14T01:00:00Z' };
      return { config, status: 201, statusText: 'Created', headers: {}, data: addedNote };
    }
    const nextHub = config.params?.reportsCursor ? { ...hub, reports: { total: 2, nextCursor: null, items: [{ ...hub.reports.items[0], id: 50, onDate: '2026-10-06' }] } }
      : config.params?.commentsCursor ? { ...hub, comments: { ...hub.comments, nextCursor: null, items: [{ ...hub.comments.items[0], id: 60, serId: 999, body: '이전 코멘트' }] } }
        : config.params?.invoicesCursor ? { ...hub, invoices: { total: 2, nextCursor: null, items: [{ ...hub.invoices.items[0], id: 70, yearMonth: '2026-09' }] } } : hub;
    const selectedHub = config.params?.commentsMonth === '2026-09' ? { ...nextHub, comments: { ...nextHub.comments,
      total: 1, nextCursor: null, items: [{ ...hub.comments.items[0], id: 59, body: '9월 코멘트', createdAt: '2026-09-30T14:59:00Z' }] } }
      : addedNote && !config.params?.commentsCursor ? { ...nextHub, comments: { ...nextHub.comments,
        total: 3, allTotal: 4, months: [{ month: '2026-10', total: 3 }, { month: '2026-09', total: 1 }],
        items: [addedNote, ...nextHub.comments.items] } } : nextHub;
    const data = config.url === '/students' ? { ...directory, page: config.params?.page ?? 1 }
      : config.url === '/meta' ? meta
        : config.url === '/guides/students' ? guideStudents
          : config.url === '/schedule/students/21/books' ? { studentId: 21, bookCount: 1, label: null }
            : config.url === '/consulting/students' ? { items: [] }
              : config.url === '/students/21/hub' ? selectedHub
                : config.url === '/students/21/private-notes' ? privateNotes
                  : config.url === '/schedule/occurrences' ? { items: [{ serId: 4, date: '2026-10-07', onDate: '2026-10-07',
                    startMin: 960, endMin: 1020, kindKey: 'lesson', subKey: 'writing', title: 'Writing', teacherId: 7,
                    teacherName: '강사A', mode: 'online', canceled: false, repState: 'plan', students: [{ id: 21, name: '학생A', droppedOnce: false }] }] }
                    : config.url === '/schedule/holidays' ? { items: [{ date: '2026-10-09', name: '한글날' }] } : detail;
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  };
});
afterEach(() => {
  cleanup(); clients.splice(0).forEach(client => client.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut(); vi.restoreAllMocks(); push.mockReset(); replace.mockReset();
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
    expect(view.getByText('G8 · Y9')).toBeTruthy();
    expect(view.getByText(/상담 중인 리드 통합 검색/)).toBeTruthy();
    expect(view.getByRole('link', { name: '학생 등록' }).getAttribute('href')).toBe('/students/new?source=students');
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
  it('개요의 코멘트 건수는 본문 없는 서버 집계로 표시하고 강사별 화면에 연결한다', async () => {
    const view = render(<StudentDetail studentId={21} />, setup());
    await view.findByRole('heading', { name: '담당 강사 1명' });
    expect(view.getByRole('tab', { name: /코멘트/ }).textContent).toContain('월별 기록 4건');
    expect(requests.some(request => request.url === '/students/21/private-notes')).toBe(false);
    expect(view.getByRole('link', { name: '강사A · Writing ›' }).getAttribute('href')).toBe('/staff/7');
    expect(view.getByRole('link', { name: '선생님 홈' }).getAttribute('href')).toBe('/staff/7');
    expect(view.getByRole('link', { name: '시간표' }).getAttribute('href')).toBe('/staff/7?tab=calendar');
    expect(view.getByRole('link', { name: '수업 안내' }).getAttribute('href')).toBe('/staff/7?tab=guides');
  });

  it('실제 수업 담당자가 매니저이면 서버 역할 낱말과 과목을 함께 표시한다', async () => {
    const adapter = api.defaults.adapter;
    if (typeof adapter !== 'function') throw new Error('테스트 HTTP adapter가 없다');
    api.defaults.adapter = async config => {
      const response = await adapter(config);
      return config.url === '/students/21/hub'
        ? { ...response, data: { ...hub, teachers: [{ ...hub.teachers[0], name: '매니저A', roleLabel: '매니저' }] } }
        : response;
    };
    const view = render(<StudentDetail studentId={21} />, setup());
    await view.findByRole('heading', { name: '담당 강사 1명' });
    expect(view.getByRole('link', { name: '매니저A 매니저 · Writing ›' }).getAttribute('href')).toBe('/staff/7');
  });

  it('최종 요구 순서의 10탭과 좌측 학생 전환을 제공하고 현재 탭을 URL에 보존한다', async () => {
    const view = render(<StudentDetail studentId={21} />, setup());
    await view.findByRole('heading', { name: student.label });
    expect(view.getByText(/학교A · G8 · 등록일 \(DB 생성\) 2026-09-30/)).toBeTruthy();
    expect(STUDENT_HUB_TABS.map(tab => tab.label)).toEqual(['안내 한눈에', '안내/교재 배정', '시간표', '수업 기록', '리포트', '교재', '코멘트', '컨설팅', '프로필', '수강/청구']);
    expect(view.getByRole('tab', { name: '안내 한눈에' }).getAttribute('aria-selected')).toBe('true');
    await view.findByText('2회 예정');
    await view.findByText('학생A 안내 본문');
    expect(view.getByText('안내 1건')).toBeTruthy();
    expect(view.queryByText(/학생 #21/)).toBeNull();
    expect(view.getByRole('link', { name: '수업 안내 수정' }).getAttribute('href'))
      .toBe('/guides?tab=students&studentId=21');
    fireEvent.click(view.getByRole('tab', { name: /안내\/교재 배정/ }));
    expect(view.getByRole('link', { name: '교재 배정 업무 열기' }).getAttribute('href'))
      .toBe('/books?tab=tracking&studentId=21&create=issue');
    expect(view.getByRole('link', { name: /학생B · G9/ }).getAttribute('href')).toBe('/students/22?tab=assignment');
    fireEvent.click(view.getByRole('tab', { name: /수업 기록/ }));
    expect(replace).toHaveBeenLastCalledWith('/students/21?tab=history', { scroll: false });
    await view.findByText('관리자가 확인할 학생 특이사항');
    expect(view.getByText('강사 특이사항 1건')).toBeTruthy();
    expect(view.getByText(/학부모 문서·검색·알림에는 본문이 노출되지 않습니다/)).toBeTruthy();
    expect(view.getByRole('link', { name: /학생B · G9/ }).getAttribute('href')).toBe('/students/22?tab=history');
    expect(view.getByText('전체 변경 이력은 아직 제공하지 않습니다.')).toBeTruthy();
    expect(view.getByText('담당자B (#8)')).toBeTruthy();
    expect(view.getByText('2026-09-30 10:00')).toBeTruthy();
    expect(view.getByText('퇴원 처리')).toBeTruthy();
    expect(view.getByRole('cell', { name: '학생' })).toBeTruthy();
    expect(view.queryByText('학생 #21')).toBeNull();
    expect(view.getByRole('heading', { name: '기존 감사 51건' })).toBeTruthy();
    fireEvent.click(view.getByRole('tab', { name: /시간표/ }));
    expect(view.getByRole('link', { name: '전체 시간표' }).getAttribute('href')).toContain('/schedule?studentId=21&date=');
    await waitFor(() => expect(requests.some(request => request.url === '/schedule/occurrences')).toBe(true));
    expect(requests.some(request => request.url === '/schedule/holidays')).toBe(true);
    expect(requests.every(request => request.method === 'get')).toBe(true);
  });

  it('학생별 aggregate를 탭 진입 시 lazy 호출하고 각 cursor로만 더 불러온다', async () => {
    const view = render(<StudentDetail studentId={21} />, setup());
    await view.findByText('학생A 안내 본문');
    expect(requests.some(request => request.url === '/schedule/students/21/books')).toBe(false);
    expect(requests.some(request => request.url === '/consulting/students')).toBe(false);
    fireEvent.click(view.getByRole('tab', { name: /리포트/ }));
    await view.findByText('리포트 2건');
    expect((await view.findAllByText('승인 대기')).length).toBeGreaterThan(0);
    fireEvent.click(view.getByRole('button', { name: '리포트 더 보기' }));
    await waitFor(() => expect(requests.some(request => request.params?.reportsCursor === 'reports_next')).toBe(true));
    fireEvent.click(view.getByRole('tab', { name: /코멘트/ }));
    await view.findByText('학생 코멘트');
    expect(view.getByText(/저장 후 수정·삭제할 수 없으며 학부모 전달 문서에는 포함되지 않습니다/)).toBeTruthy();
    expect(view.getAllByText('강사 특이사항').length).toBeGreaterThan(0);
    fireEvent.click(view.getByRole('button', { name: '코멘트 더 보기' }));
    await view.findByText('이전 코멘트');
    expect(view.queryByText('수업 #999')).toBeNull();
    expect(view.getByText('수업')).toBeTruthy();
    expect(requests.some(request => request.params?.commentsCursor === 'comments_next')).toBe(true);
    fireEvent.click(view.getByRole('tab', { name: /^교재 / }));
    await view.findByText('Writing Book');
    expect(requests.filter(request => request.url === '/schedule/students/21/books')).toHaveLength(1);
    fireEvent.click(view.getByRole('tab', { name: /컨설팅/ }));
    await view.findByText('볼 수 있는 이 학생의 컨설팅이 없습니다.');
    expect(requests.filter(request => request.url === '/consulting/students')).toHaveLength(1);
    fireEvent.click(view.getByRole('tab', { name: /수강\/청구/ }));
    await view.findByText('학생별 청구 2건');
    expect(view.getByText('금액 비공개')).toBeTruthy();
    expect(view.queryByRole('link', { name: '회계 업무 열기' })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: '청구 더 보기' }));
    await waitFor(() => expect(requests.some(request => request.params?.invoicesCursor === 'invoices_next')).toBe(true));
    expect(requests.every(request => ['get', undefined].includes(request.method))).toBe(true);
  });

  it('담당 강사 링크와 주·월 학생 달력은 서버 회차·공휴일을 표시하고 URL로 이어진다', async () => {
    const view = render(<StudentDetail studentId={21} initialTab="schedule" initialCalendarAnchor="2026-10-07" />, setup());
    await view.findByRole('heading', { name: '담당 강사 1명' });
    expect(view.getByRole('link', { name: '강사A · Writing ›' }).getAttribute('href')).toBe('/staff/7');
    expect(view.getByRole('tab', { name: /시간표/ }).getAttribute('aria-selected')).toBe('true');
    const lesson = await view.findByRole('button', { name: /Writing.*강사A.*비대면/ });
    expect(view.getByText('한글날')).toBeTruthy();
    expect(requests.find(request => request.url === '/schedule/occurrences')?.params).toMatchObject({
      studentId: 21, from: '2026-10-05', to: '2026-10-11',
    });
    fireEvent.click(lesson);
    expect(push).toHaveBeenCalledWith('/schedule?studentId=21&serId=4&onDate=2026-10-07&date=2026-10-07');
    fireEvent.click(view.getByRole('button', { name: '월간' }));
    expect(replace).toHaveBeenLastCalledWith('/students/21?tab=schedule&view=month&anchor=2026-10-07', { scroll: false });
    await waitFor(() => expect(requests.some(request => request.url === '/schedule/occurrences'
      && request.params?.from === '2026-09-28' && request.params?.to === '2026-11-01')).toBe(true));
  });

  it('코멘트는 KST 월·출처로 좁히고 기존 append-only API 저장 뒤 재조회한다', async () => {
    const view = render(<StudentDetail studentId={21} initialTab="comments" />, setup());
    await view.findByText('학생 코멘트');
    expect(view.getAllByText('수업 · Writing').length).toBeGreaterThan(0);
    expect(view.queryByText(/수업 #4/)).toBeNull();
    expect(view.getByRole('heading', { name: '코멘트 4건' })).toBeTruthy();
    expect(view.getByRole('heading', { name: '2026년 10월 3건' })).toBeTruthy();
    expect(view.getByRole('heading', { name: '10월 7일 / 수요일 · 1건' })).toBeTruthy();
    expect(view.getByText('관리자가 확인할 학생 특이사항')).toBeTruthy();
    expect(view.getByRole('button', { name: '전체 (4건)' }).getAttribute('aria-pressed')).toBe('true');
    expect(requests.some(request => request.url === '/students/21/hub' && request.params?.commentsMonth === undefined)).toBe(true);
    expect(view.getByRole('button', { name: '2026-10 (3건)' })).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '2026-09 (1건)' }));
    await view.findByText('9월 코멘트');
    expect(view.getByRole('heading', { name: '2026년 9월 1건' })).toBeTruthy();
    expect(requests.some(request => request.url === '/students/21/hub' && request.params?.commentsMonth === '2026-09')).toBe(true);
    expect(view.queryByText('관리자가 확인할 학생 특이사항')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: '전체 (4건)' }));
    await view.findByText('관리자가 확인할 학생 특이사항');
    expect(view.getByRole('heading', { name: '코멘트 4건' })).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '2026-10 (3건)' }));
    await view.findByText('학생 코멘트');
    fireEvent.click(view.getByRole('button', { name: '강사 특이사항' }));
    expect(view.queryByText('학생 코멘트')).toBeNull();
    expect(view.getByText('관리자가 확인할 학생 특이사항')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '전체' }));
    expect(view.getByRole('option', { name: /예전 강사.*2026-07-10–2026-07-10.*종료/ }).getAttribute('value')).toBe('3');
    fireEvent.change(view.getByLabelText('연결 수업'), { target: { value: '3' } });
    fireEvent.change(view.getByLabelText('코멘트 *'), { target: { value: '새 인수인계' } });
    fireEvent.click(view.getByRole('button', { name: '코멘트 남기기' }));
    await waitFor(() => expect(requests.find(request => request.url === '/schedule/tracking/notes')?.method).toBe('post'));
    expect(JSON.parse(requests.find(request => request.url === '/schedule/tracking/notes')!.data as string)).toEqual({
      studentId: 21, serId: 3, body: '새 인수인계',
    });
    await view.findByText('새 인수인계');
    expect(view.getByText('수업 · Math')).toBeTruthy();
    expect(view.queryByRole('button', { name: /수정|삭제/ })).toBeNull();
  });

  it('학생 상세 권한이 없으면 허브·비공개 메모를 조회하지 않는다', async () => {
    useSession.getState().setMe({ ...me, canAdminPage: false, canCrudAll: false });
    const view = render(<StudentDetail studentId={21} initialTab="comments" />, setup());
    expect(view.getByText('학생 상세를 조회할 권한이 없습니다.')).toBeTruthy();
    await act(async () => {});
    expect(requests).toHaveLength(0);
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

describe('학생 허브 URL 탭', () => {
  it('허용된 탭만 사용하고 나머지는 안내 한눈에로 닫는다', () => {
    expect(studentHubTabFromQuery('consulting')).toBe('consulting');
    expect(studentHubTabFromQuery('billing')).toBe('billing');
    expect(studentHubTabFromQuery('unknown')).toBe('overview');
    expect(studentHubTabFromQuery(null)).toBe('overview');
  });
});
