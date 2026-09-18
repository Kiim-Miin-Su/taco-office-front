/** @file-guide
 * 목적: 갈래 앞자락이 정말 캐시 키의 앞자락인지 기계로 확인한다 (C48).
 * 책임/재사용: 실제 qk/family/sessionQueryKey 를 그대로 쓴다. 키 모양을 테스트에 다시 적지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AxiosAdapter } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { api } from './client';
import { family, qk, sessionQueryKey, useCreateBookIssue, useCreateBookPack, useWriteGuideBody } from './queries';

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
  guideHistory: qk.guideHistory({ span: 'month', anchor: '2026-09-01' }),
  tracking: qk.tracking(3, '2026-09-11'),
  // §65 보고서 키는 `ops` 갈래 안에 산다 — 기획 결재가 운영 목록을 함께 바꾸기 때문이다 (C56)
  plan: qk.plan(3),
  meeting: qk.meeting(4),
  tuition: qk.tuition('2026-09'),
  // §57 의 날짜 눈금이 키에 든다 — 눈금을 바꾸면 다른 답이 온다 (C70 · N-40)
  otherIncome: qk.otherIncome('month'),
  // §57 강사료 시트 — 달이 키에 든다. 확정이 회계 갈래를 버리면 시트도 함께 다시 온다 (C94-b)
  payoutSheet: qk.payoutSheet('2026-08'),
  consultingDetail: qk.consultingDetail(7),
};

/** 인자를 안 받는 상수 키 중 갈래 앞자락을 가진 것 — 이것도 「걸리는 키」로 센다 */
const CONST_SAMPLE: readonly (readonly unknown[])[] = [
  qk.horizon,
  qk.accounting,
  qk.ops,
  qk.teacherHome,
  qk.guides,
  qk.guideStudents,
  qk.guideHistoryRoot,
  qk.guideTemplates,
  qk.books,
  qk.bookHistory,
  qk.bookTracking,
  qk.bookPacks,
  // §28 회계 — `consulting` 갈래 안에 산다. 납부 한 줄이 단계 보드까지 흔든다 (C58)
  qk.consulting,
  qk.consAccounting,
  qk.consStudents,
  // §52 트래킹 보드 — 회계 갈래 안에 산다 (C69)
  qk.invBoard,
];

