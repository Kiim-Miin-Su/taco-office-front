/** @file-guide
 * 목적: §67 카드 처리 창 — 바뀐 칸만 보내고 「담당이 있어야」「결과가 있어야」는 서버 문장이다 (C93 · J-101).
 * 책임/재사용: 실제 ComplaintDetail/usePatchComplaint/useMeta 를 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Complaint } from '@/api/types';
import { ComplaintDetail } from './ComplaintDetail';

const meta = {
  kinds: [], subs: [], staff: [{ id: 4, name: '강민지', role: 'coord', canAdminPage: true, canGpaPack: false, title: null }],
  rooms: [], students: [], zaccs: [], invTypes: [], cancelReasons: [], cancelTreats: [],
};
const stages = [
  { key: 'received', label: '접수', sub: '받았습니다 · 담당을 정해야 합니다' },
  { key: 'acting', label: '대응', sub: '연락하고 조치하는 중입니다' },
  { key: 'closed', label: '결과', sub: '마무리했습니다' },
];
const severities = [{ key: 'light', label: '가벼움' }, { key: 'normal', label: '보통' }, { key: 'severe', label: '심각' }];
const complaint: Complaint = {
  id: 2, area: 'teacher', areaLabel: '선생님', studentId: 5, studentName: '고은설', stage: 'received', body: '수업 시작이 10분씩 늦습니다',
  action: null, result: null, createdAt: '2026-09-17', ageDays: 1, ownerId: null, ownerName: null, dueOn: '2026-09-16', overdueDays: 2,
  severity: 'severe', severityLabel: '심각', teacherChanged: false,
};

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const patched: Array<{ url?: string; body: unknown }> = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; patched.length = 0; });

function setup(onPatch: (n: number) => { status: number; data: unknown }) {
  let n = 0;
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'patch') {
      patched.push({ url: config.url, body: JSON.parse(config.data ?? '{}') });
      const r = onPatch(++n);
      if (r.status >= 400) return Promise.reject(Object.assign(new Error('fail'), { response: { status: r.status, data: r.data } }));
      return { config, status: r.status, statusText: 'OK', headers: {}, data: r.data };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: config.url === '/meta' ? meta : {} };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const onClose = vi.fn();
  const onTeacherChange = vi.fn();
  const onWithdraw = vi.fn();
  const view = render(<QueryClientProvider client={client}><ComplaintDetail complaint={complaint} stages={stages} severities={severities} onClose={onClose} onTeacherChange={onTeacherChange} onWithdraw={onWithdraw} /></QueryClientProvider>);
  return { view, onClose, onTeacherChange, onWithdraw };
}

it('심각도·기한 지남·단계 한 줄은 서버 낱말이고, 바뀐 칸만 보내며, 담당 없이 대응은 서버가 거절한 문장을 그대로 띄운다 (J-101 · J-98)', async () => {
  const { view, onClose, onTeacherChange, onWithdraw } = setup((n) => (n === 1
    ? { status: 409, data: { code: 'CPL_OWNER_REQUIRED', message: '대응으로 옮기려면 담당을 정해야 합니다 (§67 「담당을 정해야 합니다」)' } }
    : { status: 200, data: { ...complaint, stage: 'acting', ownerName: '강민지' } }));
  const dialog = await view.findByRole('dialog', { name: '컴플레인 — 고은설 · 선생님' });
  const text = (dialog.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('심각');
  expect(text).toContain('기한 2일 지남');
  expect(text).toContain('받았습니다 · 담당을 정해야 합니다');
  const save = within(dialog).getByRole('button', { name: '저장' }) as HTMLButtonElement;
  expect(save.disabled).toBe(true); // 바뀐 것이 없다
  fireEvent.click(within(within(dialog).getByRole('group', { name: '단계' })).getByRole('button', { name: '대응' }));
  expect(text.includes('연락하고 조치하는 중입니다')).toBe(false);
  expect((dialog.textContent ?? '')).toContain('연락하고 조치하는 중입니다');
  fireEvent.click(save);
  await waitFor(() => expect(patched).toHaveLength(1));
  expect(patched[0]).toEqual({ url: '/ops/complaints/2', body: { stage: 'acting' } });
  await waitFor(() => expect(view.getByText(/담당을 정해야 합니다 \(§67/)).toBeTruthy());
  expect(onClose).not.toHaveBeenCalled();
  // 담당을 정하고 조치를 적으면 그 둘만 더 보낸다
  await waitFor(() => expect(within(dialog).getByRole('option', { name: '강민지' })).toBeTruthy());
  fireEvent.change(within(dialog).getByLabelText('담당'), { target: { value: '4' } });
  fireEvent.change(within(dialog).getByLabelText('조치'), { target: { value: ' 통화 완료 ' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
  await waitFor(() => expect(patched).toHaveLength(2));
  expect(patched[1]!.body).toEqual({ stage: 'acting', ownerId: 4, action: '통화 완료' });
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  fireEvent.click(within(dialog).getByRole('button', { name: '강사 교체' }));
  expect(onTeacherChange).toHaveBeenCalledWith(expect.objectContaining({ id: 2, studentId: 5 }));
  // J-99 — 학생이 있는 건에는 「수강 종료 · 환불」 입구가 선다 (C94-c 창 · 사유에 컴플레인)
  fireEvent.click(within(dialog).getByRole('button', { name: '수강 종료 · 환불' }));
  expect(onWithdraw).toHaveBeenCalledWith(expect.objectContaining({ id: 2, studentId: 5 }));
});
