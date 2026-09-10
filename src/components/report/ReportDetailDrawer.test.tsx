/** @file-guide
 * 목적: ReportDetailDrawer.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { query, editor, exporter } = vi.hoisted(() => ({ query: vi.fn(), editor: vi.fn(), exporter: vi.fn() }));
vi.mock('@/api/queries', () => ({ useReportDetail: query }));
vi.mock('./ReportForm', () => ({ ReportEditor: editor }));
vi.mock('./ReportExportPanel', () => ({ ReportExportPanel: exporter }));
import { ReportDetailDrawer } from './ReportDetailDrawer';

beforeEach(() => { vi.clearAllMocks(); editor.mockReturnValue(null); exporter.mockReturnValue(null); query.mockReturnValue({}); });
afterEach(cleanup);

it('닫혀 있으면 조회 키와 모달을 비활성화한다', () => {
  const view = render(<ReportDetailDrawer selection={null} onClose={() => undefined} />);
  expect(query).toHaveBeenLastCalledWith(undefined, undefined);
  expect(view.queryByRole('dialog')).toBeNull();
  expect(editor).not.toHaveBeenCalled();
});

it('표시 날짜가 아니라 원래 회차 키로 조회하고 기존 편집기/전문을 공유한다', () => {
  const data = { id: 1, date: '2026-09-08', onDate: '2026-09-07', state: 'none',
    subjectName: '수학', teacherName: '담당', canEdit: true, canReview: false };
  query.mockReturnValue({ data });
  const view = render(<ReportDetailDrawer selection={{ serId: 2, onDate: data.onDate }} onClose={() => undefined} />);
  expect(query).toHaveBeenLastCalledWith(2, '2026-09-07');
  expect(view.getByText('2026-09-08 · 수학 · 담당')).toBeTruthy();
  expect(editor.mock.calls[0][0]).toEqual({ detail: data, subject: '수학' });
  expect(exporter.mock.calls[0][0]).toEqual({ detail: data });
});

it('실패를 빈 리포트나 편집 폼으로 대체하지 않는다', () => {
  query.mockReturnValue({ isError: true });
  const view = render(<ReportDetailDrawer selection={{ serId: 2, onDate: '2026-09-07' }} onClose={() => undefined} />);
  expect(view.getByText('리포트 상세를 불러오지 못했습니다.')).toBeTruthy();
  expect(editor).not.toHaveBeenCalled();
});

it('배경 재조회가 실패해도 열려 있는 편집기와 미저장 초안을 보존한다', () => {
  const data = { id: 1, date: '2026-09-07', state: 'draft', canEdit: true };
  editor.mockReturnValue(<textarea aria-label="미저장 초안" defaultValue="" />);
  query.mockReturnValue({ data });
  const props = { selection: { serId: 2, onDate: data.date }, onClose: () => undefined };
  const view = render(<ReportDetailDrawer {...props} />);
  const input = view.getByRole('textbox', { name: '미저장 초안' });
  fireEvent.change(input, { target: { value: '작성 중인 내용' } });
  query.mockReturnValue({ data, isError: true, isRefetchError: true });
  view.rerender(<ReportDetailDrawer {...props} />);
  expect(view.getByRole('textbox', { name: '미저장 초안' })).toBe(input);
  expect((input as HTMLTextAreaElement).value).toBe('작성 중인 내용');
  expect(view.getByText('최신 상태를 다시 확인하지 못했습니다. 작성 중인 내용은 유지됩니다.')).toBeTruthy();
});
