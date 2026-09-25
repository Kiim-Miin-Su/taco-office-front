/** @file-guide
 * 목적: §50 리포트 전문 창 — 어제 보내기의 학생 카드에서 연 「학생 한 명의 하루 묶음」을 공용 Dialog 에 싣는지 검증한다.
 * 책임/재사용: 실제 ReportFullTextDialog 를 쓰고 복사·PNG 내려받기만 report-export 대역으로 센다. 파일 이름·본문은 서버 descriptor 값 그대로다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReportDeliveryStudent, ReportDetail } from '@/api/types';
import * as reportExport from '@/lib/report-export';
import { ReportFullTextDialog } from './ReportFullTextDialog';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

beforeEach(() => {
  vi.spyOn(reportExport, 'downloadReportPng').mockResolvedValue(undefined);
  vi.spyOn(reportExport, 'copyReportText').mockResolvedValue(undefined);
});

const lesson = (id: number, subjectName: string, startMin: number, patch: Partial<ReportDetail> = {}): ReportDetail => ({
  id, serId: id + 100, date: '2026-09-24', onDate: '2026-09-24', startMin, endMin: startMin + 60,
  subKey: 'map-math', kindKey: 'class', teacherId: 3, teacherName: '김재훈', state: 'ok', written: true,
  students: [{ id: 21, name: '이담흔', grade: 'G10', deliver: true }],
  minutesSinceEnd: 30, penalty: 0,
  body: { content: `${subjectName} 수업 내용`, progress: '42p', homework: '43p' },
  fields: [
    { key: 'content', label: '③ 수업 내용', hint: '', min: 1, max: 2000 },
    { key: 'progress', label: '④ 진도 페이지', hint: '', min: 1, max: 2000 },
    { key: 'homework', label: '⑤ 숙제 페이지', hint: '', min: 1, max: 2000 },
  ],
  canEdit: false, canReview: false, canExport: true, canDeliver: true,
  exportFiles: [{
    studentId: 21,
    fileName: `20260924_이담흔_G10_${subjectName}_${String(startMin / 60).padStart(2, '0')}-00.png`,
    plainText: `${subjectName} 서버 본문`,
    revision: String(id).padStart(64, '0'),
  }],
  subjectName, lang: 'ko', writtenAt: '2026-09-24T08:00:00Z',
  submittedAt: '2026-09-24T08:00:00Z', reviewedAt: '2026-09-24T09:00:00Z', rejectReason: null,
  ...patch,
});

const group = (reports: ReportDetail[]): ReportDeliveryStudent => ({
  student: { id: 21, name: '이담흔', grade: 'G10', deliver: true },
  reports, canSend: true, blockedCount: 0, lastSendId: null, lastSentAt: null,
});

/**
 * 원본 §50 — 「리포트 전문」 머리 = 「이담흔 · G10 · 26년 8월 20일 목요일 수업 1건」. 창은 **학생 한 명의 하루**다(원문 §49 동작
 * 「학생 카드 → 전문 보기」). 파일은 대표 결정(2026-08-27 §2 · D-R33)대로 **수업마다 한 장**이라 PNG 는 수업 수만큼 내려온다.
 */
it('학생 카드의 전문은 그날 수업을 한 창에 싣고 복사·PNG·닫기만 둔다 (§50 · 50-01)', async () => {
  const onClose = vi.fn();
  const math = lesson(11, 'MAP Math', 900);
  const vocab = lesson(12, 'Vocabulary', 480);
  const view = render(<ReportFullTextDialog group={group([vocab, math])} onClose={onClose} />);
  const dialog = view.getByRole('dialog', { name: '리포트 전문' });
  expect(dialog.textContent).toContain('이담흔 · G10 · 26년 9월 24일 목요일 수업 2건');
  expect(dialog.querySelectorAll('[data-testid="report-document"]').length).toBe(2);
  expect(dialog.textContent).toContain('MAP Math 수업 내용');
  expect(dialog.textContent).toContain('Vocabulary 수업 내용');
  // 전문을 읽는 자리에 작성 입력·편집 불가 배너를 싣지 않는다
  expect(dialog.querySelector('textarea, input, select')).toBeNull();
  expect(dialog.textContent).not.toContain('수정 권한');

  // 원문 아래 바 = 📋 글자로 복사 · 🖼 PNG로 저장 (g5 50-06) — 기호는 읽히지 않는 장식이다
  const copy = view.getByRole('button', { name: '글자로 복사' });
  const png = view.getByRole('button', { name: 'PNG로 저장' });
  expect(copy.textContent).toContain('📋');
  expect(png.textContent).toContain('🖼');

  fireEvent.click(copy);
  await waitFor(() => expect(reportExport.copyReportText).toHaveBeenCalledOnce());
  // 본문 글은 서버 descriptor 두 벌을 수업 차례 그대로 잇는다 — 화면이 본문을 다시 짓지 않는다
  expect(vi.mocked(reportExport.copyReportText).mock.calls[0]?.[0]).toBe('Vocabulary 서버 본문\n\nMAP Math 서버 본문');

  fireEvent.click(png);
  await waitFor(() => expect(reportExport.downloadReportPng).toHaveBeenCalledTimes(2));
  expect(vi.mocked(reportExport.downloadReportPng).mock.calls.map((call) => call[1])).toEqual([
    vocab.exportFiles[0].fileName, math.exportFiles[0].fileName,
  ]);
  expect(await view.findByText('PNG 2장 저장을 시작했습니다.')).toBeTruthy();

  fireEvent.click(view.getByRole('button', { name: '닫기' }));
  expect(onClose).toHaveBeenCalledOnce();
});

it('아직 내보낼 수 없는(미승인) 수업은 전문에 싣지 않고 그 사실만 적는다', () => {
  const approved = lesson(11, 'MAP Math', 900);
  const waiting = lesson(12, 'Writing', 1140, { state: 'wait', canExport: false, exportFiles: [] });
  const view = render(<ReportFullTextDialog group={{ ...group([approved, waiting]), canSend: false, blockedCount: 1 }} onClose={vi.fn()} />);
  const dialog = view.getByRole('dialog', { name: '리포트 전문' });
  expect(dialog.querySelectorAll('[data-testid="report-document"]').length).toBe(1);
  expect(dialog.textContent).not.toContain('Writing 수업 내용');
  expect(dialog.textContent).toContain('승인 전 리포트 1건은 싣지 않았습니다');
  expect(dialog.textContent).toContain('수업 1건');
});

it('고른 학생이 없으면 창이 닫혀 있다', () => {
  const view = render(<ReportFullTextDialog group={null} onClose={vi.fn()} />);
  expect(view.queryByRole('dialog')).toBeNull();
});
