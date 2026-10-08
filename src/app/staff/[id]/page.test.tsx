/** @file-guide
 * 목적: page.test.tsx — 관리자 강사 8탭의 actor/target 분리와 생성 계약 경계를 검증한다.
 * 책임/재사용: 생성 DTO fixture와 실제 query hook을 사용하고 teacher 본인 API를 관리자 대리 조회로 호출하지 않는지 확인한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { components } from '@/api/schema';
import { api } from '@/api/client';
import { useSession } from '@/store/useSession';
import StaffDetailPage from './page';

const replace = vi.fn();
const push = vi.fn();
const nav = { tab: null as string | null, view: null as string | null, anchor: null as string | null };
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '7' }),
  useSearchParams: () => ({ get: (key: keyof typeof nav) => nav[key] }),
  useRouter: () => ({ replace, push }),
}));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));

type Detail = components['schemas']['StaffDirectoryDetailDto'];
type TeacherHome = components['schemas']['TeacherHomeDto'];
type TeacherGuides = components['schemas']['TeacherGuidesDto'];
type TeacherSuggestions = components['schemas']['TeacherSuggestionsDto'];
type StaffTeacherHistory = components['schemas']['StaffTeacherHistoryDto'];
type StaffTeacherInbox = components['schemas']['StaffTeacherInboxDto'];
type OccurrenceList = components['schemas']['OccurrenceListDto'];
type Meta = components['schemas']['MetaDto'];

const detail: Detail = {
  profile: { id: 7, name: '김강사', englishName: 'Kim', title: '영어', active: true, hiredOn: '2026-01-02', createdAt: '2026-01-01T09:00:00+09:00', email: 'teacher@example.com', phone: '010-0000-0000', timezone: 'Asia/Seoul' },
  wageAccess: true,
  wages: [{ id: 1, fromDate: '2026-01-01', rate: 45000, reason: '입사', approvedByName: '관리자', createdAt: '2026-01-01T09:00:00+09:00' }],
  payouts: [{ id: 2, yearMonth: '2026-09', state: 'confirmed', net: 900000, confirmedByName: '관리자', confirmedAt: '2026-10-02T09:00:00+09:00' }],
  assignments: [{ id: 3, kindName: '1대1 수업', subjectName: '영어', studentNames: ['학생A'], fromDate: '2026-01-01', toDate: null }],
  reports: [{ id: 4, onDate: '2026-09-30', kindName: '1대1 수업', subjectName: '영어', studentNames: ['학생A'] }],
  audit: [{ id: 5, action: 'update', actionLabel: '정보 수정', actorName: '관리자', at: '2026-09-20T09:00:00+09:00', changes: [{ field: '직함', before: '수학', after: '영어' }], privateFields: [] }],
  nextCursor: null,
};
const home: TeacherHome = {
  todayDate: '2026-10-09', today: [], upcoming: [], todaySummary: { lessons: 0, minutes: 0 }, week: { lessons: 0, minutes: 0, unwritten: 0 },
  todo: { unwrittenReports: 1, waitingApprovals: 2, openChangeRequests: 3, openStaffRequests: 4, openBookChanges: 5 },
  settings: {
    name: '김강사', timezone: 'Asia/Seoul', wageRate: 45000, wageFrom: '2026-01-01', timezones: [],
    requests: [{ id: 71, reqType: 'tz_change', label: '시간대 변경', asked: 'Asia/Tokyo', state: 'pending', createdOn: '2026-10-08', rejectReason: null }],
    canAskWage: true, wageAskableOn: null, canAskTz: false,
  },
};
const guides: TeacherGuides = {
  weekFrom: '2026-10-05', weekTo: '2026-10-11',
  students: [{
    studentId: 31, name: '학생A', grade: 'G9', school: '검증중', targetExam: null, guidance: '꼼꼼하게', lang: 'ko', weekCount: 1,
    lessons: [{ serId: 3, onDate: '2026-10-09', date: '2026-10-09', startMin: 600, durMin: 60, subKey: 'writing', title: 'Writing' }],
    books: [{ issueId: 5, code: 'WR-01', title: 'Writing Basic', subKey: 'writing', level: 'G9', seTe: 'SE', state: 'ok', stateLabel: '사용 중', issuedOn: '2026-09-01', returnedOn: null, reissuedFrom: null, reissuedTo: null }],
    diag: null, notes: [],
  }],
};
const suggestions: TeacherSuggestions = {
  yearMonth: '2026-10', used: 1, limit: 3, remaining: 2, canPost: true,
  items: [{
    id: 81, category: 'schedule', body: '수업 시간 변경을 확인해 주세요.', state: 'open', createdOn: '2026-10-08', reply: null, replyBy: null, replyOn: null,
    lesson: { serId: 3, onDate: '2026-10-09', date: '2026-10-09', startMin: 600, endMin: 660, subject: 'Writing', title: 'Writing', students: ['학생A'] },
  }],
};
const history: StaffTeacherHistory = {
  month: '2026-09', wageAccess: true, wageRate: 45000, wageFrom: '2026-01-01',
  stats: { doneCount: 2, doneMinutes: 120, writtenCount: 1, writtenMinutes: 60, unwrittenCount: 1, unwrittenMinutes: 60 },
  lessons: [{
    serId: 3, onDate: '2026-09-30', date: '2026-09-30', startMin: 600, durMin: 60,
    kindKey: 'class', subKey: 'writing', mode: 'offline', title: 'Writing', students: '학생A',
    studentItems: [{ id: 31, name: '학생A' }], studentCount: 1, repState: 'ok', canceled: false,
    submittedAt: '2026-09-30 11:10', pay: 45000, lateCut: 0, penaltyIfNow: null, bonus: 10000,
    settle: 'written', settleLabel: '리포트 씀', correctionOf: null, paidIn: null, frozen: true,
  }],
  settlement: {
    yearMonth: '2026-09', confirmed: true, saved: true, writtenMinutes: 60,
    gross: 55000, lateCut: 0, incomeTax: 1650, localTax: 160, net: 53190,
    unwrittenCount: 1, unwrittenMinutes: 60, unwrittenAmount: 45000,
    remainingCount: 0, remainingMinutes: 0, remainingAmount: 0, bonus: 10000,
    correctionCount: 0, lateCount: 0, note: null,
    breakdown: [{ key: 'general', label: '일반', lessonCount: 1, minutes: 60, amount: 45000, note: null }, { key: 'kinder', label: 'Kinder', lessonCount: 1, minutes: 60, amount: 10000, note: null }],
    breakdownTotal: 65000, breakdownUnallocatedAmount: -10000,
  },
  bonusRules: [{ label: 'Kinder 수업', hint: '시급에 더함', amount: 10000, applied: true, note: null }],
};
const inbox: StaffTeacherInbox = {
  count: 2,
  categories: [
    ['report', '리포트', 1], ['schedule_change', '스케줄 변경', 0], ['book_change', '교재 변경', 0],
    ['unavailable', '불가 시간', 1], ['material_request', '자료 요청', 0], ['tz_change', '시간대 변경', 0],
    ['wage_change', '시급 변경', 0], ['suggestion', '건의 사항', 0],
  ].map(([key, label, count]) => ({ key, label, count })) as StaffTeacherInbox['categories'],
  items: [{
    sourceKind: 'rep', id: 101, category: 'report', categoryLabel: '리포트', title: '리포트 · 학생A 2026-09-30',
    sub: null, byId: 7, byName: '김강사', at: '2026-10-01T09:00:00+09:00', state: 'waiting', go: '/reports?review=approval',
    reqType: null, asked: null, reason: null, canAct: false, actBlockedReason: null,
  }, {
    sourceKind: 'unav', id: 91, category: 'unavailable', categoryLabel: '불가 시간', title: '불가 시간 · 10:00–11:00',
    sub: '2026-10-18 · 병원 진료', byId: 7, byName: null, at: '2026-10-08T09:00:00+09:00', state: 'waiting',
    go: '/staff/7?tab=unavailable', reqType: null, asked: null, reason: null, canAct: false,
    actBlockedReason: '편성 참고 정보이며 승인 대상이 아닙니다',
  }],
};
const unavailable: components['schemas']['ScheduleUnavListDto'] = {
  from: '2026-10-08', to: '2026-10-21',
  items: [{ id: 91, teacherId: 7, teacherName: '김강사', date: '2026-10-18', startMin: 600, endMin: 660, reason: '병원 진료로 수업 진행이 어렵습니다' }],
};
const occurrences: OccurrenceList = {
  from: '2026-10-05', to: '2026-10-11', version: 42,
  items: [{
    serId: 3, date: '2026-10-09', onDate: '2026-10-09', startMin: 600, endMin: 660, kindKey: 'class', extra: false, subKey: 'writing', title: 'Writing',
    teacherId: 7, teacherName: '김강사', roomId: 1, roomName: '2층 강의실', zaccId: null, mode: 'offline', canceled: false, hasException: false,
    recurring: true, repState: 'plan', ended: false, written: false, attendanceMode: 'unavailable', attendance: null,
    students: [{ id: 31, name: '학생A', grade: 'G9', droppedOnce: false, paused: false, late: false }],
  }],
};
const meta: Meta = {
  kinds: [{ key: 'class', name: '수업', color: '#4f46e5', cap: 1, grp: 'lesson', rep: true, extra: false }],
  subs: [{ key: 'writing', name: 'Writing', color: '#4f46e5' }],
  educationGrades: [], rooms: [], zaccs: [], staff: [], students: [], invTypes: [], cancelReasons: [], cancelTreats: [], lateReportTiers: [], teacherPolicies: [], genders: [],
};

const clients: QueryClient[] = [];
function responseFor(url: string): unknown {
  if (url === '/drawer/staff-directory/7') return detail;
  if (url === '/drawer/staff-directory/7/home') return home;
  if (url === '/drawer/staff-directory/7/guides') return guides;
  if (url === '/drawer/staff-directory/7/suggestions') return suggestions;
  if (url === '/drawer/staff-directory/7/history') return history;
  if (url === '/drawer/staff-directory/7/inbox') return inbox;
  if (url === '/schedule/unavailable') return unavailable;
  if (url === '/schedule/occurrences') return occurrences;
  if (url === '/schedule/holidays') return { from: occurrences.from, to: occurrences.to, items: [] };
  if (url === '/meta') return meta;
  throw new Error(`unexpected GET ${url}`);
}
function setup(getImpl: (url: string) => Promise<unknown> = async (url) => ({ data: responseFor(String(url)) })) {
  useSession.setState({ me: { id: 2, name: '관리자 김', roleLabel: '관리자' } as never, ready: true });
  vi.spyOn(api, 'get').mockImplementation(getImpl as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><StaffDetailPage /></QueryClientProvider>);
}
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  useSession.setState({ me: null, ready: false });
  nav.tab = null;
  nav.view = null;
  nav.anchor = null;
  replace.mockReset();
  push.mockReset();
  vi.restoreAllMocks();
});

it('실제 관리자 actor와 대상 강사를 분리하고 8탭을 한 허브에 표시한다', async () => {
  const view = setup();
  await view.findByText('조회자 관리자 김 · 대상 강사 김강사');
  await view.findByText('오늘·다가오는 7일 수업');
  expect(view.getAllByRole('tab').map((node) => node.textContent?.trim())).toEqual([
    '홈오늘 0건', '캘린더주·월', '불가 시간향후 2주', '리포트1건', '수업 안내주간 학생',
    '히스토리정산·변경', '건의 사항답변', '들어온 것8종 모음',
  ]);
  expect(view.getByText('현재 배정 수업·학생')).toBeTruthy();
  expect(view.getByText('현재 설정·보낸 신청 이력')).toBeTruthy();
});

it('리포트와 히스토리는 생성 projection만 표시하고 teacher 본인 API를 대리 호출하지 않는다', async () => {
  const view = setup();
  await view.findByText('현재 배정 수업·학생');
  fireEvent.click(view.getByRole('tab', { name: '리포트 1건' }));
  expect(replace).toHaveBeenLastCalledWith('/staff/7?tab=reports', { scroll: false });
  nav.tab = 'reports';
  view.rerender(<QueryClientProvider client={clients[0]}><StaffDetailPage /></QueryClientProvider>);
  expect(await view.findByText('작성된 수업 리포트')).toBeTruthy();
  nav.tab = 'history';
  view.rerender(<QueryClientProvider client={clients[0]}><StaffDetailPage /></QueryClientProvider>);
  expect(await view.findByText('정보 변경 감사 이력')).toBeTruthy();
  const urls = vi.mocked(api.get).mock.calls.map(([url]) => String(url));
  expect(urls).toEqual(['/drawer/staff-directory/7', '/drawer/staff-directory/7/home', '/drawer/staff-directory/7/history']);
  expect(urls.some((url) => url.startsWith('/teacher/'))).toBe(false);
});

it('히스토리는 대상 강사의 서버 KST 전월 수업·정산 projection을 표시한다', async () => {
  nav.tab = 'history';
  const view = setup();
  expect(await view.findByText('2026-09 수업 기록')).toBeTruthy();
  expect(view.getByText('Writing · 학생A')).toBeTruthy();
  expect(view.getByText(/일반 · 1건/)).toBeTruthy();
  expect(view.getByText(/Kinder · 1건/)).toBeTruthy();
  expect(view.getByText(/저장값과 현재 근거 차이/)).toBeTruthy();
  expect(view.getByText('−₩10,000')).toBeTruthy();
  expect(view.getByText('₩53,190')).toBeTruthy();
  expect(vi.mocked(api.get)).toHaveBeenCalledWith('/drawer/staff-directory/7/history');
  expect(vi.mocked(api.get).mock.calls.some(([url]) => String(url).startsWith('/teacher/'))).toBe(false);
});

it('들어온 것은 원문 8종 칩과 선택 강사의 열린 업무만 표시하고 원본 화면으로 이동한다', async () => {
  nav.tab = 'inbox';
  const view = setup();
  expect(await view.findByText('대상 강사 들어온 것')).toBeTruthy();
  expect(view.getByText('리포트 1')).toBeTruthy();
  expect(view.getByText('불가 시간 1')).toBeTruthy();
  expect(view.queryByText('GPA 요청', { exact: true })).toBeNull();
  fireEvent.click(view.getAllByRole('button', { name: '처리 화면 열기' })[0]);
  expect(push).toHaveBeenLastCalledWith('/reports?review=approval');
  expect(vi.mocked(api.get)).toHaveBeenCalledWith('/drawer/staff-directory/7/inbox');
});

it('대상 강사의 불가 시간은 기존 관리자 일정 계약으로만 읽는다', async () => {
  nav.tab = 'unavailable';
  const view = setup();
  expect(await view.findByText('2026-10-18 · 10:00–11:00')).toBeTruthy();
  expect(view.getByText(/등록·삭제는 대상 강사의 본인 화면에서만 수행합니다/)).toBeTruthy();
  expect(view.queryByRole('button', { name: /등록|저장|삭제/ })).toBeNull();
  await waitFor(() => expect(vi.mocked(api.get)).toHaveBeenCalledWith('/schedule/unavailable', {
    params: expect.objectContaining({ teacherId: 7 }),
  }));
});

it('주·월 캘린더는 대상 강사 필터의 실제 회차를 읽고 관리자 일정으로 이동한다', async () => {
  nav.tab = 'calendar';
  nav.view = 'week';
  nav.anchor = '2026-10-09';
  const view = setup();
  await waitFor(() => expect(vi.mocked(api.get)).toHaveBeenCalledWith('/schedule/occurrences', {
    params: { from: '2026-10-05', to: '2026-10-11', teacherId: 7 },
  }));
  fireEvent.click(await view.findByRole('button', { name: /10\/9.*Writing/ }));
  expect(push).toHaveBeenLastCalledWith('/schedule?serId=3&onDate=2026-10-09&date=2026-10-09');
});

it('수업 안내는 대상 강사의 준비정보를 관리자 전용 경로에서 읽는다', async () => {
  nav.tab = 'guides';
  nav.anchor = '2026-10-09';
  const view = setup();
  expect(await view.findByText('대상 강사 수업 안내')).toBeTruthy();
  expect(view.getByText('Writing Basic · 사용 중')).toBeTruthy();
  expect(vi.mocked(api.get)).toHaveBeenCalledWith('/drawer/staff-directory/7/guides', { params: { week: '2026-10-09' } });
  expect(vi.mocked(api.get).mock.calls.some(([url]) => String(url).startsWith('/teacher/'))).toBe(false);
});

it('건의 답변은 기존 운영 writer로 저장한 뒤 대상 projection을 재조회한다', async () => {
  nav.tab = 'suggestions';
  const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { id: 81 } } as never);
  const view = setup();
  expect(await view.findByText('수업 시간 변경을 확인해 주세요.')).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: '답변하기' }));
  const submit = view.getByRole('button', { name: '답변 완료' });
  expect(submit).toHaveProperty('disabled', true);
  fireEvent.change(view.getByLabelText('건의 답변'), { target: { value: '확인 후 수업 시간을 다시 안내드리겠습니다.' } });
  fireEvent.click(submit);
  await waitFor(() => expect(patch).toHaveBeenCalledWith('/ops/suggestions/81/reply', { reply: '확인 후 수업 시간을 다시 안내드리겠습니다.' }));
  await waitFor(() => expect(vi.mocked(api.get).mock.calls.filter(([url]) => String(url) === '/drawer/staff-directory/7/suggestions').length).toBeGreaterThan(1));
  expect(vi.mocked(api.get).mock.calls.some(([url]) => String(url).startsWith('/teacher/'))).toBe(false);
});
