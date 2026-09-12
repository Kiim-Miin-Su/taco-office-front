/** @file-guide
 * 목적: 갈래 앞자락이 정말 캐시 키의 앞자락인지 기계로 확인한다 (C48).
 * 책임/재사용: 실제 qk/family/sessionQueryKey 를 그대로 쓴다. 키 모양을 테스트에 다시 적지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { describe, expect, it } from 'vitest';
import { family, qk, sessionQueryKey } from './queries';

/**
 * TanStack Query 는 **앞자락**으로만 거른다. `sessionQueryKey` 가 사용자 id 를 꼬리에
 * 붙이므로, 갈래를 버리겠다고 그 꼬리를 앞자락에 끼워 넣으면 아무것도 안 걸린다 —
 * 오류도 안 나고 화면만 옛 값을 계속 보여 준다. 그래서 기계가 대신 본다.
 */
const startsWith = (key: readonly unknown[], head: readonly unknown[]): boolean =>
  head.every((seg, i) => JSON.stringify(key[i]) === JSON.stringify(seg));

const RANGE = { from: '2026-09-01', to: '2026-09-30' };

/** 인자를 받는 `qk` 마다 **실제 키 한 벌**. 새 키가 늘면 여기에도 한 줄이 늘어야 한다. */
const SAMPLE: Record<string, readonly unknown[]> = {
  occurrences: qk.occurrences({ ...RANGE }),
  reports: qk.reports({ ...RANGE }),
  unwritten: qk.unwritten(3),
  reportDetail: qk.reportDetail(1, '2026-09-01'),
  reportDelivery: qk.reportDelivery('2026-09-12'),
  reportDeliveryHistory: qk.reportDeliveryHistory({ onDate: '2026-09-12' }),
  board: qk.board({ ...RANGE }),
  exec: qk.exec({ ...RANGE }),
  teacherHistory: qk.teacherHistory('2026-09'),
  teacherGuides: qk.teacherGuides(undefined),
  teacherUnav: qk.teacherUnav(undefined),
  gpa: qk.gpa('2026-09-01'),
  zoom: qk.zoom(undefined),
};

describe('갈래 앞자락', () => {
  it('인자를 받는 키는 하나도 빠짐없이 어떤 갈래에 속한다', () => {
    const withArgs = Object.entries(qk).filter(([, v]) => typeof v === 'function').map(([k]) => k);
    expect(Object.keys(SAMPLE).sort()).toEqual(withArgs.sort());
    const heads = Object.values(family);
    for (const [name, key] of Object.entries(SAMPLE)) {
      expect(heads.some((h) => startsWith(key, h)), `${name} 이 어느 갈래에도 안 걸린다`).toBe(true);
    }
  });

  it('사용자 꼬리가 붙어도 앞자락은 그대로 걸린다', () => {
    const heads = Object.values(family);
    for (const [name, key] of Object.entries(SAMPLE)) {
      const full = sessionQueryKey(key, 7);
      expect(heads.some((h) => startsWith(full, h)), `${name}: ${JSON.stringify(full)}`).toBe(true);
    }
  });

  it('앞자락에 사용자 꼬리를 넣으면 아무것도 안 걸린다 — 그래서 넣지 않는다', () => {
    for (const head of Object.values(family)) expect(head).not.toContain('viewer');
    // 예전에 쓰던 모양이 왜 조용히 실패했는지 그대로 보인다
    const broken = sessionQueryKey(['zoom'], 7);
    expect(startsWith(sessionQueryKey(qk.zoom(undefined), 7), broken)).toBe(false);
    expect(startsWith(sessionQueryKey(qk.gpa('2026-09-01'), 7), sessionQueryKey(['gpa'], 7))).toBe(false);
  });

  it('갈래마다 실제로 걸리는 키가 하나는 있다 — 아무 데도 안 쓰는 앞자락은 두지 않는다', () => {
    const keys = Object.values(SAMPLE);
    for (const [name, head] of Object.entries(family)) {
      expect(keys.some((k) => startsWith(k, head)), `${name} 갈래에 걸리는 키가 없다`).toBe(true);
    }
  });
});
