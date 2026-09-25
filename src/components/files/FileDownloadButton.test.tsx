/** @file-guide
 * 목적: 공용 FileDownloadButton — 기본 「… 열기」 단추 그대로 · §39-5·§41-3 원문의 작은 「SE」「TE」 배지 변형 (wave 6).
 * 책임/재사용: 실제 컴포넌트를 렌더하고 공용 downloadFile 만 대역으로 바꾼다. 권한·파일 판정은 서버 몫이라 여기서 보지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FileDownloadButton } from './FileDownloadButton';

const download = vi.hoisted(() => vi.fn<(id: number, name: string) => Promise<void>>());
vi.mock('@/lib/download-file', () => ({ downloadFile: download }));

beforeEach(() => { download.mockReset().mockResolvedValue(undefined); });
afterEach(() => { cleanup(); });

it('기본 모양은 그대로다 — 「SE 열기」 단추 · 없으면 「SE 없음」 칩 (계약서·서명본 화면이 쓰는 모양)', async () => {
  const view = render(<FileDownloadButton id={7} label="SE" />);
  const button = view.getByRole('button', { name: 'SE 열기' });
  expect(button.getAttribute('title')).toBe('SE 파일 내려받기');
  fireEvent.click(button);
  await waitFor(() => expect(download).toHaveBeenCalledWith(7, 'SE.bin'));
  cleanup();
  const missing = render(<FileDownloadButton id={null} label="TE" />);
  expect(missing.getByText('TE 없음')).toBeTruthy();
  expect(missing.queryByRole('button')).toBeNull();
});

it('§39-5 · §41-3 배지 변형 — 글자는 「SE」 하나, 이름은 「{제목} SE 내려받기」, 누르면 같은 공용 함수로 내려받는다', async () => {
  const view = render(<FileDownloadButton id={3} label="SE" variant="badge" itemTitle="Numbers That Climb" />);
  const badge = view.getByRole('button', { name: 'Numbers That Climb SE 내려받기' });
  expect(badge.textContent).toBe('SE');
  expect(badge.getAttribute('data-file-badge')).toBe('SE');
  fireEvent.click(badge);
  await waitFor(() => expect(download).toHaveBeenCalledWith(3, 'SE.bin'));
});

it('배지 변형의 TE 는 보라 톤이고, 파일이 없으면 누를 수 없는 「TE 없음」이다', () => {
  const view = render(<FileDownloadButton id={4} label="TE" variant="badge" tone="violet" itemTitle="SAT Reading" />);
  const badge = view.getByRole('button', { name: 'SAT Reading TE 내려받기' });
  expect(badge.className).toContain('bg-violet');
  cleanup();
  const missing = render(<FileDownloadButton id={null} label="TE" variant="badge" tone="violet" itemTitle="SAT Reading" />);
  expect(missing.queryByRole('button')).toBeNull();
  expect(missing.getByText('TE 없음')).toBeTruthy();
});

it('배지 변형도 내려받기에 실패하면 서버 문장을 옆에 적는다', async () => {
  download.mockRejectedValueOnce(new Error('파일을 찾을 수 없습니다'));
  const view = render(<FileDownloadButton id={9} label="SE" variant="badge" itemTitle="Vocab 3000" />);
  fireEvent.click(view.getByRole('button', { name: 'Vocab 3000 SE 내려받기' }));
  expect(await view.findByRole('status')).toBeTruthy();
});
