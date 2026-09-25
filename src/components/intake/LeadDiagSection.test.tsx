/** @file-guide
 * 목적: LeadDiagSection.test.tsx — §23 상담 서랍 「진단 점수」 (DQ1 · A-04) 회귀 (test)
 * 책임/재사용: 실제 LeadDiagSection/useLeadDiag/useAddLeadDiag/useBooks 를 쓰고 네트워크만 갈아 끼운다. 제품 규칙을 테스트에 다시 적지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Lead, LeadDiag, LeadDiagList } from '@/api/types';
import { LeadDiagSection, diagScoresLabel } from './LeadDiagSection';

/**
 * DQ1 대표 답변(2026-09-25) 「점수만 저장 + 담당자가 선택」 — 화면은 서버가 준 값을 그리고, 사람이 적은 칸만 보낸다.
 * 레벨 낱말은 서버의 `levels`, 교재는 `GET /books` 그대로다. 점수로 레벨·교재를 짐작하는 자리는 없다.
 */
const base: Lead = {
  id: 5, name: '표은결', school: '양재고', ownerName: '강민지', reason: null,
  stage: 'second', stopAt: null, ageDays: 3, createdAt: '2026-09-15', studentId: null, ownerId: 4,
  failFrom: null, revivalStage: null, revivalSource: null, nextStages: [{ key: 'hold', label: '보류' }], touches: [],
};
const latest: LeadDiag = {
  id: 11, leadId: 5, english: 62, math: 71, interview: 58, takenOn: '2026-09-17', level: 'practice', levelLabel: 'Practice',
  bookId: 2, bookTitle: 'SAT Math Practice 9', note: '어머니 동석', byId: 4, byName: '강민지', at: '2026-09-17T09:00:00+09:00',
};
const LEVELS: LeadDiagList['levels'] = [{ key: 'foundation', label: 'Foundation' }, { key: 'practice', label: 'Practice' }, { key: 'master', label: 'Master' }];
const list = (items: LeadDiag[]): LeadDiagList => ({ leadId: 5, studentId: null, items, levels: LEVELS });
const books = { items: [{ id: 2, code: 'SATM-9', title: 'SAT Math Practice 9' }, { id: 3, code: 'SATR-7', title: 'SAT Reading Drills 7' }], bySub: {} };

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); vi.restoreAllMocks(); });

