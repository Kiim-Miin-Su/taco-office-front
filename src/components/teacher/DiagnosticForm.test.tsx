/** @file-guide
 * 목적: 진단 리포트 작성 — 화면이 판정하지 않는다 (C61).
 * 책임/재사용: 실제 DiagnosticForm 을 쓰고 쓰기 훅만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const { write } = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock('@/api/queries', () => ({
  useCreateDiagnostic: () => ({ mutate: write, reset: vi.fn(), isPending: false, isError: false, error: null }),
}));

const { DiagnosticForm, REPORT_PRINCIPLES } = await import('./DiagnosticForm');

afterEach(() => { cleanup(); write.mockReset(); });

const open = (props = {}) =>
  render(<DiagnosticForm studentId={7} studentName="고은성" serId={12} {...props} />);

it('모든 리포트의 원칙 세 줄을 폼 위에 그대로 적는다 (원문 슬라이드 20 「공통」)', () => {
  const v = open();
  for (const line of REPORT_PRINCIPLES) expect(v.getByText(new RegExp(line))).toBeTruthy();
  expect(REPORT_PRINCIPLES).toEqual([
    '사실만 씁니다.',
    '관찰하지 않은 것을 추측하지 않습니다.',
    '학생이 한 것과 강사가 도운 것을 나눕니다.',
  ]);
});

it('원문 04 의 칸 넷을 따로 받는다 — 강점과 약점을 한 칸에 몰지 않는다', () => {
  const v = open();
  for (const label of ['현재 수준 *', '강점', '약점', '권장 커리큘럼']) {
    expect(v.getByLabelText(label), label).toBeTruthy();
  }
});

it('현재 수준이 비면 저장이 안 눌린다 — 공백만 적은 것도 빈 것이다', () => {
  const v = open();
  const save = () => v.getByRole('button', { name: '진단 저장' });
  expect(save().hasAttribute('disabled')).toBe(true);
  fireEvent.change(v.getByLabelText('현재 수준 *'), { target: { value: '   ' } });
  expect(save().hasAttribute('disabled')).toBe(true);
  fireEvent.change(v.getByLabelText('현재 수준 *'), { target: { value: '가' } });
  expect(save().hasAttribute('disabled')).toBe(false);
});

it('글자 수 하한을 두지 않는다 — 원문이 진단에는 안 적었다 (D-R44)', () => {
  const v = open();
  fireEvent.change(v.getByLabelText('현재 수준 *'), { target: { value: '가' } });
  expect(v.queryByText(/자 이상 써 주세요/)).toBeNull();
  fireEvent.click(v.getByRole('button', { name: '진단 저장' }));
  expect(write).toHaveBeenCalledTimes(1);
});

it('안 적은 칸은 보내지 않는다 — 빈 문자열을 저장하지 않는다', () => {
  const v = open();
  fireEvent.change(v.getByLabelText('현재 수준 *'), { target: { value: 'MAP 220' } });
  fireEvent.change(v.getByLabelText('강점'), { target: { value: '  ' } });
  fireEvent.click(v.getByRole('button', { name: '진단 저장' }));
  expect(write.mock.calls[0][0]).toEqual({
    studentId: 7, levelSummary: 'MAP 220',
    strengths: undefined, weaknesses: undefined, curriculum: undefined, serId: 12,
  });
});

it('어느 수업에서 봤는지 없으면 안 붙인다 — 없는 회차를 지어내지 않는다', () => {
  const v = open({ serId: null });
  fireEvent.change(v.getByLabelText('현재 수준 *'), { target: { value: 'MAP 220' } });
  fireEvent.click(v.getByRole('button', { name: '진단 저장' }));
  expect(write.mock.calls[0][0].serId).toBeUndefined();
});

it('고치지 않고 쌓는다는 것을 화면이 말한다', () => {
  const v = open();
  expect(v.getByText(/고치지 않고 쌓입니다/)).toBeTruthy();
});
