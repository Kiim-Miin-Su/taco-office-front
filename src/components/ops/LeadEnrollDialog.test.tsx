/** @file-guide
 * 목적: §23 「등록 확정」 창 — 화면은 학생 칸·시작일·배치안 줄만 보내고 첫 수업일·청구액·겹침은 서버 값이다 (C91 · A-05 · A-06 · A-07).
 * 책임/재사용: 실제 LeadEnrollDialog/useEnrollLead/useMeta/useBooks 를 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { EnrollResult, Lead } from '@/api/types';
import { LeadEnrollDialog } from './LeadEnrollDialog';

const lead: Lead = {
  id: 18, name: '문채원', school: '언주중', ownerName: 'Grace', reason: null,
  stage: 'hold', stopAt: null, ageDays: 3, createdAt: '2026-09-15', studentId: null, ownerId: 3,
  failFrom: null, revivalStage: null, revivalSource: null,
};
const meta = {
  kinds: [{ key: 'class', name: '수업', extra: false }], subs: [{ key: 'writing', name: 'Writing' }],
  staff: [{ id: 6, name: '김재훈', role: 'teacher', canAdminPage: false, canGpaPack: false, title: null }],
  rooms: [{ id: 2, name: '201호' }], students: [{ id: 7, name: '정하람', grade: '10' }], zaccs: [], invTypes: [], cancelReasons: [], cancelTreats: [],
};
const books = { items: [{ id: 41, code: 'WR-1', title: 'Writing Basics', subKey: 'writing', subName: 'Writing' }], bySub: {} };
const result: EnrollResult = {
  leadId: 18, preview: true, studentId: 99, studentName: '문채원', studentCreated: true, startedOn: '2026-10-01',
  enrollments: [{ id: 1, kindKey: 'class', subKey: 'writing', sessions: null, startedOn: '2026-10-01' }],
  series: [{ serId: 5, kindKey: 'class', subKey: 'writing', subName: 'Writing', title: '', ruleLabel: '매주 월·수', startMin: 960, endMin: 1020, teacherId: 6, teacherName: '김재훈', firstLessonOn: '2026-10-05', monthCount: 8 }],
  invoice: { id: 77, studentId: 99, studentName: '문채원', grade: null, yearMonth: '2026-10', title: '2026년 10월 수업료 청구', amount: 480000, paidAmount: 0, state: 'draft', stateLabel: '초안', issuedOn: '2026-09-18', dueOn: null, paidAt: null, invType: 'tuition', invTypeLabel: '수업료', lines: [{ subKey: 'writing', label: 'Writing', count: 8, unitPrice: 60000, amount: 480000 }], sentAt: null, canDeliver: false, canVoid: false, voidReason: null } as unknown as EnrollResult['invoice'],
  invoiceSkipped: null, bookIssues: [], booksMissing: [{ kindKey: 'class', subKey: 'writing', label: 'Writing' }],
  guideDrafts: 1, notifiedTeachers: 1, notifiedStaff: 2,
  unavailable: [{ serId: 5, date: '2026-10-05', teacherId: 6, teacherName: '김재훈', startMin: 960, endMin: 1080, reason: '병원' }], stage: 'enrolled',
};

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const posted: Array<{ url?: string; body: unknown }> = [];
const got: string[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; posted.length = 0; got.length = 0; });

function setup(onPost: (url: string) => { status: number; data: unknown } = (url) => ({ status: 201, data: url.endsWith('/preview') ? result : { ...result, preview: false } })) {
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'post') {
      posted.push({ url: config.url, body: JSON.parse(config.data ?? '{}') });
      const r = onPost(config.url ?? '');
      if (r.status >= 400) return Promise.reject(Object.assign(new Error('fail'), { response: { status: r.status, data: r.data } }));
      return { config, status: r.status, statusText: 'OK', headers: {}, data: r.data };
    }
    got.push(config.url ?? '');
    const data = config.url === '/meta' ? meta : config.url === '/books' ? books
      : config.url === '/schedule/conflicts' ? { conflicts: [{ serId: 9, onDate: '2026-10-05', startMin: 960, endMin: 1020, title: 'SAT', with: 'teacher', whoName: '김재훈' }] } : {};
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const onClose = vi.fn();
  const onDone = vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <LeadEnrollDialog open lead={lead} onClose={onClose} onDone={onDone} />
    </QueryClientProvider>,
  );
  return { view, onClose, onDone };
}

async function fillOneLine(view: ReturnType<typeof render>) {
  const dialog = await view.findByRole('dialog');
  await waitFor(() => expect(within(dialog).getByRole('option', { name: '수업' })).toBeTruthy());
  fireEvent.change(within(dialog).getByLabelText('시작일'), { target: { value: '2026-10-01' } });
  fireEvent.change(within(dialog).getByLabelText('수업 1 종류'), { target: { value: 'class' } });
  fireEvent.change(within(dialog).getByLabelText('수업 1 과목'), { target: { value: 'writing' } });
  fireEvent.change(within(dialog).getByLabelText('수업 1 강사'), { target: { value: '6' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '수업 1 월요일' }));
  fireEvent.click(within(dialog).getByRole('button', { name: '수업 1 수요일' }));
  return dialog;
}

const expectedBody = {
  student: { name: '문채원', school: '언주중' }, startedOn: '2026-10-01', issueInvoice: true,
  lines: [{ kindKey: 'class', subKey: 'writing', mode: 'offline', rrule: 'WEEKLY:MO,WE', startMin: 960, endMin: 1020, teacherId: 6, roomId: null, title: null, sessions: null, libId: null }],
};

it('학생 칸·시작일·배치안 줄만 보낸다 — 미리 본 뒤에야 「등록 확정」이 서고, 첫 수업일·청구액·배정 필요·불가 시간은 서버 값 그대로다 (A-05 · A-07 · A-14)', async () => {
  const { view, onClose, onDone } = setup();
  const dialog = await fillOneLine(view);
  expect(got).toContain('/meta');
  const enroll = within(dialog).getByRole('button', { name: '등록 확정' }) as HTMLButtonElement;
  expect(enroll.disabled).toBe(true);
  fireEvent.click(within(dialog).getByRole('button', { name: '미리 보기' }));
  await waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toEqual({ url: '/ops/leads/18/enroll/preview', body: expectedBody });
  const box = await view.findByLabelText('등록 미리보기');
  const text = (box.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('문채원 · 새 학생 · 10/1부터 · 수업 1개');
  expect(text).toContain('Writing · 매주 월·수 16:00–17:00 · 김재훈');
  expect(text).toContain('첫 수업 10/5 · 이달 8회');
  expect(text).toContain('2026-10 · 480,000원 · Writing 8회');
  expect(text).toContain('배정 필요 Writing');
  expect(text).toContain('안내 초안 1건 · 알림 강사 1명 · 관리자 2명');
  expect(text).toContain('2026-10-05 16:00–18:00 · 김재훈 — 병원');
  await waitFor(() => expect((within(dialog).getByRole('button', { name: '등록 확정' }) as HTMLButtonElement).disabled).toBe(false));
  // 미리 본 뒤 줄을 고치면 다시 본다 — 그동안 「등록 확정」은 잠긴다
  fireEvent.click(within(dialog).getByRole('button', { name: '수업 1 금요일' }));
  expect((within(dialog).getByRole('button', { name: '등록 확정' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(within(dialog).getByRole('button', { name: '수업 1 금요일' }));
  expect((within(dialog).getByRole('button', { name: '등록 확정' }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(within(dialog).getByRole('button', { name: '등록 확정' }));
  await waitFor(() => expect(posted).toHaveLength(2));
  expect(posted[1]).toEqual({ url: '/ops/leads/18/enroll', body: expectedBody });
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ preview: false, studentId: 99 }));
});

it('겹치면 서버가 거절한 문장을 그대로 보이고 누구와 부딪혔는지 한 번 묻는다 · 동명이인이면 「다른 사람」 체크가 열린다 (A-06 · N-137)', async () => {
  let code = 'RESOURCE_CONFLICT';
  const { view } = setup(() => ({ status: 409, data: code === 'RESOURCE_CONFLICT'
    ? { code, message: '같은 시간에 강사·강의실·줌이 이미 잡혀 있습니다' }
    : { code, message: '이름이 같은 학생이 1명 있습니다(#7 10 · 언주중) — 다른 사람이 맞으면 allowSameName 으로 다시 보냅니다 (N-137)' } }));
  const dialog = await fillOneLine(view);
  fireEvent.click(within(dialog).getByRole('button', { name: '미리 보기' }));
  await waitFor(() => expect(view.getByText(/이미 잡혀 있습니다/)).toBeTruthy());
  await waitFor(() => expect(got.filter((u) => u === '/schedule/conflicts').length).toBeGreaterThan(0));
  await waitFor(() => expect(view.getByText(/2026-10-05 16:00–17:00 · 김재훈/)).toBeTruthy());
  expect(view.queryByLabelText('등록 미리보기')).toBeNull();
  expect((within(dialog).getByRole('button', { name: '등록 확정' }) as HTMLButtonElement).disabled).toBe(true);

  code = 'STUDENT_SAME_NAME';
  fireEvent.click(within(dialog).getByRole('button', { name: '미리 보기' }));
  await waitFor(() => expect(view.getByText(/이름이 같은 학생이 1명/)).toBeTruthy());
  const same = view.getByLabelText('동명이인입니다 — 다른 사람으로 새로 만듭니다') as HTMLInputElement;
  fireEvent.click(same);
  fireEvent.click(within(dialog).getByRole('button', { name: '미리 보기' }));
  await waitFor(() => expect(posted).toHaveLength(3));
  expect(posted[2]!.body).toMatchObject({ allowSameName: true });
});
