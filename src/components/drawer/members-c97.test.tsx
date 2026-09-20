/** @file-guide
 * 목적: members-c97.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Member, MemberGroup, TzGroup, WageHistory } from '@/api/types';
import { MembersPane } from './panes';

/**
 * C97 — §17 「+ 구성원」 · 강사 줄의 시급 · 「시급 수정」 (테스트 시나리오 D-41 · D-48 · I-8).
 * 단추가 서는지는 서버 플래그(canAddMember · canWage · member.wageable)뿐이다 — 화면은 role 을 보지 않는다 (D-R39).
 */
const tzGroups: TzGroup[] = [
  { id: 1, name: '한국 (KST)', tz: 'Asia/Seoul' },
  { id: 2, name: '미국 동부', tz: 'America/New_York' },
];
const who = (id: number, name: string, role: Member['role'], extra: Partial<Member> = {}): Member =>
  ({ id, name, email: `${id}@t.kr`, role, title: null, tz: 'Asia/Seoul', active: true, wageRate: null, wageFrom: null, wageable: false, ...extra });
const groups: MemberGroup[] = [
  { role: 'teacher', label: '강사', count: 2, members: [
    who(7, '김재훈', 'teacher', { wageRate: 40000, wageFrom: '2026-01-01', wageable: true }),
    who(8, '새 강사', 'teacher', { wageable: true }),
  ] },
  { role: 'manager', label: '매니저', count: 1, members: [who(3, '김범준', 'manager')] },
];

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); vi.restoreAllMocks(); });

function paint(flags: { canAddMember?: boolean; canWage?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, view: render(<MembersPane groups={groups} tzGroups={tzGroups} tz="Asia/Seoul" canAddMember={flags.canAddMember} canWage={flags.canWage} />, { wrapper: wrap }) };
}
const row = (view: ReturnType<typeof render>, name: string) =>
  [...view.container.querySelectorAll('li')].find((li) => li.textContent?.startsWith(name))!;

