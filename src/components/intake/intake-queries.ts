/** @file-guide
 * 목적: intake-queries.ts — useSaveLeadPlan, useExtendLeadHold, useSaveLeadAppt, useDeleteLeadAppt, useScheduleLeadAppts (hook)
 * 책임/재사용: 상담 화면 전용 쓰기 훅. 공용 Axios(`api`)·생성 타입·`family` 무효화를 그대로 쓰고 서버 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * wave 3 · g3 — 상담 카드의 배치안 초안 · 보류 연장 · 2차/진단 일정 쓰기 넷 (23-15 · 23-16).
 *
 * 원래 자리는 `src/api/queries.ts` 다(쿼리 키·훅을 한 곳에서 만든다). 이 물결의 파일 범위가 상담 화면이라
 * 운영 화면의 `components/ops/ops-queries.ts` 와 같은 방식으로 여기 두었다 — 옮길 때는 **몸통을 그대로** 옮기면 된다.
 * 응답은 상담 한 줄(LeadDto) 이지만 카드·머리 수·경고가 같이 바뀌므로 `family.ops` 앞자락을 통째로 버린다(다른 상담 쓰기와 같은 규약).
 */
'use client';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { api } from '@/api/client';
import { family } from '@/api/queries';
import type { components } from '@/api/schema';

type S = components['schemas'];
export type Lead = S['LeadDto'];
export type LeadPlanLine = S['LeadPlanLineDto'];
export type LeadAppt = S['LeadApptDto'];
export type LeadPlanWrite = S['LeadPlanWriteDto'];
export type LeadApptWrite = S['LeadApptWriteDto'];
export type LeadApptScheduleResult = S['LeadApptScheduleResultDto'];

function useInvalidateOps() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: family.ops });
}

/** 배치안 통째로 바꾸기 — 빈 배열이면 비운다. 단가는 보내지 않는다(단가표가 정본 · 서버가 붙인다) */
export function useSaveLeadPlan(): UseMutationResult<Lead, unknown, { id: number } & LeadPlanWrite> {
  const invalidate = useInvalidateOps();
  return useMutation({
    mutationFn: async ({ id, ...body }) => (await api.put<Lead>(`/ops/leads/${id}/plan`, body)).data,
    onSettled: invalidate,
  });
}

/** 「연장 +2일」 — 새 재확인 날짜는 서버가 센다 */
export function useExtendLeadHold(): UseMutationResult<Lead, unknown, { id: number }> {
  const invalidate = useInvalidateOps();
  return useMutation({
    mutationFn: async ({ id }) => (await api.post<Lead>(`/ops/leads/${id}/hold/extend`)).data,
    onSettled: invalidate,
  });
}

/** 2차 · 진단 일정 한 줄 — 같은 종류를 다시 보내면 고쳐 적는다 */
export function useSaveLeadAppt(): UseMutationResult<Lead, unknown, { id: number } & LeadApptWrite> {
  const invalidate = useInvalidateOps();
  return useMutation({
    mutationFn: async ({ id, ...body }) => (await api.put<Lead>(`/ops/leads/${id}/appts`, body)).data,
    onSettled: invalidate,
  });
}

/**
 * 일정 한 줄 지우기 (23-15 · impl3-w8) — 아직 시간표에 없는 줄만 서버가 지운다.
 * 시간표에 만든 줄은 서버가 409 문장으로 막는다(회차는 시간표가 정본) — 화면이 그 판정을 다시 하지 않는다.
 */
export function useDeleteLeadAppt(): UseMutationResult<Lead, unknown, { id: number; kind: LeadAppt['kind'] }> {
  const invalidate = useInvalidateOps();
  return useMutation({
    mutationFn: async ({ id, kind }) => (await api.delete<Lead>(`/ops/leads/${id}/appts/${kind}`)).data,
    onSettled: invalidate,
  });
}

/** 「스케줄에 N건 만들기」 — 시간표에 회차가 생기므로 시간표 갈래도 버린다 */
export function useScheduleLeadAppts(): UseMutationResult<LeadApptScheduleResult, unknown, { id: number }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }) => (await api.post<LeadApptScheduleResult>(`/ops/leads/${id}/appts/schedule`)).data,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: family.ops });
      void qc.invalidateQueries({ queryKey: family.occurrences });
      void qc.invalidateQueries({ queryKey: family.horizon });
      // 상담 일정이 시간표 회차(SER)가 된다 — §07 사이드바의 일정 원본 수도
      void qc.invalidateQueries({ queryKey: family.seriesCounts });
    },
  });
}
