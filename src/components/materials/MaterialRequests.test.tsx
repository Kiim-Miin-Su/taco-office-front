/** @file-guide
 * 목적: 최신 일반 자료요청을 GPAPACK과 분리하고 계약 전 쓰기를 만들지 않는지 검증한다.
 * 책임/재사용: 공용 자료요청 컴포넌트의 입력·상태·잠금만 시험하고 route 조립은 각 page 테스트에 맡긴다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MaterialRequestBoard, MaterialRequestDraft } from './MaterialRequests';

afterEach(cleanup);

const students = [
  { id: 7, label: '김하늘 · G5' },
  { id: 9, label: '이도윤 · Kinder' },
];

it('강사 초안은 최신 네 종류·학생·필요일·내용을 한 경로에 두고 제출을 잠근다', () => {
  const view = render(<MaterialRequestDraft viewerId={2} students={students} />);

  expect(view.getByRole('heading', { name: '자료 요청' })).toBeTruthy();
  expect([...view.getByLabelText('자료 종류 *').querySelectorAll('option')].map((option) => option.textContent)).toEqual([
    '선택', '교재 PDF', '워크시트', '시험지', '그 밖의 자료',
  ]);
  expect([...view.getByLabelText('학생 *').querySelectorAll('option')].map((option) => option.textContent)).toEqual([
    '선택', '김하늘 · G5', '이도윤 · Kinder',
  ]);

  fireEvent.change(view.getByLabelText('자료 종류 *'), { target: { value: 'worksheet' } });
  fireEvent.change(view.getByLabelText('학생 *'), { target: { value: '7' } });
  fireEvent.change(view.getByLabelText('필요한 날 *'), { target: { value: '2026-10-20' } });
  fireEvent.change(view.getByLabelText('요청 내용 *'), { target: { value: 'Unit 4 복습용 문제와 정답지를 준비해 주세요.' } });

  expect(view.getByText('초안 입력 완료 · 저장 기능 연결 대기')).toBeTruthy();
  const submit = view.getByRole('button', { name: '요청 계약 준비 중' });
  expect(submit).toHaveProperty('disabled', true);
  fireEvent.click(submit);
  expect(view.queryByText(/요청을 접수했습니다/)).toBeNull();
});

it('담당 학생 계약이 없으면 임의 명단을 만들지 않고 사유를 표시한다', () => {
  const view = render(<MaterialRequestDraft viewerId={2} students={[]} studentsUnavailable />);
  expect(view.getByText('전체 담당 학생 선택 기능을 준비 중입니다.')).toBeTruthy();
  expect(view.getByLabelText('학생 *')).toHaveProperty('disabled', true);
  expect(view.getByRole('button', { name: '요청 계약 준비 중' })).toHaveProperty('disabled', true);
});

it('로그인 사용자나 담당 학생 후보가 바뀌면 이전 강사의 초안을 지운다', () => {
  const view = render(<MaterialRequestDraft viewerId={2} students={students} />);
  fireEvent.change(view.getByLabelText('자료 종류 *'), { target: { value: 'book_pdf' } });
  fireEvent.change(view.getByLabelText('학생 *'), { target: { value: '7' } });
  fireEvent.change(view.getByLabelText('필요한 날 *'), { target: { value: '2026-10-20' } });
  fireEvent.change(view.getByLabelText('요청 내용 *'), { target: { value: 'A 강사만 볼 초안' } });

  view.rerender(<MaterialRequestDraft viewerId={3} students={[students[1]]} />);
  expect(view.getByLabelText('자료 종류 *')).toHaveProperty('value', '');
  expect(view.getByLabelText('학생 *')).toHaveProperty('value', '');
  expect(view.getByLabelText('필요한 날 *')).toHaveProperty('value', '');
  expect(view.getByLabelText('요청 내용 *')).toHaveProperty('value', '');
  expect(view.queryByDisplayValue('A 강사만 볼 초안')).toBeNull();
});

it('관리자 보드는 최신 상태와 후속 action을 보여 주되 가짜 0건·전달 성공을 만들지 않는다', () => {
  const view = render(<MaterialRequestBoard />);
  expect(view.getByRole('heading', { name: '강사 자료 요청 보드' })).toBeTruthy();
  expect([...view.getAllByTestId('material-request-state')].map((node) => node.textContent)).toEqual([
    '접수', '준비 중', '전달 완료', '반려',
  ]);
  expect(view.getByText(/준비 시작 · 반려 사유 · 전달 파일 · 완료 이력/)).toBeTruthy();
  expect(view.getByText('일반 자료요청 목록 준비 중')).toBeTruthy();
  expect(view.queryByText(/0건/)).toBeNull();
  expect(view.queryByRole('button', { name: /전달 완료/ })).toBeNull();
});
