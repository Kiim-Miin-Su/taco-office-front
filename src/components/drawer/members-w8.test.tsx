/** @file-guide
 * 목적: members-w8.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Member, MemberGroup, TzGroup } from '@/api/types';
import { MembersPane } from './panes';

/**
 * W8 — §17 사용자 표 CRUD (대표 지시 2026-09-26 「매니저 이상급부터 user table CRUD」).
 * 단추가 서는지는 줄마다 서버 플래그뿐이다(canEdit · canChangeRole · canResetPassword · canToggleActive · canDelete) —
 * 화면은 role 을 보지 않는다 (D-R39). 넘겨줄 정보(아이디 · 초기 비밀번호)는 서버 응답에서만 온다.
 */
const tzGroups: TzGroup[] = [
  { id: 1, name: '한국 (KST)', tz: 'Asia/Seoul' },
  { id: 2, name: '미국 동부', tz: 'America/New_York' },
];
const ALL = { canEdit: true, canChangeRole: true, canResetPassword: true, canToggleActive: true, canDelete: true };
const NONE = { canEdit: false, canChangeRole: false, canResetPassword: false, canToggleActive: false, canDelete: false };
const who = (id: number, name: string, role: Member['role'], extra: Partial<Member> = {}): Member => ({
  id, name, email: `m${id}@t.kr`, role, title: null, tz: 'Asia/Seoul', active: true, wageRate: null, wageFrom: null, wageable: false,
  mustChangeCredentials: false, phone: null, hiredOn: '2026-03-02', ...NONE, ...extra,
});
const managerView: MemberGroup[] = [
  { role: 'teacher', label: '강사', count: 2, members: [
    who(7, '김재훈', 'teacher', { ...ALL, phone: '01033334444', mustChangeCredentials: true }),
    who(8, '쉬는 강사', 'teacher', { ...ALL, active: false }),
  ] },
  // 자기 줄 — 수정만 선다(역할 · 초기화 · 사용 중지 · 삭제는 서버가 뺐다)
  { role: 'manager', label: '매니저', count: 1, members: [who(3, '김범준', 'manager', { ...NONE, canEdit: true })] },
  // 대표 줄 — 아무것도 서지 않는다
  { role: 'ceo', label: '대표', count: 1, members: [who(1, '김민선', 'ceo')] },
];

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function paint(groups: MemberGroup[] = managerView) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, view: render(<MembersPane groups={groups} tzGroups={tzGroups} tz="Asia/Seoul" canAddMember />, { wrapper: wrap }) };
}
const row = (view: ReturnType<typeof render>, name: string) =>
  [...view.container.querySelectorAll('li')].find((li) => li.textContent?.startsWith(name))!;
const buttons = (li: HTMLElement) => within(li).queryAllByRole('button').map((b) => b.textContent);
const invalidated = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey?: unknown } | undefined)?.queryKey));

