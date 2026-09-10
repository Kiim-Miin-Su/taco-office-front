/** @file-guide
 * 목적: ReportExportPanel.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReportDetail, ReportField } from '@/api/types';
import * as reportExport from '@/lib/report-export';
import { ReportExportPanel } from './ReportExportPanel';

const fields: ReportField[] = [
  { key: 'content', label: '③ 수업 내용', hint: '', min: 1, max: 2000 },
  { key: 'progress', label: '④ 진도', hint: '', min: 1, max: 2000 },
  { key: 'homework', label: '⑤ 과제', hint: '', min: 1, max: 2000 },
];

const detail: ReportDetail = {
  id: 1, serId: 2, date: '2026-09-03', onDate: '2026-09-03', startMin: 960, endMin: 1020,
  subKey: 'ap-chem', kindKey: 'class', teacherId: 3, teacherName: '강사', state: 'wait',
  written: true,
  students: [
    { id: 4, name: '학생A', grade: '고2', deliver: true },
    { id: 5, name: '학생B', grade: null, deliver: true },
  ],
  minutesSinceEnd: 30, penalty: 0,
  body: { content: '수업', progress: '42p', homework: '43p' }, fields,
  canEdit: false, canReview: false, canExport: true, canDeliver: false,
  exportFiles: [
    { studentId: 4, fileName: '20260903_학생A_고2_AP Chemistry_16:00.png', plainText: '학생A 본문', revision: 'a'.repeat(64) },
    { studentId: 5, fileName: '20260903_학생B_학년미정_AP Chemistry_16:00.png', plainText: '학생B 본문', revision: 'b'.repeat(64) },
  ],
  subjectName: 'AP Chemistry', lang: 'ko', writtenAt: '2026-09-03T08:00:00Z',
  submittedAt: '2026-09-03T08:00:00Z', reviewedAt: null, rejectReason: null,
};

describe('ReportExportPanel — 학생별 동일 전문', () => {
  it.each([
    { startMin: 960, endMin: 1020, label: '16:00–17:00' },
    { startMin: 1380, endMin: 1440, label: '23:00–24:00' },
    { startMin: null, endMin: null, label: '시간 미정' },
  ])('PNG 대상과 서버 본문은 동일 회차 범위를 전달한다: $label', async ({ startMin, endMin, label }) => {
    const download = vi.spyOn(reportExport, 'downloadReportPng').mockResolvedValue(undefined);
    const copy = vi.spyOn(reportExport, 'copyReportText').mockResolvedValue(undefined);
    const source = { ...detail, startMin, endMin, date: '2026-09-04', exportFiles: [
      { studentId: 4, fileName: 'server.png', plainText: `서버 본문 ${label}`, revision: 'a'.repeat(64) },
    ] };
    const view = render(<ReportExportPanel detail={source} />);
    expect(view.getByText(label)).toBeTruthy();
    fireEvent.click(view.getByText('PNG 저장'));
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    expect(download.mock.calls[0][0].textContent).toContain(label);
    expect(download.mock.calls[0][0].textContent).toContain('2026-09-04');
    fireEvent.click(view.getByText('본문 복사'));
    await waitFor(() => expect(copy).toHaveBeenCalledWith(`서버 본문 ${label}`));
  });

  it('선택한 학생과 서버 파일명으로 같은 미리보기를 출력한다', async () => {
    const download = vi.spyOn(reportExport, 'downloadReportPng').mockResolvedValue(undefined);
    const view = render(<ReportExportPanel detail={detail} />);

    expect(view.getAllByText('학생A').length).toBeGreaterThan(0);
    fireEvent.change(view.getByLabelText('출력할 학생'), { target: { value: '5' } });
    expect(view.getAllByText('학생B').length).toBeGreaterThan(0);
    fireEvent.click(view.getByText('PNG 저장'));

    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    expect(download.mock.calls[0]?.[1]).toBe('20260903_학생B_학년미정_AP Chemistry_16:00.png');
  });

  it('서버가 출력 권한을 닫으면 전문과 버튼을 노출하지 않는다', () => {
    const view = render(<ReportExportPanel detail={{ ...detail, canExport: false, exportFiles: [] }} />);
    expect(view.container.childElementCount).toBe(0);
  });
});
