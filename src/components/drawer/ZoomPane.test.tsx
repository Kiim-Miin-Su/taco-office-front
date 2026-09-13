/** @file-guide
 * 목적: §21 줌 계정 서랍 — 원문의 격자 한 판과 숫자 둘이 화면에 있는가 (C72).
 * 책임/재사용: 실제 ZoomPane/ZoomGrid 를 그대로 그린다. 낱말과 셈을 테스트에 다시 적지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ZoomAccount, ZoomBoard } from '@/api/types';
import { ZoomPane } from './panes';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

afterEach(cleanup);

const LABELS = ['Boarding', 'Consulting', 'TN', 'Study', 'Jkim'];

const rows: ZoomAccount[] = LABELS.map((label, i) => ({
  id: i + 1, label, joinUrl: `https://zoom.us/j/${i + 1}`, active: true, assigned: 3, overlaps: 0,
}));

/** 원문 §21 의 배치 — 다섯 계정 모두 낮에 붉은 칸이 있는데도 「지금 가능」은 5 다 */
const board: ZoomBoard = {
  onDate: '2026-08-21', fromHour: 8, toHour: 21,
  accounts: [],
  rows: LABELS.map((label, i) => ({
    zaccId: i + 1, label,
    slots: Array.from({ length: 14 }, (_, h) => ({ hour: 8 + h, busy: 8 + h === 20 ? 1 : 0 })),
  })),
  nowHour: 12, freeNow: 5, freeLabels: LABELS, fullHours: 1,
};

it('격자는 서버가 준 시간 범위를 그대로 그린다 — 계정 × 08~21', () => {
  const view = render(<ZoomPane rows={rows} board={board} />);
  const heads = [...view.container.querySelectorAll('th')].map((h) => h.textContent);
  expect(heads).toEqual(['계정', ...Array.from({ length: 14 }, (_, i) => String(8 + i).padStart(2, '0'))]);
  LABELS.forEach((l) => expect(view.getAllByText(l).length).toBeGreaterThan(0));
});

it('「지금 가능」과 「만석 시간대」는 서버가 센 값이다 — 화면이 격자를 다시 세지 않는다', () => {
  // 격자에는 붉은 칸이 다섯이지만 화면은 그것을 세지 않는다. 서버가 준 5·1 을 적는다
  const view = render(<ZoomPane rows={rows} board={{ ...board, freeNow: 5, fullHours: 1 }} />);
  const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('지금 가능');
  expect(text).toContain('만석 시간대');
  expect(text).toContain('12시 기준');
});

it('지금 쓸 수 있는 계정은 서버가 준 **이름 그대로**다 — 화면이 고르지 않는다', () => {
  const view = render(<ZoomPane rows={rows} board={{ ...board, freeNow: 2, freeLabels: ['TN', 'Jkim'] }} />);
  const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('지금 쓸 수 있는 계정 — TN · Jkim');
});

it('오늘이 아니면 「지금」 칸을 비운다 — 없는 셈을 지어내지 않는다', () => {
  const view = render(
    <ZoomPane rows={rows} board={{ ...board, nowHour: null, freeNow: 0, freeLabels: [] }} />,
  );
  const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('오늘만 셉니다');
  expect(text).not.toContain('지금 쓸 수 있는 계정');
});

it('머리줄은 켜진 계정 수를 한도로 말한다 — 꺼진 계정은 한도에 들지 않는다', () => {
  const off = [...rows.slice(0, 4), { ...rows[4], active: false }];
  const view = render(<ZoomPane rows={off} board={board} />);
  const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
  // 달력과 같은 날짜 낱말이다 — 이 칸만 ISO 를 쓰지 않는다
  expect(text).toContain('8/21 (금) 기준 · 동시 4개가 한도입니다');
});

it('겹침은 이름만 말한다 — 건수를 두 곳에서 적지 않는다 (D-R22)', () => {
  const bad = [...rows.slice(0, 4), { ...rows[4], overlaps: 2 }];
  const view = render(<ZoomPane rows={bad} board={board} />);
  const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('1개 계정이 같은 시간에 두 수업을 잡고 있습니다');
  expect(text).not.toContain('Jkim · 2건');
});

it('점유를 아직 못 받았으면 격자 자리를 비워 둔다 — 빈 격자를 그리지 않는다', () => {
  const view = render(<ZoomPane rows={rows} loading />);
  expect(view.container.querySelector('table')).toBeNull();
  expect((view.container.textContent ?? '')).toContain('점유를 세는 중입니다');
});
