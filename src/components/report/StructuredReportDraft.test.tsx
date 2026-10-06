/** @file-guide
 * 목적: 최신 종류별 리포트가 확정 kind/marker만 사용하고 현 legacy writer로 우회하지 않는지 검증한다. (test)
 * 책임/재사용: 실제 StructuredReportDraft의 입력·교재·검증·clipboard 경계를 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReportDetail } from '@/api/types';
import { useSession } from '@/store/useSession';
import {
  DEVELOPMENT_AREAS, INTERVIEW_AREAS, StructuredReportDraft, structuredReportKind,
  type StructuredBookOption,
} from './StructuredReportDraft';

const detail = (over: Partial<ReportDetail> = {}): ReportDetail => ({
  id: 1, serId: 12, date: '2026-10-06', onDate: '2026-10-06', startMin: 600, endMin: 660,
  mode: 'offline', subKey: 'diag', kindKey: 'diagx', teacherId: 7, teacherName: '강사', state: 'none',
  written: false,
  students: [
    { id: 4, name: '첫 학생', grade: 'G10', deliver: true, late: false },
    { id: 5, name: '둘째 학생', grade: 'G11', deliver: true, late: false },
  ],
  minutesSinceEnd: 30, penalty: 0,
  body: { content: '', progress: '', homework: '' },
  fields: [
    { key: 'content', label: '③ 수업 내용', hint: '', min: 1, max: 2000 },
    { key: 'progress', label: '④ 진도', hint: '', min: 1, max: 2000 },
    { key: 'homework', label: '⑤ 과제', hint: '', min: 1, max: 2000 },
  ],
  canEdit: true, canReview: false, canExport: false, exportFiles: [], canDeliver: false,
  subjectName: '진단고사', lang: 'ko', writtenAt: null, submittedAt: null, reviewedAt: null, rejectReason: null,
  ...over,
});

const books: StructuredBookOption[] = [
  { id: 'issue:31', code: 'MATH-G10', title: 'Algebra Practice', edition: '2026판' },
];

afterEach(() => {
  cleanup();
  useSession.setState({ me: null, ready: false });
  window.localStorage.clear();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
});

describe('structuredReportKind — 추정 없는 최신 양식 분기', () => {
  it('명시 kind와 일반 수업 인원만 분기하고 class 1명을 Kinder로 추정하지 않는다', () => {
    expect(structuredReportKind(detail())).toBe('diagnostic');
    expect(structuredReportKind(detail({ kindKey: 'mock' }))).toBe('mock');
    expect(structuredReportKind(detail({ kindKey: 'class' }))).toBe('group');
    expect(structuredReportKind(detail({ kindKey: 'class', students: [detail().students[0]] }))).toBe('individual');
  });

  it('양식 버전이 없는 기존 draft·제출본은 새 양식으로 소급 전환하지 않는다', () => {
    expect(structuredReportKind(detail({ state: 'draft' }))).toBeNull();
    expect(structuredReportKind(detail({ state: 'wait' }))).toBeNull();
    expect(structuredReportKind(detail({ state: 'ok' }))).toBeNull();
  });
});

it('Kinder는 4영역 3단계·관찰·종합 소견만 있고 그룹 의견은 없다', () => {
  const view = render(<StructuredReportDraft detail={detail({ students: [detail().students[0]] })} kind="kinder" />);
  expect(view.getByRole('group', { name: '작성 언어' })).toBeTruthy();
  for (const area of DEVELOPMENT_AREAS) {
    expect(view.getByRole('group', { name: `${area.label} 평가` }).querySelectorAll('button')).toHaveLength(3);
    expect(view.getByLabelText('관찰', { selector: `#structured-${area.key}-observation` })).toBeTruthy();
  }
  expect(view.getByLabelText('종합 소견')).toBeTruthy();
  expect(view.queryByText(/개별 의견/)).toBeNull();
  expect(view.getByRole('button', { name: '승인 요청 계약 준비 중' }).hasAttribute('disabled')).toBe(true);
});

it('Kinder에 학생이 둘이면 양식을 열지 않고 1대1 제한을 표시한다', () => {
  const view = render(<StructuredReportDraft detail={detail()} kind="kinder" />);
  expect(view.getByText('Kinder 학생 수 오류')).toBeTruthy();
  expect(view.queryByRole('group', { name: '언어 발달 평가' })).toBeNull();
  expect(view.getByText(/관리자 대리 작성으로 우회할 수 없습니다/)).toBeTruthy();
});

it('일반 1대1은 60자 내용·배부 교재·진도·숙제 분량을 나누고 입력 검사를 즉시 표시한다', () => {
  const one = detail({ kindKey: 'class', subjectName: 'Algebra', students: [detail().students[0]] });
  const view = render(<StructuredReportDraft detail={one} kind="individual" bookOptions={books} />);
  expect(view.getByLabelText('수업 내용')).toBeTruthy();
  expect(within(view.getByRole('group', { name: '진도 페이지 교재' })).getByRole('button', { name: 'Algebra Practice · 2026판' })).toBeTruthy();
  expect(view.getByLabelText('시작 쪽', { selector: '#structured-progress-from' })).toBeTruthy();
  expect(view.getByLabelText('숙제 분량')).toBeTruthy();

  fireEvent.click(view.getByRole('button', { name: '입력 검사' }));
  expect(view.getByText(/확인할 항목: 수업 내용 60자/)).toBeTruthy();
  expect(view.getByLabelText('수업 내용').getAttribute('aria-invalid')).toBe('true');
  expect(view.getAllByRole('alert').length).toBeGreaterThan(0);
});

it('일반 그룹은 공통 사항과 학생별 40자 의견 및 학생별 프롬프트를 제공한다', () => {
  const d = detail({ kindKey: 'class' });
  const view = render(<StructuredReportDraft detail={d} kind="group" bookOptions={books} />);
  expect(view.getByLabelText('공통 수업 사항')).toBeTruthy();
  expect(view.getByLabelText('첫 학생 개별 의견')).toBeTruthy();
  expect(view.getByLabelText('둘째 학생 개별 의견')).toBeTruthy();
  fireEvent.change(view.getByLabelText('첫 학생 개별 의견'), { target: { value: '짧음' } });
  expect(view.getByText('40자 이상 써 주세요')).toBeTruthy();
  expect(view.getByRole('button', { name: '첫 학생 복사하기' })).toBeTruthy();
  expect(view.getByRole('button', { name: '둘째 학생 복사하기' })).toBeTruthy();
});

it('입력값을 자동 채운 프롬프트만 clipboard로 복사하고 성공 문구를 정확히 표시한다', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  const one = detail({ kindKey: 'class', subjectName: 'Algebra', students: [detail().students[0]] });
  const view = render(<StructuredReportDraft detail={one} kind="individual" bookOptions={books} />);

  fireEvent.change(view.getByLabelText('수업 내용'), { target: { value: '개념 이해와 예제 적용을 함께 확인하고 풀이 과정을 말로 설명하도록 연습했습니다. 비슷한 문제도 스스로 해결했습니다.' } });
  for (const groupName of ['진도 페이지 교재', '숙제 페이지 교재']) {
    fireEvent.click(within(view.getByRole('group', { name: groupName })).getByRole('button', { name: 'Algebra Practice · 2026판' }));
  }
  fireEvent.change(view.getByLabelText('시작 쪽', { selector: '#structured-progress-from' }), { target: { value: '12' } });
  fireEvent.change(view.getByLabelText('끝 쪽', { selector: '#structured-progress-to' }), { target: { value: '18' } });
  fireEvent.change(view.getByLabelText('시작 쪽', { selector: '#structured-homework-from' }), { target: { value: '19' } });
  fireEvent.change(view.getByLabelText('끝 쪽', { selector: '#structured-homework-to' }), { target: { value: '22' } });
  fireEvent.change(view.getByLabelText('숙제 분량'), { target: { value: '홀수 문제 전부' } });
  fireEvent.click(view.getByRole('button', { name: '복사하기' }));

  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  const copied = writeText.mock.calls[0][0] as string;
  expect(copied).toContain('학생: 첫 학생 (G10)');
  expect(copied).toContain('과목: Algebra');
  expect(copied).toContain('Algebra Practice · 2026판 · p.12–18');
  expect(copied).toContain('분량 홀수 문제 전부');
  expect(view.getByRole('status').textContent).toBe('프롬프트가 복사되었습니다');
});

it('clipboard 권한 실패를 저장 성공으로 오인하지 않고 직접 복사 안내를 표시한다', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
  });
  const view = render(<StructuredReportDraft detail={detail({ students: [detail().students[0]] })} kind="kinder" />);
  fireEvent.click(view.getByRole('button', { name: '복사하기' }));
  await waitFor(() => expect(view.getByRole('status').textContent).toContain('복사하지 못했습니다'));
});

it('진단 그룹은 학생별 점수·오답·인터뷰 3영역을 분리하고 인터뷰 평균만 확정 산식으로 표시한다', () => {
  const view = render(<StructuredReportDraft detail={detail()} kind="diagnostic" />);
  expect(view.getByRole('region', { name: '첫 학생 진단' })).toBeTruthy();
  expect(view.getByRole('region', { name: '둘째 학생 진단' })).toBeTruthy();
  for (const area of INTERVIEW_AREAS) expect(view.getAllByLabelText(`인터뷰 · ${area.label}`)).toHaveLength(2);

  fireEvent.change(view.getAllByLabelText('인터뷰 · 유창성')[0], { target: { value: '70' } });
  fireEvent.change(view.getAllByLabelText('인터뷰 · 단어 다양성')[0], { target: { value: '80' } });
  fireEvent.change(view.getAllByLabelText('인터뷰 · 어법')[0], { target: { value: '90' } });
  expect(view.getByText('인터뷰 평균 80.0 · 전체 평균은 산식 결정 대기')).toBeTruthy();

  fireEvent.change(view.getAllByLabelText('수학 점수')[0], { target: { value: '101' } });
  expect(view.getByRole('alert').textContent).toContain('0부터 100 사이');
  expect(view.queryByLabelText(/레벨/)).toBeNull();
});
