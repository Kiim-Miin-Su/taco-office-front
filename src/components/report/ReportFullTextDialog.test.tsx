/** @file-guide
 * 목적: §50 리포트 전문 창 — 어제 보내기에서 연 리포트를 공용 Dialog 에 미리보기+내보내기만으로 싣는지 검증한다.
 * 책임/재사용: 실제 ReportFullTextDialog/ReportExportPanel 을 쓰고 이력 조회 컴포넌트만 표시로 대체한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReportDetail } from '@/api/types';
import { ReportFullTextDialog } from './ReportFullTextDialog';

vi.mock('./ReportDeliveryHistory', () => ({ ReportDeliveryHistory: () => <div>내보내기 이력 표</div> }));

afterEach(() => cleanup());

const detail: ReportDetail = {
  id: 11, serId: 111, date: '2026-09-24', onDate: '2026-09-24', startMin: 900, endMin: 960,
  subKey: 'map-math', kindKey: 'class', teacherId: 3, teacherName: '김재훈', state: 'ok', written: true,
  students: [{ id: 21, name: '이담흔', grade: 'G10', deliver: true }],
  minutesSinceEnd: 30, penalty: 0,
  body: { content: '수업 내용', progress: '42p', homework: '43p' },
  fields: [
    { key: 'content', label: '③ 수업 내용', hint: '', min: 1, max: 2000 },
    { key: 'progress', label: '④ 진도 페이지', hint: '', min: 1, max: 2000 },
    { key: 'homework', label: '⑤ 숙제 페이지', hint: '', min: 1, max: 2000 },
  ],
  canEdit: false, canReview: false, canExport: true, canDeliver: true,
  exportFiles: [{ studentId: 21, fileName: '20260924_이담흔_G10_MAP Math_15-00.png', plainText: '서버 본문', revision: 'a'.repeat(64) }],
  subjectName: 'MAP Math', lang: 'ko', writtenAt: '2026-09-24T08:00:00Z',
  submittedAt: '2026-09-24T08:00:00Z', reviewedAt: '2026-09-24T09:00:00Z', rejectReason: null,
};

it('「리포트 전문」 창에는 학부모 문서와 복사·PNG·닫기만 있다 — 작성 칸·편집 불가 배너·이력은 없다 (§50)', () => {
  const onClose = vi.fn();
  const view = render(<ReportFullTextDialog report={detail} studentId={21} onClose={onClose} />);
  const dialog = view.getByRole('dialog', { name: '리포트 전문' });
  expect(dialog.textContent).toContain('이담흔');
  expect(dialog.textContent).toContain('수업 내용');
  expect(view.getByRole('button', { name: '글자로 복사' })).toBeTruthy();
  expect(view.getByRole('button', { name: 'PNG로 저장' })).toBeTruthy();
  // 전문을 읽는 자리에 작성 입력·편집 불가 배너·내보내기 이력을 싣지 않는다
  expect(dialog.querySelector('textarea, input')).toBeNull();
  expect(dialog.textContent).not.toContain('수정 권한');
  expect(view.queryByText('내보내기 이력 표')).toBeNull();
  fireEvent.click(view.getByRole('button', { name: '닫기' }));
  expect(onClose).toHaveBeenCalledOnce();
});

it('고른 리포트가 없으면 창이 닫혀 있다', () => {
  const view = render(<ReportFullTextDialog report={null} onClose={vi.fn()} />);
  expect(view.queryByRole('dialog')).toBeNull();
});
