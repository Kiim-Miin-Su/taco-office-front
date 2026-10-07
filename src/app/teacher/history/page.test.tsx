/** @file-guide
 * 목적: page.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 강사 §30·§31 수업 히스토리 — **모바일에서는 접힌다** (C45).
 *
 * 원본은 웹 한 줄(시각·학생·과목·대면·시수·상태·금액)과 모바일 세 줄을 둘 다 갖는다.
 * 접지 않으면 금액 칸이 393px 밖으로 나가 **본문 전체가 가로로 밀리고**(실측 scrollWidth 513)
 * 그 화면에서는 오른쪽 금액을 볼 수가 없다.
 *
 * jsdom 은 미디어 쿼리를 계산하지 않으므로 여기서 고정하는 것은 **구조**다 —
 * 세 묶음으로 나뉘어 있고(모바일 줄), 웹에서 한 줄로 합쳐질 때의 **순서가 원본 그대로**인지.
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { TeacherHistory } from '@/api/types';
import { won } from '@/lib/money';
import { LATE_TIERS_FIXTURE } from '@/components/teacher/late-tiers.fixture';
import TeacherHistoryPage from './page';

const mocks = vi.hoisted(() => ({ history: vi.fn(), receipts: vi.fn(), write: vi.fn(), mutate: vi.fn() }));
vi.mock('@/api/queries', () => ({
  useTeacherHistory: mocks.history,
  useTeacherPrivateNoteReceipts: mocks.receipts,
  useWriteTeacherPrivateNote: mocks.write,
  // 과목 이름도 코드표에서 온다 — 화면이 코드값(ap-chem)을 찍지 않는다 (QA 0925)
  useMeta: () => ({ data: { lateReportTiers: LATE_TIERS_FIXTURE, subs: [{ key: 'ap-chem', name: 'AP Chem' }], kinds: [] } }),
}));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));

beforeEach(() => {
  mocks.receipts.mockReturnValue({
    data: { items: [{ id: 90, studentId: 11, studentName: '김민준', serId: 9, onDate: '2026-09-10', version: 1,
      createdAt: '2026-09-10T08:00:00Z', updatedAt: '2026-09-10T08:00:00Z' }] },
    isPending: false, isError: false, refetch: vi.fn(),
  });
  mocks.mutate.mockImplementation(async (body: { studentId: number; serId: number; onDate: string }) => ({
    id: 91, studentId: body.studentId, studentName: body.studentId === 11 ? '김민준' : '송지호',
    serId: body.serId, onDate: body.onDate, version: 1,
    createdAt: '2026-10-08T08:00:00Z', updatedAt: '2026-10-08T08:00:00Z',
  }));
  mocks.write.mockReturnValue({ mutateAsync: mocks.mutate, isPending: false, error: null });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const lesson = (over: Partial<TeacherHistory['lessons'][number]> = {}): TeacherHistory['lessons'][number] => ({
  serId: 1, onDate: '2026-09-17', date: '2026-09-17', startMin: 960, durMin: 90, kindKey: 'class', subKey: 'ap-chem',
  mode: 'offline', title: null, students: '김민준, 송지호', studentItems: [{ id: 11, name: '김민준' }, { id: 12, name: '송지호' }],
  studentCount: 2, repState: 'plan',
  canceled: false, pay: 67500, lateCut: 5000,
  bonus: 0, settle: 'written', settleLabel: '리포트 씀', correctionOf: null, paidIn: null, frozen: false, ...over,
});

const data = (): TeacherHistory => ({
  month: '2026-09',
  stats: { doneCount: 8, doneMinutes: 600, writtenCount: 7, writtenMinutes: 540, unwrittenCount: 1, unwrittenMinutes: 60 },
  wageRate: 45000, wageFrom: '2026-09-12',
  lessons: [lesson()],
  settlement: {
    yearMonth: '2026-09', confirmed: false, saved: false, writtenMinutes: 540, gross: 378000,
    lateCut: 20000, incomeTax: 10740, localTax: 1074, net: 346186,
    unwrittenCount: 1, unwrittenMinutes: 60, unwrittenAmount: 42000,
    remainingCount: 4, remainingMinutes: 300, remainingAmount: 225000,
    bonus: 0, correctionCount: 0, lateCount: 0, note: null,
    breakdown: [
      { key: 'general', label: '일반 수업', lessonCount: 7, minutes: 540, amount: 378000, note: null },
      { key: 'kinder', label: 'Kinder 수업 가산', lessonCount: 0, minutes: 0, amount: 0, note: null },
      { key: 'group', label: '그룹 수업 가산', lessonCount: 0, minutes: 0, amount: 0, note: null },
      { key: 'diag', label: '진단고사 가산', lessonCount: 0, minutes: 0, amount: 0, note: null },
      { key: 'mock', label: '모의수업 가산', lessonCount: 0, minutes: 0, amount: 0, note: null },
      { key: 'other', label: '그 밖의 가산', lessonCount: 0, minutes: 0, amount: 0, note: null },
    ],
    breakdownTotal: 378000, breakdownUnallocatedAmount: 0,
  },
  bonusRules: [],
});

it('서버 권위 전월 조회를 인자 없이 사용하고 월 이동 입력을 노출하지 않는다', async () => {
  mocks.history.mockReturnValue({ data: data(), isLoading: false, isError: false });
  const view = render(<TeacherHistoryPage />);
  expect(mocks.history).toHaveBeenCalledWith();
  expect(view.getByText('KST 전월 고정 조회')).toBeTruthy();
  expect(view.queryByRole('button', { name: '← 지난달' })).toBeNull();
  expect(view.queryByRole('button', { name: '이번 달' })).toBeNull();
  expect(view.queryByRole('button', { name: '다음 달 →' })).toBeNull();
});

it('히스토리의 시급 변경 신청은 기존 강사 홈 writer로 이동한다', async () => {
  mocks.history.mockReturnValue({ data: data(), isLoading: false, isError: false });
  const view = render(<TeacherHistoryPage />);
  const link = await view.findByRole('link', { name: '시급 변경 신청' });
  expect(link.getAttribute('href')).toBe('/teacher?setting=wage#my-settings');
  expect(link.className).toContain('!h-11');
});

it('수업 업무 상태를 우선하고 리포트 상태를 보조로 구분한다', async () => {
  const d = data();
  d.lessons = [
    lesson({ serId: 1, settle: 'written', repState: 'ok' }),
    lesson({ serId: 2, startMin: 1080, settle: 'upcoming', repState: 'plan' }),
    lesson({ serId: 3, startMin: 1200, settle: 'canceled', canceled: true, repState: 'na' }),
  ];
  mocks.history.mockReturnValue({ data: d, isLoading: false, isError: false });
  const view = render(<TeacherHistoryPage />);
  await waitFor(() => expect(view.getByText('진행 완료')).toBeTruthy());
  expect(view.getByText('예정')).toBeTruthy();
  expect(view.getAllByText('취소').length).toBeGreaterThan(0);
  expect(view.getByText('리포트 승인 완료')).toBeTruthy();
  expect(view.getByText('리포트 작성 예정')).toBeTruthy();
  expect(view.container.textContent).not.toContain('리포트 리포트');
});

it('완료 수업에서 관리자 전용 특이사항 초안을 열면 회차·날짜·학생이 자동으로 이어진다', async () => {
  mocks.history.mockReturnValue({ data: data(), isLoading: false, isError: false });
  const view = render(<TeacherHistoryPage />);

  fireEvent.click(await view.findByRole('button', { name: '특이사항 남기기' }));

  const dialog = view.getByRole('dialog', { name: '특이사항 작성' });
  expect(dialog.textContent).toContain('김민준');
  expect(dialog.textContent).toContain('송지호');
  expect(dialog.textContent).toContain('2026년 9월 17일');
  expect(dialog.textContent).toContain('16:00');
  expect(dialog.textContent).toContain('AP Chem');
  expect(view.getByLabelText('학생')).toBeTruthy();
  expect((view.getByLabelText('학생') as HTMLSelectElement).value).toBe('11');
});

it('구조화 학생 ID·원래 회차일·version·requestKey로 전용 writer를 호출하고 전달 완료를 표시한다', async () => {
  mocks.history.mockReturnValue({ data: data(), isLoading: false, isError: false });
  const view = render(<TeacherHistoryPage />);
  fireEvent.click(await view.findByRole('button', { name: '특이사항 남기기' }));

  fireEvent.change(view.getByLabelText('특이사항 내용'), { target: { value: '오늘 유난히 지쳐 보였습니다.' } });
  fireEvent.click(view.getByRole('button', { name: '관리자에게 전달' }));
  await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({
    studentId: 11, serId: 1, onDate: '2026-09-17', body: '오늘 유난히 지쳐 보였습니다.', expectedVersion: 0,
    requestKey: expect.any(String),
  })));
  expect((await view.findByRole('status')).textContent).toBe('관리자에게 전달되었습니다.');
  expect(view.getByRole('dialog').textContent).toContain('관리자만 볼 수 있고 학부모에게 공개되지 않습니다');
});

it('예정·취소 수업에는 사후 관찰 특이사항 진입을 노출하지 않는다', async () => {
  const d = data();
  d.lessons = [
    lesson({ serId: 2, settle: 'upcoming', repState: 'plan' }),
    lesson({ serId: 3, startMin: 1080, settle: 'canceled', canceled: true, repState: 'na' }),
  ];
  mocks.history.mockReturnValue({ data: d, isLoading: false, isError: false });
  const view = render(<TeacherHistoryPage />);
  await waitFor(() => expect(view.getByText('예정')).toBeTruthy());
  expect(view.queryByRole('button', { name: '특이사항 남기기' })).toBeNull();
});

it('연강 유예 안내는 맞닿은 수업을 묶어 마지막 종료부터 수업 수 × 1시간을 말한다', async () => {
  mocks.history.mockReturnValue({ data: data(), isLoading: false, isError: false });
  const view = render(<TeacherHistoryPage />);
  await view.findByText('리포트 지각 차감 규칙');
  const text = view.container.textContent ?? '';
  expect(text).toContain('연강은 마지막 수업 종료부터 수업 수 × 1시간 유예');
  expect(text).not.toContain('연강도 수업별 적용');
  expect(text).not.toContain('추가 유예 없음');
});

it('수업 기록 한 줄은 **세 묶음**으로 나뉜다 — 모바일에서 세 줄로 접히는 자리다', async () => {
  mocks.history.mockReturnValue({ data: data(), isLoading: false, isError: false });
  const view = render(<TeacherHistoryPage />);
  await waitFor(() => expect(view.container.querySelector('li')).toBeTruthy());

  const row = [...view.container.querySelectorAll('li')].find((li) => li.textContent?.includes('AP Chem'))!;
  const groups = [...row.querySelectorAll('div')].filter((d) => d.className.includes('sm:contents'));
  expect(groups).toHaveLength(2); // ① 시각·학생·시수, ③ 대면·상태·금액 (② 과목은 그대로 한 칸)
  expect(row.textContent).toContain('16:00');
  expect(row.textContent).toContain('김민준 외 1명');
  expect(row.textContent).toContain('1.5h');
  expect(row.textContent).toContain('AP Chem');
  expect(row.textContent).not.toContain('ap-chem');
  expect(row.textContent).toContain('대면');
  expect(row.textContent).toContain('₩67,500');
});

it('웹 한 줄의 순서는 원본 그대로다 — order 1~7 이 한 번씩 있다', async () => {
  mocks.history.mockReturnValue({ data: data(), isLoading: false, isError: false });
  const view = render(<TeacherHistoryPage />);
  await waitFor(() => expect(view.container.querySelector('li')).toBeTruthy());

  const row = [...view.container.querySelectorAll('li')].find((li) => li.textContent?.includes('AP Chem'))!;
  const orders = [...row.querySelectorAll('*')]
    .flatMap((el) => [...el.classList])
    .filter((c) => /^sm:order-[1-7]$/.test(c))
    .sort();
  expect(orders).toEqual(['sm:order-1', 'sm:order-2', 'sm:order-3', 'sm:order-4', 'sm:order-5', 'sm:order-6', 'sm:order-7']);
});

it('정산 줄의 산식은 좁은 화면에서 **잘리지 않고 아래로 내려간다** — 금액의 근거이기 때문이다', async () => {
  mocks.history.mockReturnValue({ data: data(), isLoading: false, isError: false });
  const view = render(<TeacherHistoryPage />);
  await waitFor(() => expect(view.container.textContent).toContain('실지급 예정액'));

  const how = [...view.container.querySelectorAll('span')]
    .find((el) => el.textContent?.includes('제출 인정'))!;
  // 좁을 때는 한 줄을 다 쓰고(w-full), 넓을 때만 잘라 쓴다(sm:truncate)
  expect(how.className).toContain('w-full');
  expect(how.className).toContain('sm:truncate');
  expect(how.className).not.toMatch(/(^|\s)truncate(\s|$)/);
});

it('정산 금액은 서버가 내려준 기본 시급·Kinder·그룹·진단·모의 breakdown을 그대로 펼쳐 보여 준다', async () => {
  const d = data();
  d.settlement.breakdown = [
    { key: 'general', label: '일반 수업', lessonCount: 4, minutes: 240, amount: 180000, note: null },
    { key: 'kinder', label: 'Kinder 수업 가산', lessonCount: 0, minutes: 0, amount: 0, note: null },
    { key: 'group', label: '그룹 수업 가산', lessonCount: 1, minutes: 60, amount: 10000, note: null },
    { key: 'diag', label: '진단고사 가산', lessonCount: 1, minutes: 60, amount: 15000, note: null },
    { key: 'mock', label: '모의수업 가산', lessonCount: 1, minutes: 60, amount: 15000, note: null },
    { key: 'other', label: '그 밖의 가산', lessonCount: 0, minutes: 0, amount: 0, note: null },
  ];
  d.settlement.breakdownTotal = 220000;
  d.settlement.breakdownUnallocatedAmount = 0;
  d.settlement.gross = 220000;
  mocks.history.mockReturnValue({ data: d, isLoading: false, isError: false });
  const view = render(<TeacherHistoryPage />);
  const base = await view.findByText('일반 수업');
  const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
  expect(base.parentElement?.textContent).toContain('4건 · 4시간');
  expect(view.getByText('그룹 수업 가산').parentElement?.textContent).toContain('1건 · 1시간');
  expect(view.getByText('진단고사 가산').parentElement?.textContent).toContain('1건 · 1시간');
  expect(view.getByText('모의수업 가산').parentElement?.textContent).toContain('1건 · 1시간');
  expect(text).not.toContain('Kinder 표시가 없어');
  expect(text).toContain(won(220000));
});

/**
 * 정산 상태는 **서버 결론 하나**만 읽는다 (N-27 · 대표 결정 2026-09-12).
 *
 * 전에는 `payout.state` 낱말로 「지급 완료 / 마감 작성 중 / 확정」을 화면이 갈랐다.
 * 그 낱말에 정본이 없어서, 저장만 된 정산이 강사에게 「확정」으로 보였다.
 * 지금 화면이 아는 사실은 둘뿐이다 — 확정됐는가(`confirmed`) · 저장값인가(`saved`).
 */
