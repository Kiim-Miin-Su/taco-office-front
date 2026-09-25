/** @file-guide
 * 목적: cut-words.test.ts (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * **컷의 낱말** — C67·C68 에서 되돌린 것들을 못 박는다.
 *
 * 전수 대조(`report/CUT-VS-PRODUCT-2026-09-13.md` 2절)에서 나온 자리다. 하나같이
 * 「더 짧아서」·「더 자연스러워서」 우리가 줄여 부르던 것이고, 그래서 **다시 줄여 부르기 쉽다.**
 * 원문이 정본이다 (D-R44 · 표준 지시 「애매한 것은 명세서 v2 + Figma 기준」).
 */
import { expect, it } from 'vitest';
import { CONSULTING_CONTRACT_STEPS } from './consulting';
import { REQ_TYPE_LABEL } from './roles';

it('컨설팅 계약 다섯 걸음은 컷 §30 의 이름이다', () => {
  expect([...CONSULTING_CONTRACT_STEPS]).toEqual(['계약서 준비', '피드백', '전달', '서명', '수납']);
});

it('변경 요청 갈래 넷은 컷 §19 의 이름이다 — 「옮기기·바꾸기」와 「취소」가 아니라 「휴강」', () => {
  // 2026-09-25 컷 §19 「무엇을」 칩을 다시 열어 교정했다 — C68 은 「시간 이동·강사 변경·강의실 변경」을 컷 낱말로 잘못 적었다
  expect(REQ_TYPE_LABEL.time_move).toBe('시간 옮기기');
  expect(REQ_TYPE_LABEL.teacher).toBe('강사 바꾸기');
  expect(REQ_TYPE_LABEL.room).toBe('강의실 바꾸기');
  // 같은 줄의 대상 칸(서버 문장)이 「휴강」이라 적는다 — 한 줄이 두 이름을 가지면 안 된다
  expect(REQ_TYPE_LABEL.cancel).toBe('휴강');
});
