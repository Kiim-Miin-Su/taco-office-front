<!-- @file-guide
목적: 문서 및 에이전트 작업 안내
책임/재사용: 이 파일의 범위만 설명한다. 업무 규칙은 docs/AGENT.md, 현재 작업은 docs/CLAUDE.md를 따른다.
검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
-->

# taco_office_front

## 프로젝트 개요

TACO ERP의 관리자·강사 웹 화면입니다. **Next.js 15 App Router · React 19 · TypeScript**를 사용하며 백엔드와 독립된 Git/npm 저장소입니다. API 코드를 공유하지 않고 백엔드 OpenAPI에서 생성한 타입을 소비합니다.

[작업 지침](AGENTS.md) · [업무 정본](../docs/AGENT.md) · [현재 인계](../docs/CLAUDE.md) · [기능 대조표](../docs/contracts/FEATURE-CRUD-MAP.md)

## 제공 기능

일정·출결, 학생·강사, 상담·등록·컨설팅, 리포트·안내·교재, 회계·운영과 강사 전용 수업·이력 화면을 연결합니다. 공용 셸·서랍·폼·탭과 권한별 경로 보호를 재사용합니다.

교재 SE/TE의 새 PDF는 관리자 서가에서 공식 Blob SDK의 multipart로 직접 전송한 뒤 업로드 ID를 판에 연결합니다. 새 Back의 서버 한도는 파일당 1GB(1,000,000,000 bytes), SE+TE 합계 2GB이며 진행률·취소·재시도를 제공합니다. 구형 Back의 한도는 50MB로 안내합니다. 현재 담당 강사는 `/teacher/guides`에서 배부 완료된 정확한 판의 SE/TE를 내려받습니다. 비공개 Blob은 권한 확인 후 2분 서명 URL의 네이티브 다운로드로 넘겨 전체 파일을 JS 메모리에 담지 않습니다. 브라우저에 따라 UUID 파일명으로 저장될 수 있으며 원본 이름은 메타데이터에 보존합니다. 기존 DB 파일은 인증 API 다운로드를 유지하며 새 다운로드 경로가 없는 구형 Back에는 기존 경로로 돌아갑니다. 2026-10-17 운영 DB(migration 129)와 Vercel 배포에 반영됐습니다. 운영에서 실제 1GB 파일을 보낸 검증은 아직 없습니다. [1GB 기능 원장](../docs/sprint/TBO-55/features/BOOK-PDF-1GB-2026-10-13.md)을 확인합니다.
화면 존재, 쓰기 계약 연결, 영속화, 실제 QA의 완료 여부는 기능별 원장에서 구분합니다. 과거 README의 미완 목록이나 테스트 개수를 현재 상태로 재사용하지 않습니다.

## 실행환경 구축

- Node.js `>=22`, npm. 정확한 설치 버전은 `package-lock.json`, 허용 범위는 `package.json`이 소유합니다.
- front/back/docs를 형제 폴더에 둡니다. 계약 생성 시 `../taco_office_back/openapi.json`이 필요합니다.
- 개발 컴퓨터에서 설치합니다. 다른 OS/CPU의 `node_modules`를 복사하지 않습니다.

```sh
npm ci
test -e .env.local || cp .env.local.example .env.local
```

환경 예제는 기존 파일이 없을 때만 복사합니다. 실제 upstream과 origin은 사용 환경에 맞게 확인합니다.

| 키 | 용도 |
|---|---|
| `TACO_API_UPSTREAM` | Next 서버가 연결할 별도 Back 주소, 로컬 예: `http://localhost:3001/api/v1` |
| `TACO_FRONT_ORIGIN` | 실제 Front origin, 로컬 예: `http://localhost:3000` |
| `NEXT_DIST_DIR` | 선택적 빌드 폴더. 앱 기준 상대 경로만 사용 |

브라우저는 같은 origin의 `/api/v1`만 호출하고 [next.config.mjs](next.config.mjs)가 Back으로 rewrite합니다. upstream이 Front 자신을 가리키면 안 됩니다. 운영 모드 빌드는 upstream과 front origin의 명시값이 필요합니다. 서버 비밀값을 공개 환경 변수에 넣지 않습니다.

## 빌드 방법

