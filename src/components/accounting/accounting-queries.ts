/** @file-guide
 * 목적: accounting-queries.ts — useCashflow, usePayoutDetail (hook)
 * 책임/재사용: 회계 화면 전용 조회 훅. 공용 Axios(`api`)·생성 타입·세션 키 규약(`sessionQueryKey`)을 그대로 쓰고 서버 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * w5 — 1:1 대조 둘째 물결에서 생긴 회계 조회 둘 (§55 들어온 돈 · §56 강사 상세).
 *
 * 원래 자리는 `src/api/queries.ts` 다(키·훅을 한 곳에서 만든다). 이 물결의 파일 범위가 회계 화면이라 여기 두었다.
 * 키는 **`family.accounting` 앞자락 밑**에 둔다 — 입금·발행·확정 같은 회계 쓰기가 그 앞자락을 버리면 이 둘도 같이 다시 읽힌다.
 * 옮길 때는 키 두 줄을 `qk` 로, 훅 몸통은 그대로 옮기면 된다.
 */
'use client';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/api/client';
import { family, sessionQueryKey } from '@/api/queries';
import type { components } from '@/api/schema';
import { useSession } from '@/store/useSession';

type S = components['schemas'];
export type Cashflow = S['CashflowDto'];
export type CashflowDay = S['CashflowDayDto'];
export type CashflowCategory = S['CashflowCategoryDto'];
export type CashflowOpen = S['CashflowOpenDto'];
export type PayoutDetail = S['PayoutDetailDto'];
export type PayoutLesson = S['PayoutLessonDto'];

/** §55 조회 조건 — 기간(없으면 전체)과 분류 칩. 빈 값은 키와 질의에서 뺀다(같은 조건이 두 캐시가 되지 않게) */
export interface CashflowParams { from?: string; to?: string; category?: string }

const clean = (p: CashflowParams): CashflowParams => {
  const out: CashflowParams = {};
  if (p.from) out.from = p.from;
  if (p.to) out.to = p.to;
  if (p.category) out.category = p.category;
  return out;
};

const cashflowKey = (p: CashflowParams) => [...family.accounting, 'cashflow', clean(p)] as const;
const payoutDetailKey = (staffId: number, month: string) => [...family.accounting, 'payouts', 'detail', staffId, month] as const;

/**
 * §55 들어온 돈 — 기간 요약 · 입금 달력 · 분류별 · 미수 전체 (w5 · 55-01 · 55-02 · 55-03 · 55-05).
 * 세는 것도 기간 낱말도 서버다 — 화면은 받은 숫자를 그린다 (D-R37 · D-R18). 그 탭을 열 때만 부른다.
 */
export function useCashflow(params: CashflowParams, enabled = true): UseQueryResult<Cashflow> {
  const viewerId = useSession((s) => s.me?.id ?? 'anonymous');
  return useQuery({
    queryKey: sessionQueryKey(cashflowKey(params), viewerId),
    queryFn: async () => (await api.get<Cashflow>('/accounting/cashflow', { params: clean(params) })).data,
    enabled,
  });
}

/**
 * §56 강사 한 사람 상세 — 시급 · 수업 날짜 · 리포트 미작성 · 정산 내역 (w5 · 56-01).
 * 시트와 같은 함수가 센 값이다 — 줄의 총액과 수업 줄의 합이 갈리지 않는다. 고른 사람이 있을 때만 부른다.
 */
export function usePayoutDetail(staffId: number | null, month: string): UseQueryResult<PayoutDetail> {
  const viewerId = useSession((s) => s.me?.id ?? 'anonymous');
  return useQuery({
    queryKey: sessionQueryKey(payoutDetailKey(staffId ?? 0, month), viewerId),
    queryFn: async () => (await api.get<PayoutDetail>(`/accounting/payouts/${staffId}`, { params: { month } })).data,
    enabled: staffId !== null && /^\d{4}-(0[1-9]|1[0-2])$/.test(month),
  });
}
