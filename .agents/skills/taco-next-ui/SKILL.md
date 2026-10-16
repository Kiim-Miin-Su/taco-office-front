---
name: taco-next-ui
description: TACO Next.js 화면·폼·반응형·접근성 구현 또는 수정에 사용한다. 신규 앱 생성이나 단순 문서 작업에는 사용하지 않는다.
---

<!-- @file-guide
목적: 문서 및 에이전트 작업 안내
책임/재사용: 이 파일의 범위만 설명한다. 업무 규칙은 docs/AGENT.md, 현재 작업은 docs/CLAUDE.md를 따른다.
검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
-->

# Next.js 화면 구현

1. Front AGENTS와 src/components/AGENTS, 관련 route·소비자·기능 원문/Figma node·생성 DTO를 확인한다.
2. Button/Field/Overlay/QueryState/TabCards, 해당 도메인 writer·Hook·token을 검색하고 최소 확장 지점을 정한다.
3. page는 조립, ui는 props 기반 표현, 도메인 컴포넌트는 상호작용, api Hook은 서버 상태를 소유한다. 서버 캐시를 별도 상태에 상시 복제하지 않는다. 편집 초안은 단일 소유자에 두고 초기화·저장·취소·세션 변경 경계를 명시한다.
4. 필요한 client 경계·기존 RHF/Zod 또는 reducer를 유지한다. label/error/focus/keyboard·pending/error/empty·권한별 동선을 구현한다.
5. 공용 CSS token·Modules·Tailwind를 사용한다. Thymeleaf/JSP·새 디자인 시스템·화면별 색 사전을 추가하지 않는다.
6. 관련 Testing Library/Vitest → typecheck/lint/build → 실제 역할별 브라우저·모바일 overflow·저장 후 reload를 검증한다. API 연결이 바뀌면 taco-query-state와 생성 계약 절차를 함께 따른다.
7. 같은 기능 ID의 명세·Figma·PROMPT·portfolio 영향/미반영을 기록한다. 브라우저를 못 열었으면 단위시험만 통과했다고 보고한다.

새 디자인을 발명하거나 읽기 화면 존재만으로 CRUD 완료를 주장하지 않는다.
