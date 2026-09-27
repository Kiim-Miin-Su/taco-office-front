/** @file-guide
 * 목적: §53 청구서 발행 — 화면은 회차를 세지 않는다 (C50).
 * 책임/재사용: 실제 InvoiceIssuer/useIssueInvoice 를 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { api } from '@/api/client';
import type { Invoice, Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import { InvoiceIssuer } from './InvoiceIssuer';

const me: Me = {
  id: 1, name: '관리자', role: 'admin', roleLabel: '관리자', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: false, canCrudAttendance: true, canMoney: true, canWage: false,
  canApprove: true, canHide: true, canGpaPack: true,
};

const meta = {
  kinds: [], subs: [], rooms: [], zaccs: [], staff: [],
  students: [{ id: 7, name: '양찬욱', grade: 'G10', school: null }],
  // 종류 목록도 서버가 준다 — 화면이 코드표를 다시 적지 않는다 (D-R18 · C64)
  // W11 N-75 — 진단고사 + 상담은 서버가 회차로 세고, 응시료는 사람이 줄을 적고(manualLines), 컨설팅비는 「청구서로 전환」 한 길이다
  invTypes: [
    { key: 'tuition', label: '수업료 청구', sub: '정규 수업', other: false, issuable: true, issueBlockedReason: null, manualLines: false },
    { key: 'consulting', label: '컨설팅비 청구', sub: '진학 컨설팅 · 인터뷰 준비', other: true, issuable: false, issueBlockedReason: '컨설팅비는 컨설팅 화면의 「청구서로 전환」으로 냅니다 — 계약 금액이 그 청구서의 금액입니다', manualLines: false },
    { key: 'diag_intake', label: '진단고사 + 상담 비용', sub: '진단고사 · 입학 상담', other: true, issuable: true, issueBlockedReason: null, manualLines: false },
    { key: 'exam_fee', label: 'MAP + CAT 응시료', sub: 'MAP · CAT 응시료', other: true, issuable: true, issueBlockedReason: null, manualLines: true },
  ],
};

const made: Invoice = {
  id: 42, studentId: 7, studentName: '양찬욱', grade: 'G10', yearMonth: '2026-08',
  title: '2026년 8월 수업료 청구', amount: 250000, paidAmount: 0, state: 'draft', stateLabel: '작성 중',
  invType: 'tuition', invTypeLabel: '수업료 청구',
  issuedOn: '2026-09-12', dueOn: null, paidAt: null, remaining: 250000, overdueDays: 0, sentAt: null, canDeliver: true, canVoid: false, voidBlockedReason: null, voidReason: null,
  installments: [], nextDueOn: null, nextInstallmentSeq: null,
  lines: [
    { subKey: 'sat-math', label: 'SAT Math', count: 3, unitPrice: 50000, amount: 150000 },
    { subKey: 'writing', label: 'Writing', count: 2, unitPrice: 50000, amount: 100000 },
  ],
};

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
let posted: unknown = null;
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut(); posted = null;
});

function setup(onPost: () => { status: number; data: unknown } = () => ({ status: 201, data: made })) {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'post') {
      posted = JSON.parse(config.data ?? '{}');
      const r = onPost();
      if (r.status >= 400) return Promise.reject(Object.assign(new Error('fail'), { response: { status: r.status, data: r.data } }));
      return { config, status: r.status, statusText: 'OK', headers: {}, data: r.data };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: meta };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><InvoiceIssuer /></QueryClientProvider>);
}

it('보내는 것은 누구·어느 달·종류 셋뿐이다 — 줄도 횟수도 금액도 안 보낸다 (D-R37)', async () => {
  const view = setup();
  fireEvent.click(view.getByRole('button', { name: '+ 새 청구서 발행' }));
  // 학생 목록(meta)이 와야 고를 수 있다 — 칸만 있고 항목이 없으면 값이 안 들어간다
  await waitFor(() => expect(view.getByRole('option', { name: /양찬욱/ })).toBeTruthy());
  fireEvent.change(view.getByLabelText('학생'), { target: { value: '7' } });
  fireEvent.change(view.getByLabelText('달'), { target: { value: '2026-08' } });
  fireEvent.change(view.getByLabelText('납부 기한'), { target: { value: '2026-08-25' } });
  fireEvent.click(view.getByRole('button', { name: '발행' }));
  await waitFor(() => expect(posted).not.toBeNull());
  expect(Object.keys(posted as object).sort()).toEqual(['dueOn', 'invType', 'studentId', 'yearMonth']);
  expect(posted).toMatchObject({ studentId: 7, yearMonth: '2026-08', invType: 'tuition', dueOn: '2026-08-25' });
});

it('줄은 낸 뒤에 보인다 — 미리보기를 그리면 화면이 회차를 세게 된다', async () => {
  const view = setup();
  fireEvent.click(view.getByRole('button', { name: '+ 새 청구서 발행' }));
  // 학생 목록(meta)이 와야 고를 수 있다 — 칸만 있고 항목이 없으면 값이 안 들어간다
  await waitFor(() => expect(view.getByRole('option', { name: /양찬욱/ })).toBeTruthy());
  // 내기 전에는 줄이 없다
  expect(view.queryByText('SAT Math')).toBeNull();
  fireEvent.change(view.getByLabelText('학생'), { target: { value: '7' } });
  fireEvent.change(view.getByLabelText('납부 기한'), { target: { value: '2026-08-25' } });
  fireEvent.click(view.getByRole('button', { name: '발행' }));
  await waitFor(() => expect(view.getByText('SAT Math')).toBeTruthy());
  const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('3회');
  expect(text).toContain('2회');
  // 합계는 서버가 준 값이다 — 화면이 줄을 더하지 않는다
  expect(text).toContain('250,000');
});

it('학생을 안 고르면 발행을 누를 수 없다', async () => {
  const view = setup();
  fireEvent.click(view.getByRole('button', { name: '+ 새 청구서 발행' }));
  // 학생 목록(meta)이 와야 고를 수 있다 — 칸만 있고 항목이 없으면 값이 안 들어간다
  await waitFor(() => expect(view.getByRole('option', { name: /양찬욱/ })).toBeTruthy());
  expect((view.getByRole('button', { name: '발행' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(view.getByLabelText('학생'), { target: { value: '7' } });
  // 기한을 고르기 전에는 여전히 못 누른다 — 기본값을 두지 않았다 (대표 결정 2026-09-20 · S3)
  expect((view.getByRole('button', { name: '발행' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(view.getByLabelText('납부 기한'), { target: { value: '2026-08-25' } });
  expect((view.getByRole('button', { name: '발행' }) as HTMLButtonElement).disabled).toBe(false);
});

/**
 * **기한은 미리 채우지 않는다** (대표 결정 2026-09-20 · S3). 원문 §53 은 기한이 있는 모습만 보여 주고
 * 어떻게 정하는지는 보여 주지 않는다 — 화면이 「발행일 + N일」을 지어내면 없는 업무 규칙이 생긴다(D-R44).
 */
