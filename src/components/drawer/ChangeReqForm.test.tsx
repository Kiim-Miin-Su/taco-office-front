/** @file-guide
 * 목적: UX-13C2b 변경 요청의 자정 종료 표시와 계약 분 경계 회귀.
 * 책임/재사용: 실제 ChangeReqForm·공용 changeReqReady/body를 사용하고 UI 정책을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { useState } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ChangeReqForm } from './panes';
import { changeReqBody, changeReqReady, EMPTY_DRAFT, type ChangeReqDraft } from './change-request';

afterEach(cleanup);

function TimeMoveHarness() {
  const [draft, setDraft] = useState<ChangeReqDraft>({ ...EMPTY_DRAFT, day: '2026-10-02', serId: '3',
    onDate: '2026-10-02', startMin: '1380', endMin: '1440', reason: '시간 변경' });
  return <>
    <ChangeReqForm draft={draft} onDraft={setDraft} conflicts={[]} occurrences={[]}
      occurrencesLoading={false} staff={[]} rooms={[]} zaccs={[]} subs={[]} kinds={[]} />
    <output data-testid="ready">{String(changeReqReady(draft))}</output>
    <output data-testid="end-min">{draft.endMin}</output>
    <output data-testid="body-end">{changeReqReady(draft) ? String((changeReqBody(draft) as { endMin?: number }).endMin) : '-'}</output>
  </>;
}

it('변경 요청의 24:00 종료는 화면에 보이고 1440분 계약으로 유지된다 (UX-13C2b)', () => {
  const v = render(<TimeMoveHarness />);
  expect(v.getByRole('checkbox', { name: '24:00 (자정에 종료)' })).toHaveProperty('checked', true);
  expect(v.getByRole('status', { name: '새 끝 시각' }).textContent).toBe('24:00');
  expect(v.getByTestId('body-end').textContent).toBe('1440');
  fireEvent.click(v.getByRole('checkbox', { name: '24:00 (자정에 종료)' }));
  expect((v.getByLabelText('새 끝') as HTMLInputElement).value).toBe('');
  expect(v.getByTestId('ready').textContent).toBe('false');
  fireEvent.change(v.getByLabelText('새 끝'), { target: { value: '23:30' } });
  expect(v.getByTestId('body-end').textContent).toBe('1410');
});

it('좁은 화면에서는 날짜와 일정 선택을 각각 한 줄에 놓는다 (UX-13C2b)', () => {
  const v = render(<TimeMoveHarness />);
  const dateRow = v.getByLabelText(/어느 날/).parentElement?.parentElement;
  expect(dateRow?.className).toContain('grid-cols-1');
  expect(dateRow?.className).toContain('sm:grid-cols-');
});
