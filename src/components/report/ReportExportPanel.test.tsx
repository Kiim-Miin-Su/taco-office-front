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
  id: 1, serId: 2, date: '2026-09-03', onDate: '2026-09-03', startMin: 960,
  subKey: 'ap-chem', kindKey: 'class', teacherId: 3, teacherName: '강사', state: 'wait',
  written: true,
  students: [{ id: 4, name: '학생A', grade: '고2' }, { id: 5, name: '학생B', grade: null }],
  minutesSinceEnd: 30, penalty: 0,
  body: { content: '수업', progress: '42p', homework: '43p' }, fields,
  canEdit: false, canReview: false, canExport: true,
  exportFiles: [
    { studentId: 4, fileName: '20260903_학생A_고2_AP Chemistry_16:00.png' },
    { studentId: 5, fileName: '20260903_학생B_학년미정_AP Chemistry_16:00.png' },
  ],
  subjectName: 'AP Chemistry', lang: 'ko', writtenAt: '2026-09-03T08:00:00Z',
  submittedAt: '2026-09-03T08:00:00Z', reviewedAt: null, rejectReason: null,
};

describe('ReportExportPanel — 학생별 동일 전문', () => {
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