it('기한 칸은 비어서 열린다 — 화면이 날짜를 짓지 않는다 (S3)', async () => {
  const view = setup();
  fireEvent.click(view.getByRole('button', { name: '+ 새 청구서 발행' }));
  await waitFor(() => expect(view.getByRole('option', { name: /양찬욱/ })).toBeTruthy());
  expect((view.getByLabelText('납부 기한') as HTMLInputElement).value).toBe('');
});

it('거절 이유는 서버 문장을 그대로 보여 준다 — 화면이 이유를 짓지 않는다', async () => {
  const view = setup(() => ({
    status: 409,
    data: { code: 'INV_NO_LESSONS', message: '2026-08 에 양찬욱 학생의 수업이 없습니다 — 청구할 것이 없습니다' },
  }));
  fireEvent.click(view.getByRole('button', { name: '+ 새 청구서 발행' }));
  // 학생 목록(meta)이 와야 고를 수 있다 — 칸만 있고 항목이 없으면 값이 안 들어간다
  await waitFor(() => expect(view.getByRole('option', { name: /양찬욱/ })).toBeTruthy());
  fireEvent.change(view.getByLabelText('학생'), { target: { value: '7' } });
  fireEvent.change(view.getByLabelText('납부 기한'), { target: { value: '2026-08-25' } });
  fireEvent.click(view.getByRole('button', { name: '발행' }));
  await waitFor(() => expect(view.getByText(/수업이 없습니다/)).toBeTruthy());
  expect(view.queryByText('SAT Math')).toBeNull();
});