describe('갈래 앞자락', () => {
  it('인자를 받는 키는 하나도 빠짐없이 어떤 갈래에 속한다', () => {
    const withArgs = Object.entries(qk)
      .filter(([, v]) => typeof v === 'function')
      .map(([k]) => k);
    expect(Object.keys(SAMPLE).sort()).toEqual(withArgs.sort());
    const heads = Object.values(family);
    for (const [name, key] of Object.entries(SAMPLE)) {
      expect(
        heads.some((h) => startsWith(key, h)),
        `${name} 이 어느 갈래에도 안 걸린다`,
      ).toBe(true);
    }
  });

  it('사용자 꼬리가 붙어도 앞자락은 그대로 걸린다', () => {
    const heads = Object.values(family);
    for (const [name, key] of Object.entries(SAMPLE)) {
      const full = sessionQueryKey(key, 7);
      expect(
        heads.some((h) => startsWith(full, h)),
        `${name}: ${JSON.stringify(full)}`,
      ).toBe(true);
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
      expect(
        keys.some((k) => startsWith(k, head)),
        `${name} 갈래에 걸리는 키가 없다`,
      ).toBe(true);
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
    const constKeys = new Set(
      Object.entries(qk)
        .filter(([, v]) => Array.isArray(v))
        .map(([k]) => k),
    );
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
    const hooks = starts
      .map((m, i) => ({
        name: m[1],
        body: src.slice(m.index ?? 0, starts[i + 1]?.index ?? src.length).replace(/\/\*[\s\S]*?\*\//g, ''),
      }))
      .filter((h) => /UseMutationResult/.test(h.body) && /^use[A-Z]/.test(h.name));
    expect(hooks.length).toBeGreaterThan(20);
    const helpers = /function (refreshReportConsumers|reconcileReportError|use\w*Invalidate)/g;
    const helperNames = new Set([...src.matchAll(helpers)].map((m) => m[1]));
    for (const h of hooks) {
      const buries =
        /invalidateQueries|Invalidate\(\)|invalidate\b/.test(h.body) || [...helperNames].some((n) => h.body.includes(n));
      expect(buries, `${h.name} 이 쓰기 뒤에 아무것도 안 버린다`).toBe(true);
    }
  });
});

/**
 * C56 에서 실제로 겪은 것 — **기획 결재가 보고서를 다시 읽지 않았다.**
 *
 * `sessionQueryKey` 는 사용자 id 를 키의 **꼬리**가 아니라 **가운데**에 끼운다
 * (`['ops','viewer',7]`). 그래서 `['ops','plan',3,'viewer',7]` 은 그 앞자락에 안 걸린다.
 * 갈래 전체를 버릴 때는 **사용자 꼬리 없는 `family.X`** 를 써야 한다 (C48).
 */
describe('C56 — 기획 보고서 키가 무효화에 실제로 걸리는가', () => {
  const VIEWER = 7;
  const plan = sessionQueryKey(qk.plan(3), VIEWER);
  const list = sessionQueryKey(qk.ops, VIEWER);

  it('사용자 꼬리가 낀 ops 앞자락으로는 보고서가 안 걸린다 — 이것이 그 버그였다', () => {
    expect(startsWith(plan, list)).toBe(false);
  });

  it('family.ops 로는 목록과 보고서가 함께 걸린다', () => {
    expect(startsWith(plan, family.ops)).toBe(true);
    expect(startsWith(list, family.ops)).toBe(true);
  });

  it('기획 결재 훅은 family.ops 를 쓴다 — 소스에서 직접 본다', () => {
    const src = readFileSync(join(__dirname, 'queries.ts'), 'utf8');
    const body = src.slice(src.indexOf('function useOpsFamilyInvalidate'), src.indexOf('export function useMeetingDetail'));
    expect(body).toContain('queryKey: family.ops');
    // §66 회의 쓰기도 같은 앞자락을 쓴다 — 창을 열어 둔 채 저장해도 화면이 따라온다 (C57)
    for (const hook of ['useDecidePlanDue', 'useReviewPlan', 'useWriteMinutes', 'useAssignMeetingTask']) {
      const h = src.slice(src.indexOf(`export function ${hook}`));
      expect(h.slice(0, 400)).toContain('useOpsFamilyInvalidate()');
    }
  });
});

describe('C77 — 교재 쓰기의 교차 갈래 무효화', () => {
  const src = readFileSync(join(__dirname, 'queries.ts'), 'utf8');
  const hookBody = (name: string) => {
    const start = src.indexOf(`export function ${name}`);
    const end = src.indexOf('\nexport function ', start + 1);
    return src.slice(start, end < 0 ? src.length : end);
  };

  it('학생 교재 상태 변경은 현황판도 다시 읽는다', () => {
    for (const hook of ['useCreateBookIssue', 'useTransitionBookIssue', 'useReturnBookIssue']) {
      expect(hookBody(hook), hook).toContain('useBooksInvalidate({ board: true })');
    }
  });

  it('자료 전달 변경은 서랍 할 일도 다시 읽는다', () => {
    for (const hook of ['useCreateBookPack', 'usePatchBookPack', 'useDeliverBookPack', 'useReceiveBookPack']) {
      expect(hookBody(hook), hook).toContain('useBooksInvalidate({ drawer: true })');
    }
  });

  it('안내 작성 결과가 남긴 교재 이력도 다시 읽는다', () => {
    const body = src.slice(src.indexOf('function useGuidesInvalidate'), src.indexOf('export function useCreateGuideTemplate'));
    expect(body).toContain('queryKey: family.guides');
    expect(body).toContain('queryKey: family.books');
    expect(hookBody('useWriteGuideBody')).toContain('useGuidesInvalidate({ books: true })');
  });
});

describe('C77 — 실제 mutation의 query cache 무효화', () => {
  const run = async <TVariables,>(
    hook: () => { mutateAsync: (body: TVariables) => Promise<unknown> },
    body: TVariables,
  ) => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const original = api.defaults.adapter;
    const adapter: AxiosAdapter = async (config) => ({
      config,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: {},
    });
    api.defaults.adapter = adapter;
    const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
    try {
      const { result } = renderHook(hook, { wrapper });
      await act(() => result.current.mutateAsync(body));
      return invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    } finally {
      api.defaults.adapter = original;
      client.clear();
    }
  };

  it('배부 쓰기는 books와 board를 함께 버린다', async () => {
    const keys = await run(useCreateBookIssue, { studentId: 3, libId: 4, state: 'ok' });
    expect(keys).toEqual(expect.arrayContaining([family.books, family.board]));
  });

  it('자료 전달 쓰기는 books와 drawer를 함께 버린다', async () => {
    const keys = await run(useCreateBookPack, {
      packType: 'exam',
      title: '자료',
      effectiveOn: '2026-09-14',
      coordinatorId: 3,
      studentIds: [4],
      libIds: [5],
    });
    expect(keys).toEqual(expect.arrayContaining([family.books, family.drawer]));
  });

  it('안내 작성은 guides와 books를 함께 버린다', async () => {
    const keys = await run(useWriteGuideBody, { id: 8, body: '안내' });
    expect(keys).toEqual(expect.arrayContaining([family.guides, family.books]));
  });
});