const settle = (over: Partial<TeacherHistory['settlement']>) => {
  const d = data();
  return { ...d, settlement: { ...d.settlement, ...over } };
};

it.each([
  { confirmed: true, saved: true, chip: '확정', tail: '실지급액' },
  { confirmed: false, saved: true, chip: '마감 작성 중', tail: '실지급 예정액' },
  { confirmed: false, saved: false, chip: '실시간 계산', tail: '실지급 예정액' },
])('정산 상태는 확정 여부와 저장 여부 둘로만 말한다 — %o', async ({ confirmed, saved, chip, tail }) => {
  mocks.history.mockReturnValue({ data: settle({ confirmed, saved }), isLoading: false, isError: false });
  const view = render(<TeacherHistoryPage />);
  await waitFor(() => expect(view.getByText('2026년 9월 정산')).toBeTruthy());
  const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
  expect(view.getByText(chip)).toBeTruthy();
  expect(text).toContain(tail);
  // 낱말이 아니라 결론을 읽는다 — 「지급 완료」는 낱말이 정해질 때까지 만들지 않는다 (N-27)
  expect(text).not.toContain('지급 완료');
});

it('리포트 지각 차감 규칙 표는 서버 구간(/meta lateReportTiers)을 그대로 그린다 — 화면 사본 없음 (2026-09-25)', async () => {
  mocks.history.mockReturnValue({ data: data(), isLoading: false, isError: false });
  const view = render(<TeacherHistoryPage />);
  const panel = await view.findByText('리포트 지각 차감 규칙');
  const box = panel.closest('section, aside, div[class*="rounded"]')?.parentElement ?? view.container;
  const rows = [...box.querySelectorAll('ul li')].map((li) => li.textContent);
  expect(rows).toEqual(LATE_TIERS_FIXTURE.map((tier) => `${tier.range}${tier.cut}`));
});