it('종류 목록을 서버에서 받아 그린다 — 화면에 코드표를 다시 적지 않는다 (D-R18 · C64)', async () => {
  const view = setup();
  fireEvent.click(view.getByRole('button', { name: '+ 새 청구서 발행' }));
  await waitFor(() => expect(view.getByRole('option', { name: /MAP \+ CAT 응시료/ })).toBeTruthy());
  const select = view.getByLabelText('종류') as HTMLSelectElement;
  expect([...select.options].map((o) => o.value)).toEqual(meta.invTypes.map((t) => t.key));
  // 낼 수 있는지도 서버가 말한다 — 컨설팅비만 잠기고(「청구서로 전환」 한 길) 까닭은 서버 문장 그대로다 (N-75)
  expect([...select.options].map((o) => o.disabled)).toEqual([false, true, false, false]);
  expect(select.options[0].textContent).toBe('수업료 청구');
  expect(select.options[1].title).toBe(meta.invTypes[1].issueBlockedReason);
  const locked = view.getByRole('list', { name: '여기서 낼 수 없는 종류' });
  expect(locked.textContent).toBe(`컨설팅비 청구 — ${meta.invTypes[1].issueBlockedReason}`);
});

/* ── 일괄 발행 (C94-a · H-75) ─────────────────────────────────────────── */

it('일괄 발행은 달 하나만 보내고, 발행 건수·건너뛴 학생과 이유를 서버가 준 대로 그린다 (D-R37)', async () => {
  const result = {
    yearMonth: '2026-09', candidates: 3, issuedAmount: 70000,
    issued: [made, { ...made, id: 43, studentId: 8, studentName: '김하윤', amount: 20000 }],
    skipped: [{ studentId: 9, studentName: '발행C', invType: 'diag_intake', invTypeLabel: '진단고사 + 상담 비용', code: 'INV_NO_RATE', message: '단가표에 없는 과목이 있습니다: 단가 없는 과목 — 단가를 먼저 등록하세요' }],
  };
  const view = setup(() => ({ status: 201, data: result }));
  // 원문 §53 「자동 생성 켜기」 = 기존 일괄 발행 창이다 (N-28 ②)
  fireEvent.click(view.getByRole('button', { name: '자동 생성 켜기' }));
  fireEvent.change(view.getByLabelText('달'), { target: { value: '2026-09' } });
  fireEvent.change(view.getByLabelText('납부 기한'), { target: { value: '2026-09-25' } });
  fireEvent.click(view.getByRole('button', { name: '9월 청구서 일괄 발행' }));
  await waitFor(() => expect(posted).not.toBeNull());
  // 한 번에 내는 청구서들의 기한은 **하나**다 — 낱장과 같은 규약이다 (S3)
  expect(posted).toEqual({ yearMonth: '2026-09', dueOn: '2026-09-25' });
  await waitFor(() => expect(view.getByText('2026-09 — 발행 2건')).toBeTruthy());
  // 대상은 (학생 · 종류) 한 쌍이 한 건이다 — 한 학생이 수업료와 진단고사 + 상담 둘 다일 수 있다 (N-75)
  expect(view.getByText('· 대상 3건 · 건너뜀 1건')).toBeTruthy();
  expect(view.getByText('₩70,000')).toBeTruthy();
  expect(view.getByText('발행C')).toBeTruthy();
  // 건너뛴 줄에는 종류 이름이 선다 — 코드값(INV_…)은 화면에 찍지 않는다
  expect(view.getByText('진단고사 + 상담 비용')).toBeTruthy();
  expect(view.queryByText('INV_NO_RATE')).toBeNull();
  expect(view.getByText(/단가를 먼저 등록하세요/)).toBeTruthy();
});

