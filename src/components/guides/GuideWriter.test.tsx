/** @file-guide
 * 목적: §43 안내 작성 — 상태 낱말을 화면이 보내지 않는다 (C51).
 * 책임/재사용: 실제 GuideWriter/useWriteGuideBody 를 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { api } from '@/api/client';
import type { Guide, GuideTemplate, Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import { GuideWriter } from './GuideWriter';

const me: Me = {
  id: 1, name: '관리자', role: 'admin', roleLabel: '관리자', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: false, canCrudAttendance: true, canMoney: false, canWage: false,
  canApprove: true, canHide: true, canGpaPack: true,
};

const guide: Guide = {
  canSend: false, canAck: false, sendBlockedReason: null, acknowledgedAfterSeconds: null,
  previousTeacherId: null, previousTeacherName: null,
  id: 5, serId: 8, studentId: 4, teacherId: 2, reason: 'new', kindLabel: '포괄 안내', state: 'draft', pending: true, studentName: '고은설',
  teacherName: 'Sophia', serTitle: 'Vocabulary', body: null, dueOn: '2026-09-20', eventOn: '2026-09-20',
  sourceOccurrenceId: 55, createdAt: '2026-09-10', sentAt: null, acknowledgedAt: null, overdueDays: 0, siblingCount: 0, siblings: [], deadline: null,
};

const templates: GuideTemplate[] = [
  { id: 1, name: '첫 수업 안내', body: '안녕하세요. 첫 수업은 9월 10일입니다.' },
  { id: 2, name: '강사 교체 안내', body: '선생님이 바뀌었습니다.' },
];

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
let put: { url?: string; body?: unknown } = {};
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut(); put = {};
});

function setup(fail?: { status: number; data: unknown }, over: Partial<Guide> = {}) {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'put') {
      put = { url: config.url, body: JSON.parse(config.data ?? '{}') };
      if (fail) return Promise.reject(Object.assign(new Error('x'), { response: { status: fail.status, data: fail.data } }));
      return { config, status: 200, statusText: 'OK', headers: {}, data: { ...guide, state: 'ready', body: (put.body as { body: string }).body } };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: templates };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  let closed = false;
  const view = render(
    <QueryClientProvider client={client}><GuideWriter guide={{ ...guide, ...over }} onClose={() => { closed = true; }} /></QueryClientProvider>,
  );
  return { view, wasClosed: () => closed };
}

it('보내는 것은 본문뿐이다 — 상태 낱말을 화면이 정하지 않는다 (D-R18)', async () => {
  const { view } = setup();
  fireEvent.change(view.getByLabelText('안내 본문'), { target: { value: '9월 10일 첫 수업입니다' } });
  fireEvent.click(view.getByRole('button', { name: '작성' }));
  await waitFor(() => expect(put.body).toBeTruthy());
  expect(Object.keys(put.body as object)).toEqual(['body']);
  expect(put.body).toEqual({ body: '9월 10일 첫 수업입니다' });
  expect(put.url).toBe('/guides/5/body');
});

it('문구 틀은 본문만 복사한다 — 어느 틀에서 왔는지는 안 보낸다', async () => {
  const { view } = setup();
  await waitFor(() => expect(view.getByRole('option', { name: '첫 수업 안내' })).toBeTruthy());
  fireEvent.change(view.getByLabelText('문구 틀에서 가져오기'), { target: { value: '1' } });
  expect((view.getByLabelText('안내 본문') as HTMLTextAreaElement).value).toBe(templates[0].body);
  fireEvent.click(view.getByRole('button', { name: '작성' }));
  await waitFor(() => expect(put.body).toBeTruthy());
  // 틀 id 는 어디에도 없다
  expect(JSON.stringify(put.body)).not.toContain('tpl');
  expect(Object.keys(put.body as object)).toEqual(['body']);
});

it('본문이 비면 작성을 누를 수 없다', () => {
  const { view } = setup();
  expect((view.getByRole('button', { name: '작성' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(view.getByLabelText('안내 본문'), { target: { value: '내용' } });
  expect((view.getByRole('button', { name: '작성' }) as HTMLButtonElement).disabled).toBe(false);
});

it('거절 이유는 서버 문장을 그대로 보여 주고 창을 닫지 않는다', async () => {
  const { view, wasClosed } = setup({
    status: 409, data: { code: 'GUIDE_ALREADY_SENT', message: '이미 보낸 안내는 고칠 수 없습니다 — 새 안내를 만드세요' },
  });
  fireEvent.change(view.getByLabelText('안내 본문'), { target: { value: '내용' } });
  fireEvent.click(view.getByRole('button', { name: '작성' }));
  await waitFor(() => expect(view.getByText(/이미 보낸 안내/)).toBeTruthy());
  expect(wasClosed()).toBe(false);
});

/**
 * g4 §44-3 — 「지도 방향」·「관리자 코멘트 · 강사만」 두 상자. 저장된 값으로 열고 **바꾼 칸만** 보낸다 —
 * 안 보낸 칸은 서버가 그대로 두므로(GuideBodyDto) 본문만 고친 사람이 다른 사람이 적은 메모를 덮지 않는다.
 */
