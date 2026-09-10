<!-- @file-guide
목적: taco_office_front (document)
책임/재사용: 이 문서의 주제만 기록하고 공통 지시는 docs/AGENT.md, 현재 작업은 docs/CLAUDE.md를 연결한다. 과거 수치를 현행 완료로 복제하지 않는다.
검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
-->

# taco_office_front

TACO ERP 화면 — **Next.js 15 · CSS Modules + Tailwind · Vercel**

> 정본: [`docs/AGENT.md`](../docs/AGENT.md) · [`DEV-SPEC.md`](../docs/spec/DEV-SPEC.md) (v2 · 실제 UI 61컷)
> 스택: [`STACK.md`](../docs/contracts/STACK.md). 링크는 back/front/docs가 같은 부모 폴더에 있는 로컬 워크스페이스 기준입니다.

**백엔드와는 독립 레포다** (D-R42). 공유하는 것은 코드가 아니라 `openapi.json` 한 장이다.

---

## 시작

```bash
cp .env.local.example .env.local  # 기존 파일이 없을 때만. API URL 확인
npm ci                           # 현재 OS/CPU에서 기존 lockfile로 설치
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

업무 route 11개와 일정·리포트·출결·현황판의 주요 흐름은 구현돼 있습니다. 컨설팅 §26은 조회 보드까지이며
항목·상태 전이 쓰기는 남았습니다. 화면 존재가 기능 완료를 뜻하지 않습니다.
현재 상태·검증 수치·운영 로그인 ERR_NETWORK 잔여는 [MVP 잔여 원장](../docs/report/MVP-REMAINING-PLAN-2026-09-04.md)을 봅니다.
