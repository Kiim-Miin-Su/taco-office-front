/** @file-guide
 * 목적: QueryState.tsx — QueryState (ui)
 * 책임/재사용: props와 공용 시각 토큰으로 표현한다. 업무 권한·정산 판정, Axios 호출, 서버 캐시를 소유하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 데이터 상태 규약(SKILLS §3) — useQuery 3상태를 화면마다 다시 그리지 않는다.
 * Figma 정본: 공용 컴포넌트 `Query/State` (8583:81338). 세션 만료는 RequireAuth가 처리한다.
 */
'use client';
import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Button } from './Button';

function Skeleton() {
  return (
    <div role="status" aria-label="불러오는 중" className="flex flex-col gap-3 rounded-xl border border-line bg-card p-6">
      <div className="h-4 w-44 rounded-md bg-inset" />
      <div className="h-3 w-full rounded-md bg-inset" />
      <div className="h-3 w-full rounded-md bg-inset" />
      <div className="h-3 w-2/3 rounded-md bg-inset" />
    </div>
  );
}

/** 로딩·오류·빈 상태를 규약대로 그리고, 데이터가 있으면 children(data)을 그린다. */
export function QueryState<T>({ query, empty, isEmpty, children }: {
  query: UseQueryResult<T>;
  /** 빈 상태 문구 — 기본 「표시할 항목이 없습니다」 */
  empty?: string;
  /** 응답이 있어도 「비어 있음」으로 볼 조건 (기본: 배열이면 length 0) */
  isEmpty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <Skeleton />;
  if (query.isError) {
    return (
      <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-line bg-card p-8 text-center">
        <p className="text-base font-bold text-fg">불러오지 못했습니다</p>
        <p className="text-xs text-fg-subtle">네트워크 또는 서버 오류입니다. 잠시 후 다시 시도해 주세요.</p>
        <Button className="mt-2" onClick={() => void query.refetch()}>다시 시도</Button>
      </div>
    );
  }
  const data = query.data as T;
  const blank = isEmpty ? isEmpty(data) : Array.isArray(data) && data.length === 0;
  if (blank) {
    return (
      <div className="flex flex-col items-center gap-1 rounded-xl border border-line bg-card p-8 text-center">
        <p className="text-base font-bold text-fg">표시할 항목이 없습니다</p>
        <p className="text-xs text-fg-subtle">{empty ?? '조건을 바꾸거나 새로 만들어 보세요.'}</p>
      </div>
    );
  }
  return <>{children(data)}</>;
}
