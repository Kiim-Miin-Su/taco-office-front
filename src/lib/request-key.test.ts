/** @file-guide
 * 목적: 요청 키 규약(N-132) — 같은 내용은 같은 키 · 고치면 새 키 · 성공(reset) 뒤 새 키.
 * 책임/재사용: 실제 useRequestKey 를 renderHook 으로 부른다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useRequestKey } from './request-key';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

it('같은 내용은 같은 키 · 내용이 바뀌면 새 키 · reset 뒤에는 같은 내용도 새 키', () => {
  const { result, rerender } = renderHook(() => useRequestKey());
  const a = result.current.keyFor({ invId: 9, amount: 120000 });
  expect(a).toMatch(UUID);
  rerender();
  expect(result.current.keyFor({ invId: 9, amount: 120000 })).toBe(a);
  const b = result.current.keyFor({ invId: 9, amount: 100000 });
  expect(b).not.toBe(a);
  result.current.reset();
  expect(result.current.keyFor({ invId: 9, amount: 100000 })).not.toBe(b);
});
