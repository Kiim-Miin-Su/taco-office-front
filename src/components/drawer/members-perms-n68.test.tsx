/** @file-guide
 * 목적: members-perms-n68.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Member, MemberGroup, MemberPerm, TzGroup } from '@/api/types';
import { MembersPane } from './panes';

/**
 * N-68 — 사람별 권한 예외(켬/끔/역할 따름). 칸이 서는지는 서버의 `canEditPerms`(대표 · 자기 줄 아님)뿐이고,
 * 예외 다섯 줄의 이름 · 역할 기본 · 지금 값도 서버가 준 `perms` 그대로다 — 화면은 role 을 보지 않는다(D-R39).
 */
const tzGroups: TzGroup[] = [{ id: 1, name: '한국 (KST)', tz: 'Asia/Seoul' }];
const FLAGS = { canEdit: true, canChangeRole: true, canResetPassword: true, canToggleActive: true, canDelete: true };
const perm = (key: MemberPerm['key'], label: string, override: boolean | null, roleDefault: boolean): MemberPerm => ({
  key, label, override, roleDefault, effective: override ?? roleDefault,
});
const PERMS: MemberPerm[] = [
  perm('canMoney', '회계 권한', false, true),
  perm('canWage', '시급 권한', null, false),
  perm('canApprove', '결재 권한', null, true),
  perm('canHide', '비공개 권한', null, false),
  perm('canGpaPack', '자료 요청 권한', null, true),
];
const who = (id: number, name: string, extra: Partial<Member> = {}): Member => ({
  id, name, loginId: `m${id}`, email: null, role: 'manager', title: null, tz: 'Asia/Seoul', active: true, wageRate: null, wageFrom: null,
  wageable: false, mustChangeCredentials: false, phone: null, hiredOn: '2026-03-02', ...FLAGS, ...extra,
});

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); vi.restoreAllMocks(); });

function paint(members: Member[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const groups: MemberGroup[] = [{ role: 'manager', label: '매니저', count: members.length, members }];
  return render(<MembersPane groups={groups} tzGroups={tzGroups} tz="Asia/Seoul" />, { wrapper: wrap });
}
const row = (view: ReturnType<typeof render>, name: string) =>
  [...view.container.querySelectorAll('li')].find((li) => li.textContent?.startsWith(name))!;
const pressed = (dialog: HTMLElement, label: string) =>
  within(within(dialog).getByRole('group', { name: label })).getAllByRole('button')
    .filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);

describe('§17 사람별 권한 예외 (N-68)', () => {
  it('서버가 canEditPerms 를 주면 수정 창에 다섯 칸이 지금 값으로 서고, 바뀐 칸만 perms 로 보낸다(역할 따름 = null)', async () => {
    const view = paint([who(7, '박매니저', { canEditPerms: true, perms: PERMS })]);
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: who(7, '박매니저') } as never);
    fireEvent.click(within(row(view, '박매니저')).getByRole('button', { name: '수정' }));
    const dialog = view.getByRole('dialog');
    const box = within(dialog).getByRole('group', { name: '사람별 권한 예외' });
    expect(within(box).getAllByRole('group').map((g) => g.getAttribute('aria-label')))
      .toEqual(['회계 권한', '시급 권한', '결재 권한', '비공개 권한', '자료 요청 권한']);
    expect(pressed(dialog, '회계 권한')).toEqual(['끔']);
    expect(pressed(dialog, '시급 권한')).toEqual(['역할 따름']);
    expect(box.textContent).toContain('역할 기본 켬');
    const save = within(dialog).getByRole('button', { name: '저장' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.click(within(within(dialog).getByRole('group', { name: '회계 권한' })).getByRole('button', { name: '역할 따름' }));
    fireEvent.click(within(within(dialog).getByRole('group', { name: '결재 권한' })).getByRole('button', { name: '끔' }));
    expect(save.disabled).toBe(false);
    expect(dialog.textContent).toContain('권한 예외는 저장한 다음 요청부터 박매니저 님에게 적용됩니다.');
    fireEvent.click(save);
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/drawer/staff/7', { perms: { canMoney: null, canApprove: false } }));
  });

  it('처음 값으로 되돌리면 보낼 것이 없다 — 저장이 다시 잠긴다', () => {
    const view = paint([who(7, '박매니저', { canEditPerms: true, perms: PERMS })]);
    fireEvent.click(within(row(view, '박매니저')).getByRole('button', { name: '수정' }));
    const dialog = view.getByRole('dialog');
    const save = within(dialog).getByRole('button', { name: '저장' }) as HTMLButtonElement;
    const hide = within(within(dialog).getByRole('group', { name: '비공개 권한' }));
    fireEvent.click(hide.getByRole('button', { name: '켬' }));
    expect(save.disabled).toBe(false);
    fireEvent.click(hide.getByRole('button', { name: '역할 따름' }));
    expect(save.disabled).toBe(true);
  });

  it('canEditPerms 가 없으면(자기 줄 · 대표가 아닌 보는 이) perms 가 와도 칸이 서지 않는다', () => {
    const view = paint([who(3, '나매니저', { canEditPerms: false, perms: PERMS, canChangeRole: false })]);
    fireEvent.click(within(row(view, '나매니저')).getByRole('button', { name: '수정' }));
    const dialog = view.getByRole('dialog');
    expect(within(dialog).queryByRole('group', { name: '사람별 권한 예외' })).toBeNull();
    expect(within(dialog).queryByRole('group', { name: '회계 권한' })).toBeNull();
  });

  it('줄에는 적힌 예외만 칩으로 선다 — 「역할 따름」은 적지 않는다', () => {
    const view = paint([who(7, '박매니저', { canEditPerms: true, perms: PERMS }), who(8, '최매니저')]);
    expect(within(row(view, '박매니저')).getByText('회계 권한 끔')).toBeTruthy();
    expect(row(view, '박매니저').textContent).not.toContain('시급 권한');
    expect(row(view, '최매니저').textContent).not.toContain('권한');
  });

  it('올릴 수 없는 권한을 켜면 서버의 거절 문장이 창 안에 그대로 남는다', async () => {
    const view = paint([who(7, '박매니저', { canEditPerms: true, perms: PERMS })]);
    vi.spyOn(api, 'patch').mockRejectedValue({
      response: { status: 403, data: { code: 'PERM_GRANT_FORBIDDEN', message: '시급 권한은 지금 내게 없는 권한이라 남에게 켤 수 없습니다' } },
    });
    fireEvent.click(within(row(view, '박매니저')).getByRole('button', { name: '수정' }));
    const dialog = view.getByRole('dialog');
    fireEvent.click(within(within(dialog).getByRole('group', { name: '시급 권한' })).getByRole('button', { name: '켬' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(within(dialog).getByText('시급 권한은 지금 내게 없는 권한이라 남에게 켤 수 없습니다')).toBeTruthy());
  });
});
