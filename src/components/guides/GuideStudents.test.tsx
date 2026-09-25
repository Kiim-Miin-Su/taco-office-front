/** @file-guide
 * 목적: §44 학생 레일 선택이 서버가 준 latestGuide·교재·진단 projection을 그대로 전환하는지 검증한다.
 * 책임/재사용: 실제 GuideStudents와 QueryClient를 사용하며 최신 안내 선정 규칙을 테스트에서 다시 만들지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import { family } from '@/api/queries';
import type { Guide, GuideStudent, GuideStudents as GuideStudentsDto, Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import * as pngExport from '@/lib/png-export';
import { GuideStudents } from './GuideStudents';

const me: Me = {
  id: 4,
  name: '대표',
  role: 'ceo',
  roleLabel: '대표',
  title: null,
  canAdminPage: true,
  canCrudAll: true,
  canSeeProfit: true,
  canCrudAttendance: true,
  canMoney: true,
  canWage: true,
  canApprove: true,
  canHide: true,
  canGpaPack: true,
};

function student(studentId: number, name: string): GuideStudent {
  const latestGuide: Guide = {
    canSend: false, canAck: false, sendBlockedReason: null, acknowledgedAfterSeconds: null,
    id: studentId,
    serId: 10 + studentId,
    studentId,
    teacherId: 3,
    reason: 'new',
    state: 'ready',
    pending: true,
    studentName: name,
    teacherName: '강사1',
    serTitle: `${name} 수업`,
    body: `${name} 서버 최신 안내`,
    dueOn: null,
    eventOn: '2026-09-15',
    sourceOccurrenceId: 90 + studentId,
    createdAt: '2026-09-14T10:00:00+09:00',
    sentAt: null,
    acknowledgedAt: null,
    overdueDays: 0, siblingCount: 0,
  };
  return {
    studentId,
    studentName: name,
    grade: 'G7',
    guidance: '엄격 + 관리',
    lang: 'mix',
    guideCount: studentId,
    latestGuide,
    books: [
      {
        issueId: studentId,
        libId: 20,
        versId: null,
        code: `BOOK-${studentId}`,
        title: `${name} 교재`,
        edition: '2026',
        seTe: 'SE',
        subKey: 'eng',
      },
    ],
    diagnostic: {
      id: studentId,
      levelSummary: `${name} 수준`,
      strengths: '리딩',
      weaknesses: '라이팅',
      curriculum: '주 2회',
      createdAt: '2026-09-13T10:00:00+09:00',
    },
  };
}

const clients: QueryClient[] = [];
const originalAdapter = api.defaults.adapter;

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  useSession.setState({ me: null, ready: false });
  vi.restoreAllMocks();
  api.defaults.adapter = originalAdapter;
});

it('학생을 고르면 그 학생의 서버 최신 안내·진단·교재로 함께 전환한다', async () => {
  const response: GuideStudentsDto = { items: [student(1, '강라율'), student(2, '고은설')] };
  vi.spyOn(api, 'get').mockResolvedValue({ data: response });
  useSession.setState({ me, ready: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <GuideStudents />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(view.getByText('강라율 서버 최신 안내')).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: /고은설.*안내 2건/ }));
  expect(view.getByText('고은설 서버 최신 안내')).toBeTruthy();
  expect(view.getByText('고은설 수준')).toBeTruthy();
  expect(view.getByText('고은설 교재')).toBeTruthy();
});

function setupEditor(initial: GuideStudentsDto) {
  let response = initial;
  const writes: Array<{ url: string | undefined; body: unknown }> = [];
  api.defaults.adapter = async (config) => {
    let data: unknown = [];
    if (config.method === 'put') {
      const body = JSON.parse(config.data as string) as { body: string };
      writes.push({ url: config.url, body });
      data = { ...response.items[0].latestGuide, body: body.body };
    } else if (config.url === '/guides/students') data = response;
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  };
  useSession.getState().signIn('fixture', me);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><GuideStudents /></QueryClientProvider>);
  return {
    view, writes,
    refresh: async (next: GuideStudentsDto) => {
      response = next;
      await act(async () => { await client.invalidateQueries({ queryKey: family.guides }); });
    },
  };
}

it('다른 학생을 고르면 편집 세션을 바꾸고 이전 본문을 새 GUIDE id로 보내지 않는다', async () => {
  const first = student(1, '강라율');
  const second = student(2, '고은설');
  const { view, writes } = setupEditor({ items: [first, second] });
  await waitFor(() => expect(view.getByRole('button', { name: '수정' })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '수정' }));
  fireEvent.change(view.getByLabelText('안내 본문'), { target: { value: '첫 학생의 미저장 초안' } });
  fireEvent.click(view.getByRole('button', { name: /고은설.*안내 2건/ }));
  fireEvent.click(view.getByRole('button', { name: '수정' }));
  fireEvent.click(view.getByRole('button', { name: '작성' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toEqual({ url: '/guides/2/body', body: { body: second.latestGuide.body } });
});

it('같은 GUIDE id의 정상 refetch는 작성 중 본문을 보존한다', async () => {
  const first = student(1, '강라율');
  const { view, writes, refresh } = setupEditor({ items: [first] });
  await waitFor(() => expect(view.getByRole('button', { name: '수정' })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '수정' }));
  fireEvent.change(view.getByLabelText('안내 본문'), { target: { value: '보존할 미저장 본문' } });
  const input = view.getByLabelText('안내 본문');
  await refresh({ items: [{ ...first, latestGuide: { ...first.latestGuide, body: '서버에서 다시 읽은 본문' } }] });
  await waitFor(() => expect(view.getByText('서버에서 다시 읽은 본문')).toBeTruthy());
  expect(view.getByLabelText('안내 본문')).toBe(input);
  expect((input as HTMLTextAreaElement).value).toBe('보존할 미저장 본문');
  fireEvent.click(view.getByRole('button', { name: '작성' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toEqual({ url: '/guides/1/body', body: { body: '보존할 미저장 본문' } });
});

it('같은 학생의 최신 GUIDE id가 바뀌면 새 안내의 본문으로 편집 세션을 연다', async () => {
  const first = student(1, '강라율');
  const { view, writes, refresh } = setupEditor({ items: [first] });
  await waitFor(() => expect(view.getByRole('button', { name: '수정' })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '수정' }));
  fireEvent.change(view.getByLabelText('안내 본문'), { target: { value: '이전 안내의 미저장 초안' } });
  await refresh({ items: [{ ...first, latestGuide: { ...first.latestGuide, id: 99, body: '새 안내의 저장 본문' } }] });
  await waitFor(() => expect(view.getByText('새 안내의 저장 본문')).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '수정' }));
  fireEvent.click(view.getByRole('button', { name: '작성' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toEqual({ url: '/guides/99/body', body: { body: '새 안내의 저장 본문' } });
});

it('본문·교재·세 시각의 순서와 PNG 포함 범위를 보존하고 본문 HTML은 텍스트로 표시한다', async () => {
  const first = student(1, '강라율');
  first.latestGuide = {
    ...first.latestGuide,
    body: '<script>문자 그대로</script>\n둘째 줄',
    createdByName: '작성자', sentAt: '2026-09-14T11:00:00+09:00', sentByName: '발송자',
    acknowledgedAt: '2026-09-14T12:00:00+09:00', acknowledgedByName: '수신 강사',
  };
  const png = vi.spyOn(pngExport, 'downloadElementPng').mockResolvedValue(undefined);
  const { view } = setupEditor({ items: [first] });
  await waitFor(() => expect(view.getByText(/문자 그대로/)).toBeTruthy());
  expect(view.container.querySelector('script')).toBeNull();
  expect(view.getByText(/문자 그대로/).textContent).toBe(first.latestGuide.body);
  fireEvent.click(view.getByRole('button', { name: '안내문 PNG' }));
  await waitFor(() => expect(png).toHaveBeenCalledTimes(1));
  const [element, filename] = png.mock.calls[0];
  const text = element.textContent ?? '';
  expect(filename).toBe('2026-09-15-강라율-수업안내.png');
  expect(text.indexOf(first.latestGuide.body!)).toBeLessThan(text.indexOf('강라율 교재'));
  expect(text.indexOf('강라율 교재')).toBeLessThan(text.indexOf('작성 2026-09-14 10:00'));
  expect(text).toContain('발송 2026-09-14 11:00 · 발송자');
  expect(text).toContain('강사 확인 2026-09-14 12:00 · 수신 강사');
  expect(text).not.toContain('안내문 PNG');
});

it.each(['sent', 'read'] as const)('같은 GUIDE id가 %s로 재조회되면 이전 본문 편집을 닫는다', async (state) => {
  const first = student(1, '강라율');
  const { view, writes, refresh } = setupEditor({ items: [first] });
  fireEvent.click(await view.findByRole('button', { name: '수정' }));
  fireEvent.change(view.getByLabelText('안내 본문'), { target: { value: '발송 전 미저장 초안' } });
  await refresh({ items: [{ ...first, latestGuide: { ...first.latestGuide, state, pending: false } }] });
  await waitFor(() => expect(view.queryByLabelText('안내 본문')).toBeNull());
  expect(view.getByRole('button', { name: '수정' })).toHaveProperty('disabled', true);
  expect(writes).toHaveLength(0);
});
