/** @file-guide
 * 목적: MyPageDialog.test.tsx (test)
 * 책임/재사용: 마이 페이지 대화상자(AUTH-SELF-01)의 역할별 절 구성 · 이름 저장 · 새 수신처 인증 변경 · 서버 거절 자리를 실제 Query 훅과 Axios 경계(어댑터만 대역)로 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 강사 PPTX p98 대화상자 차례(머리 → 시간대 → 기본 시급 → 계정 → [닫기])와 Figma 색인 D1~D6(9555:134122)을 본다.
 * 서버 낱말(역할 · 직함 · 채널 이름 · 거절 문장)은 응답 그대로 쓰는지, 역할 낱말 비교 없이 서버 플래그(canAdminPage)로만 절을 고르는지 본다.
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { LoginResult, Me, OnboardingCodeResult, Profile, TeacherHome } from '@/api/types';
import { useSession } from '@/store/useSession';
import { MyPageDialog } from './MyPageDialog';

const h = vi.hoisted(() => ({ clear: vi.fn(), revalidate: vi.fn(() => Promise.resolve()) }));
vi.mock('@/api/session-cache', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/session-cache')>(),
  clearSessionQueries: h.clear,
  revalidateSession: h.revalidate,
}));

const teacher: Me = {
  id: 7, name: '김재훈', role: 'teacher', roleLabel: '강사', title: null, canAdminPage: false, canCrudAll: false,
  canSeeProfit: false, canCrudAttendance: false, canMoney: false, canWage: false, canApprove: false, canHide: false,
  canGpaPack: false, mustChangeCredentials: false,
};
const manager: Me = {
  ...teacher, id: 3, name: '김범준', role: 'manager', roleLabel: '매니저', title: '교수실장', canAdminPage: true, canApprove: true,
};

const CHANNELS = [
  { channel: 'email' as const, label: '메일', ready: true, notReadyReason: null },
  { channel: 'sms' as const, label: '문자', ready: true, notReadyReason: null },
];
const profileOf = (over: Partial<Profile> = {}): Profile => ({
  id: 7, loginId: 't02@tnacademy.kr', name: '김재훈', englishName: 'Jaehoon Kim', roleLabel: '강사', title: null,
  email: 't02@tnacademy.kr', emailVerified: true, phone: '01090000007', phoneVerified: true, hiredOn: '2023-03-06',
  contactCodes: {
    channels: CHANNELS, codeTtlMinutes: 10, resendAfterSeconds: 60,
    phoneCountries: [{ code: '82', label: '대한민국' }, { code: '1', label: '미국 · 캐나다' }],
  },
  ...over,
});
const home: TeacherHome = {
  todayDate: '2026-10-16', today: [], upcoming: [],
  todaySummary: { lessons: 0, minutes: 0 },
  week: { lessons: 0, minutes: 0, unwritten: 0 },
  todo: { unwrittenReports: 0, waitingApprovals: 0, openChangeRequests: 0, openStaffRequests: 0, openBookChanges: 0 },
  settings: {
    name: '김재훈', timezone: 'Asia/Seoul', wageRate: 45000, wageFrom: '2026-07-01',
    kinderHourlyRate: 55000, diagPerSession: 15000, mockPerSession: 15000,
    timezones: [{ tz: 'Asia/Seoul', name: '한국 (KST)' }, { tz: 'America/New_York', name: '미국 동부' }],
    requests: [], canAskWage: true, wageAskableOn: null, canAskTz: true,
  },
};
const SHELL = { timezone: 'Asia/Seoul', tzLabel: 'Seoul · UTC+9', wageRate: 45000, notis: [], unread: 0, notiWindowDays: 30 };

type Reply = { status?: number; data: unknown };
type Handler = (body: Record<string, unknown>) => Reply;
const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
/** 이 시험에서 화면이 부른 「방법 경로」 */
const calls: Array<{ key: string; body: Record<string, unknown> }> = [];

afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut();
  calls.length = 0; vi.clearAllMocks();
});

