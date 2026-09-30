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
  nextStages: [{ key: 'wait2nd', label: '2차 대기' }, { key: 'second', label: '2차 상담' }], touches: [],
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
  diagBookApplied: false, latestDiag: null,
  // W11 · N-86 — 등록 확정이 상담 담당에게 만드는 사후 관리 할 일(날은 서버가 정한다)
  aftercare: { firstLessonOn: '2026-10-05', happyCallOn: '2026-10-12', monthlyOn: '2026-11-05', ownerId: 3, ownerName: 'Grace' },
};

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const posted: Array<{ url?: string; body: unknown }> = [];
const got: string[] = [];
const conflictParams: string[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; posted.length = 0; got.length = 0; conflictParams.length = 0; });

function setup(onPost: (url: string) => { status: number; data: unknown } = (url) => ({ status: 201, data: url.endsWith('/preview') ? result : { ...result, preview: false } }), forLead: Lead = lead) {
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'post') {
      posted.push({ url: config.url, body: JSON.parse(config.data ?? '{}') });
      const r = onPost(config.url ?? '');
      if (r.status >= 400) return Promise.reject(Object.assign(new Error('fail'), { response: { status: r.status, data: r.data } }));
      return { config, status: r.status, statusText: 'OK', headers: {}, data: r.data };
    }
    got.push(config.url ?? '');
    const data = config.url === '/meta' ? meta : config.url === '/books' ? books
      : config.url === '/schedule/conflicts' ? {
        conflicts: [{ serId: 9, onDate: '2026-10-05', startMin: 960, endMin: 1020, title: 'SAT', with: 'teacher', whoName: '김재훈' }],
        freeLine: null, altTimes: [{ startMin: 1020, endMin: 1080 }, { startMin: 900, endMin: 960 }],
      } : {};
    // 실제로 나가는 주소 그대로 — 되풀이 키(`alsoDates=…&alsoDates=…`)가 대괄호 없이 붙는지 본다
    if (config.url === '/schedule/conflicts') conflictParams.push(api.getUri(config as Parameters<typeof api.getUri>[0]));
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const onClose = vi.fn();
  const onDone = vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <LeadEnrollDialog open lead={forLead} onClose={onClose} onDone={onDone} />
    </QueryClientProvider>,
  );
  return { view, onClose, onDone };
}

async function fillOneLine(view: ReturnType<typeof render>) {
  const dialog = await view.findByRole('dialog');
  await waitFor(() => expect(within(dialog).getByRole('option', { name: '수업' })).toBeTruthy());
  fireEvent.change(within(dialog).getByLabelText('시작일'), { target: { value: '2026-10-01' } });
  // 함께 내는 청구서의 기한 — 기본값이 없어 고르지 않으면 「미리 보기」가 서지 않는다 (S3)
  fireEvent.change(within(dialog).getByLabelText('납부 기한'), { target: { value: '2026-10-25' } });
  fireEvent.change(within(dialog).getByLabelText('수업 1 종류'), { target: { value: 'class' } });
  fireEvent.change(within(dialog).getByLabelText('수업 1 과목'), { target: { value: 'writing' } });
  fireEvent.change(within(dialog).getByLabelText('수업 1 강사'), { target: { value: '6' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '수업 1 월요일' }));
  fireEvent.click(within(dialog).getByRole('button', { name: '수업 1 수요일' }));
  return dialog;
}

it('UX-13B — 등록 줄 시각은 분 단위 선택기이고 24:00 종료를 미리보기 DTO의 1440분으로 보존한다', async () => {
  const { view } = setup();
  const dialog = await fillOneLine(view);
  const start = within(dialog).getByLabelText('수업 1 시작') as HTMLInputElement;
  const end = within(dialog).getByLabelText('수업 1 끝') as HTMLInputElement;
  expect(start.type).toBe('time');
  expect(end.type).toBe('time');
  expect(start.step).toBe('60');
  expect(end.step).toBe('60');

  fireEvent.click(within(dialog).getByRole('checkbox', { name: '수업 1 끝 24:00 (자정에 종료)' }));
  expect(end.hidden).toBe(true);
  expect(end.tabIndex).toBe(-1);
  expect(within(dialog).getByRole('status', { name: '수업 1 끝 시각' }).textContent).toBe('24:00');
  fireEvent.click(within(dialog).getByRole('button', { name: '미리 보기' }));
  await waitFor(() => expect(posted).toHaveLength(1));
  expect((posted[0]!.body as { lines: Array<{ startMin: number; endMin: number }> }).lines[0]).toMatchObject({ startMin: 960, endMin: 1440 });
  await waitFor(() => expect((within(dialog).getByRole('button', { name: '등록 확정' }) as HTMLButtonElement).disabled).toBe(false));

  fireEvent.click(within(dialog).getByRole('checkbox', { name: '수업 1 끝 24:00 (자정에 종료)' }));
  expect(end.hidden).toBe(false);
  expect(end.value).toBe('');
  expect((within(dialog).getByRole('button', { name: '미리 보기' }) as HTMLButtonElement).disabled).toBe(true);
  expect((within(dialog).getByRole('button', { name: '등록 확정' }) as HTMLButtonElement).disabled).toBe(true);
});

