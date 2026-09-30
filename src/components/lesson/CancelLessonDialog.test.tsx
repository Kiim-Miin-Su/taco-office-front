/** @file-guide
 * 목적: §12 휴강 창 — 다시 그려도 적은 것이 안 지워진다 (C92-d QA 에서 잡은 회귀).
 * 책임/재사용: 실제 CancelLessonDialog 를 쓰고 props 로만 상태를 준다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CancelLessonDialog } from './CancelLessonDialog';

const reasons = [
  { key: 'student_absent' as const, label: '학생 결석', deductible: true, parentNotice: false },
  { key: 'holiday' as const, label: '공휴일', deductible: false, parentNotice: false },
  { key: 'academy' as const, label: '학원 사정', deductible: false, parentNotice: true },
];
const treats = [
  { key: 'carry' as const, label: '이월', sub: '이번 달 청구에서 빼고 다음 달로 넘깁니다 (기본)' },
  { key: 'deduct' as const, label: '차감', sub: '이번 달 회차로 소진합니다 — 학생 결석에만' },
  { key: 'makeup' as const, label: '보강 이관', sub: '보강 회차를 잡습니다' },
];
afterEach(() => { cleanup(); });

it('부르는 쪽이 매 렌더마다 새 original 객체를 줘도(저장 중 → 실패) 적은 사유·메모가 남는다', () => {
  const props = { open: true, title: '휴강 — 시험', reasons, treats, onSubmit: () => {}, onClose: () => {} };
  const v = render(<CancelLessonDialog {...props} original={{ date: '2026-08-21', startMin: 600, endMin: 660 }} />);
  fireEvent.change(v.getByLabelText('사유', { exact: true }), { target: { value: 'holiday' } });
  fireEvent.change(v.getByLabelText('메모', { exact: true }), { target: { value: '공휴일' } });
  // 저장 중 → 실패: 부모가 다시 그리며 original 을 새 객체로 준다
  v.rerender(<CancelLessonDialog {...props} pending original={{ date: '2026-08-21', startMin: 600, endMin: 660 }} />);
  v.rerender(<CancelLessonDialog {...props} error="2026년 8월은 마감됐습니다" original={{ date: '2026-08-21', startMin: 600, endMin: 660 }} />);
  expect((v.getByLabelText('사유', { exact: true }) as HTMLSelectElement).value).toBe('holiday');
  expect((v.getByLabelText('메모', { exact: true }) as HTMLTextAreaElement).value).toBe('공휴일');
  expect(v.getByText('2026년 8월은 마감됐습니다')).toBeTruthy();
});

it('닫았다 다시 열면 비운다 — 지난 휴강의 사유가 다음 창에 남지 않는다', () => {
  const props = { title: '휴강 — 시험', reasons, treats, onSubmit: () => {}, onClose: () => {} };
  const v = render(<CancelLessonDialog {...props} open />);
  fireEvent.change(v.getByLabelText('사유', { exact: true }), { target: { value: 'holiday' } });
  v.rerender(<CancelLessonDialog {...props} open={false} />);
  v.rerender(<CancelLessonDialog {...props} open />);
  expect((v.getByLabelText('사유', { exact: true }) as HTMLSelectElement).value).toBe('');
});

it('학원 사정을 고르면 학부모 안내가 준비된다고 먼저 말한다 — 서버의 parentNotice 를 읽고 사유 코드를 비교하지 않는다 (C-32 · D-R39)', () => {
  const props = { open: true, title: '휴강 — 시험', reasons, treats, onSubmit: () => {}, onClose: () => {} };
  const v = render(<CancelLessonDialog {...props} />);
  fireEvent.change(v.getByLabelText('사유', { exact: true }), { target: { value: 'holiday' } });
  expect(v.queryByText(/학부모 안내를 준비합니다/)).toBeNull();
  fireEvent.change(v.getByLabelText('사유', { exact: true }), { target: { value: 'academy' } });
  expect(v.getByText(/학부모 안내를 준비합니다/)).toBeTruthy();
});

it('24:00에 끝난 원 회차의 보강 종료 시각을 화면에 표시하고 1440분으로 보낸다 (UX-13C2a)', () => {
  const onSubmit = vi.fn();
  const v = render(<CancelLessonDialog open title="휴강 — 자정" reasons={reasons} treats={treats}
    original={{ date: '2026-08-21', startMin: 1380, endMin: 1440 }} onSubmit={onSubmit} onClose={() => {}} />);
  fireEvent.change(v.getByLabelText('사유', { exact: true }), { target: { value: 'holiday' } });
  fireEvent.click(v.getByRole('radio', { name: /보강 이관/ }));
  fireEvent.change(v.getByLabelText('날짜', { exact: true }), { target: { value: '2026-08-22' } });
  expect(v.getByRole('checkbox', { name: '24:00 (자정에 종료)' })).toHaveProperty('checked', true);
  expect(v.getByRole('status', { name: '끝 시각' }).textContent).toBe('24:00');
  fireEvent.click(v.getByRole('button', { name: '휴강 · 보강 잡기' }));
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
    makeup: { date: '2026-08-22', startMin: 1380, endMin: 1440 },
  }));
});

it('보강 자정 종료를 해제하면 종료 시각을 다시 고를 때까지 제출하지 않는다 (UX-13C2a)', () => {
  const onSubmit = vi.fn();
  const v = render(<CancelLessonDialog open title="휴강 — 자정" reasons={reasons} treats={treats}
    original={{ date: '2026-08-21', startMin: 1380, endMin: 1440 }} onSubmit={onSubmit} onClose={() => {}} />);
  fireEvent.change(v.getByLabelText('사유', { exact: true }), { target: { value: 'holiday' } });
  fireEvent.click(v.getByRole('radio', { name: /보강 이관/ }));
  fireEvent.change(v.getByLabelText('날짜', { exact: true }), { target: { value: '2026-08-22' } });
  fireEvent.click(v.getByRole('checkbox', { name: '24:00 (자정에 종료)' }));
  expect((v.getByLabelText('끝', { exact: true }) as HTMLInputElement).value).toBe('');
  expect(v.getByRole('button', { name: '휴강 · 보강 잡기' })).toHaveProperty('disabled', true);
  fireEvent.change(v.getByLabelText('끝', { exact: true }), { target: { value: '23:30' } });
  fireEvent.click(v.getByRole('button', { name: '휴강 · 보강 잡기' }));
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
    makeup: { date: '2026-08-22', startMin: 1380, endMin: 1410 },
  }));
});
