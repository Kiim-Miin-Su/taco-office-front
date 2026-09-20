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
  invTypes: [
    { key: 'tuition', label: '수업료 청구', sub: '정규 수업', other: false },
    { key: 'consulting', label: '컨설팅비 청구', sub: '진학 컨설팅 · 인터뷰 준비', other: true },
    { key: 'diag_intake', label: '진단고사 + 상담 비용', sub: '진단고사 · 입학 상담', other: true },
    { key: 'exam_fee', label: 'MAP + CAT 응시료', sub: 'MAP · CAT 응시료', other: true },
  ],
};

const made: Invoice = {
  id: 42, studentId: 7, studentName: '양찬욱', grade: 'G10', yearMonth: '2026-08',
  title: '2026년 8월 수업료 청구', amount: 250000, paidAmount: 0, state: 'draft', stateLabel: '작성 중',
  issuedOn: '2026-09-12', dueOn: null, paidAt: null, remaining: 250000, overdueDays: 0, sentAt: null, canDeliver: true, canVoid: false, voidReason: null,
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
  await waitFor(() => expect(view.getByRole('option', { name: 'MAP + CAT 응시료' })).toBeTruthy());
  const select = view.getByLabelText('종류') as HTMLSelectElement;
  expect([...select.options].map((o) => o.value)).toEqual(meta.invTypes.map((t) => t.key));
  expect([...select.options].map((o) => o.textContent)).toEqual(meta.invTypes.map((t) => t.label));
});

/* ── 일괄 발행 (C94-a · H-75) ─────────────────────────────────────────── */

it('일괄 발행은 달 하나만 보내고, 발행 건수·건너뛴 학생과 이유를 서버가 준 대로 그린다 (D-R37)', async () => {
  const result = {
    yearMonth: '2026-09', candidates: 3, issuedAmount: 70000,
    issued: [made, { ...made, id: 43, studentId: 8, studentName: '김하윤', amount: 20000 }],
    skipped: [{ studentId: 9, studentName: '발행C', code: 'INV_NO_RATE', message: '단가표에 없는 과목이 있습니다: 단가 없는 과목 — 단가를 먼저 등록하세요' }],
  };
  const view = setup(() => ({ status: 201, data: result }));
  fireEvent.click(view.getByRole('button', { name: '청구서 일괄 발행' }));
  fireEvent.change(view.getByLabelText('달'), { target: { value: '2026-09' } });
  fireEvent.change(view.getByLabelText('납부 기한'), { target: { value: '2026-09-25' } });
  fireEvent.click(view.getByRole('button', { name: '9월 청구서 일괄 발행' }));
  await waitFor(() => expect(posted).not.toBeNull());
  // 한 번에 내는 청구서들의 기한은 **하나**다 — 낱장과 같은 규약이다 (S3)
  expect(posted).toEqual({ yearMonth: '2026-09', dueOn: '2026-09-25' });
  await waitFor(() => expect(view.getByText('2026-09 — 발행 2건')).toBeTruthy());
  expect(view.getByText('· 대상 3명 · 건너뜀 1명')).toBeTruthy();
  expect(view.getByText('70,000원')).toBeTruthy();
  expect(view.getByText('발행C')).toBeTruthy();
  expect(view.getByText('INV_NO_RATE')).toBeTruthy();
  expect(view.getByText(/단가를 먼저 등록하세요/)).toBeTruthy();
});

it('일괄 발행이 막히면(마감 달) 서버 문장을 그대로 보여 준다', async () => {
  const view = setup(() => ({ status: 409, data: { code: 'MONTH_CLOSED', message: '2026년 8월은 마감됐습니다 — 대표가 마감을 해제한 뒤 고칠 수 있습니다' } }));
  fireEvent.click(view.getByRole('button', { name: '청구서 일괄 발행' }));
  fireEvent.change(view.getByLabelText('달'), { target: { value: '2026-08' } });
  fireEvent.change(view.getByLabelText('납부 기한'), { target: { value: '2026-08-25' } });
  fireEvent.click(view.getByRole('button', { name: '8월 청구서 일괄 발행' }));
  await waitFor(() => expect(view.getByText(/2026년 8월은 마감됐습니다/)).toBeTruthy());
});