/* ── W11 M2 — 가산(N-93) · 보정(N-51). 금액 글자는 `lib/money` 로 만든다 ── */

it('가산 · 보정 — 줄의 가산 · 보정 칩 · 확정 안내 문장 · 가산 규칙 칸을 서버 값 그대로 그린다 (N-93 · N-51)', async () => {
  const d = data();
  mocks.history.mockReturnValue({
    data: {
      ...d,
      lessons: [
        lesson({ serId: 2, kindKey: 'mock', subKey: null, title: '모의수업', students: '김민준', studentCount: 1, repState: 'ok', pay: 45000, lateCut: 0, bonus: 15000 }),
        lesson({ serId: 3, onDate: '2026-08-28', date: '2026-08-28', title: 'SAT Reading', subKey: null, students: '송지호', studentCount: 1, repState: 'ok', pay: 45000, lateCut: 0,
          settle: 'correction', settleLabel: '보정 · 8월 회차', correctionOf: '2026-08', frozen: false }),
      ],
      settlement: { ...d.settlement, bonus: 15000, correctionCount: 1, note: '앞선 확정 달의 회차 1건이 이 달 정산에 보정으로 들어옵니다' },
      bonusRules: [
        { label: '모의수업', hint: '한 번에 얼마', amount: 15000, applied: true, note: null },
        { label: 'Kinder 수업', hint: '시급에 더함', amount: null, applied: true, note: null },
      ],
    },
    isLoading: false, isError: false,
  });
  const view = render(<TeacherHistoryPage />);
  await waitFor(() => expect(view.getByText('보정 · 8월 회차')).toBeTruthy());
  const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
  // 줄의 가산 — 수업료와 따로 적는다
  expect(text).toContain(`+${won(15000)} 가산`);
  // 보정 줄은 앞선 달의 회차 — 날짜 머리에 달을 같이 적는다
  expect(text).toContain('8월 28일');
  // 확정 · 보정 안내 한 문장 · 수업료 산식의 가산 포함
  expect(text).toContain('앞선 확정 달의 회차 1건이 이 달 정산에 보정으로 들어옵니다');
  expect(text).toContain(`가산 ${won(15000)} 포함`);
  // 가산 규칙 칸 — 낱말 · 금액 · 명시 표식 계산 지원 여부까지 서버 것
  const rules = view.getByRole('list', { name: '가산 규칙' });
  expect(rules.textContent).toContain(`모의수업한 번에 얼마 +${won(15000)}`);
  expect(rules.textContent).toContain('Kinder 수업시급에 더함 · 없음');
  expect(rules.textContent).not.toContain('Kinder 수업을 가르는 표시가 아직 없어');
  // 옛 안내(「가산은 정책 확정 전」)는 사라졌다
  expect(text).not.toContain('정책 확정 전이라 단일 시급 기준');
});

/* 옮긴 회차 — 날짜 묶음은 실제 수업일(date)이다 (TBO-54 MEETING-MOVE) */
it('옮긴 회차는 옮긴 날의 묶음 아래에 선다 — 규칙 날짜(onDate)로 묶지 않는다', async () => {
  const d = data();
  d.lessons = [lesson({ serId: 1, onDate: '2026-09-17', date: '2026-09-17' }), lesson({ serId: 2, onDate: '2026-09-10', date: '2026-09-24', startMin: 600 })];
  mocks.history.mockReturnValue({ data: d, isLoading: false, isError: false });
  const view = render(<TeacherHistoryPage />);
  await waitFor(() => expect(view.container.querySelector('li')).toBeTruthy());
  const heads = [...view.container.querySelectorAll('b')].map((e) => e.textContent ?? '');
  expect(heads.some((t) => /^24일 \(/.test(t))).toBe(true);
  expect(heads.some((t) => /^10일 \(/.test(t))).toBe(false);
});