```sh
npm run typecheck
npm run lint
TACO_API_UPSTREAM=http://localhost:3001/api/v1 TACO_FRONT_ORIGIN=http://localhost:3000 npm run build
```

주소는 로컬 production-mode 검증용입니다. 배포 환경에는 승인된 실제 주소를 설정합니다. 기본 산출물은 `.next/`이며 build/typecheck 뒤 next-env·tsconfig·증분 캐시 diff를 확인합니다. 사용자 설정 변경은 덮어쓰지 않습니다.

## 주요 사용 기술과 상태 소유자

| 영역 | 기술·소유자 |
|---|---|
| 화면 | Next App Router, React, 공용/도메인 TSX 컴포넌트 |
| 서버 상태 | TanStack Query · `src/api/queries.ts`의 qk/family·세션 key |
| 전송 | Axios 단일 인스턴스 · `src/api/client.ts` |
| 전역 UI | Zustand `useSession`(Me/세션), `useWorkspace`(셸·서랍·undo) |
| 지역 폼 | 기존 reducer/useState 또는 React Hook Form + Zod |
| 스타일 | CSS Modules(레이아웃), Tailwind 3(컴포넌트), `styles/tokens.css`(기본 토큰) |
| 검증 | Vitest, Testing Library, jsdom, ESLint, Prettier |

권한은 서버 플래그/`useCan`으로 읽습니다. UI에서 role을 직접 재판정하지 않습니다.
Tailwind는 CSS 변수를 읽으며 `.tsx`에 hex 색상을 복제하지 않습니다. API Meta의 런타임 코드색은 `lib/tokens.ts` helper로 소비합니다.

## 실행방법

```sh
npm run dev
```

기본 주소는 `http://localhost:3000`입니다. 실제 로그인·CRUD는 준비된 Back과 격리 개발 DB가 필요합니다.
빌드 산출물은 같은 환경 설정으로 `npm start`를 실행합니다.

## 폴더 구조

```text
src/
  app/             route·layout·providers
  components/
    ui/            공용 표현 컴포넌트
    shell/         로그인·권한·셸
    cal/ lesson/ teacher/ consulting/ ...  도메인 UI
  api/             client·queries·생성 계약·세션 캐시
  lib/             표시·순수 함수·공용 진단
  store/           useSession·useWorkspace
  styles/          tokens.css·전역 스타일
scripts/           계약 외 도구·upstream 검증·usage 생성
.agents/skills/    화면·Query 작업 스킬
```

기본 소스 경계는 `src/`, alias는 `@/*`입니다. Java 패키지/Thymeleaf 템플릿 대신 기존 React 컴포넌트를 사용합니다.

## 테스트·생성물

| 명령 | 용도·주의 |
|---|---|
| `npm test` / `npm run test:watch` | Vitest 전체 / 관찰 |
| `npm test -- src/api/session-cache.test.ts` | 지정 회귀 예시 |
| `npm run typecheck` / `npm run lint` | 타입 / ESLint |
| `npm run types:gen` | Back OpenAPI → `src/api/schema.d.ts`, **파일 쓰기** |
| `npm run usage:gen` | `src/lib/component-usage.json` 갱신, **파일 쓰기** |

`schema.d.ts`·`next-env.d.ts`는 손편집하지 않습니다. `types.ts`는 생성 타입 alias를 관리합니다.
`lib/tokens.ts`에는 직접 작성된 helper도 있으므로 파일 전체를 자동 생성물로 취급하지 않습니다.
테스트 통과와 실제 브라우저 접근성·반응형·역할별 저장/reload 검증은 별개입니다.

## 신규 구성·문서화 원칙

모든 새 프레임워크 앱은 공식 CLI/스타터를 사용합니다. Next.js는 [create-next-app](https://nextjs.org/docs/app/api-reference/cli/create-next-app), NestJS는 Nest CLI, Spring Boot는 Spring Initializr입니다. 기존 앱을 다시 생성하거나 버전을 자동 변경하지 않습니다.

[AGENTS](AGENTS.md)와 [스킬 지도](../.agents/README.md)에 따라 구현·검증·PROMPT/Figma/portfolio의 1:1 대조를 같은 청크에서 수행합니다.
