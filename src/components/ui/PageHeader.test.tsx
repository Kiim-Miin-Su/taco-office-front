/** @file-guide
 * 목적: PageHeader.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';

afterEach(cleanup);

describe('PageHeader — 가운데 슬롯(26-01) · 두 색 부제(82-3)', () => {
  it('기본은 제목·부제·오른쪽 그대로다 — 가운데 자리가 생기지 않는다', () => {
    const v = render(<PageHeader title="컨설팅" sub="단계 보드" right={<button type="button">+ 시작</button>} />);
    expect(v.getByRole('heading', { name: '컨설팅' })).toBeTruthy();
    expect(v.getByText('단계 보드').tagName).toBe('P');
    expect(v.container.querySelector('[data-page-header-center]')).toBeNull();
  });

  it('center 는 제목과 같은 줄(같은 묶음) 안에 선다', () => {
    const v = render(<PageHeader title="컨설팅" center={<nav aria-label="탭">탭 카드</nav>} />);
    const slot = v.container.querySelector('[data-page-header-center]') as HTMLElement;
    expect(slot.textContent).toBe('탭 카드');
    expect(slot.parentElement?.contains(v.getByRole('heading', { name: '컨설팅' }))).toBe(true);
  });

  it('sub 는 노드도 받는다 — 뒤 낱말만 붉게', () => {
    const v = render(<PageHeader title="GPA 포인트" sub={<>4주 사이클 · <span className="text-red">학부모 비공개</span></>} />);
    expect(v.getByText('학부모 비공개').className).toBe('text-red');
  });
});
