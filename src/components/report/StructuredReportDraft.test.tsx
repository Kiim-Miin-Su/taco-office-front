/** @file-guide
 * 목적: 최신 종류별 리포트가 확정 kind/marker만 사용하고 현 legacy writer로 우회하지 않는지 검증한다. (test)
 * 책임/재사용: 실제 StructuredReportDraft의 영역·학생별 입력·점수 경계를 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReportDetail } from '@/api/types';
import { useSession } from '@/store/useSession';
import {
  DEVELOPMENT_AREAS, INTERVIEW_AREAS, StructuredReportDraft, structuredReportKind,
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

afterEach(() => {
  cleanup();
  useSession.setState({ me: null, ready: false });
  window.localStorage.clear();
});

describe('structuredReportKind — 추정 없는 최신 양식 분기', () => {
  it('명시 kind와 일반 그룹만 분기하고 class 1명은 Kinder로 추정하지 않는다', () => {
    expect(structuredReportKind(detail())).toBe('diagnostic');
    expect(structuredReportKind(detail({ kindKey: 'mock' }))).toBe('mock');
    expect(structuredReportKind(detail({ kindKey: 'class' }))).toBe('group');
    expect(structuredReportKind(detail({ kindKey: 'class', students: [detail().students[0]] }))).toBeNull();
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

it('일반 그룹은 공통 수업 내용과 학생 수만큼 40자 개별 의견을 제공한다', () => {
  const d = detail({ kindKey: 'class' });
  const view = render(<StructuredReportDraft detail={d} kind="group" />);
  expect(view.getByLabelText('공통 수업 내용')).toBeTruthy();
  expect(view.getByLabelText('첫 학생 개별 의견')).toBeTruthy();
  expect(view.getByLabelText('둘째 학생 개별 의견')).toBeTruthy();
  fireEvent.change(view.getByLabelText('첫 학생 개별 의견'), { target: { value: '짧음' } });
  expect(view.getByText('40자 이상 써 주세요')).toBeTruthy();
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