describe('§17 구성원 (C97)', () => {
  it('플래그가 없으면 「+ 구성원」도 시급도 「시급 수정」도 없다 — 강사가 보는 서랍', () => {
    const { view } = paint();
    expect(view.queryByRole('button', { name: '+ 구성원' })).toBeNull();
    expect(view.queryByRole('button', { name: '시급 수정' })).toBeNull();
    expect(view.container.textContent).not.toContain('시급');
  });

  it('canWage 면 wageable 인 줄에만 시급과 「시급 수정」이 서고, 줄이 없는 강사는 「시급 없음」이라 적지 않는다 — 매니저 줄에는 없다', () => {
    const { view } = paint({ canWage: true });
    expect(row(view, '김재훈').textContent).toContain('시급 40,000원 · 2026-01-01 부터');
    expect(within(row(view, '김재훈')).getByRole('button', { name: '시급 수정' })).toBeTruthy();
    expect(row(view, '새 강사').textContent).not.toContain('시급 없음');
    expect(within(row(view, '새 강사')).getByRole('button', { name: '시급 수정' })).toBeTruthy();
    expect(within(row(view, '김범준')).queryByRole('button', { name: '시급 수정' })).toBeNull();
    expect(view.queryByRole('button', { name: '+ 구성원' })).toBeNull();
  });

  it('「+ 구성원」은 강사·매니저만 고를 수 있고, 이름·이메일·8자 비밀번호가 있어야 서며, 시간대는 서랍의 그룹 낱말 그대로 보낸다 (D-41)', async () => {
    const { view, client } = paint({ canAddMember: true, canWage: true });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: who(9, '박수진', 'teacher', { wageRate: 42000, wageFrom: '2026-09-19', wageable: true }) } as never);
    fireEvent.click(view.getByRole('button', { name: '+ 구성원' }));
    const dialog = view.getByRole('dialog');
    const roles = within(dialog).getByRole('group', { name: '역할' });
    expect([...roles.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['강사', '매니저']);
    const make = within(dialog).getByRole('button', { name: '만들기' }) as HTMLButtonElement;
    expect(make.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('이름'), { target: { value: ' 박수진 ' } });
    fireEvent.change(within(dialog).getByLabelText('이메일'), { target: { value: 'Park@t.kr' } });
    fireEvent.change(within(dialog).getByLabelText('첫 비밀번호'), { target: { value: 'short' } });
    expect(make.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('첫 비밀번호'), { target: { value: 'park-1234!' } });
    expect(make.disabled).toBe(false);
    fireEvent.change(within(dialog).getByLabelText('시간대'), { target: { value: 'America/New_York' } });
    fireEvent.change(within(dialog).getByLabelText('직함'), { target: { value: '영어' } });
    fireEvent.change(within(dialog).getByLabelText('입사일'), { target: { value: '2026-08-20' } });
    fireEvent.change(within(dialog).getByLabelText('기본 시급 (선택)'), { target: { value: '42000' } });
    fireEvent.click(make);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/drawer/staff', {
      name: '박수진', email: 'Park@t.kr', password: 'park-1234!', role: 'teacher', hiredOn: '2026-08-20', title: '영어', tz: 'America/New_York', wageRate: 42000,
    }));
    await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
    // 서랍과 /meta(담당·강사 고르기)가 새 사람을 알아야 한다
    const keys = invalidate.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys.some((k) => k.startsWith('["drawer"'))).toBe(true);
    expect(keys.some((k) => k.startsWith('["meta"'))).toBe(true);
  });

  it('시급을 다룰 권한이 없으면 「+ 구성원」 창에 시급 칸이 아예 없다 — 만들기는 그대로다 (S4)', async () => {
    const { view } = paint({ canAddMember: true, canWage: false });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: who(9, '박수진', 'teacher') } as never);
    fireEvent.click(view.getByRole('button', { name: '+ 구성원' }));
    const dialog = view.getByRole('dialog');
    // 예외가 걸린 매니저에게는 이 칸이 서면 안 된다 — 서버도 403 WAGE_SET_FORBIDDEN 으로 같은 질문을 한다
    expect(within(dialog).queryByLabelText('기본 시급 (선택)')).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('이름'), { target: { value: '박수진' } });
    fireEvent.change(within(dialog).getByLabelText('이메일'), { target: { value: 'park2@t.kr' } });
    fireEvent.change(within(dialog).getByLabelText('첫 비밀번호'), { target: { value: 'park-1234!' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '만들기' }));
    // 보내는 본문에 wageRate 가 없다 — 만드는 것 자체는 막지 않는다
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(Object.keys(post.mock.calls[0]![1] as object)).not.toContain('wageRate');
  });

  it('거절은 서버 문장 그대로 창 안에 남고 창은 닫히지 않는다 — 같은 이메일 409', async () => {
    const { view } = paint({ canAddMember: true });
    vi.spyOn(api, 'post').mockRejectedValue({ response: { status: 409, data: { code: 'STAFF_EMAIL_TAKEN', message: '이미 그 이메일로 로그인하는 사람이 있습니다' } } });
    fireEvent.click(view.getByRole('button', { name: '+ 구성원' }));
    const dialog = view.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('이름'), { target: { value: '중복' } });
    fireEvent.change(within(dialog).getByLabelText('이메일'), { target: { value: 't02@t.kr' } });
    fireEvent.change(within(dialog).getByLabelText('첫 비밀번호'), { target: { value: 'another-pw-1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '만들기' }));
    await waitFor(() => expect(within(dialog).getByText('이미 그 이메일로 로그인하는 사람이 있습니다')).toBeTruthy());
    expect(view.getByRole('dialog')).toBeTruthy();
  });

  it('「시급 수정」 창은 이력을 서버 순서 그대로(「지금」 줄은 서버가 가른다) 보이고, 새 줄은 사람·시급·날짜·사유를 보낸다 (D-48)', async () => {
    const { view, client } = paint({ canWage: true });
    const history: WageHistory = { staffId: 7, staffName: '김재훈', rows: [
      { id: 3, staffId: 7, staffName: '김재훈', rate: 47000, fromDate: '2026-09-26', reason: null, approvedByName: '김범준', current: false, createdAt: '2026-09-19T10:00:00+09:00' },
      { id: 2, staffId: 7, staffName: '김재훈', rate: 45000, fromDate: '2026-09-19', reason: '연봉 협상', approvedByName: '김범준', current: true, createdAt: '2026-09-19T09:00:00+09:00' },
      { id: 1, staffId: 7, staffName: '김재훈', rate: 40000, fromDate: '2026-01-01', reason: '입사', approvedByName: null, current: false, createdAt: '2026-01-01T09:00:00+09:00' },
    ] };
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: history } as never);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: history.rows[1] } as never);
    fireEvent.click(within(row(view, '김재훈')).getByRole('button', { name: '시급 수정' }));
    const dialog = view.getByRole('dialog');
    expect(dialog.textContent).toContain('김재훈 · 시급');
    expect(dialog.textContent).toContain('지금 시급 40,000원 · 2026-01-01 부터');
    await waitFor(() => expect(get).toHaveBeenCalledWith('/accounting/wages', { params: { staffId: 7 } }));
    await waitFor(() => expect(within(dialog).getAllByRole('row')).toHaveLength(4));
    const cells = within(dialog).getAllByRole('row').slice(1).map((r) => r.textContent);
    expect(cells[0]).toContain('2026-09-26');
    expect(cells[0]).toContain('47,000원');
    expect(cells[0]).not.toContain('지금');
    expect(cells[1]).toContain('지금');
    expect(cells[1]).toContain('연봉 협상');
    expect(cells[2]).toContain('입사');
    const write = within(dialog).getByRole('button', { name: '새 줄 적기' }) as HTMLButtonElement;
    expect(write.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('새 시급'), { target: { value: '45000' } });
    fireEvent.change(within(dialog).getByLabelText('언제부터'), { target: { value: '2026-09-19' } });
    fireEvent.change(within(dialog).getByLabelText('사유 (선택)'), { target: { value: ' 연봉 협상 ' } });
    fireEvent.click(write);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/accounting/wages', { staffId: 7, rate: 45000, fromDate: '2026-09-19', reason: '연봉 협상' }));
    await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
    // 정산 시트(회계)·강사 홈·히스토리·서랍이 같이 바뀐다 — 지난달 시트는 서버가 그대로 준다 (I-8)
    const keys = invalidate.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    for (const head of ['["drawer"', '["accounting"', '["teacher","home"', '["teacher","history"']) {
      expect(keys.some((k) => k.startsWith(head))).toBe(true);
    }
  });

  it('소급·같은 날 두 번은 서버의 409 문장이 창에 남는다', async () => {
    const { view } = paint({ canWage: true });
    vi.spyOn(api, 'get').mockResolvedValue({ data: { staffId: 7, staffName: '김재훈', rows: [] } } as never);
    vi.spyOn(api, 'post').mockRejectedValue({ response: { status: 409, data: { code: 'WAGE_SAME_DAY', message: '2026-09-19 부터 적용된 시급이 이미 있습니다' } } });
    fireEvent.click(within(row(view, '김재훈')).getByRole('button', { name: '시급 수정' }));
    const dialog = view.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('새 시급'), { target: { value: '46000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '새 줄 적기' }));
    await waitFor(() => expect(within(dialog).getByText(/2026-09-19 부터 적용된 시급이 이미 있습니다/)).toBeTruthy());
    expect(view.getByRole('dialog')).toBeTruthy();
  });
});