const fail = (status: number, code: string, message: string): Reply => ({ status, data: { code, message } });

function mount(me: Me, profile: Profile, handlers: Record<string, Handler> = {}, onClose = vi.fn()) {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    const key = `${String(config.method).toUpperCase()} ${String(config.url)}`;
    const body = typeof config.data === 'string' && config.data ? JSON.parse(config.data) as Record<string, unknown> : {};
    calls.push({ key, body });
    const reads: Record<string, unknown> = { 'GET /auth/profile': profile, 'GET /teacher/home': home, 'GET /teacher/shell': SHELL };
    const reply: Reply = handlers[key]?.(body) ?? (key in reads ? { data: reads[key] } : fail(404, 'NOT_FOUND', key));
    const status = reply.status ?? 200;
    const response = { config, status, statusText: '', headers: {}, data: reply.data };
    if (status >= 400) throw new AxiosError('fixture', AxiosError.ERR_BAD_REQUEST, config, undefined, response);
    return response;
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><MyPageDialog open onClose={onClose} /></QueryClientProvider>);
  return { view, onClose, dialog: () => view.getByRole('dialog', { name: '마이 페이지' }) };
}
const keys = () => calls.map((c) => c.key);
const bodyOf = (key: string) => calls.find((c) => c.key === key)?.body;
const type = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } });

