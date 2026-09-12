/** @file-guide
 * 목적: ChangeReqsPane.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §20 변경 요청 · 이력 — 원문 탭 「확인 대기 · 반영 · 반려 · 전체」 (C42).
 *
 * 원문 안내문이 이 화면의 계약이다 — 「겹치면 넣을 수 없습니다 ·
 * **반영하면 시간표가 바뀌고 이력에 남습니다**」.
 */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { ChangeReq } from '@/api/types';
import { ChangeReqsPane } from './panes';

afterEach(cleanup);

const rows: ChangeReq[] = [
  {
    id: 1, reqType: 'teacher', serId: 41, onDate: '2026-08-28', reason: '병가입니다',
    rejectReason: null, state: 'pending', byName: '이다현', asked: '강사 → KJ',
    applyAll: false, at: '2026-08-27 10:00',
  },
  {
    id: 2, reqType: 'time_move', serId: 42, onDate: '2026-08-28', reason: '학부모 면담',
    rejectReason: null, state: 'approved', byName: '고은설', asked: '20:00–21:30 로 이동',
    applyAll: true, at: '2026-08-26 10:00',
  },
  {
    id: 3, reqType: 'cancel', serId: 43, onDate: '2026-08-29', reason: '개인 사정',
    rejectReason: '그날은 진단고사가 있습니다', state: 'rejected', byName: '최윤호', asked: '휴강',
    applyAll: false, at: '2026-08-25 10:00',
  },
];

it('원문 탭 넷이 제 건수를 세고, 처음에는 확인 대기만 보인다', () => {
  const view = render(<ChangeReqsPane rows={rows} />);
  expect(view.getByRole('button', { name: '확인 대기 1' })).toBeTruthy();
  expect(view.getByRole('button', { name: '반영 1' })).toBeTruthy();
  expect(view.getByRole('button', { name: '반려 1' })).toBeTruthy();
  expect(view.getByRole('button', { name: '전체 3' })).toBeTruthy();
  expect(view.container.textContent).toContain('강사 → KJ');
  expect(view.container.textContent).not.toContain('20:00–21:30 로 이동');
});

it('탭을 바꾸면 그 상태만 보인다 — 전체는 셋 다', () => {
  const view = render(<ChangeReqsPane rows={rows} />);
  fireEvent.click(view.getByRole('button', { name: '반영 1' }));
  expect(view.container.textContent).toContain('20:00–21:30 로 이동');
  expect(view.container.textContent).toContain('이후 전체');
  fireEvent.click(view.getByRole('button', { name: '전체 3' }));
  expect(view.container.textContent).toContain('강사 → KJ');
  expect(view.container.textContent).toContain('휴강');
});

it('반려 사유는 신청 사유를 덮어쓰지 않는다 — 둘 다 남는다 (v4.18 · D-R13)', () => {
  const view = render(<ChangeReqsPane rows={rows} />);
  fireEvent.click(view.getByRole('button', { name: '반려 1' }));
  expect(view.container.textContent).toContain('그날은 진단고사가 있습니다');
});

it('확인할 것이 없으면 원문 문구 그대로 말한다', () => {
  const view = render(<ChangeReqsPane rows={rows.filter((r) => r.state !== 'pending')} />);
  expect(view.container.textContent).toContain('확인할 요청이 없습니다');
  expect(view.container.textContent).toContain('반영하면 시간표가 바뀌고 이력에 남습니다');
});