it('일괄 발행이 막히면(마감 달) 서버 문장을 그대로 보여 준다', async () => {
  const view = setup(() => ({ status: 409, data: { code: 'MONTH_CLOSED', message: '2026년 8월은 마감됐습니다 — 대표가 마감을 해제한 뒤 고칠 수 있습니다' } }));
  fireEvent.click(view.getByRole('button', { name: '자동 생성 켜기' }));
  fireEvent.change(view.getByLabelText('달'), { target: { value: '2026-08' } });
  fireEvent.change(view.getByLabelText('납부 기한'), { target: { value: '2026-08-25' } });
  fireEvent.click(view.getByRole('button', { name: '8월 청구서 일괄 발행' }));
  await waitFor(() => expect(view.getByText(/2026년 8월은 마감됐습니다/)).toBeTruthy());
});

/** 원문 §53 — 「+ 새 청구서 발행」은 주단추, 「자동 생성 켜기」는 보조 모양이고 차례도 컷 그대로다 (w5 · 53-03 · N-28 ②) */
it('「+ 새 청구서 발행」이 주단추이고 「자동 생성 켜기」는 그 오른쪽 보조 단추다', () => {
  const view = setup();
  expect(view.getByRole('button', { name: '+ 새 청구서 발행' }).className).toContain('bg-primary');
  expect(view.getByRole('button', { name: '자동 생성 켜기' }).className).not.toContain('bg-primary');
  const names = view.getAllByRole('button').map((b) => b.textContent);
  expect(names.indexOf('+ 새 청구서 발행')).toBeLessThan(names.indexOf('자동 생성 켜기'));
});

/* ── W11 — 분납 일정(N-79) · 응시료 줄(N-75) · §53 ① 「청구서 작성 →」(N-28 ②) ───────────────── */

const DRAFT = {
  studentId: 7, studentName: '양찬욱', yearMonth: '2026-08', invType: 'tuition', invTypeLabel: '수업료 청구',
  title: '2026년 8월 수업료 청구', amount: 250000, lines: made.lines, canIssue: true, blockedCode: null, issueBlockedReason: null,
};

/** 주소마다 답을 가른다 — 미리 세기는 `/accounting/invoices/draft`, 나머지 GET 은 코드표 */
function mount(opts: {
  draft?: unknown;
  preset?: { seq: number; studentId: number; yearMonth: string; invType: string } | null;
  onPost?: () => { status: number; data: unknown };
} = {}) {
  const gets: Array<{ url?: string; params?: Record<string, unknown> }> = [];
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string; params?: Record<string, unknown> }) => {
    if (config.method === 'post') {
      posted = JSON.parse(config.data ?? '{}');
      const r = (opts.onPost ?? (() => ({ status: 201, data: made })))();
      if (r.status >= 400) return Promise.reject(Object.assign(new Error('fail'), { response: { status: r.status, data: r.data } }));
      return { config, status: r.status, statusText: 'OK', headers: {}, data: r.data };
    }
    gets.push({ url: config.url, params: config.params });
    const data = config.url === '/accounting/invoices/draft' ? (opts.draft ?? DRAFT) : meta;
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <InvoiceIssuer open onOpenChange={() => undefined} preset={opts.preset ?? null} />
    </QueryClientProvider>,
  );
  return { view, gets };
}