it('지도 방향·관리자 코멘트는 저장된 값으로 열고 바꾼 칸만 보낸다 (§44-3)', async () => {
  const { view } = setup(undefined, { body: '본문', direction: '어휘 먼저', adminNote: null });
  expect((view.getByLabelText('지도 방향') as HTMLTextAreaElement).value).toBe('어휘 먼저');
  expect((view.getByLabelText('관리자 코멘트 · 강사만') as HTMLTextAreaElement).value).toBe('');
  fireEvent.change(view.getByLabelText('관리자 코멘트 · 강사만'), { target: { value: '숙제 양을 살펴 주세요' } });
  fireEvent.click(view.getByRole('button', { name: '작성' }));
  await waitFor(() => expect(put.body).toBeTruthy());
  expect(put.body).toEqual({ body: '본문', adminNote: '숙제 양을 살펴 주세요' });
});

it('지도 방향을 지우면 빈 글자로 보내 서버가 비운다 (§44-3)', async () => {
  const { view } = setup(undefined, { body: '본문', direction: '어휘 먼저', adminNote: '메모' });
  fireEvent.change(view.getByLabelText('지도 방향'), { target: { value: '' } });
  fireEvent.click(view.getByRole('button', { name: '작성' }));
  await waitFor(() => expect(put.body).toBeTruthy());
  expect(put.body).toEqual({ body: '본문', direction: '' });
});

/**
 * F-60 「그룹이면 인원별 단가가 계산되어 표시 · 진단 입력 탭이 인원수만큼 생성」 · F-61 「첫 학생 진단 → 나머지에게 복사 · 각자 고친다」.
 * 단가는 §79 수강 학생 카드와 같은 서버 계산(GET /schedule/tracking · 금액은 돈 권한만)이고, 진단은 반 진단(GET/POST /guides/:id/class-diagnostics)이다.
 * 사용자 결정 2026-09-30 「탭에서 관리자도 입력」 — 안내를 쓰는 사람이 탭마다 진단을 적는다.
 */
it('그룹이면 인원별 단가를 보이고, 반 학생 수만큼 진단 탭을 세워 첫 탭을 나머지에 복사한 뒤 각자 고쳐 한 번에 저장한다 (F-60 · F-61)', async () => {
  useSession.getState().signIn('fixture', { ...me, canMoney: true });
  const posted: Array<{ url?: string; body: unknown }> = [];
  const classList = {
    items: [
      { guideId: 5, studentId: 4, studentName: '고은설', diagnostic: null },
      { guideId: 6, studentId: 7, studentName: '강라율', diagnostic: { id: 3, levelSummary: '이전 진단', strengths: null, weaknesses: null, curriculum: null, createdAt: '2026-09-01T10:00:00+09:00' } },
      { guideId: 7, studentId: 9, studentName: '이하린', diagnostic: null },
    ],
  };
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'post') {
      posted.push({ url: config.url, body: JSON.parse(config.data ?? '{}') });
      return { config, status: 201, statusText: 'Created', headers: {}, data: classList };
    }
    if (config.url === '/schedule/tracking') {
      return { config, status: 200, statusText: 'OK', headers: {}, data: { serId: 8, onDate: '2026-09-20', cap: 4, count: 3, priced: true, unitPrice: 60000, total: 180000, canSeeAmounts: true, students: [] } };
    }
    if (config.url === '/guides/5/class-diagnostics') return { config, status: 200, statusText: 'OK', headers: {}, data: classList };
    return { config, status: 200, statusText: 'OK', headers: {}, data: templates };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  const siblings = [
    { id: 6, studentName: '강라율', state: 'draft', copyable: true, skipReason: null },
    { id: 7, studentName: '이하린', state: 'draft', copyable: true, skipReason: null },
  ];
  const view = render(
    <QueryClientProvider client={client}><GuideWriter guide={{ ...guide, siblingCount: 2, siblings }} onClose={() => undefined} /></QueryClientProvider>,
  );
  // 인원별 단가 — 서버가 센 인원 · 1인 단가 · 수업당 총액 그대로
  const price = await view.findByLabelText('인원별 단가');
  expect(price.textContent).toContain('3명 · 1인 ₩60,000 · 수업당 ₩180,000');
  // 진단 탭 — 반 학생 수만큼 · 본인 먼저
  const tabs = await view.findAllByRole('tab');
  expect(tabs.map((t) => t.textContent)).toEqual(['고은설', '강라율', '이하린']);
  fireEvent.change(view.getByLabelText('고은설 현재 수준'), { target: { value: '추론 문항 약함' } });
  fireEvent.change(view.getByLabelText('고은설 약점'), { target: { value: '추론' } });
  fireEvent.click(view.getByRole('button', { name: '이 진단을 나머지 학생에게 복사' }));
  fireEvent.click(view.getByRole('tab', { name: '강라율' }));
  expect((view.getByLabelText('강라율 현재 수준') as HTMLTextAreaElement).value).toBe('추론 문항 약함');
  fireEvent.change(view.getByLabelText('강라율 약점'), { target: { value: '시간 배분' } });
  fireEvent.click(view.getByRole('button', { name: '진단 저장 · 3명' }));
  await waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toEqual({
    url: '/guides/5/class-diagnostics',
    body: { items: [
      { studentId: 4, levelSummary: '추론 문항 약함', strengths: '', weaknesses: '추론', curriculum: '' },
      { studentId: 7, levelSummary: '추론 문항 약함', strengths: '', weaknesses: '시간 배분', curriculum: '' },
      { studentId: 9, levelSummary: '추론 문항 약함', strengths: '', weaknesses: '추론', curriculum: '' },
    ] },
  });
});
