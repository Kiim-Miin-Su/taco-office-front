/** @file-guide
 * 목적: §16 알림 칸 — 분류 칩·날짜 묶음·전부 읽음·보관 안내 회귀 (D9 · N-7 · D-16 · C38).
 * 책임/재사용: 실제 NotisPane 을 쓰고 서버 판정(분류·색)은 props 로 받은 값만 그린다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Noti } from '@/api/types';
import { addDays, todayKst } from '@/lib/calendar';
import { NotisPane } from './panes';

afterEach(cleanup);

const today = `${todayKst()}T12:00:00+09:00`;
const yesterday = `${addDays(todayKst(), -1)}T12:00:00+09:00`;

const ME = 1;
const notis: Noti[] = [
  { id: 1, toId: ME, body: '4시간 이상 미작성 16건', link: '/reports/unwritten', read: false, at: today, tone: 'warn', category: 'report_due', categoryLabel: '작성 독촉', fromName: 'Grace' },
  { id: 2, toId: 9, body: 'MAP Reading 리포트 독촉', link: '/reports/unwritten', read: false, at: today, tone: 'warn', category: 'report_due', categoryLabel: '작성 독촉', fromName: null },
  { id: 3, toId: ME, body: '시험 준비 자료 기록 승인', link: '/reports/9', read: true, at: yesterday, tone: 'ok', category: 'report', categoryLabel: '리포트', fromName: 'Hoon' },
];

function setup(over: Partial<Parameters<typeof NotisPane>[0]> = {}) {
  const props: Parameters<typeof NotisPane>[0] = {
    notis,
    categories: [
      { key: 'report_due', label: '작성 독촉', count: 2 },
      { key: 're_alarm', label: '재알람', count: 0 },
      { key: 'report', label: '리포트', count: 1 },
      { key: 'schedule', label: '일정 변경', count: 0 },
      { key: 'request', label: '요청 처리', count: 0 },
      { key: 'etc', label: '알림', count: 0 },
    ],
    meId: ME, windowDays: 30, olderCount: 4, busy: false,
    onRead: vi.fn(), onReadAll: vi.fn(), onWiden: vi.fn(), widened: false,
    ...over,
  };
  return { props, view: render(<NotisPane {...props} />) };
}

it('분류 칩은 서버가 준 라벨로 만들어지고 누르면 그 분류만 남는다 (§16)', () => {
  const { view } = setup();
  expect(view.getByRole('button', { name: '전체 3' })).toBeTruthy();
  expect(view.getByRole('button', { name: '안 읽음 2' })).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: '리포트 1' }));
  expect(view.container.textContent).toContain('시험 준비 자료 기록 승인');
  expect(view.container.textContent).not.toContain('4시간 이상 미작성');
});

it('오늘·어제로 묶는다', () => {
  const { view } = setup();
  expect(view.container.textContent).toContain('오늘');
  expect(view.container.textContent).toContain('어제');
});

it('예전 알림은 지운 것이 아니라 접어 둔 것이라고 말한다 (N-7 · D-16)', () => {
  const { props, view } = setup();
  expect(view.container.textContent).toContain('최근 30일만 보입니다');
  expect(view.container.textContent).toContain('지운 것이 아니라');
  fireEvent.click(view.getByRole('button', { name: '예전 알림 4건도 보기' }));
  expect(props.onWiden).toHaveBeenCalledWith(true);
});

/**
 * 원문 M-126 「내게 온 것」 — 관리자·대표는 남의 알림도 보는 화면이라, 줄마다 「남의 알림」이라
 * 적어 두기만 하고 골라 볼 길이 없었다. 판정은 읽음 단추가 이미 쓰는 것과 같은 것이어야 한다.
 */
it('내게 온 것만 골라 볼 수 있다 — 남의 알림은 빠진다 (M-126)', () => {
  const { view } = setup();
  const chip = view.getByRole('button', { name: '내게 온 것 2' });
  fireEvent.click(chip);
  expect(chip.getAttribute('aria-pressed')).toBe('true');
  expect(view.container.textContent).toContain('4시간 이상 미작성 16건');
  expect(view.container.textContent).toContain('시험 준비 자료 기록 승인');
  expect(view.container.textContent).not.toContain('MAP Reading 리포트 독촉');
});

/**
 * 원문 M-127 「읽음 처리된다」 — 여는 것과 읽음이 따로 놀아, 눌러서 그 화면까지 가 놓고도
 * 수신함에는 안 읽음으로 남아 있었다. 남의 알림은 서버가 거절하므로 부르지 않는다.
 */
