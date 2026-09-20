/** @file-guide
 * 목적: §48 발송 이력의 「다시 보내기」 — 단추가 서는지도 막힌 이유도 서버가 정한다 (S5 · D-R39).
 * 책임/재사용: 실제 ReportDeliveryHistory/Query hook 을 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 이 줄의 단추에는 **조건이 아예 없었다** — 보존 파일이 0장인 줄에서도 서 있었고 누르면 409
 * `REPORT_DELIVERY_FILES_MISSING` 였다. 게다가 목록의 `fileCount` 는 **첨부 줄 전부**를 세고
 * 재발송은 **파일이 남아 있는 줄**만 세어, 화면의 「파일 2장 보관」과 실제로 다시 보낼 수 있는
 * 것이 갈렸다. 이제 둘 다 같은 것을 센다.
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { api } from '@/api/client';
import type { ReportSendHistory } from '@/api/types';
import { ReportDeliveryHistory } from './ReportDeliveryHistory';

const row = (over: Partial<ReportSendHistory> = {}): ReportSendHistory => ({
  id: 11, sourceSendId: null, studentId: 5, studentName: '고은설', onDate: '2026-09-18',
  repIds: [7], channel: 'blob', fileCount: 2, canResend: true, resendBlockedReason: null,
  sentAt: '2026-09-18T09:00:00+09:00', sentBy: 2, sentByName: '김민수', ...over,
});

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const posted: string[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; posted.length = 0; });

function setup(items: ReportSendHistory[]) {
  api.defaults.adapter = (async (config: { url?: string; method?: string }) => {
    if ((config.method ?? 'get').toLowerCase() === 'post') {
      posted.push(config.url ?? '');
      return { config, status: 201, statusText: 'OK', headers: {}, data: { item: items[0] } };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: { total: items.length, items } };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><ReportDeliveryHistory /></QueryClientProvider>);
}

it('보존 파일이 있는 줄에서만 「다시 보내기」가 눌린다 — 판정은 서버의 canResend 하나다 (S5)', async () => {
  const view = setup([row()]);
  await waitFor(() => expect(view.getAllByRole('button', { name: '다시 보내기' }).length).toBeGreaterThan(0));
  // 좁은 화면과 표가 같은 줄을 두 모양으로 그린다 — 두 자리가 **같은 값**을 봐야 한다
  const buttons = view.getAllByRole('button', { name: '다시 보내기' }) as HTMLButtonElement[];
  expect(buttons.every((b) => b.disabled === false)).toBe(true);
  fireEvent.click(buttons[0]!);
  await waitFor(() => expect(posted).toEqual(['/reports/deliveries/11/resend']));
});

it('파일이 한 장도 안 남았으면 단추가 닫히고 서버가 준 이유를 그대로 단다 — 전에는 눌러야 409 였다 (S5)', async () => {
  const view = setup([row({
    fileCount: 0, canResend: false,
    resendBlockedReason: '보존된 파일이 없어 다시 보낼 수 없습니다',
  })]);
  await waitFor(() => expect(view.getAllByRole('button', { name: '다시 보내기' }).length).toBeGreaterThan(0));
  const buttons = view.getAllByRole('button', { name: '다시 보내기' }) as HTMLButtonElement[];
  expect(buttons.every((b) => b.disabled)).toBe(true);
  expect(buttons.every((b) => b.getAttribute('title') === '보존된 파일이 없어 다시 보낼 수 없습니다')).toBe(true);
  fireEvent.click(buttons[0]!);
  // 눌러도 아무것도 안 나간다 — 막힌 것은 단추이지 문구가 아니다
  await Promise.resolve();
  expect(posted).toHaveLength(0);
  // 줄이 세는 파일 수도 재발송이 세는 것과 같은 것이다
  expect(view.container.textContent).toContain('파일 0장 보관');
});

it('재발송 줄은 원본을 가리키고 파일을 그대로 보관한다고 적는다 (§48)', async () => {
  const view = setup([row({ id: 12, sourceSendId: 11, fileCount: 2 })]);
  await waitFor(() => expect(view.container.textContent).toContain('다시 보냄 · 파일 2장 그대로'));
});
