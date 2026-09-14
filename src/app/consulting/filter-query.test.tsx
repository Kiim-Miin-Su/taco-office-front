/** @file-guide
 * 목적: filter-query.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Consulting } from '@/api/types';
import ConsultingPage from './page';

vi.mock('@/store/useSession', () => ({
  useSession: (select: (state: { me: { id: number; canMoney: boolean } }) => unknown) => select({ me: { id: 17, canMoney: false } }),
  useCan: () => false,
}));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));

describe('실제 useConsulting 연결', () => {
  it('네 필터 왕복이 기존 사용자별 캐시 하나를 소비하고 GET을 추가하지 않는다', async () => {
    const row: Consulting = { id: 1, stage: 'contract', consType: 'future_type', studentNames: ['필터 학생'], createdAt: '2026-09-11', share: 'all', canOpen: true, sessionsLog: [], items: [] };
    const get = vi.spyOn(api, 'get').mockImplementation(async (url: string) => (
      url === '/consulting/accounting'
        ? { data: { items: [], totalAmount: 0, totalPaid: 0, totalDue: 0, canSeeAmounts: false } }
        : { data: { items: [row], canSeeAmounts: false } }
    ) as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><ConsultingPage /></QueryClientProvider>);
    try {
      await view.findByRole('button', { name: '전체 1' });
      for (const name of ['계약 1', '진행 0', '종료 0', '전체 1']) {
        await act(async () => { fireEvent.click(view.getByRole('button', { name })); });
        expect(view.getByRole('button', { name, pressed: true })).toBeTruthy();
      }
      // 회계 capability가 없으므로 §26 목록만 부른다. 비활성 탭은 요청을 만들지 않는다.
      // 지켜야 할 것은 **필터를 눌러도 그 수가 안 는다**는 것이다.
      const urls = get.mock.calls.map(([u]) => u).sort();
      expect(urls).toEqual(['/consulting']);
      // §27 학생별은 그 탭을 열기 전에는 **부르지 않는다** — 캐시에 자리만 있고 GET 은 0 이다
      expect(urls).not.toContain('/consulting/students');
      // 목록 + 비활성 회계/학생/meta observer 네 개이며 실제 GET은 위 목록 하나뿐이다.
      expect(client.getQueryCache().getAll()).toHaveLength(4);
      expect(view.getByRole('button', { name: '필터 학생 컨설팅 상세' })).toBeTruthy();
    } finally { view.unmount(); client.clear(); get.mockRestore(); }
  });
});
