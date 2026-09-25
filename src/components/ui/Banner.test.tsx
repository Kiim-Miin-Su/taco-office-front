/** @file-guide
 * 목적: Banner.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Banner } from './Banner';

afterEach(cleanup);

describe('Banner — 제목 · 점 목록(§86 알림 상자 86-4)', () => {
  it('기본은 한 줄 글자 띠 그대로다 — 제목·목록 없음', () => {
    const v = render(<Banner tone="info">규칙 한 줄</Banner>);
    expect(v.getByText('규칙 한 줄').className).toContain('bg-blue/5');
    expect(v.container.querySelector('p')).toBeNull();
    expect(v.container.querySelector('ul')).toBeNull();
  });

  it('title 은 톤 색 굵은 제목, items 는 점 목록이다', () => {
    const v = render(<Banner tone="danger" title="⛔ 2곳이 겹칩니다" items={['08-21 16:00 MAP Reading', '08-22 10:00 Writing']} />);
    const title = v.getByText('⛔ 2곳이 겹칩니다');
    expect(title.className).toContain('text-red');
    expect(title.className).toContain('font-bold');
    const list = v.getByRole('list');
    expect(list.className).toContain('list-disc');
    expect(v.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['08-21 16:00 MAP Reading', '08-22 10:00 Writing']);
  });
});
