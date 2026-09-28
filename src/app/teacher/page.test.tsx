/** @file-guide
 * 목적: 강사 홈 §8 「내 설정」 — 변경 요청 버튼·한 달에 한 번·서버 판정 소비 회귀 (C39) · 알림 링크 `?meeting=` 의 회의 창 (W11 A' 후속).
 * 책임/재사용: 실제 TeacherHomePage/useTeacherHome 을 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { MeetingDetail, Me, TeacherHome } from '@/api/types';
import { useSession } from '@/store/useSession';
import TeacherHomePage from './page';

// 질의(`?meeting=`)는 시험마다 바꾼다 — 창을 닫으면 질의를 걷는지(replace)도 본다
const nav = vi.hoisted(() => ({ search: '', replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));

const me: Me = {
  id: 6, name: '이다현', role: 'teacher', roleLabel: '강사', title: null, canAdminPage: false, canCrudAll: false,
  canSeeProfit: false, canCrudAttendance: false, canMoney: false, canWage: false,
  canApprove: false, canHide: false, canGpaPack: false,
};

const home = (over: Partial<TeacherHome['settings']> = {}): TeacherHome => ({
  todayDate: '2026-09-12', today: [], upcoming: [],
  todaySummary: { lessons: 0, minutes: 0 },
  week: { lessons: 0, minutes: 0, unwritten: 0 },
  todo: { unwrittenReports: 0, waitingApprovals: 0, openChangeRequests: 0, openStaffRequests: 0, openBookChanges: 0 },
  settings: {
    name: '이다현', timezone: 'Asia/Seoul', wageRate: 42000, wageFrom: '2026-01-01',
    timezones: [{ tz: 'Asia/Seoul', name: '한국 (KST)' }, { tz: 'America/New_York', name: '미국 동부' }],
    requests: [], canAskWage: true, wageAskableOn: null, canAskTz: true, ...over,
  },
});

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
/** 이 시험에서 화면이 읽은 경로 */
const requested: string[] = [];
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut();
  nav.search = ''; nav.replace.mockClear(); nav.push.mockClear(); requested.length = 0;
});

/** 머리줄 서버 값(GET /teacher/shell) — 시간대 낱말·IANA 이름은 서버가 준다 */
const SHELL = { timezone: 'Asia/Seoul', tzLabel: 'Seoul · UTC+9', wageRate: 42000, notis: [], unread: 0, notiWindowDays: 30 };

function setup(data: TeacherHome, post?: ReturnType<typeof vi.fn>, shell: typeof SHELL = SHELL, meeting?: MeetingDetail) {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { method?: string; url?: string }) => {
    if (String(config.method).toLowerCase() === 'post' && post) return post(config);
    const url = String(config.url);
    requested.push(url);
    const body = url.includes('/teacher/shell') ? shell : url.includes('/ops/meetings/') ? meeting : data;
    return { config, status: 200, statusText: 'OK', headers: {}, data: body };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><TeacherHomePage /></QueryClientProvider>);
}

it('원문 그대로 — 시간대·시급 각각 변경 요청 버튼과 「관리자 승인 후 적용」이 보인다 (강사 덱 §8)', async () => {
  const view = setup(home());
  await waitFor(() => expect(view.getByRole('button', { name: '변경 요청' })).toBeTruthy());
  expect(view.getByRole('button', { name: '변경 신청' })).toBeTruthy();
  expect(view.container.textContent).toContain('관리자 승인 후 적용');
  expect(view.container.textContent).toContain('한 달에 한 번');
});

it('시급 신청은 서버 판정(canAskWage)으로 잠기고 언제부터 되는지 말한다', async () => {
  const view = setup(home({ canAskWage: false, wageAskableOn: '2026-10-05' }));
  await waitFor(() => expect(view.getByRole('button', { name: '변경 신청' })).toBeTruthy());
  expect(view.getByRole('button', { name: '변경 신청' }).hasAttribute('disabled')).toBe(true);
  expect(view.container.textContent).toContain('2026-10-05부터 다시 됩니다');
});

