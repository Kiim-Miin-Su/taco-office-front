/**
 * API 타입 — **생성물에서만 가져온다.**
 *
 * `schema.d.ts` 는 백엔드의 `openapi.json` 에서 만든 것이고, 그 json 은 DTO 에서 나온다.
 * 여기서 `interface MeDto { … }` 를 손으로 다시 적으면 형상이 조용히 어긋난다
 * (docs/contracts/CONTRACTS.md §1 · AGENT.md §2.2).
 *
 * 갱신: `npm run types:gen`
 */
import type { components } from './schema';

type S = components['schemas'];

export type Me = S['MeDto'];
export type LoginBody = S['LoginDto'];
export type LoginResult = S['LoginResultDto'];
export type RefreshResult = S['RefreshResultDto'];

/** 권한 플래그 이름 — 화면이 조건을 적을 때 오타가 나지 않게 */
export type PermName = {
  [K in keyof Me]: Me[K] extends boolean ? K : never;
}[keyof Me];