describe('마이 페이지 — 역할별 절 (강사 PPTX p98 · D2)', () => {
  it('강사 = 머리 · 시간대 · 기본 시급 · 계정 — 서버 값 그대로', async () => {
    const { dialog } = mount(teacher, profileOf());
    await waitFor(() => expect(within(dialog()).getByText('입사일 2023-03-06 · TN Academy')).toBeTruthy());
    const d = dialog();
    expect(within(d).getByText('시간대와 시급은 관리자 승인 후 바뀝니다.')).toBeTruthy();
    // 시간대 — 서버 낱말 · IANA 이름 · 본인 시간대의 지금 시각 · [변경 요청]
    await waitFor(() => expect(within(d).getByText('Seoul · UTC+9')).toBeTruthy());
    expect(within(d).getByText(/^Asia\/Seoul · 현재 \d\d:\d\d$/)).toBeTruthy();
    expect(within(d).getByRole('button', { name: '변경 요청' })).toBeTruthy();
    // 기본 시급 — 적용일 · Kinder · 진단/모의 건당(S1 파생값) · [변경 신청] · 월 1회 안내
    expect(d.textContent).toContain('₩45,000/시간');
    expect(d.textContent).toContain('2026-07-01 적용 · Kinder ₩55,000 · 진단·모의 ₩15,000/건');
    expect(within(d).getByRole('button', { name: '변경 신청' })).toBeTruthy();
    expect(d.textContent).toContain('시급 변경 신청은 한 달에 한 번입니다. 이 내역은 본인만 볼 수 있습니다.');
    // 계정 — 이름·역할 · 조회 범위 · 행 4개
    expect(within(d).getByText('김재훈 · 강사')).toBeTruthy();
    expect(within(d).getByText('담당 학생과 배정된 수업만 조회됩니다')).toBeTruthy();
    expect(within(d).getByText('영어 이름 · Jaehoon Kim')).toBeTruthy();
    expect(within(d).getByText('아이디는 바뀌지 않습니다')).toBeTruthy();
    expect(within(d).getByText('01090000007')).toBeTruthy();
    expect(within(d).getAllByText('인증됨')).toHaveLength(2);
    expect(within(d).getByRole('button', { name: '이름 수정' })).toBeTruthy();
    expect(within(d).getByRole('button', { name: '휴대폰 변경' })).toBeTruthy();
    expect(within(d).getByRole('button', { name: '이메일 변경' })).toBeTruthy();
    expect(keys()).toEqual(expect.arrayContaining(['GET /auth/profile', 'GET /teacher/home']));
  });

  it('관리자·매니저·대표 = 머리 + 계정 — 직함이 있으면 직함(관리자 p131), 강사 전용 조회는 부르지 않는다', async () => {
    const { dialog } = mount(manager, profileOf({ id: 3, name: '김범준', roleLabel: '매니저', title: '교수실장', hiredOn: null, loginId: 'head@tnacademy.kr' }));
    await waitFor(() => expect(within(dialog()).getByText('김범준 · 교수실장')).toBeTruthy());
    const d = dialog();
    expect(within(d).getByText('이름과 연락처를 확인하고 바꿉니다 · 연락처는 새 수신처 인증 뒤에 바뀝니다')).toBeTruthy();
    expect(within(d).getByText('업무 화면과 권한은 역할 권한 표를 따릅니다 — 여기서는 바꿀 수 없습니다')).toBeTruthy();
    // 입사일이 없는 옛 계정은 입사일 낱말을 지어내지 않는다
    expect(within(d).getByText('TN Academy')).toBeTruthy();
    expect(within(d).queryByText(/입사일/)).toBeNull();
    expect(within(d).queryByRole('button', { name: '변경 요청' })).toBeNull();
    expect(within(d).queryByRole('button', { name: '변경 신청' })).toBeNull();
    expect(keys()).not.toContain('GET /teacher/home');
    expect(keys()).not.toContain('GET /teacher/shell');
  });

  it('바닥 [닫기] 와 Esc 는 닫기를 부른다 (D1)', async () => {
    const { view, dialog, onClose } = mount(manager, profileOf());
    await waitFor(() => expect(within(dialog()).getByText('아이디는 바뀌지 않습니다')).toBeTruthy());
    fireEvent.click(within(dialog()).getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    view.unmount();
  });
});

describe('계정 절 — 이름 · 영어 이름 (D5)', () => {
  it('한 번에 패널 하나 — 이름 패널이 열리면 나머지 단추는 잠긴다', async () => {
    const { dialog } = mount(teacher, profileOf());
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: '이름 수정' })).toBeTruthy());
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: '변경 요청' })).toBeTruthy());
    fireEvent.click(within(dialog()).getByRole('button', { name: '이름 수정' }));
    const d = dialog();
    expect(within(d).getByRole('group', { name: '이름 · 영어 이름 바꾸기' })).toBeTruthy();
    for (const name of ['휴대폰 변경', '이메일 변경', '변경 요청', '변경 신청']) {
      expect((within(d).getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    fireEvent.click(within(d).getByRole('button', { name: '취소' }));
    expect(within(d).queryByRole('group', { name: '이름 · 영어 이름 바꾸기' })).toBeNull();
    expect((within(d).getByRole('button', { name: '휴대폰 변경' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('패널을 닫으면(취소 · 저장) 초점은 그 패널을 연 단추로 돌아온다 — 키보드 사용자가 대화상자 처음으로 튕기지 않는다', async () => {
    const { dialog } = mount(teacher, profileOf(), { 'PATCH /auth/profile': () => ({ data: profileOf({ englishName: null }) }) });
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: '변경 요청' })).toBeTruthy());
    fireEvent.click(within(dialog()).getByRole('button', { name: '이름 수정' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(document.activeElement).toBe(within(dialog()).getByRole('button', { name: '이름 수정' })));

    fireEvent.click(within(dialog()).getByRole('button', { name: '이름 수정' }));
    type(within(dialog()).getByLabelText('영어 이름'), '');
    fireEvent.click(within(dialog()).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(within(dialog()).getByRole('status').textContent).toBe('이름을 저장했습니다'));
    await waitFor(() => expect(document.activeElement).toBe(within(dialog()).getByRole('button', { name: '이름 수정' })));

    fireEvent.click(within(dialog()).getByRole('button', { name: '변경 요청' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(document.activeElement).toBe(within(dialog()).getByRole('button', { name: '변경 요청' })));
  });

  it('요청을 올려 연 단추가 잠기면 초점은 대화상자 판에 남는다 — body 로 빠지지 않는다', async () => {
    let asked = false;
    const { dialog } = mount(teacher, profileOf(), {
      'POST /teacher/requests': () => { asked = true; return { status: 201, data: { id: 9 } }; },
      'GET /teacher/home': () => ({ data: asked ? { ...home, settings: { ...home.settings, canAskTz: false } } : home }),
    });
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: '변경 요청' })).toBeTruthy());
    fireEvent.click(within(dialog()).getByRole('button', { name: '변경 요청' }));
    fireEvent.change(within(dialog()).getByLabelText('바라는 시간대'), { target: { value: 'America/New_York' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: '요청 올리기' }));
    await waitFor(() => expect(within(dialog()).getByText('올린 요청이 처리 중입니다')).toBeTruthy());
    expect(bodyOf('POST /teacher/requests')).toEqual({ reqType: 'tz_change', timezone: 'America/New_York' });
    await waitFor(() => expect(document.activeElement).toBe(dialog()));
  });

  it('빈 이름은 보내지 않고 칸 아래에 알린다 · 바뀐 칸만 보내고 영어 이름 빈 칸은 비움(null)이다', async () => {
    const saved = profileOf({ name: '김재훈A', englishName: null });
    const { dialog } = mount(teacher, profileOf(), { 'PATCH /auth/profile': () => ({ data: saved }) });
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: '이름 수정' })).toBeTruthy());
    fireEvent.click(within(dialog()).getByRole('button', { name: '이름 수정' }));
    const d = dialog();
    const name = within(d).getByLabelText('이름');
    expect((name as HTMLInputElement).value).toBe('김재훈');
    type(name, '   ');
    fireEvent.click(within(d).getByRole('button', { name: '저장' }));
    expect(within(d).getByText('이름을 적어 주세요')).toBeTruthy();
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(keys()).not.toContain('PATCH /auth/profile');

    type(name, ' 김재훈A ');
    type(within(d).getByLabelText('영어 이름'), '  ');
    fireEvent.click(within(d).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(within(d).getByRole('status').textContent).toBe('이름을 저장했습니다'));
    expect(bodyOf('PATCH /auth/profile')).toEqual({ name: '김재훈A', englishName: null });
    // 셸 이름은 서버 Me 를 다시 읽어 바꾼다(Me 는 Zustand 한 곳 · 화면이 지어 넣지 않는다)
    expect(h.revalidate).toHaveBeenCalledTimes(1);
    expect(within(d).queryByRole('group', { name: '이름 · 영어 이름 바꾸기' })).toBeNull();
    expect(within(d).getByText('김재훈A · 강사')).toBeTruthy();
    expect(within(d).getByText('영어 이름 없음')).toBeTruthy();
  });

  it('서버 거절 문장은 [저장] 바로 아래에 그대로 선다', async () => {
    const { dialog } = mount(teacher, profileOf(), {
      'PATCH /auth/profile': () => fail(400, 'BAD_REQUEST', '이름은 40자까지입니다'),
    });
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: '이름 수정' })).toBeTruthy());
    fireEvent.click(within(dialog()).getByRole('button', { name: '이름 수정' }));
    type(within(dialog()).getByLabelText('이름'), '가'.repeat(41));
    fireEvent.click(within(dialog()).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(within(dialog()).getByRole('alert').textContent).toBe('이름은 40자까지입니다'));
    expect(h.revalidate).not.toHaveBeenCalled();
    expect(within(dialog()).getByRole('group', { name: '이름 · 영어 이름 바꾸기' })).toBeTruthy();
  });
});