it('UX-13B — 등록 줄의 역순·10분 미만·8시간 초과는 서버 미리보기 전에 막는다', async () => {
  const { view } = setup();
  const dialog = await fillOneLine(view);
  const start = within(dialog).getByLabelText('수업 1 시작');
  const end = within(dialog).getByLabelText('수업 1 끝');
  const preview = within(dialog).getByRole('button', { name: '미리 보기' }) as HTMLButtonElement;

  fireEvent.change(end, { target: { value: '15:00' } });
  expect(preview.disabled).toBe(true);
  fireEvent.change(end, { target: { value: '16:09' } });
  expect(preview.disabled).toBe(true);
  fireEvent.change(end, { target: { value: '16:10' } });
  expect(preview.disabled).toBe(false);
  fireEvent.change(start, { target: { value: '07:00' } });
  expect(preview.disabled).toBe(true);
  expect(posted).toHaveLength(0);
});

it('온라인으로 바꾸면 이전 강의실을 비우고 미리보기 본문에도 실지 않는다 (UX-09)', async () => {
  const { view } = setup();
  const dialog = await fillOneLine(view);
  const room = within(dialog).getByLabelText('수업 1 강의실') as HTMLSelectElement;
  fireEvent.change(room, { target: { value: '2' } });
  expect(room.value).toBe('2');
  fireEvent.change(within(dialog).getByLabelText('수업 1 방식'), { target: { value: 'online' } });
  expect(room.value).toBe('');
  expect(room.disabled).toBe(true);
  fireEvent.click(within(dialog).getByRole('button', { name: '미리 보기' }));
  await waitFor(() => expect(posted).toHaveLength(1));
  expect((posted[0]!.body as { lines: Array<{ mode: string; roomId: number | null }> }).lines[0]).toMatchObject({ mode: 'online', roomId: null });
});

it('기존 학생 선택은 같은 학생의 재등록으로만 안내한다 — 새 형제를 한 사람으로 합치지 않는다 (A-13)', async () => {
  const { view } = setup();
  const dialog = await view.findByRole('dialog');
  expect(within(dialog).getByRole('checkbox', { name: '기존 학생의 재등록으로 붙입니다' })).toBeTruthy();
  expect(within(dialog).queryByText(/형제/)).toBeNull();
});

