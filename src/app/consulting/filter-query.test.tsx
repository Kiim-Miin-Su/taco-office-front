import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Consulting } from '@/api/types';
import ConsultingPage from './page';

vi.mock('@/store/useSession', () => ({ useSession: (select: (state: { me: { id: number } }) => unknown) => select({ me: { id: 17 } }) }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));

describe('실제 useConsulting 연결', () => {
  it('네 필터 왕복이 기존 사용자별 캐시 하나를 소비하고 GET을 추가하지 않는다', async () => {
    const row: Consulting = { id: 1, stage: 'contract', consType: 'future_type', studentNames: ['필터 학생'], createdAt: '2026-09-11', share: 'all', canOpen: true, sessionsLog: [] };
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { items: [row], canSeeAmounts: false } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><ConsultingPage /></QueryClientProvider>);
    try {
      await view.findByRole('button', { name: '전체 1' });
      for (const name of ['계약 1', '진행 0', '종료 0', '전체 1']) {
        await act(async () => { fireEvent.click(view.getByRole('button', { name })); });
        expect(view.getByRole('button', { name, pressed: true })).toBeTruthy();
      }
      expect(get).toHaveBeenCalledTimes(1);
      expect(get).toHaveBeenCalledWith('/consulting');
      expect(client.getQueryCache().getAll()).toHaveLength(1);
      expect(view.getByRole('button', { name: '필터 학생 컨설팅 상세' })).toBeTruthy();
    } finally { view.unmount(); client.clear(); get.mockRestore(); }
  });
});