it('열기 ›를 누르면 읽음도 함께 보낸다 — 남의 알림은 부르지 않는다 (M-127)', () => {
  const { props, view } = setup();
  const links = view.getAllByRole('link', { name: '열기 ›' });
  fireEvent.click(links[0]);
  expect(props.onRead).toHaveBeenCalledWith(1);
  // 두 번째 줄은 남의 알림이다 — 눌러도 읽음을 보내지 않는다 (호출은 여전히 한 번뿐)
  fireEvent.click(links[1]);
  expect(props.onRead).toHaveBeenCalledTimes(1);
});

it('남의 알림은 읽음 단추가 없다 — 서버가 어차피 거절한다 (관리자는 남의 것도 본다)', () => {
  const { view } = setup();
  expect(view.getAllByRole('button', { name: '읽음' })).toHaveLength(1);
  expect(view.container.textContent).toContain('남의 알림');
  expect(view.container.textContent).toContain('내게 온 것 1건');
});

it('전부 읽음은 안 읽은 것이 있을 때만 눌린다', () => {
  const { props, view } = setup();
  fireEvent.click(view.getByRole('button', { name: '전부 읽음으로 표시' }));
  expect(props.onReadAll).toHaveBeenCalledTimes(1);
  cleanup();

  const allRead = setup({ notis: notis.map((n) => ({ ...n, read: true })) });
  expect(allRead.view.getByRole('button', { name: '전부 읽음으로 표시' }).hasAttribute('disabled')).toBe(true);
  expect(allRead.view.container.textContent).toContain('읽지 않은 알림이 없습니다');
});

/*
 * g2 대조 16-1 · 16-2 · 16-4 — 원문 카드: 분류 아이콘 타일 · **굵은 제목** · 상세 한 줄 · 메타(분류 · 보낸 이 · 역할 · 시각)
 * · 안 읽음 점. 제목은 서버의 title 이고, 없는 옛 알림은 본문이 굵은 한 줄이 된다.
 */
it('카드는 아이콘 타일 · 굵은 제목 · 상세 · 메타(분류 · 보낸 이 · 역할 · 시각)로 선다', () => {
  const { view } = setup({
    notis: [
      { ...notis[0]!, title: 'MAP Reading 리포트 독촉', body: '08-18 16:30 종료 후 65시간 경과', fromName: 'Allissa', fromRoleLabel: '강사', at: `${todayKst()}T09:12:00+09:00` },
      { ...notis[2]!, title: null },
    ],
  });
  const [titled, old] = view.getAllByRole('listitem');
  const title = within(titled!).getByText('MAP Reading 리포트 독촉');
  expect(title.className).toContain('font-bold');
  expect(within(titled!).getByText('08-18 16:30 종료 후 65시간 경과')).toBeTruthy();
  expect(titled!.textContent).toContain('작성 독촉 · Allissa · 강사 · 09:12');
  expect(titled!.querySelector('svg')).toBeTruthy();
  // 안 읽은 것도 바탕은 흰색이다 — 파란 틴트가 아니라 오른쪽 점 하나다
  expect(titled!.className).toContain('bg-card');
  expect(titled!.className).not.toContain('bg-blue');
  // 제목이 없는 옛 알림은 본문이 굵은 한 줄이다 — 본문을 잘라 제목을 짓지 않는다
  expect(within(old!).getByText('시험 준비 자료 기록 승인').className).toContain('font-bold');
});

it('안 읽음 점을 누르면 읽음이 된다 — 「전부 읽음으로 표시」는 전폭 단추다', () => {
  const { props, view } = setup();
  fireEvent.click(view.getByRole('button', { name: '읽음' }));
  expect(props.onRead).toHaveBeenCalledWith(1);
  expect(view.getByRole('button', { name: '전부 읽음으로 표시' }).className).toContain('w-full');
});

/* g2 대조 16-3 — 분류 칩 앞에 카드 타일과 같은 색 점 */
it('분류 칩 앞에 색 점이 서고 전체·안 읽음에는 없다', () => {
  const { view } = setup();
  expect(view.getByRole('button', { name: '전체 3' }).querySelector('span[aria-hidden]')).toBeNull();
  expect(view.getByRole('button', { name: '작성 독촉 2' }).querySelector('span[aria-hidden]')?.className).toContain('bg-red');
  expect(view.getByRole('button', { name: '리포트 1' }).querySelector('span[aria-hidden]')?.className).toContain('bg-green');
});
