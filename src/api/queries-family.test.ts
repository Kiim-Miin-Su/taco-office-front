/** @file-guide
 * 목적: 갈래 앞자락이 정말 캐시 키의 앞자락인지 기계로 확인한다 (C48).
 * 책임/재사용: 실제 qk/family/sessionQueryKey 를 그대로 쓴다. 키 모양을 테스트에 다시 적지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  drawer: qk.drawer(),
};

/** 인자를 안 받는 상수 키 중 갈래 앞자락을 가진 것 — 이것도 「걸리는 키」로 센다 */
const CONST_SAMPLE: readonly (readonly unknown[])[] = [
  qk.horizon, qk.accounting, qk.ops, qk.teacherHome, qk.guides, qk.guideTemplates,
];

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
    const keys = [...Object.values(SAMPLE), ...CONST_SAMPLE];
    for (const [name, head] of Object.entries(family)) {
      expect(keys.some((k) => startsWith(k, head)), `${name} 갈래에 걸리는 키가 없다`).toBe(true);
    }
  });
});

/**
 * 무효화가 **어떤 모양으로 적혀 있는가**를 소스에서 직접 본다.
 *
 * C48 에서 한 번 당했다 — `sessionQueryKey(['zoom'], viewerId)` 는 사용자 꼬리를 앞자락에
 * 끼워 넣어 **아무 키에도 안 걸렸다.** 오류가 안 나고 화면만 옛 값을 보여 줬다.
 * 그래서 표기를 두 가지로만 좁히고, 기계가 그 둘인지 본다.
 *
 *   · `family.X`                        — 갈래 전체를 버린다 (뒤에 무엇이 붙든)
 *   · `sessionQueryKey(qk.Y, viewerId)` — 이 사용자의 **그 키 하나**만 버린다
 *
 * 두 번째는 `qk.Y` 가 **인자를 안 받는 상수**여야 한다. 인자를 받는 키는 뒤에 조각이 더
 * 붙으므로, 그 모양으로 적으면 앞자락이 짧아져 다시 안 걸린다.
 */
describe('무효화 표기', () => {
  const src = readFileSync(join(__dirname, 'queries.ts'), 'utf8');
  const args = [...src.matchAll(/invalidateQueries\(\{\s*queryKey:\s*([^}]+?)\s*\}\)/g)].map((m) => m[1].trim());

  it('무효화는 family 앞자락이거나 정확한 한 키다 — 그 사이는 없다', () => {
    expect(args.length).toBeGreaterThan(20);
    const constKeys = new Set(Object.entries(qk).filter(([, v]) => Array.isArray(v)).map(([k]) => k));
    for (const a of args) {
      const asFamily = /^family\.(\w+)$/.exec(a);
      const asExact = /^sessionQueryKey\(qk\.(\w+),\s*\w+\)$/.exec(a);
      expect(Boolean(asFamily || asExact), `모양이 둘 중 하나가 아니다: ${a}`).toBe(true);
      if (asFamily) {
        expect(Object.keys(family), `family.${asFamily[1]} 가 없다`).toContain(asFamily[1]);
      }
      if (asExact) {
        // 인자를 받는 키를 이 모양으로 적으면 앞자락이 짧아져 아무것도 안 걸린다
        expect(constKeys, `qk.${asExact[1]} 는 인자를 받는다 — family 앞자락을 쓰라`).toContain(asExact[1]);
      }
    }
  });

  it('쓰기 훅은 하나도 빠짐없이 캐시를 버린다', () => {
    /*
     * 함수 본문을 중괄호로 끊으려다 두 번 틀렸다 — 시그니처의 타입 리터럴
     * (`UseMutationResult<T, unknown, { id: number }>`) 이 먼저 열고 닫아서 본문 전에 끝난다.
     * 다음 `export` 앞까지 자르는 편이 단순하고 안 틀린다. 뒤따르는 주석이 딸려 오므로 지운다.
     */
    const starts = [...src.matchAll(/^export (?:function|const) (\w+)/gm)];
    const hooks = starts.map((m, i) => ({
      name: m[1],
      body: src.slice(m.index ?? 0, starts[i + 1]?.index ?? src.length)
        .replace(/\/\*[\s\S]*?\*\//g, ''),
    })).filter((h) => /UseMutationResult/.test(h.body) && /^use[A-Z]/.test(h.name));
    expect(hooks.length).toBeGreaterThan(20);
    const helpers = /function (refreshReportConsumers|reconcileReportError|use\w*Invalidate)/g;
    const helperNames = new Set([...src.matchAll(helpers)].map((m) => m[1]));
    for (const h of hooks) {
      const buries = /invalidateQueries|Invalidate\(\)|invalidate\b/.test(h.body)
        || [...helperNames].some((n) => h.body.includes(n));
      expect(buries, `${h.name} 이 쓰기 뒤에 아무것도 안 버린다`).toBe(true);
    }
  });
});
