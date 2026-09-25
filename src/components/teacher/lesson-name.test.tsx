/** @file-guide
 * 목적: lesson-name.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useLessonName } from './lesson-name';

const meta = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock('@/api/queries', () => ({ useMeta: () => meta }));

it('수업 이름은 제목 → 과목 → 종류 이름 순이고, 코드값은 어떤 경우에도 찍지 않는다 (QA 0925)', () => {
  meta.data = { subs: [{ key: 'map-read', name: 'MAP Reading' }], kinds: [{ key: 'class', name: '수업' }, { key: 'meeting', name: '회의' }] };
  const { result } = renderHook(() => useLessonName());
  expect(result.current({ title: '주간 운영 회의', subKey: 'map-read', kindKey: 'meeting' })).toBe('주간 운영 회의');
  expect(result.current({ title: null, subKey: 'map-read', kindKey: 'class' })).toBe('MAP Reading');
  expect(result.current({ title: null, subKey: null, kindKey: 'meeting' })).toBe('회의');
  // 표에 없는 키·코드표를 아직 못 받음 — 코드 대신 「수업」
  expect(result.current({ title: null, subKey: 'ghost-sub', kindKey: 'ghost-kind' })).toBe('수업');
  meta.data = undefined;
  const { result: cold } = renderHook(() => useLessonName());
  expect(cold.current({ subKey: 'map-read', kindKey: 'class' })).toBe('수업');
});
