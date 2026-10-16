<!-- @file-guide
목적: 문서 및 에이전트 작업 안내
책임/재사용: 이 파일의 범위만 설명한다. 업무 규칙은 docs/AGENT.md, 현재 작업은 docs/CLAUDE.md를 따른다.
검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
-->

# Frontend 작업 지침

상위 [공통 지침](../AGENTS.md)과 [업무 정본](../docs/AGENT.md)을 함께 읽는다. 이 파일은 Next.js 저장소의 구현 경계를 소유한다. 단독 clone에서는 형제 docs와 워크스페이스 지침을 준비한다.

## 환경·구조

- Node `>=22`, npm, Next.js 15 App Router, React 19, strict TypeScript. 정확한 버전은 package/lockfile을 확인한다.
- `@/*`는 `src/*`다. NestJS src를 직접 import하지 않는다. Java 기본 패키지나 Thymeleaf 폴더를 만들지 않는다.
- `src/app`: route/layout 조립. `components/ui`: 시각 원시 컴포넌트. 도메인 components: 업무 화면. `api`: 통신·Query·생성 계약. `lib`: 순수 계산/표시. `store`: 세션·셸. `styles`: 시각 토큰.
- TS·포맷은 현재 tsconfig/ESLint/Prettier를 따른다. strict를 느슨하게 하거나 새 lint-disable로 우회하지 않는다.
- 신규 별도 앱만 공식 create-next-app을 쓴다. 기존 앱에 생성기를 실행하거나 최신 CLI 기본값으로 교체하지 않는다.

## 구현

1. 현재 route → 도메인 컴포넌트 → 공용 UI/Hook → 생성 DTO 소비를 먼저 추적한다.
2. 필요한 상호작용 경계에 `'use client'`를 둔다. 전체 트리를 무조건 client로 바꾸거나 기존 인증 CSR 경계를 임의 SSR로 옮기지 않는다.
3. [components 지침](src/components/AGENTS.md)에 따라 props/variant로 재사용한다. 관리자·강사 화면의 권한·문구·동선을 임의 합치지 않는다.
4. 서버 값은 Query, Me는 `useSession`, 사이드바·서랍·undo 등 셸 값은 `useWorkspace`, 지역 폼은 가까운 reducer/RHF가 소유한다. effect로 서버 상태를 복제하지 않는다.
5. RHF/Zod는 입력 편의용이다. 서버 validator·업무 권한을 대체하지 않는다. 기존 폼을 일괄 RHF로 변환하지 않는다.
6. `useCan` 및 서버 capability를 소비한다. `role === ...` 재판정, 민감 필드 CSS 숨김은 금지한다.
7. 색의 기본 정본은 `styles/tokens.css`; CSS Modules는 레이아웃, Tailwind는 낱개 UI. 런타임 코드표 색은 기존 `lib/tokens.ts` helper로 소비한다. `.tsx` hex literal 금지.
8. `browserLog`, `api/request-diagnostics.ts`를 재사용하고 raw Axios 오류·폼 입력·토큰을 console에 출력하지 않는다.

## 검증

저장소 안에서 실행한다.

```sh
npm test -- src/components/ui/Overlay.test.tsx
npm test
npm run typecheck
npm run lint
TACO_API_UPSTREAM=http://localhost:3001/api/v1 TACO_FRONT_ORIGIN=http://localhost:3000 npm run build
```

첫 명령은 공용 UI 변경의 예시다. 변경 기능의 실제 테스트를 선택한다. 브라우저 QA는 역할별 정상/거절·loading/error/empty·키보드·모바일 overflow·저장 후 reload를 확인한다. jsdom 통과는 브라우저 검수를 대신하지 않는다.

`typecheck`는 증분 캐시, Next 빌드는 생성물과 next-env/tsconfig를 바꿀 수 있다. 전후 diff를 확인하고 사용자의 기존 설정은 덮지 않는다. `NEXT_DIST_DIR`는 앱 기준 상대 경로만 사용한다.

`types:gen`은 schema를, `usage:gen`은 component-usage.json을 쓴다. 해당 원본이 바뀌었을 때만 실행하고 diff를 검수한다. API 작업은 [api 지침](src/api/AGENTS.md), 문서-only는 상위 문서 검증 절차를 따른다.

## 작업 스킬

- [.agents/skills/taco-next-ui](.agents/skills/taco-next-ui/SKILL.md): 화면·폼·접근성.
- [.agents/skills/taco-query-state](.agents/skills/taco-query-state/SKILL.md): API 소비·세션 캐시·mutation.
- 교차 저장소 계약·스타일·검증은 [워크스페이스 스킬 지도](../.agents/README.md)를 확인한다.