function setup(lead: Lead, history: LeadDiag[] = []) {
  const get = vi.spyOn(api, 'get').mockImplementation(async (url: string) =>
    ({ data: url === '/books' ? books : url === `/ops/leads/${lead.id}/diag` ? list(history) : {} }) as never);
  const post = vi.spyOn(api, 'post').mockImplementation(async (_url: string, body: unknown) =>
    ({ data: list([{ ...latest, id: 12, ...(body as object) }, ...history]) }) as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const onDone = vi.fn();
  const view = render(<QueryClientProvider client={client}><LeadDiagSection lead={lead} onDone={onDone} /></QueryClientProvider>);
  return { view, get, post, onDone, section: view.getByRole('region', { name: '진단 점수' }) };
}

it('서버가 준 최신 진단(점수 셋 · 레벨 · 교재)을 그대로 그리고, 서랍을 여는 것만으로는 아무것도 묻지 않는다', () => {
  const { section, get } = setup({ ...base, latestDiag: latest });
  const text = (section.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('영어62');
  expect(text).toContain('수학71');
  expect(text).toContain('인터뷰58');
  expect(text).toContain('Practice');
  expect(text).toContain('SAT Math Practice 9');
  expect(text).toContain('본 날 2026-09-17 · 강민지 기록 · 어머니 동석');
  // 규칙은 한 줄로 말한다 — 자동으로 정해지는 것은 없다
  expect(text).toContain('레벨과 교재는 담당자가 고릅니다 — 점수로 자동 판정하거나 배치하지 않습니다.');
  expect(get).not.toHaveBeenCalled();
  // 카드 칩과 같은 모양 — 적지 않은 점수는 「—」
  expect(diagScoresLabel(latest)).toBe('62·71·58');
  expect(diagScoresLabel({ english: 64, math: null, interview: null })).toBe('64·—·—');
});

it('처음 적는 건 — 레벨은 서버 낱말·교재는 서가 그대로 고르고, 사람이 적은 칸만 보낸다(빈 칸·추천값 없음)', async () => {
  const { section, get, post, onDone } = setup(base);
  expect(section.textContent).toContain('아직 적은 진단 점수가 없습니다.');
  fireEvent.click(within(section).getByRole('button', { name: '+ 점수 기록' }));
  // 적을 때만 부른다 — 이력(레벨 낱말)과 교재
  await waitFor(() => expect(get.mock.calls.map((c) => c[0]).sort()).toEqual(['/books', '/ops/leads/5/diag']));
  const level = within(section).getByLabelText('레벨') as HTMLSelectElement;
  await waitFor(() => expect([...level.options].map((o) => o.textContent)).toEqual(['고르지 않음', 'Foundation', 'Practice', 'Master']));
  expect(level.value).toBe('');   // 점수를 적어도 레벨을 고르지 않는다 — 담당자가 고른다
  const book = within(section).getByLabelText('교재') as HTMLSelectElement;
  await waitFor(() => expect([...book.options].map((o) => o.textContent)).toEqual(['고르지 않음', 'SAT Math Practice 9', 'SAT Reading Drills 7']));

  const submit = within(section).getByRole('button', { name: '기록' }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);   // 아무것도 안 적었다
  fireEvent.change(within(section).getByLabelText('영어'), { target: { value: '-1' } });
  expect(within(section).getByText('영어 점수는 0 이상의 정수로 적어 주세요')).toBeTruthy();
  expect(submit.disabled).toBe(true);
  fireEvent.change(within(section).getByLabelText('영어'), { target: { value: '62' } });
  fireEvent.change(within(section).getByLabelText('수학'), { target: { value: '171' } });   // 만점을 지어내지 않는다 — 100 을 넘어도 막지 않는다
  expect(level.value).toBe('');
  fireEvent.change(level, { target: { value: 'practice' } });
  expect(submit.disabled).toBe(false);
  fireEvent.click(submit);
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  expect(post).toHaveBeenCalledWith('/ops/leads/5/diag', { english: 62, math: 171, level: 'practice' });
  await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ leadId: 5 })));
  expect(within(section).queryByRole('button', { name: '기록' })).toBeNull();
});

it('지난 기록이 있으면 그 값을 채워 두고 연다 · 이력은 「이력 보기」를 눌렀을 때 서버 줄 그대로(최근 것이 앞)', async () => {
  const older: LeadDiag = { ...latest, id: 9, english: 48, math: null, interview: null, level: null, levelLabel: null, bookId: null, bookTitle: null, takenOn: null, note: null };
  const { section, get, post } = setup({ ...base, latestDiag: latest }, [latest, older]);
  fireEvent.click(within(section).getByRole('button', { name: '이력 보기' }));
  const rows = await within(section).findAllByRole('listitem');
  expect(rows.map((r) => (r.textContent ?? '').replace(/\s+/g, ' '))).toEqual([
    expect.stringContaining('62·71·58Practice · SAT Math Practice 9본 날 2026-09-17'),
    expect.stringContaining('48·—·—레벨 없음 · 교재 없음'),
  ]);
  expect(get).toHaveBeenCalledWith('/ops/leads/5/diag');
  expect(get).not.toHaveBeenCalledWith('/books');   // 이력만 볼 때는 교재를 부르지 않는다

  fireEvent.click(within(section).getByRole('button', { name: '+ 점수 기록' }));
  expect((within(section).getByLabelText('영어') as HTMLInputElement).value).toBe('62');
  expect((within(section).getByLabelText('본 날 (선택)') as HTMLInputElement).value).toBe('2026-09-17');
  await waitFor(() => expect((within(section).getByLabelText('레벨') as HTMLSelectElement).value).toBe('practice'));
  await waitFor(() => expect((within(section).getByLabelText('교재') as HTMLSelectElement).value).toBe('2'));
  expect((within(section).getByLabelText('메모 (선택)') as HTMLTextAreaElement).value).toBe('');   // 메모는 줄마다 새로
  // 인터뷰만 고쳐 새 줄로 — 보낸 본문은 폼에 있는 칸 그대로(지난 줄은 고치지 않는다)
  fireEvent.change(within(section).getByLabelText('인터뷰'), { target: { value: '75' } });
  fireEvent.click(within(section).getByRole('button', { name: '기록' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/ops/leads/5/diag', { english: 62, math: 71, interview: 75, takenOn: '2026-09-17', level: 'practice', bookId: 2 }));
});
