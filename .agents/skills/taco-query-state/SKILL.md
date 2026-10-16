---
name: taco-query-state
description: TACO frontend API Hook·TanStack Query·Axios 오류·세션 캐시·mutation을 구현하거나 진단할 때 사용한다. 진단 요청만으로 계약이나 인증 구조를 바꾸지 않는다.
---

<!-- @file-guide
목적: 문서 및 에이전트 작업 안내
책임/재사용: 이 파일의 범위만 설명한다. 업무 규칙은 docs/AGENT.md, 현재 작업은 docs/CLAUDE.md를 따른다.
검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
-->

# Query와 세션 경계

진단·리뷰 요청이면 기존 소스·생성물·실행 증거를 대조해 원인과 필요한 변경만 보고한다. 코드·계약 수정과 테스트 추가는 구현까지 요청된 경우에만 수행한다.

1. Front AGENTS와 src/api/AGENTS, client.ts·queries.ts·session-cache.ts·생성 alias 및 호출자를 읽는다.
2. 요청/응답은 현재 생성 DTO에서 선택한다. 누락 계약은 Back DTO부터 수정하는 taco-contract-sync 절차로 연결한다.
3. qk/family·sessionQueryKey에서 사용자/권한/필터/날짜 경계를 확인한다. 서버 값을 새 store로 복제하지 않는다.
4. 공용 Axios의 401 refresh·오류 정규화와 세션 epoch를 유지한다. token을 UI로 퍼뜨리거나 직접 fetch 경로를 추가하지 않는다.
5. mutation의 가역성·멱등성·version/409를 먼저 확인한다. 가역일 때 cancel/snapshot/patch/rollback/reconcile과 경쟁 요청을 함께 설계한다. 비가역 작업은 pending 표시와 서버 확정 결과를 사용한다.
6. 필요한 query consumer만 무효화한다. 로그아웃/권한 변경의 전체 폐기는 별도 보안 동작으로 검증한다.
7. session-cache.test.ts·해당 Hook 회귀를 확장해 늦은 응답, 계정 전환, 권한 축소, 실패 rollback, 중복 재시도를 검증한다. 정상 화면만 확인하지 않는다.
8. contracts 무효화 매트릭스와 기능 문서에 변경/경계를 남긴다. raw payload·headers·Axios config는 로그에 싣지 않는다.
