# taco_office_front

TACO ERP 화면 — **Next.js 15 · CSS Modules + Tailwind · Vercel**

> 정본: [`docs/spec/DEV-SPEC.md`](../taco-office/docs/spec/DEV-SPEC.md) (개발 명세서 v2 · 화면 70컷)
> 스택: [`docs/contracts/STACK.md`](../taco-office/docs/contracts/STACK.md)

**백엔드와는 독립 레포다** (D-R42). 공유하는 것은 코드가 아니라 `openapi.json` 한 장이다.

---

## 시작

```bash
cp .env.local.example .env.local
npm install
npm run types:gen     # 백엔드 openapi.json → src/api/schema.d.ts
npm run dev           # http://localhost:3000
```

## 스타일 — 두 벌이 되지 않게 그은 선 (D-R41)

대표 결정: *"스타일: 전역 - CSS Modules, 컴포넌트 - tailwind"*

| 무엇 | 어디에 |
|---|---|
| **색 · 치수 토큰** | `src/styles/tokens.css` **한 곳** |
| 전역 · 레이아웃 | `*.module.css` (캘린더 그리드 · 분할 뷰 · 사이드바 · 인쇄) |
| 컴포넌트 낱개 | Tailwind 유틸리티 |
| 색을 런타임에 주입 | `style={{ background: kindVar(k) }}` + Tailwind 는 `bg-[color:var(--c)]` |

`tailwind.config.ts` 는 `var(--…)` 를 **읽기만** 한다. Tailwind 에 색을 새로 적으면
토큰이 두 벌이 되고 명세서와 화면이 조용히 어긋난다.

**`.tsx` 안에 `#rrggbb` 를 쓸 수 없다** — eslint 가 막는다.

## 권한 — 읽기만 한다 (D-R39)

`/auth/me` 가 플래그를 내려준다. 화면이 `role` 을 보고 다시 파생하지 않는다 — eslint 가 막는다.

```tsx
const canEdit = useCan('canCrudAll');
```

## 상태

| | 무엇 |
|---|---|
| 서버 상태 | TanStack Query — 캐시·무효화가 `CONTRACTS.md §6` 매트릭스와 1:1 |
| 전역 | zustand — **`useSession` 하나뿐** |
| 지역 | `useReducer` — 분할 뷰 · 리포트 초안 · 캘린더 선택 |

## 명령

| | |
|---|---|
| `npm run dev` · `build` | 개발 · 빌드 |
| `npm test` | Vitest |
| `npm run typecheck` · `lint` | 타입 · 린트 |
| `npm run types:gen` | **백엔드 계약에서 타입을 다시 만든다** |

## 생성물 — 손으로 고치지 않는다

- `src/api/schema.d.ts` ← 백엔드 `openapi.json`
- `src/lib/tokens.ts` (키 목록) ← `src/styles/tokens.css`

## 아직 없는 것

화면. 명세서 v2 의 **70컷**을 트랙 B 에서 탭 순서대로 만든다 (TBO-23~).
지금 있는 `/` 는 토큰 29색이 Tailwind 로 이어졌는지 눈으로 보는 자리다.
