/** @file-guide
 * 목적: §17 구성원 · 시간대 — 역할 묶음과 각자의 현재 시각 (C73).
 * 책임/재사용: 실제 MembersPane 을 그대로 그린다. 낱말과 인원을 테스트에서 다시 세지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, render, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Member, MemberGroup, TzGroup } from '@/api/types';
import { MembersPane } from './panes';

afterEach(() => { cleanup(); vi.useRealTimers(); });

/** 2026-09-13 14:49 KST = 05:49 UTC — 컷 §17 의 시계와 같은 분이다 */
const FIXED = Date.UTC(2026, 8, 13, 5, 49);
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED); });

const tzGroups: TzGroup[] = [
  { id: 1, name: '서울', tz: 'Asia/Seoul' },
  { id: 2, name: '미국 동부', tz: 'America/New_York' },
  { id: 3, name: '시드니', tz: 'Australia/Sydney' },
];

const who = (id: number, name: string, role: Member['role'], tz: string, extra: Partial<Member> = {}): Member =>
  ({ id, name, email: `${id}@t.kr`, role, title: null, tz, active: true, ...extra });

const groups: MemberGroup[] = [
  {
    role: 'teacher', label: '강사', count: 3,
    members: [
      who(1, 'Kim', 'teacher', 'Asia/Seoul'),
      who(2, 'Rebecca', 'teacher', 'America/New_York'),
      who(3, 'Megan', 'teacher', 'Australia/Sydney'),
    ],
  },
  { role: 'manager', label: '매니저', count: 1, members: [who(4, 'Grace', 'manager', 'Asia/Seoul', { title: '상담 담당' })] },
  { role: 'ceo', label: '대표', count: 1, members: [who(5, '김민선', 'ceo', 'Asia/Seoul')] },
];

const paint = (g: MemberGroup[] = groups) =>
  render(<MembersPane groups={g} tzGroups={tzGroups} tz="Asia/Seoul" />);

/** 사람 목록을 가진 묶음만 본다 — 맨 아래 「시간대 그룹」은 표라서 ul 이 없다 */
const heads = (c: HTMLElement) =>
  [...c.querySelectorAll('section')].filter((s) => s.querySelector('ul'))
    .map((s) => s.querySelector('div')?.textContent ?? '');

it('묶음의 이름도 인원도 서버가 준 것이다 — 화면이 다시 짓거나 세지 않는다', () => {
  const view = paint();
  expect(heads(view.container)).toEqual(['강사3', '매니저1', '대표1']);
});

it('서버가 센 수가 줄 수와 달라도 화면은 서버의 수를 적는다 — 세는 자리는 하나다 (D-R37)', () => {
  // 화면이 몰래 다시 세고 있으면 이 시험이 「2」를 보게 된다
  const view = paint([{ ...groups[0], count: 13 }]);
  expect(heads(view.container)).toEqual(['강사13']);
});

it('줄마다 그 사람이 있는 곳의 지금 시각을 적는다 — 관리자 화면 시각이 아니다', () => {
  const view = paint();
  const at = (name: string) =>
    ([...view.container.querySelectorAll('li')].find((li) => li.textContent?.startsWith(name))?.textContent ?? '');
  // 같은 순간이지만 사람마다 다른 시각이다
  expect(at('Kim')).toContain('14:49');
  expect(at('Rebecca')).toContain('01:49');
  expect(at('Megan')).toContain('15:49');
});

it('시간대는 서버 표의 이름으로 적는다 — 줄에 저장값을 찍지 않는다 (D-R18)', () => {
  const view = paint();
  expect(view.container.textContent).toContain('미국 동부');
  const lis = [...view.container.querySelectorAll('li')].map((li) => li.textContent ?? '').join(' ');
  expect(lis).not.toContain('America/New_York');
});

it('표에 없는 시간대는 감추지 않는다 — 저장값 그대로 보이고 시각은 「—」다', () => {
  const view = paint([{ ...groups[0], count: 1, members: [who(1, 'Kim', 'teacher', 'Mars/Olympus')] }]);
  const li = view.container.querySelector('li')!;
  expect(li.textContent).toContain('Mars/Olympus');
  expect(li.textContent).toContain('—');
});

it('직함은 줄에 적는다 — 컷이 묶음으로 쓰던 자리이고, 우리 저장소는 한 칸뿐이다 (N-41)', () => {
  const view = paint();
  const li = [...view.container.querySelectorAll('li')].find((x) => x.textContent?.startsWith('Grace'))!;
  expect(within(li).getByText('상담 담당')).toBeTruthy();
});

it('그만둔 사람도 목록에 남는다 — 지난 수업이 그 이름을 가리킨다', () => {
  const view = paint([{ ...groups[0], count: 1, members: [who(1, 'Kim', 'teacher', 'Asia/Seoul', { active: false })] }]);
  expect(view.getByText('Kim').className).toContain('line-through');
});

it('없는 단추를 있다고 말하지 않는다 — 서랍에는 시간대를 바꾸는 자리가 없다', () => {
  const view = paint();
  const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('고정');
  expect(text).not.toContain('여기서 바꾼');
  expect(view.queryAllByRole('button')).toHaveLength(0);
});
