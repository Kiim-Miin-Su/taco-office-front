/** @file-guide
 * 목적: 명세서 공용 할 일 바가 서버 순서·합계·이동 경로를 변형 없이 표시하는지 검증한다.
 * 책임/재사용: WorkSummaryBar의 표현 계약만 검증하고 DB 집계는 백엔드 테스트에 맡긴다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { Drawer } from '@/api/types';
import { WorkSummaryBar } from './WorkSummaryBar';

const summary: Drawer['workSummary'] = {
  total: 16,
  now: 6,
  items: [
    { key: 'schedule', label: '스케줄', count: 1, go: '/schedule' },
    { key: 'consulting', label: '상담', count: 3, go: '/consulting' },
    { key: 'accounting', label: '회계', count: 4, go: '/accounting' },
    { key: 'books', label: '교재', count: 2, go: '/books' },
    { key: 'guides', label: '수업 안내', count: 3, go: '/guides' },
    { key: 'zoom', label: '줌 계정', count: 3, go: '/zoom' },
  ],
};

const luminance = (color: number[]) =>
  color.reduce((sum, channel, index) => {
    const value = channel / 255;
    const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);

const contrast = (foreground: number[], background: number[]) => {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
};

it('서버 요약을 명세서 순서로 표시하고 펼친 항목은 각 도메인으로 이동한다', () => {
  const view = render(<WorkSummaryBar summary={summary} />);
  expect(view.getByText('할 일 16건')).toBeTruthy();
  expect(view.getByText('지금 6')).toBeTruthy();
  expect(view.getByRole('link', { name: '교재 2건' }).getAttribute('href')).toBe('/books');
  expect(view.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(summary.items.map((item) => item.go));
});

it('0건의 보조 글자도 red 바탕에서 WCAG 작은 글자 대비 4.5 이상이다', () => {
  const zero = { ...summary, items: summary.items.map((item) => (item.key === 'books' ? { ...item, count: 0 } : item)) };
  const view = render(<WorkSummaryBar summary={zero} />);
  expect(view.getByRole('link', { name: '교재 0건' }).classList.contains('text-white/80')).toBe(true);
  const red = [142, 74, 69]; // --red: #8E4A45
  const white80 = [255, 255, 255].map((channel, index) => channel * 0.8 + red[index] * 0.2);
  expect(contrast(white80, red)).toBeGreaterThanOrEqual(4.5);
});