it('시급 요청은 입력한 값 그대로 서버로 간다 — 화면이 적용하지 않는다', async () => {
  const post = vi.fn(async (config) => ({
    config, status: 201, statusText: 'Created', headers: {},
    data: { id: 1, reqType: 'wage_change', label: '시급 변경', asked: '45,000원/시간', state: 'pending', createdOn: '2026-09-12', rejectReason: null },
  }));
  const view = setup(home(), post);
  await waitFor(() => expect(view.getByRole('button', { name: '변경 신청' })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '변경 신청' }));
  fireEvent.change(view.getByLabelText('바라는 시급'), { target: { value: '45000' } });
  fireEvent.change(view.getByLabelText('사유'), { target: { value: '3년차' } });
  fireEvent.click(view.getByRole('button', { name: '요청 올리기' }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  expect(post.mock.calls[0][0].url).toContain('/teacher/requests');
  expect(JSON.parse(String(post.mock.calls[0][0].data))).toEqual({ reqType: 'wage_change', rate: 45000, reason: '3년차' });
});

it('시간대 목록에서 지금 쓰는 것은 빠지고, 올린 이력과 반려 사유가 그대로 보인다', async () => {
  const view = setup(home({
    canAskTz: false,
    requests: [
      { id: 2, reqType: 'tz_change', label: '시간대 변경', asked: 'America/New_York', state: 'pending', createdOn: '2026-09-11', rejectReason: null },
      { id: 1, reqType: 'wage_change', label: '시급 변경', asked: '45,000원/시간', state: 'rejected', createdOn: '2026-08-20', rejectReason: '3개월 뒤 재검토' },
    ],
  }));
  await waitFor(() => expect(view.container.textContent).toContain('시간대 변경'));
  expect(view.getByRole('button', { name: '변경 요청' }).hasAttribute('disabled')).toBe(true);
  expect(view.container.textContent).toContain('3개월 뒤 재검토');
  expect(view.container.textContent).toContain('45,000원/시간');
});

/** 휴강 사유는 서버의 낱말이다 — 오늘 목록의 배지가 「휴강 · 학생 결석」이고 옛 휴강은 「수업 취소」 그대로 (C92 · C-31) */
it('오늘 목록의 휴강 배지는 서버가 준 사유 낱말을 쓰고, 사유가 없으면 「수업 취소」다', async () => {
  const lesson = {
    serId: 1, onDate: '2026-09-12', date: '2026-09-12', startMin: 600, durMin: 60, kindKey: 'class', subKey: 'writing', mode: 'offline' as const,
    title: null, roomName: '강의실 1', roomBranch: '강남', zaccLabel: null, students: '학생 A', canceled: true, repState: 'plan' as const,
  };
  const data = home();
  data.today = [{ ...lesson, cancelKindLabel: '학생 결석' }, { ...lesson, serId: 2, startMin: 720, cancelKindLabel: null }];
  const view = setup(data);
  await waitFor(() => expect(view.getByText('휴강 · 학생 결석')).toBeTruthy());
  expect(view.getByText('수업 취소')).toBeTruthy();
});

/* ── 강사 덱 slide 8·9 대조 (wave 6) ─────────────────────────────────────────────── */

it('hero 는 서버가 센 오늘 건수·시수를 적고, 시각은 강사 본인 시간대(서버 낱말) 기준이다', async () => {
  const data = home();
  // 목록은 한 줄뿐이지만 hero 는 서버 todaySummary 를 읽는다 — 화면이 다시 세지 않는다 (D-R37)
  data.todaySummary = { lessons: 3, minutes: 330 };
  const view = setup(data, undefined, { ...SHELL, timezone: 'America/New_York', tzLabel: 'New York · UTC-4' });
  await waitFor(() => expect(view.container.textContent).toContain('오늘 수업 3건 · 시수 5.5시간'));
  await waitFor(() => expect(view.container.textContent).toContain('New York · UTC-4 기준'));
  const clock = view.container.querySelector('[data-teacher-clock]');
  const expected = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(Date.now());
  expect(clock?.textContent).toContain(expected);
  // 12일은 토요일 — 덱의 「25 / 화요일」 자리
  expect(view.container.querySelector('[data-teacher-hero]')?.textContent).toContain('토요일');
});

it('「다가오는 수업」 머리 오른쪽에 이번 주 칩 — 건수·시간·미작성 모두 서버 week 값이다 (덱 slide 9)', async () => {
  const data = home();
  data.week = { lessons: 10, minutes: 1140, unwritten: 4 };
  const view = setup(data);
  await waitFor(() => expect(view.getByText('이번 주 10건 · 19시간 ·')).toBeTruthy());
  expect(view.getByText('미작성 4')).toBeTruthy();
});

it('머리줄이 「홈」을 말하므로 본문에 같은 h1 이 없고, 바로가기는 덱의 다섯 칸이다', async () => {
  const view = setup(home());
  await waitFor(() => expect(view.getByRole('button', { name: '변경 신청' })).toBeTruthy());
  expect(view.queryByRole('heading', { level: 1 })).toBeNull();
  const quick = view.getByRole('navigation', { name: '바로가기' });
  expect([...quick.querySelectorAll('a')].map((a) => a.textContent?.replace('›', '').trim()))
    .toEqual(['캘린더', '리포트', '수업 안내', '수업 히스토리', '건의 사항']);
});

it('다가오는 수업 줄은 날짜와 「N일 뒤」를 적고, 끝난 수업은 그 리포트로 잇는다', async () => {
  const lesson = {
    serId: 5, onDate: '2026-09-14', date: '2026-09-14', startMin: 600, durMin: 120, kindKey: 'class', subKey: 'writing', mode: 'online' as const,
    title: 'Literature & Writing', roomName: null, roomBranch: null, zaccLabel: 'TN 학원 1번방', students: '고은설',
    canceled: false, cancelKindLabel: null, repState: 'plan' as const,
  };
  const data = home();
  data.upcoming = [lesson];
  data.today = [{ ...lesson, serId: 6, onDate: '2026-09-12', date: '2026-09-12', repState: 'none' as const }];
  const view = setup(data);
  await waitFor(() => expect(view.getByText('2일 뒤')).toBeTruthy());
  // 오늘 끝난(미작성) 수업은 리포트 작성 화면으로 — 덱 slide 9 「클릭 → 해당 수업의 리포트 작성 화면」
  const link = view.getByRole('link', { name: /Literature & Writing/ });
  expect(link.getAttribute('href')).toBe('/reports?serId=6&onDate=2026-09-12');
  // 아직 안 한 수업(예정)은 쓸 리포트가 없으므로 링크가 아니다
  expect(view.getAllByRole('link', { name: /Literature & Writing/ })).toHaveLength(1);
});

/* 옮긴 회차 — 날짜와 「N일 뒤」는 실제 수업일(date)이고 리포트 링크는 키(onDate)다 (TBO-54 MEETING-MOVE) */
it('다가오는 수업의 날짜는 실제 수업일이다 — 다음 주로 옮긴 회차는 옮긴 날과 「N일 뒤」로 서고 링크는 원래 키를 쓴다', async () => {
  const moved = {
    serId: 7, onDate: '2026-09-12', date: '2026-09-19', startMin: 600, durMin: 60, kindKey: 'class', subKey: 'writing', mode: 'offline' as const,
    title: 'Moved Writing', roomName: '강의실 1', roomBranch: '강남', zaccLabel: null, students: '고은설',
    canceled: false, cancelKindLabel: null, repState: 'none' as const,
  };
  const data = home();
  data.today = [];
  data.upcoming = [moved];
  const view = setup(data);
  await waitFor(() => expect(view.getByText('7일 뒤')).toBeTruthy());
  expect(view.container.textContent).toContain('9/19');
  expect(view.container.textContent).not.toContain('9/12');
  expect(view.getByRole('link', { name: /Moved Writing/ }).getAttribute('href')).toBe('/reports?serId=7&onDate=2026-09-12');
});
/* 강사 덱 slide 8 「오늘 할 일」 넷째 줄 — 교재 변경 요청 중(서버가 센 수 · N-99). 수업 안내로 간다 */
it('오늘 할 일 넷째 줄은 「교재 변경 요청 중」이고 서버가 센 수를 그대로 쓰며 수업 안내로 잇는다 (N-99)', async () => {
  const data = home();
  const view = setup({ ...data, todo: { ...data.todo, openStaffRequests: 3, openBookChanges: 1 } });
  await waitFor(() => expect(view.getByText('교재 변경 요청 중')).toBeTruthy());
  const row = view.getByText('교재 변경 요청 중').closest('a')!;
  expect(row.getAttribute('href')).toBe('/teacher/guides');
  expect(row.textContent).toContain('1');
  // 덱에 없는 「요청 진행 중」 줄은 서지 않는다 — 시급 · 시간대 요청은 「내 설정」이 보인다
  expect(view.queryByText('요청 진행 중')).toBeNull();
});

/* ── W11 A' 후속 — 강사 참석자의 회의 상세 (회의 안내 · 회의 할 일 알림의 링크) ─────────────── */

/** 강사 참석자가 받는 상세 — 쓰기 플래그는 서버가 끈다(운영 권한 없음) · 응답만 선다 */
const MEETING: MeetingDetail = {
  id: 4, mtType: 'general', mtTypeLabel: '일반 회의', title: '주간 운영 회의', onDate: '2026-09-15',
  startMin: 1110, endMin: 1170, placeLabel: '6호',
  attendees: [
    { staffId: 2, name: '김민수', title: null, state: 'in', stateLabel: '참석' },
    { staffId: 6, name: '이다현', title: null, state: 'waiting', stateLabel: '응답 대기' },
  ],
  confirmed: 1, attendLabel: '참석 1/2 확인', preFiles: [], minutes: null, minutesAt: null, minutesByName: null,
  minutesTemplates: ['[정한 것]', '[누가 무엇을]', '[다음 회의까지]', '[보류]'], minutesHint: '정한 것 · 누가 무엇을 · 다음 회의까지',
  tasks: [], taskDone: 0,
  canEdit: false, canSendNotice: false, noticeBlockedReason: null, canRespond: true, myAttend: { state: 'waiting', stateLabel: '응답 대기' },
};

it('알림 링크 `/teacher?meeting=N` 은 홈 위에 운영 화면과 같은 회의 상세 창을 연다 — 쓰기 단추는 서버 플래그 · 닫으면 질의를 걷는다', async () => {
  nav.search = 'meeting=4';
  const view = setup(home(), undefined, SHELL, MEETING);
  const dialog = await waitFor(() => view.getByRole('dialog', { name: '일반 회의' }));
  await waitFor(() => expect(within(dialog).getByText('참석 1/2 확인')).toBeTruthy());
  // 참석자로만 여는 강사 — 안내 · 속기록 저장 · 머리말이 서지 않고 본인 응답만 선다
  expect(within(dialog).queryByRole('button', { name: '안내 보내기' })).toBeNull();
  expect(within(dialog).queryByRole('button', { name: '속기록 저장' })).toBeNull();
  expect(within(dialog).getByRole('group', { name: '내 참석 응답' })).toBeTruthy();
  // 홈은 그대로 뒤에 있다
  expect(view.getByRole('button', { name: '변경 신청' })).toBeTruthy();
  fireEvent.click(within(dialog).getAllByRole('button', { name: '닫기' })[1]);
  expect(nav.replace).toHaveBeenCalledWith('/teacher');
});

it('질의가 없거나 번호 모양이 아니면 회의 창을 열지 않는다 — 회의를 읽지도 않는다', async () => {
  nav.search = 'meeting=abc';
  const view = setup(home());
  await waitFor(() => expect(view.getByRole('button', { name: '변경 신청' })).toBeTruthy());
  expect(view.queryByRole('dialog')).toBeNull();
  expect(requested.some((u) => u.includes('/teacher/home'))).toBe(true);
  expect(requested.some((u) => u.includes('/ops/meetings/'))).toBe(false);
});