const expectedBody = {
  student: { name: '문채원', school: '언주중' }, startedOn: '2026-10-01', issueInvoice: true, dueOn: '2026-10-25',
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
  expect(text).toContain('2026-10 · ₩480,000 · Writing 8회');
  expect(text).toContain('배정 필요 Writing');
  expect(text).toContain('안내 초안 1건 · 알림 강사 1명 · 관리자 2명');
  expect(text).toContain('사후 관리 — 해피콜 10/12 · 첫 월간 상담 11/5 · Grace의 할 일');
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

it('A-01 — 문의 연락처가 보호자로 이어지면 미리보기에 이름 · 서버의 번호 모양 · 「받는 채널은 보호자 화면에서」가 선다 · 없으면 줄이 없다', async () => {
  const carried = { ...result, guardianCarried: { name: '문채원 어머니', relation: '어머니', phoneDisplay: '010-5555-6666' } };
  const { view } = setup((url) => ({ status: 201, data: url.endsWith('/preview') ? carried : { ...carried, preview: false } }));
  const dialog = await fillOneLine(view);
  fireEvent.click(within(dialog).getByRole('button', { name: '미리 보기' }));
  const box = await view.findByLabelText('등록 미리보기');
  expect((box.textContent ?? '').replace(/\s+/g, ' ')).toContain('보호자 — 문채원 어머니 · 010-5555-6666 (받는 채널은 보호자 화면에서 켭니다)');
});

it('A-01 — 이을 연락처가 없으면(guardianCarried null) 보호자 줄이 없다', async () => {
  const { view } = setup();
  const dialog = await fillOneLine(view);
  fireEvent.click(within(dialog).getByRole('button', { name: '미리 보기' }));
  const box = await view.findByLabelText('등록 미리보기');
  expect(box.textContent).not.toContain('보호자 —');
});

it('회차 칸의 너비는 감싼 칸이 정한다 — Input 에 w-16 을 겹쳐 주면 공용 w-full 이 이겨 옆 「교재」 칸이 눌려 이름이 잘린다(QA 0926)', async () => {
  const { view } = setup();
  const dialog = await view.findByRole('dialog');
  const sessions = within(dialog).getByLabelText('수업 1 회차');
  expect(sessions.className.split(/\s+/).filter((c) => /^w-/.test(c))).toEqual(['w-full']);
  expect(sessions.parentElement?.className.split(/\s+/)).toEqual(expect.arrayContaining(['w-16', 'shrink-0']));
  // 교재 칸은 줄의 나머지를 쓴다
  const book = within(dialog).getByLabelText('수업 1 교재');
  expect(book.parentElement?.className.split(/\s+/)).toEqual(expect.arrayContaining(['min-w-0', 'flex-1']));
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
  await waitFor(() => expect(view.getByText(/\[강사\] 김재훈 · 2026-10-05 16:00–17:00 · SAT/)).toBeTruthy());
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

/**
 * A-06 「다른 시간을 제안한다」 — 409 뒤 설명과 함께 서버가 준 **같은 강사 · 모든 요일에서 비는** 같은 길이의 시각을 단추로 보인다.
 * 누르면 그 줄의 시각만 바뀐다 — 미리 잡지 않으므로 다시 「미리 보기」를 거쳐야 확정이 선다. 요일이 둘이면 둘째 날짜도 함께 묻는다.
 */
it('겹치면 다른 시간을 제안하고, 누르면 그 줄의 시각이 바뀌며 다시 미리 봐야 한다 (A-06)', async () => {
  const { view } = setup(() => ({ status: 409, data: { code: 'RESOURCE_CONFLICT', message: '같은 시간에 강사·강의실·줌이 이미 잡혀 있습니다' } }));
  const dialog = await fillOneLine(view);
  fireEvent.click(within(dialog).getByRole('button', { name: '미리 보기' }));
  const alt = await waitFor(() => within(dialog).getByRole('group', { name: '다른 시간 제안' }));
  expect(within(alt).getByText(/수업 1 — 같은 강사가 월·수 모두 비는 시간/)).toBeTruthy();
  // 월 · 수 두 날짜를 함께 물었다(같은 키 되풀이)
  expect(conflictParams.some((p) => /[?&]alsoDates=2026-10-07(&|$)/.test(p))).toBe(true);
  expect(conflictParams.some((p) => /alsoDates%5B|alsoDates\[/.test(p))).toBe(false);
  fireEvent.click(within(alt).getByRole('button', { name: '17:00–18:00' }));
  expect((within(dialog).getByLabelText('수업 1 시작') as HTMLInputElement).value).toBe('17:00');
  expect((within(dialog).getByLabelText('수업 1 끝') as HTMLInputElement).value).toBe('18:00');
  await waitFor(() => expect(within(dialog).queryByRole('group', { name: '다른 시간 제안' })).toBeNull());
  expect(view.getByText(/수업 1 시각을 17:00–18:00 로 바꿨습니다 — 미리 보기로 다시 확인하세요/)).toBeTruthy();
  expect((within(dialog).getByRole('button', { name: '등록 확정' }) as HTMLButtonElement).disabled).toBe(true);
});

/**
 * 23-20 — 「다른 사람」 체크는 **오류 코드**(`STUDENT_SAME_NAME`)로 연다. 사용자에게는 서버 문장(apiMessage)만 보인다.
 * 예전에는 문장 안에 필드명 `allowSameName` 이 있는지로 열었다 — 서버가 문장에서 필드명·결정 번호를 걷어내는 순간
 * 체크가 조용히 사라진다. 문장은 사람의 것이고, 갈래를 가르는 것은 코드다.
 */
it('동명이인 체크는 서버 문장에 필드명이 없어도 코드(STUDENT_SAME_NAME)로 열린다', async () => {
  const { view } = setup(() => ({ status: 409, data: { code: 'STUDENT_SAME_NAME', message: '이름이 같은 학생이 1명 있습니다 — 다른 사람이면 아래를 체크하고 다시 보냅니다' } }));
  const dialog = await fillOneLine(view);
  fireEvent.click(within(dialog).getByRole('button', { name: '미리 보기' }));
  await waitFor(() => expect(view.getByText(/이름이 같은 학생이 1명/)).toBeTruthy());
  expect(view.getByLabelText('동명이인입니다 — 다른 사람으로 새로 만듭니다')).toBeTruthy();
  expect(view.queryByText('STUDENT_SAME_NAME')).toBeNull();
});

/**
 * DQ1 (2026-09-25) — 상담 진단에서 담당자가 교재를 골라 두었으면 첫 줄의 교재 칸이 그 교재로 선다.
 * 화면은 교재 키를 **빼서** 보내고(서버가 최신 진단 줄의 교재를 채운다) 「교재 미정」을 고르면 null 을 보내 기본값을 끈다.
 * 교재를 고른 사람은 담당자다 — 화면은 점수로 교재를 고르지 않는다.
 */
it('상담 진단에서 고른 교재가 첫 줄의 기본값이다 — 키를 빼서 보내 서버가 채우고, 「교재 미정」은 null 로 기본값을 끈다 (DQ1)', async () => {
  const withDiag: Lead = {
    ...lead,
    latestDiag: { id: 3, leadId: 18, english: 62, math: 71, interview: 58, takenOn: null, level: 'practice', levelLabel: 'Practice', bookId: 41, bookTitle: 'Writing Basics', note: null, byId: 3, byName: 'Grace', at: '2026-09-20T10:00:00+09:00' },
  };
  const { view } = setup((url) => ({ status: 201, data: url.endsWith('/preview') ? { ...result, diagBookApplied: true, bookIssues: [{ id: 1, libId: 41, studentId: 99, state: 'wait', stateLabel: '대기' }], booksMissing: [] } : result }), withDiag);
  const dialog = await fillOneLine(view);
  const book = within(dialog).getByLabelText('수업 1 교재') as HTMLSelectElement;
  expect(book.value).toBe('');
  expect(book.options[book.selectedIndex]!.textContent).toBe('상담에서 고른 교재 — Writing Basics');
  fireEvent.click(within(dialog).getByRole('button', { name: '미리 보기' }));
  await waitFor(() => expect(posted).toHaveLength(1));
  const lineWithoutBook: Record<string, unknown> = { ...expectedBody.lines[0]! };
  delete lineWithoutBook.libId;
  expect(posted[0]!.body).toEqual({ ...expectedBody, lines: [lineWithoutBook] });
  expect((posted[0]!.body as { lines: object[] }).lines[0]).not.toHaveProperty('libId');
  const box = await view.findByLabelText('등록 미리보기');
  expect(box.textContent).toContain('요청 1건 (상담에서 담당자가 고른 교재 포함)');
  // 「교재 미정」 — 기본값을 쓰지 않는다는 명시라 null 을 보낸다
  fireEvent.change(book, { target: { value: 'none' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '미리 보기' }));
  await waitFor(() => expect(posted).toHaveLength(2));
  expect(posted[1]!.body).toEqual(expectedBody);
});

/**
 * N-83 (W11 · 스케줄 담당 줄) — 성별은 선택 칸이다. 낱말은 서버 코드표(`meta.genders`)이고 미리 채우지 않는다.
 * 고르지 않으면 본문에 칸이 없고(첫 시험의 expectedBody), 고르면 새 학생 칸에만 실린다.
 */
it('성별은 서버 코드표의 두 낱말 중 고를 때만 새 학생 칸에 실린다 — 미리 채우지 않는다 (N-83)', async () => {
  Object.assign(meta, { genders: [{ key: 'female', label: '여' }, { key: 'male', label: '남' }] });
  try {
    const { view } = setup();
    const dialog = await fillOneLine(view);
    const gender = within(dialog).getByLabelText(/^성별/) as HTMLSelectElement;
    expect(gender.value).toBe('');
    expect(Array.from(gender.options).map((o) => o.textContent)).toEqual(['고르지 않음', '여', '남']);
    fireEvent.change(gender, { target: { value: 'female' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '미리 보기' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.body).toEqual({ ...expectedBody, student: { ...expectedBody.student, gender: 'female' } });
  } finally {
    delete (meta as { genders?: unknown }).genders;
  }
});
