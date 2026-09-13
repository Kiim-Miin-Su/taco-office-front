/** @file-guide
 * 목적: StatusBadge.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { StatusBadge } from './StatusBadge';

afterEach(cleanup);

/**
 * 컷 §47 의 상태 칸은 **「미작성」**이다. 우리는 「안 씀」이라 적고 있었다.
 * 탭 이름 「안 쓴 리포트」는 컷에도 그대로 있으므로 **서로 다른 자리의 서로 다른 낱말**이다.
 */
it('리포트를 안 썼을 때의 낱말은 컷의 「미작성」이다', () => {
  const v = render(<StatusBadge state="none" />);
  expect(v.getByText('미작성')).toBeTruthy();
  expect(v.queryByText('안 씀')).toBeNull();
});

it('나머지 상태 낱말은 그대로다 — 한 배지에서만 고치지 않는다', () => {
  for (const [state, word] of [['plan', '예정'], ['draft', '작성 중'], ['wait', '승인 대기'], ['ok', '승인'], ['rej', '반려']]) {
    cleanup();
    expect(render(<StatusBadge state={state} />).getByText(word)).toBeTruthy();
  }
});