it('분납을 켜면 기한 칸 대신 회차 일정을 적고, 서버가 센 청구액을 보인다 — 보내는 것은 일정뿐이다 (N-79)', async () => {
  const { view, gets } = mount();
  await waitFor(() => expect(view.getByRole('option', { name: /양찬욱/ })).toBeTruthy());
  fireEvent.change(view.getByLabelText('학생'), { target: { value: '7' } });
  fireEvent.change(view.getByLabelText('달'), { target: { value: '2026-08' } });
  // 분납을 켜기 전에는 미리 세기를 부르지 않는다 — 평소에는 낸 뒤에 줄이 보인다
  expect(gets.some((g) => g.url === '/accounting/invoices/draft')).toBe(false);
  fireEvent.click(view.getByLabelText('분납 — 회차마다 예정일과 금액을 적습니다'));
  expect(view.queryByLabelText('납부 기한')).toBeNull();
  // 청구액은 서버가 발행과 같은 함수로 센 값 그대로다
  await waitFor(() => expect(view.getByText('₩250,000')).toBeTruthy());
  expect(gets.find((g) => g.url === '/accounting/invoices/draft')?.params).toEqual({ studentId: 7, yearMonth: '2026-08', invType: 'tuition' });
  // 회차는 두 줄부터 — 한 줄로는 뺄 수 없고, 다 채우기 전에는 발행을 누를 수 없다
  expect((view.getByRole('button', { name: '일정 1 빼기' }) as HTMLButtonElement).disabled).toBe(true);
  expect((view.getByRole('button', { name: '발행' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(view.getByLabelText('일정 1 예정일'), { target: { value: '2026-08-25' } });
  fireEvent.change(view.getByLabelText('일정 1 금액'), { target: { value: '150000' } });
  fireEvent.change(view.getByLabelText('일정 2 예정일'), { target: { value: '2026-09-10' } });
  fireEvent.change(view.getByLabelText('일정 2 금액'), { target: { value: '100000' } });
  fireEvent.click(view.getByRole('button', { name: '발행' }));
  await waitFor(() => expect(posted).not.toBeNull());
  expect(posted).toEqual({
    studentId: 7, yearMonth: '2026-08', invType: 'tuition',
    installments: [{ dueOn: '2026-08-25', amount: 150000 }, { dueOn: '2026-09-10', amount: 100000 }],
  });
});

it('분납 합이 틀리면 서버 문장을 그대로 보인다 — 화면이 합을 다시 판정하지 않는다', async () => {
  const { view } = mount({ onPost: () => ({ status: 409, data: { code: 'INV_INSTALLMENT_SUM', message: '분납 합계(200,000원)가 청구액(250,000원)과 다릅니다 — 회차 금액의 합을 청구액에 맞춰 주세요' } }) });
  await waitFor(() => expect(view.getByRole('option', { name: /양찬욱/ })).toBeTruthy());
  fireEvent.change(view.getByLabelText('학생'), { target: { value: '7' } });
  fireEvent.click(view.getByLabelText('분납 — 회차마다 예정일과 금액을 적습니다'));
  fireEvent.change(view.getByLabelText('일정 1 예정일'), { target: { value: '2026-08-25' } });
  fireEvent.change(view.getByLabelText('일정 1 금액'), { target: { value: '100000' } });
  fireEvent.change(view.getByLabelText('일정 2 예정일'), { target: { value: '2026-09-10' } });
  fireEvent.change(view.getByLabelText('일정 2 금액'), { target: { value: '100000' } });
  fireEvent.click(view.getByRole('button', { name: '발행' }));
  await waitFor(() => expect(view.getByText(/분납 합계\(200,000원\)가 청구액\(250,000원\)과 다릅니다/)).toBeTruthy());
});

it('분납을 켰는데 그 달에 낼 것이 없으면 미리 세기의 까닭 문장이 선다', async () => {
  const blocked = { ...DRAFT, amount: null, lines: [], canIssue: false, blockedCode: 'INV_NO_LESSONS', issueBlockedReason: '2026-08 에 양찬욱 학생의 수업이 없습니다 — 청구할 것이 없습니다' };
  const { view } = mount({ draft: blocked });
  await waitFor(() => expect(view.getByRole('option', { name: /양찬욱/ })).toBeTruthy());
  fireEvent.change(view.getByLabelText('학생'), { target: { value: '7' } });
  fireEvent.change(view.getByLabelText('달'), { target: { value: '2026-08' } });
  fireEvent.click(view.getByLabelText('분납 — 회차마다 예정일과 금액을 적습니다'));
  await waitFor(() => expect(view.getByText(/수업이 없습니다 — 청구할 것이 없습니다/)).toBeTruthy());
});

it('응시료는 줄(내용 · 금액)을 사람이 적고 그대로 보낸다 — 미리 세기는 부르지 않는다 (N-75)', async () => {
  const { view, gets } = mount();
  await waitFor(() => expect(view.getByRole('option', { name: /양찬욱/ })).toBeTruthy());
  fireEvent.change(view.getByLabelText('학생'), { target: { value: '7' } });
  fireEvent.change(view.getByLabelText('종류'), { target: { value: 'exam_fee' } });
  fireEvent.change(view.getByLabelText('납부 기한'), { target: { value: '2026-08-25' } });
  // 줄을 다 적기 전에는 누를 수 없다
  expect((view.getByRole('button', { name: '발행' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(view.getByLabelText('줄 1 내용'), { target: { value: '  MAP 응시료 ' } });
  fireEvent.change(view.getByLabelText('줄 1 금액'), { target: { value: '95000' } });
  fireEvent.click(view.getByRole('button', { name: '+ 줄' }));
  fireEvent.change(view.getByLabelText('줄 2 내용'), { target: { value: 'CAT 응시료' } });
  fireEvent.change(view.getByLabelText('줄 2 금액'), { target: { value: '0' } });
  expect((view.getByRole('button', { name: '발행' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(view.getByLabelText('줄 2 금액'), { target: { value: '60000' } });
  fireEvent.click(view.getByRole('button', { name: '발행' }));
  await waitFor(() => expect(posted).not.toBeNull());
  expect(posted).toEqual({
    studentId: 7, yearMonth: expect.any(String), invType: 'exam_fee', dueOn: '2026-08-25',
    lines: [{ label: 'MAP 응시료', amount: 95000 }, { label: 'CAT 응시료', amount: 60000 }],
  });
  expect(gets.some((g) => g.url === '/accounting/invoices/draft')).toBe(false);
});

it('§53 ① 「청구서 작성 →」이 준 값으로 학생 · 달 · 종류를 채우고 기한은 비워 둔다 (N-28 ② · S3)', async () => {
  const { view } = mount({ preset: { seq: 1, studentId: 7, yearMonth: '2026-07', invType: 'diag_intake' } });
  await waitFor(() => expect(view.getByRole('option', { name: /양찬욱/ })).toBeTruthy());
  expect((view.getByLabelText('학생') as HTMLSelectElement).value).toBe('7');
  expect((view.getByLabelText('달') as HTMLInputElement).value).toBe('2026-07');
  expect((view.getByLabelText('종류') as HTMLSelectElement).value).toBe('diag_intake');
  expect((view.getByLabelText('납부 기한') as HTMLInputElement).value).toBe('');
  expect((view.getByRole('button', { name: '발행' }) as HTMLButtonElement).disabled).toBe(true);
});

it('낸 분납 청구서는 회차 · 예정일 · 금액을 서버가 저장한 대로 보인다', async () => {
  const split = { ...made, installments: [
    { seq: 1, dueOn: '2026-08-25', amount: 150000, covered: false },
    { seq: 2, dueOn: '2026-09-10', amount: 100000, covered: false },
  ], nextDueOn: '2026-08-25', nextInstallmentSeq: 1 };
  const { view } = mount({ onPost: () => ({ status: 201, data: split }) });
  await waitFor(() => expect(view.getByRole('option', { name: /양찬욱/ })).toBeTruthy());
  fireEvent.change(view.getByLabelText('학생'), { target: { value: '7' } });
  fireEvent.click(view.getByLabelText('분납 — 회차마다 예정일과 금액을 적습니다'));
  fireEvent.change(view.getByLabelText('일정 1 예정일'), { target: { value: '2026-08-25' } });
  fireEvent.change(view.getByLabelText('일정 1 금액'), { target: { value: '150000' } });
  fireEvent.change(view.getByLabelText('일정 2 예정일'), { target: { value: '2026-09-10' } });
  fireEvent.change(view.getByLabelText('일정 2 금액'), { target: { value: '100000' } });
  fireEvent.click(view.getByRole('button', { name: '발행' }));
  const plan = await view.findByLabelText('발행한 분납 일정');
  expect(plan.textContent?.replace(/\s+/g, ' ')).toBe('1회차2026-08-25₩150,0002회차2026-09-10₩100,000');
});
