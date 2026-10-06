/** @file-guide
 * 목적: 최신 기준 단가 화면이 시간당 정책과 기존 RATE/STURATE 회당 이력을 분리하는지 검증한다. (test)
 * 책임/재사용: 실제 RateBook/useMeta를 사용하고 네트워크만 어댑터로 바꿔 검증·초기화·write 0을 확인한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { api } from '@/api/client';
import type { Meta, RateBook as RateBookData } from '@/api/types';
import { RateBook } from './RateBook';

const book: RateBookData = {
  rates: [
    { id: 11, kindKey: 'extra', kindName: '추가 수업', kindExtra: true, subKey: null, subName: null, heads: 1, unitPrice: 75000, fromDate: '2026-02-01', current: true },
    { id: 10, kindKey: 'extra', kindName: '추가 수업', kindExtra: true, subKey: null, subName: null, heads: 1, unitPrice: 70000, fromDate: '2026-01-01', current: false },
    { id: 1, kindKey: 'class', kindName: '수업', kindExtra: false, subKey: 'writing', subName: 'Writing', heads: 2, unitPrice: 33000, fromDate: '2026-01-01', current: true },
  ],
  studentRates: [
    { id: 5, studentId: 7, studentName: '정하람', kindKey: 'class', kindName: '수업', unitPrice: 54000, fromDate: '2026-04-06', reason: '형제 할인', byName: '김민수', createdAt: '2026-04-01T10:00:00+09:00', current: true },
  ],
};
const meta = {
  kinds: [{ key: 'class', name: '수업', extra: false }],
  subs: [{ key: 'writing', name: 'Writing', kindKey: 'class' }],
  students: [{ id: 7, name: '정하람', grade: '10', tag: '10', label: '정하람 · 10' }, { id: 8, name: '윤도현', grade: '11', tag: '11', label: '윤도현 · 11' }],
  rooms: [], zaccs: [], staff: [], invTypes: [], cancelReasons: [], cancelTreats: [],
} as unknown as Meta;

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const seen: Array<{ method?: string; url?: string }> = [];

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  api.defaults.adapter = originalAdapter;
  seen.splice(0);
});

function setup() {
  api.defaults.adapter = (async (config: { method?: string; url?: string }) => {
    seen.push(config);
    return { config, status: 200, statusText: 'OK', headers: {}, data: meta };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><RateBook data={book} loading={false} /></QueryClientProvider>);
}

it('기존 RATE/STURATE를 회당 이력으로 그대로 그리고 시간당 값으로 환산하지 않는다', () => {
  const view = setup();
  const basic = view.getByLabelText('기존 회당 단가 표');
  expect(within(basic).getByText('₩75,000')).toBeTruthy();
  expect(within(basic).getByText('₩70,000')).toBeTruthy();
  expect(within(basic).getByText('₩33,000')).toBeTruthy();
  expect(within(basic).getAllByText('현재')).toHaveLength(2);
  const student = view.getByLabelText('기존 학생별 회당 예외 표');
  expect(within(student).getByText('정하람')).toBeTruthy();
  expect(within(student).getByText('형제 할인 · 김민수')).toBeTruthy();
  expect(seen).toHaveLength(0);
});

it('그룹 입력은 정원·1인 시간당 단가·총액 서버 결과를 분리하고 저장을 잠근다', () => {
  const view = setup();
  fireEvent.click(within(view.getByRole('group', { name: '기준 단가 입력 종류' })).getByRole('button', { name: '그룹' }));
  fireEvent.change(view.getByLabelText('정원'), { target: { value: '1' } });
  fireEvent.blur(view.getByLabelText('정원'));
  expect(view.getByText('2명 이상의 정수를 적어 주세요')).toBeTruthy();
  expect(view.getByLabelText('1인 시간당 단가')).toBeTruthy();
  expect(view.getByText('총액/시간 · 서버 재계산 후 표시')).toBeTruthy();
  expect((view.getByRole('button', { name: '시간당 단가 저장 준비 중' }) as HTMLButtonElement).disabled).toBe(true);
  expect(seen).toHaveLength(0);
});

it('학생 예외는 meta를 그때만 읽고 대상·개별 시간당 단가·기준 대비 %·효력기간·사유를 준비한다', async () => {
  const view = setup();
  expect(seen).toHaveLength(0);
  fireEvent.click(within(view.getByRole('group', { name: '기준 단가 입력 종류' })).getByRole('button', { name: '학생 예외' }));
  await waitFor(() => expect(view.getByRole('option', { name: '윤도현 · 11' })).toBeTruthy());
  expect(seen.map(({ url }) => url)).toEqual(['/meta']);
  fireEvent.blur(view.getByLabelText('대상 학생'));
  fireEvent.blur(view.getByLabelText('사유'));
  expect(view.getByText('학생을 골라 주세요')).toBeTruthy();
  expect(view.getByText('학생 예외 사유를 적어 주세요')).toBeTruthy();
  expect(view.getByLabelText('개별 시간당 단가')).toBeTruthy();
  expect(view.getByText('기준 대비 % · 서버 재계산 후 표시')).toBeTruthy();
  expect(view.getByLabelText('언제부터')).toBeTruthy();
  expect(view.getByLabelText('언제까지')).toBeTruthy();
});

it('입력 종류를 바꾸면 앞 대상·금액·기간·사유 초안을 지워 다른 정책으로 넘기지 않는다', async () => {
  const view = setup();
  const modes = view.getByRole('group', { name: '기준 단가 입력 종류' });
  fireEvent.click(within(modes).getByRole('button', { name: '학생 예외' }));
  await waitFor(() => expect(view.getByRole('option', { name: '정하람 · 10' })).toBeTruthy());
  fireEvent.change(view.getByLabelText('대상 학생'), { target: { value: '7' } });
  fireEvent.change(view.getByLabelText('개별 시간당 단가'), { target: { value: '54000' } });
  fireEvent.change(view.getByLabelText('언제까지'), { target: { value: '2027-01-31' } });
  fireEvent.change(view.getByLabelText('사유'), { target: { value: '형제 할인' } });
  fireEvent.click(within(modes).getByRole('button', { name: '그룹' }));
  fireEvent.click(within(modes).getByRole('button', { name: '학생 예외' }));
  expect((view.getByLabelText('대상 학생') as HTMLSelectElement).value).toBe('');
  expect((view.getByLabelText('개별 시간당 단가') as HTMLInputElement).value).toBe('');
  expect((view.getByLabelText('언제까지') as HTMLInputElement).value).toBe('');
  expect((view.getByLabelText('사유') as HTMLInputElement).value).toBe('');
});

it('종료일이 시작일보다 앞서면 검증하고 어떤 POST·PATCH·DELETE도 보내지 않는다', async () => {
  const view = setup();
  fireEvent.change(view.getByLabelText('언제부터'), { target: { value: '2026-11-01' } });
  fireEvent.change(view.getByLabelText('언제까지'), { target: { value: '2026-10-31' } });
  fireEvent.blur(view.getByLabelText('언제까지'));
  expect(view.getByText('시작일과 같거나 뒤인 날짜로 적어 주세요')).toBeTruthy();
  expect(view.getAllByRole('button', { name: '수정 준비 중' }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  expect(view.getAllByRole('button', { name: '삭제 준비 중' }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  expect(seen.every(({ method }) => !method || method.toLowerCase() === 'get')).toBe(true);
});
