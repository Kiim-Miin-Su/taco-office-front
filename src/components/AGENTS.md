<!-- @file-guide
목적: 문서 및 에이전트 작업 안내
책임/재사용: 이 파일의 범위만 설명한다. 업무 규칙은 docs/AGENT.md, 현재 작업은 docs/CLAUDE.md를 따른다.
검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
-->

# UI 컴포넌트 지침

[Frontend 지침](../../AGENTS.md)을 따른다. 이 폴더는 표현과 상호작용을 소유하며 서버 정책 정본이 아니다.

- `ui/`의 Button, Field, Overlay, QueryState, TabCards 등과 실제 소비자를 검색한 뒤 확장한다. 도메인별로 같은 Dialog/Field/Tab을 복제하지 않는다.
- 공용 UI는 props·callback·토큰을 받고 API 호출·세션 캐시·권한/정산 계산을 소유하지 않는다. 도메인 컴포넌트는 기존 Hook·selector와 연결하고 route는 조립한다.
- 화면별 초안·선택 상태는 가장 가까운 단일 소유자에 둔다. 여러 진입점이 쓰는 writer를 `New`/`V2`로 복제하지 않는다.
- label, role/name, 오류 연결, disabled 이유, focus 복원, Escape·키보드 동작을 기존 Overlay/Field 패턴에 맞춘다.
- loading/error/empty/session-expired를 구별한다. 요청 실패를 빈 목록이나 저장 성공으로 표현하지 않는다.
- 토큰·CSS Modules·Tailwind 경계를 지키고 동적 Tailwind class 문자열 조합 대신 기존 매핑을 재사용한다. 반응형은 같은 의미 구조를 유지한다.
- 승인 Figma node와 명세의 CRUD input·권한·이동을 확인한다. 정적 렌더나 이미지 존재만으로 기능·저장 완료를 판정하지 않는다.

수정 컴포넌트와 소비자 회귀 → typecheck/lint/build → 역할별 실제 브라우저 검증을 수행한다. 구조/소비가 바뀌면 `npm run usage:gen` 결과도 검수한다. 동작 없는 설명용 UI나 요청하지 않은 새 디자인 시스템은 만들지 않는다.
