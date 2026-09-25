/** @file-guide
 * 목적: ops-queries.ts — useAddPlanTask (hook)
 * 책임/재사용: 운영 화면 전용 쓰기 훅. 공용 Axios(`api`)·생성 타입·`family.ops` 무효화를 그대로 쓰고 서버 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * w5 — 1:1 대조 둘째 물결에서 생긴 운영 쓰기 경로 하나.
 *
 * 원래 자리는 `src/api/queries.ts` 다(쿼리 키·훅을 한 곳에서 만든다). 이 물결의 파일 범위가 운영 화면이라
 * 여기 두었고, 옮길 때는 **몸통을 그대로** 옮기면 된다 — 키를 새로 만들지 않고 `family.ops` 앞자락만 버린다.
 */
'use client';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { api } from '@/api/client';
import { family } from '@/api/queries';
import type { components } from '@/api/schema';

type PlanDetail = components['schemas']['PlanDetailDto'];
type PlanTaskCreate = components['schemas']['PlanTaskCreateDto'];

/**
 * §65 「+ 대표 지시」 (w5 · g6 65-4) — 과제(TODO) 한 줄 · 담당 알림 · 감사 줄이 서버에서 한 트랜잭션이다.
 *
 * 응답은 **보고서 전체**다 — 「과제 N/M」을 화면이 한 줄 붙여 다시 세지 않는다 (D-R37).
 * 성공하면 `family.ops` 전체를 버린다 — 보고서(`['ops','plan',id,…]`)·§61 카드의 「과제 N/M」·§62 기한 표·§64 할 일이
 * 전부 그 앞자락 밑에 있다(사용자 꼬리가 가운데 끼는 키라 `sessionQueryKey(qk.ops)` 로는 보고서가 안 걸린다 · C56).
 */
export function useAddPlanTask(): UseMutationResult<PlanDetail, unknown, { id: number } & PlanTaskCreate> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }) => (await api.post<PlanDetail>(`/ops/plans/${id}/tasks`, body)).data,
    onSettled: () => qc.invalidateQueries({ queryKey: family.ops }),
  });
}
