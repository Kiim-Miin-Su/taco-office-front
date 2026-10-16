/** @file-guide
 * 목적: Panel.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Panel } from './Panel';

afterEach(cleanup);

describe('Panel — 머리 오른쪽 슬롯의 좁은 폭 줄바꿈(S5a p7)', () => {
  it('기본은 기존 머리 그대로다 — 오른쪽 슬롯이 줄을 바꾸지 않는다', () => {
    const v = render(<Panel title="코멘트" sub="설명" right={<button type="button">필터</button>}>본문</Panel>);
    const header = v.container.querySelector('header') as HTMLElement;
    expect(header.dataset.wrapRight).toBeUndefined();
    expect(header.className).not.toContain('flex-wrap');
  });

  it('wrapRight 이면 제목 묶음이 먼저 자리를 잡고 넓은 오른쪽 슬롯은 다음 줄로 내려간다', () => {
    const v = render(<Panel title="코멘트 3건" sub="긴 설명" wrapRight right={<button type="button">필터</button>}>본문</Panel>);
    const header = v.container.querySelector('header') as HTMLElement;
    expect(header.dataset.wrapRight).toBe('true');
    expect(header.className).toContain('flex-wrap');
    const titleBox = v.getByRole('heading', { name: '코멘트 3건' }).parentElement as HTMLElement;
    expect(titleBox.className).toContain('min-w-0');
    expect(titleBox.className).toContain('flex-1');
  });
});
