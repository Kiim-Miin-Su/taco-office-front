<!-- @file-guide
목적: 문서 및 에이전트 작업 안내
책임/재사용: 이 파일의 범위만 설명한다. 업무 규칙은 docs/AGENT.md, 현재 작업은 docs/CLAUDE.md를 따른다.
검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
-->

# API 소비·캐시 경계

[Frontend 지침](../../AGENTS.md)을 전제로 이 폴더의 계약과 서버 상태만 다룬다.

- `schema.d.ts`는 Back OpenAPI 생성물이다. 직접 고치지 않는다. `types.ts`는 생성 `components/paths` 타입의 alias를 소유하며 같은 응답 interface를 재선언하지 않는다.
- 계약 변경은 Back DTO/Swagger → OpenAPI → `npm run types:gen` → alias/consumer 순으로 한다. 없는 필드를 임의 타입으로 덧붙이지 않는다.
- `client.ts`의 Axios가 Bearer·401 refresh·오류 정규화의 단일 경계다. Hook·컴포넌트마다 fetch/client/token 재발급을 만들지 않는다.
- `queries.ts`의 `qk`/계열 `family`와 `sessionQueryKey`를 재사용한다. 키에 필요한 사용자·권한·날짜·필터를 포함한다. `sessionQueryKey`에 배열 리터럴을 직접 넘기지 않는다.
- 로그인/로그아웃·권한 변경은 `session-cache.ts`의 epoch/폐기 경계를 확인한다. 로그아웃 뒤 도착한 응답이 다음 사용자의 캐시에 쓰이지 않아야 한다.
- 서버 상태를 Zustand에 복제하지 않는다. 업무 mutation은 영향 key만 무효화한다. 세션 전체 폐기는 별도 보안 경계다.
- 가역 동작의 낙관 갱신은 cancel → snapshot → patch → 오류 rollback → 서버 reconcile을 한 계약으로 다룬다. 겹친 mutation에서 오래된 snapshot이 새 결과를 덮지 않는지 시험한다.
- 결제·발송·권한 변경은 서버 확인 전 성공으로 표시하지 않는다. 재시도는 멱등키·version·409 의미를 먼저 확인한다.
- 로그는 허용된 diagnostics 메타데이터만 남긴다. 응답 누락/null/undefined를 임의 기본값으로 숨기지 않는다.

검증 진입점: `session-cache.test.ts`, `consulting-workflow.test.tsx`와 변경 Hook의 기존 테스트. 정상·실패·재시도·계정 전환·권한 변경·늦은 응답을 포함하고 contracts의 무효화 매트릭스를 대조한다.