describe('§17 사용자 표 CRUD (W8)', () => {
  it('줄 단추는 서버 플래그대로 — 다룰 수 있는 줄은 넷, 자기 줄은 「수정」만, 대표 줄은 없음 · 상태 칩은 「첫 설정 전」·「사용 중지」', () => {
    const { view } = paint();
    expect(buttons(row(view, '김재훈'))).toEqual(['수정', '비밀번호 초기화', '사용 중지', '삭제']);
    expect(buttons(row(view, '쉬는 강사'))).toEqual(['수정', '비밀번호 초기화', '다시 사용', '삭제']);
    expect(buttons(row(view, '김범준'))).toEqual(['수정']);
    expect(buttons(row(view, '김민선'))).toEqual([]);
    expect(row(view, '김재훈').textContent).toContain('첫 설정 전');
    // 활성 줄의 「사용 중지」는 단추 하나뿐이다(칩이 아니다)
    expect(within(row(view, '김재훈')).getAllByText('사용 중지').map((el) => el.tagName)).toEqual(['BUTTON']);
    expect(within(row(view, '쉬는 강사')).getByText('사용 중지')).toBeTruthy();
    expect(row(view, '김범준').textContent).not.toContain('첫 설정 전');
  });

  it('플래그가 없으면(강사가 보는 서랍) 줄 단추가 하나도 없다', () => {
    const { view } = paint([{ role: 'teacher', label: '강사', count: 1, members: [who(7, '김재훈', 'teacher')] }]);
    expect(buttons(row(view, '김재훈'))).toEqual([]);
  });

  it('「수정」은 바뀐 칸만 보내고(이메일은 서버처럼 소문자 비교) · 바뀐 것이 없으면 저장이 잠기며 · 되면 서랍과 /meta 가 다시 읽힌다', async () => {
    const { view, client } = paint();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: who(7, '김재훈', 'manager') } as never);
    fireEvent.click(within(row(view, '김재훈')).getByRole('button', { name: '수정' }));
    const dialog = view.getByRole('dialog');
    const save = within(dialog).getByRole('button', { name: '저장' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect((within(dialog).getByLabelText('휴대폰') as HTMLInputElement).value).toBe('01033334444');
    // 대소문자만 바꾼 이메일은 바뀐 것이 아니다
    fireEvent.change(within(dialog).getByLabelText('이메일'), { target: { value: ' M7@T.KR ' } });
    expect(save.disabled).toBe(true);
    fireEvent.click(within(within(dialog).getByRole('group', { name: '역할' })).getByRole('button', { name: '매니저' }));
    fireEvent.change(within(dialog).getByLabelText('직함'), { target: { value: ' 실장 ' } });
    fireEvent.change(within(dialog).getByLabelText('휴대폰'), { target: { value: '' } });
    fireEvent.click(save);
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/drawer/staff/7', { role: 'manager', title: '실장', phone: '' }));
    await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
    const keys = invalidated(invalidate);
    expect(keys.some((k) => k.startsWith('["drawer"'))).toBe(true);
    expect(keys.some((k) => k.startsWith('["meta"'))).toBe(true);
  });

  it('자기 줄의 「수정」에는 역할 칸이 없고, 서버 거절 문장은 창 안에 남는다', async () => {
    const { view } = paint();
    vi.spyOn(api, 'patch').mockRejectedValue({ response: { status: 409, data: { code: 'STAFF_EMAIL_TAKEN', message: '그 이메일로 이미 구성원이 있습니다' } } });
    fireEvent.click(within(row(view, '김범준')).getByRole('button', { name: '수정' }));
    const dialog = view.getByRole('dialog');
    expect(within(dialog).queryByRole('group', { name: '역할' })).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('이메일'), { target: { value: 'm7@t.kr' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(within(dialog).getByText('그 이메일로 이미 구성원이 있습니다')).toBeTruthy());
    expect(view.getByRole('dialog')).toBeTruthy();
  });

  it('「비밀번호 초기화」는 창에서 한 번 더 누르고, 되면 서버가 준 넘겨줄 정보를 보인다 · 복사가 막힌 브라우저에서도 깨지지 않는다', async () => {
    const { view } = paint();
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { loginId: 'm7@t.kr', initialPassword: 'server-initial-7' } } as never);
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    fireEvent.click(within(row(view, '김재훈')).getByRole('button', { name: '비밀번호 초기화' }));
    const dialog = view.getByRole('dialog');
    // 첫 단계는 확인뿐 — 아직 아무것도 보내지 않았다
    expect(post).not.toHaveBeenCalled();
    expect(dialog.textContent).toContain('지금 로그인된 곳은 끊기고');
    fireEvent.click(within(dialog).getByRole('button', { name: '초기화' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/drawer/staff/7/password-reset', {}));
    const box = await within(dialog).findByRole('region', { name: '넘겨줄 정보' });
    expect(box.textContent).toContain('m7@t.kr');
    expect(box.textContent).toContain('server-initial-7');
    fireEvent.click(within(box).getByRole('button', { name: '복사' }));
    await waitFor(() => expect(within(box).getByRole('status').textContent).toContain('직접 옮겨 적어 주세요'));
  });

  it('복사할 수 있으면 아이디와 초기 비밀번호를 함께 복사한다', async () => {
    const { view } = paint();
    vi.spyOn(api, 'post').mockResolvedValue({ data: { loginId: 'm7@t.kr', initialPassword: 'server-initial-7' } } as never);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    fireEvent.click(within(row(view, '김재훈')).getByRole('button', { name: '비밀번호 초기화' }));
    fireEvent.click(within(view.getByRole('dialog')).getByRole('button', { name: '초기화' }));
    const box = await within(view.getByRole('dialog')).findByRole('region', { name: '넘겨줄 정보' });
    fireEvent.click(within(box).getByRole('button', { name: '복사' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('아이디 m7@t.kr\n초기 비밀번호 server-initial-7'));
    await waitFor(() => expect(within(box).getByRole('status').textContent).toBe('복사했습니다'));
  });

  it('「사용 중지」·「다시 사용」은 확인 뒤 active 한 칸만 보낸다', async () => {
    const { view } = paint();
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: who(7, '김재훈', 'teacher', { active: false }) } as never);
    fireEvent.click(within(row(view, '김재훈')).getByRole('button', { name: '사용 중지' }));
    let dialog = view.getByRole('dialog');
    expect(dialog.textContent).toContain('다음 요청부터 막히고');
    fireEvent.click(within(dialog).getByRole('button', { name: '사용 중지' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/drawer/staff/7/active', { active: false }));
    await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
    fireEvent.click(within(row(view, '쉬는 강사')).getByRole('button', { name: '다시 사용' }));
    dialog = view.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '다시 사용' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/drawer/staff/8/active', { active: true }));
  });

  it('「삭제」가 409 로 막히면 서버 문장(사용 중지 안내)을 창 안에 그대로 보이고 창은 남는다 · 되면 닫힌다', async () => {
    const { view } = paint();
    const del = vi.spyOn(api, 'delete')
      .mockRejectedValueOnce({ response: { status: 409, data: { code: 'STAFF_HAS_RECORDS', message: '기록이 있는 구성원은 지울 수 없습니다 — 사용 중지로 막아 주세요' } } })
      .mockResolvedValueOnce({ data: { ok: true } } as never);
    fireEvent.click(within(row(view, '김재훈')).getByRole('button', { name: '삭제' }));
    const dialog = view.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(within(dialog).getByText('기록이 있는 구성원은 지울 수 없습니다 — 사용 중지로 막아 주세요')).toBeTruthy());
    expect(del).toHaveBeenCalledWith('/drawer/staff/7');
    expect(view.getByRole('dialog')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
    expect(del).toHaveBeenCalledTimes(2);
  });
});