describe('계정 절 — 휴대폰 · 이메일 새 수신처 인증 (D6)', () => {
  const sentTo = (channel: 'sms' | 'email', targetMasked: string): Handler => () => ({
    data: { channel, targetMasked, expiresAt: '2026-10-16T06:10:00.000Z', resendAfterSeconds: 60, devCode: '482913' } satisfies OnboardingCodeResult,
  });
  const newMe: Me = { ...teacher };
  const session: LoginResult = { accessToken: 'fresh-access', user: newMe };

  it('새 번호 → 코드 받기 → 코드 · 지금 비밀번호 → 인증하고 저장 → 새 세션', async () => {
    const { dialog } = mount(teacher, profileOf(), {
      'POST /auth/profile/contact-codes': sentTo('sms', '010-****-5678'),
      'POST /auth/profile/contact-change': () => ({ status: 201, data: session }),
    });
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: '휴대폰 변경' })).toBeTruthy());
    fireEvent.click(within(dialog()).getByRole('button', { name: '휴대폰 변경' }));
    const d = dialog();
    const panel = within(d).getByRole('group', { name: '휴대폰 번호 바꾸기' });
    expect(within(panel).getByText('지금 번호 01090000007 · 인증됨 — 새 번호 인증을 마치기 전까지 그대로입니다')).toBeTruthy();
    // 코드를 받기 전에는 코드 · 비밀번호 칸과 저장 단추가 잠긴다
    expect((within(panel).getByLabelText('인증 코드') as HTMLInputElement).disabled).toBe(true);
    expect((within(panel).getByLabelText('지금 비밀번호') as HTMLInputElement).disabled).toBe(true);
    expect((within(panel).getByRole('button', { name: '인증하고 저장' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(panel).getByRole('button', { name: '문자로 코드 받기' }) as HTMLButtonElement).disabled).toBe(true);

    type(within(panel).getByLabelText('새 번호'), '010-1234-5678');
    fireEvent.click(within(panel).getByRole('button', { name: '문자로 코드 받기' }));
    await waitFor(() => expect(within(panel).getByText('보낸 곳 010-****-5678 · 10분 안에 적어 주세요')).toBeTruthy());
    expect(bodyOf('POST /auth/profile/contact-codes')).toEqual({ channel: 'sms', target: '010-1234-5678' });
    // 개발용 되돌려 주기는 서버가 실었을 때만 — 실제 수신이 아니다
    expect(within(panel).getByText('개발용 코드: 482913')).toBeTruthy();
    expect(within(panel).getByRole('button', { name: /다시 받기 \(\d+초\)/ })).toBeTruthy();

    type(within(panel).getByLabelText('인증 코드'), '482913');
    type(within(panel).getByLabelText('지금 비밀번호'), 'taco1234!');
    fireEvent.click(within(panel).getByRole('button', { name: '인증하고 저장' }));
    await waitFor(() => expect(within(d).getByRole('status').textContent).toBe('휴대폰 번호를 바꿨습니다 — 다른 기기의 로그인은 끊겼습니다'));
    expect(bodyOf('POST /auth/profile/contact-change')).toEqual({
      channel: 'sms', target: '010-1234-5678', code: '482913', currentPassword: 'taco1234!',
    });
    // 옛 토큰은 서버가 끊었다 — 캐시를 버리고 응답의 새 세션으로 연다(첫 설정 · 로그인과 같은 순서)
    expect(h.clear).toHaveBeenCalledTimes(1);
    expect(useSession.getState().me).toEqual(newMe);
    expect(within(d).queryByRole('group', { name: '휴대폰 번호 바꾸기' })).toBeNull();
  });

  it('키보드 초점이 body 로 빠지지 않는다 — 열면 새 받는 곳 칸, 보내는 중·초읽기는 그 단추(aria-disabled), 저장 거절은 거절된 칸 (S4)', async () => {
    let change: Reply = fail(409, 'CODE_MISMATCH', '휴대폰 코드가 맞지 않습니다 — 4번 더 시도할 수 있습니다');
    const { dialog } = mount(teacher, profileOf(), {
      'POST /auth/profile/contact-codes': sentTo('sms', '010-****-5678'),
      'POST /auth/profile/contact-change': () => change,
    });
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: '휴대폰 변경' })).toBeTruthy());
    fireEvent.click(within(dialog()).getByRole('button', { name: '휴대폰 변경' }));
    const panel = within(dialog()).getByRole('group', { name: '휴대폰 번호 바꾸기' });
    // 연 단추는 패널로 바뀌어 사라진다 — 초점은 패널의 첫 입력 칸으로 들어간다
    expect(document.activeElement).toBe(within(panel).getByLabelText('새 번호'));

    type(within(panel).getByLabelText('새 번호'), '010-1234-5678');
    const send = within(panel).getByRole('button', { name: '문자로 코드 받기' });
    send.focus();
    fireEvent.click(send);
    // 실제 브라우저는 disabled 가 된 단추의 초점을 body 로 버린다 — 보내는 동안 · 초읽기 동안은 aria-disabled 로만 잠근다
    expect(send.hasAttribute('disabled')).toBe(false);
    expect(send.getAttribute('aria-disabled')).toBe('true');
    await waitFor(() => expect(within(panel).getByText('보낸 곳 010-****-5678 · 10분 안에 적어 주세요')).toBeTruthy());
    expect(send.textContent).toMatch(/다시 받기 \(\d+초\)/);
    expect(send.hasAttribute('disabled')).toBe(false);
    expect(send.getAttribute('aria-disabled')).toBe('true');
    // 초읽기 중 눌러도 다시 보내지 않는다
    fireEvent.click(send);
    expect(calls.filter((c) => c.key === 'POST /auth/profile/contact-codes')).toHaveLength(1);

    type(within(panel).getByLabelText('인증 코드'), '111111');
    type(within(panel).getByLabelText('지금 비밀번호'), 'taco1234!');
    const save = within(panel).getByRole('button', { name: '인증하고 저장' });
    save.focus();
    fireEvent.click(save);
    await waitFor(() => expect(document.activeElement).toBe(within(panel).getByLabelText('인증 코드')));

    change = fail(409, 'CURRENT_PASSWORD_MISMATCH', '지금 비밀번호가 맞지 않습니다 — 3번 더 시도할 수 있습니다');
    save.focus();
    fireEvent.click(save);
    await waitFor(() => expect(document.activeElement).toBe(within(panel).getByLabelText('지금 비밀번호')));
  });

  it('이름 패널을 열면 초점은 이름 칸이다 — 연 단추가 사라져도 키보드 위치를 잃지 않는다 (S4)', async () => {
    const { dialog } = mount(teacher, profileOf());
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: '이름 수정' })).toBeTruthy());
    fireEvent.click(within(dialog()).getByRole('button', { name: '이름 수정' }));
    expect(document.activeElement).toBe(within(dialog()).getByLabelText('이름'));
  });

  it('받는 곳을 바꾸면 보낸 코드는 쓸 수 없다 — 코드 칸이 다시 잠긴다', async () => {
    const { dialog } = mount(teacher, profileOf(), { 'POST /auth/profile/contact-codes': sentTo('sms', '010-****-5678') });
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: '휴대폰 변경' })).toBeTruthy());
    fireEvent.click(within(dialog()).getByRole('button', { name: '휴대폰 변경' }));
    const panel = within(dialog()).getByRole('group', { name: '휴대폰 번호 바꾸기' });
    type(within(panel).getByLabelText('새 번호'), '010-1234-5678');
    fireEvent.click(within(panel).getByRole('button', { name: '문자로 코드 받기' }));
    await waitFor(() => expect((within(panel).getByLabelText('인증 코드') as HTMLInputElement).disabled).toBe(false));
    type(within(panel).getByLabelText('새 번호'), '010-1234-5679');
    expect((within(panel).getByLabelText('인증 코드') as HTMLInputElement).disabled).toBe(true);
    expect(within(panel).queryByText(/보낸 곳/)).toBeNull();
  });

  it('코드 받기 거절(429)은 그 단추 바로 아래 · 코드/비밀번호 거절은 그 칸 아래 — 서버 문장 그대로, 세션은 그대로', async () => {
    let change: Reply = fail(409, 'CODE_EXPIRED', '휴대폰 인증 코드가 만료됐습니다 — 코드를 다시 받아 주세요');
    let codes: Reply = fail(429, 'CODE_TOO_SOON', '코드를 방금 보냈습니다 — 41초 뒤에 다시 받을 수 있습니다');
    const { dialog } = mount(teacher, profileOf(), {
      'POST /auth/profile/contact-codes': () => codes,
      'POST /auth/profile/contact-change': () => change,
    });
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: '휴대폰 변경' })).toBeTruthy());
    fireEvent.click(within(dialog()).getByRole('button', { name: '휴대폰 변경' }));
    const panel = within(dialog()).getByRole('group', { name: '휴대폰 번호 바꾸기' });
    type(within(panel).getByLabelText('새 번호'), '010-1234-5678');
    fireEvent.click(within(panel).getByRole('button', { name: '문자로 코드 받기' }));
    await waitFor(() => expect(within(panel).getByRole('alert').textContent).toBe('코드를 방금 보냈습니다 — 41초 뒤에 다시 받을 수 있습니다'));
    expect((within(panel).getByLabelText('인증 코드') as HTMLInputElement).disabled).toBe(true);

    codes = sentTo('sms', '010-****-5678')({});
    fireEvent.click(within(panel).getByRole('button', { name: '문자로 코드 받기' }));
    await waitFor(() => expect((within(panel).getByLabelText('인증 코드') as HTMLInputElement).disabled).toBe(false));
    type(within(panel).getByLabelText('인증 코드'), '111111');
    type(within(panel).getByLabelText('지금 비밀번호'), 'taco1234!');
    fireEvent.click(within(panel).getByRole('button', { name: '인증하고 저장' }));
    const code = within(panel).getByLabelText('인증 코드');
    await waitFor(() => expect(code.getAttribute('aria-invalid')).toBe('true'));
    expect(document.getElementById(String(code.getAttribute('aria-describedby')))?.textContent)
      .toBe('휴대폰 인증 코드가 만료됐습니다 — 코드를 다시 받아 주세요');

    change = fail(409, 'CURRENT_PASSWORD_MISMATCH', '지금 비밀번호가 맞지 않습니다');
    fireEvent.click(within(panel).getByRole('button', { name: '인증하고 저장' }));
    const password = within(panel).getByLabelText('지금 비밀번호');
    await waitFor(() => expect(password.getAttribute('aria-invalid')).toBe('true'));
    expect(document.getElementById(String(password.getAttribute('aria-describedby')))?.textContent).toBe('지금 비밀번호가 맞지 않습니다');
    expect(code.getAttribute('aria-invalid')).toBeNull();
    expect(h.clear).not.toHaveBeenCalled();
    expect(useSession.getState().me).toEqual(teacher);
  });

  it('이메일 — 다른 구성원의 주소(409)는 코드 받기 단추 아래, 지금 주소는 그대로 보인다', async () => {
    const { dialog } = mount(manager, profileOf({ email: 'head@tnacademy.kr' }), {
      'POST /auth/profile/contact-codes': () => fail(409, 'EMAIL_TAKEN', '이미 다른 계정이 쓰는 이메일입니다 — 다른 주소를 적어 주세요'),
    });
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: '이메일 변경' })).toBeTruthy());
    fireEvent.click(within(dialog()).getByRole('button', { name: '이메일 변경' }));
    const panel = within(dialog()).getByRole('group', { name: '이메일 바꾸기' });
    expect(within(panel).getByText('지금 주소 head@tnacademy.kr · 인증됨 — 새 주소 인증을 마치기 전까지 그대로입니다')).toBeTruthy();
    type(within(panel).getByLabelText('새 이메일'), 'admin@tnacademy.kr');
    fireEvent.click(within(panel).getByRole('button', { name: '메일로 코드 받기' }));
    await waitFor(() => expect(within(panel).getByRole('alert').textContent).toBe('이미 다른 계정이 쓰는 이메일입니다 — 다른 주소를 적어 주세요'));
    expect(bodyOf('POST /auth/profile/contact-codes')).toEqual({ channel: 'email', target: 'admin@tnacademy.kr' });
    expect((within(panel).getByRole('button', { name: '인증하고 저장' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
