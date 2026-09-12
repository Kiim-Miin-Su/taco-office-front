/** @file-guide
 * 목적: §18·§21 서랍 맨 아래 목적지 단추 — 원문에 있던 줄이 제품에도 있는가 (C48).
 * 책임/재사용: 실제 KindsPane/ZoomPane 을 그대로 그린다. 낱말을 테스트에 다시 적지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { KindRow, ZoomAccount } from '@/api/types';
import { KindsPane, ZoomPane } from './panes';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

afterEach(cleanup);

const kinds: KindRow[] = [
  { key: 'class', name: '정규 수업', color: '#7C6A58', cap: 4, grp: 'lesson', grpLabel: '수업', rep: true },
  { key: 'intake', name: '입학 상담', color: '#4A6FA5', cap: 1, grp: 'intake', grpLabel: '상담·진단', rep: false },
];

const zaccs: ZoomAccount[] = [
  { id: 1, label: 'Boarding', joinUrl: 'https://zoom.us/j/1', active: true, assigned: 3, overlaps: 0 },
];

it('§18 서랍은 「프로그램 · 과목 전체 열기」로 목적지를 연다 — 원문의 마지막 줄이다', () => {
  const view = render(<KindsPane kinds={kinds} />);
  const go = view.getByText('프로그램 · 과목 전체 열기').closest('a');
  expect(go?.getAttribute('href')).toBe('/programs');
});

it('§21 서랍은 「줌 계정 관리」로 목적지를 연다', () => {
  const view = render(<ZoomPane rows={zaccs} />);
  const go = view.getByText('줌 계정 관리').closest('a');
  expect(go?.getAttribute('href')).toBe('/zoom');
});

it('묶음 이름은 서버가 준 낱말이다 — 화면이 코드표를 다시 적지 않는다 (D-R18)', () => {
  const view = render(<KindsPane kinds={kinds} />);
  // 원문 §18 의 머리글은 「상담·진단」이다. 화면이 스스로 적던 시절엔 「상담」이었다
  expect(view.getByText('상담·진단')).toBeTruthy();
  expect(view.queryByText('상담')).toBeNull();
  // 코드값은 화면에 나오지 않는다
  const text = view.container.textContent ?? '';
  expect(text).not.toContain('intake');
  expect(text).not.toContain('lesson');
});
