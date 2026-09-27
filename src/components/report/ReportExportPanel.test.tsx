/** @file-guide
 * 목적: ReportExportPanel.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { fireEvent, render, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReportDetail, ReportField } from '@/api/types';
import * as reportExport from '@/lib/report-export';
import { ReportExportPanel } from './ReportExportPanel';

const fields: ReportField[] = [
  { key: 'content', label: '③ 수업 내용', hint: '', min: 1, max: 2000 },
  { key: 'progress', label: '④ 진도 페이지', hint: '', min: 1, max: 2000 },
  { key: 'homework', label: '⑤ 숙제 페이지', hint: '', min: 1, max: 2000 },
];

const detail: ReportDetail = {
  id: 1, serId: 2, date: '2026-09-03', onDate: '2026-09-03', startMin: 960, endMin: 1020,
  subKey: 'ap-chem', kindKey: 'class', teacherId: 3, teacherName: '강사', state: 'wait',
  written: true,
  students: [
    { id: 4, name: '학생A', grade: '고2', deliver: true, late: false },
    { id: 5, name: '학생B', grade: null, deliver: true, late: false },
  ],
  minutesSinceEnd: 30, penalty: 0,
  body: { content: '수업', progress: '42p', homework: '43p' }, fields,
  canEdit: false, canReview: false, canExport: true, canDeliver: false,
  exportFiles: [
    { studentId: 4, fileName: '20260903_학생A_고2_AP Chemistry_16-00.png', plainText: '학생A 본문', revision: 'a'.repeat(64) },
    { studentId: 5, fileName: '20260903_학생B_학년미정_AP Chemistry_16-00.png', plainText: '학생B 본문', revision: 'b'.repeat(64) },
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
    fireEvent.click(view.getByText('PNG로 저장'));
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    expect(download.mock.calls[0][0].textContent).toContain(label);
    // 날짜는 원문 §50 의 긴 날짜 「26년 9월 4일 금요일」 (g5 50-04)
    expect(download.mock.calls[0][0].textContent).toContain('26년 9월 4일 금요일');
    fireEvent.click(view.getByText('글자로 복사'));
    await waitFor(() => expect(copy).toHaveBeenCalledWith(`서버 본문 ${label}`));
  });

  it('선택한 학생과 서버 파일명으로 같은 미리보기를 출력한다', async () => {
    const download = vi.spyOn(reportExport, 'downloadReportPng').mockResolvedValue(undefined);
    const view = render(<ReportExportPanel detail={detail} />);

    expect(view.getAllByText('학생A').length).toBeGreaterThan(0);
    fireEvent.change(view.getByLabelText('출력할 학생'), { target: { value: '5' } });
    expect(view.getAllByText('학생B').length).toBeGreaterThan(0);
    fireEvent.click(view.getByText('PNG로 저장'));

    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    expect(download.mock.calls[0]?.[1]).toBe('20260903_학생B_학년미정_AP Chemistry_16-00.png');
  });

  it('서버가 출력 권한을 닫으면 전문과 버튼을 노출하지 않는다', () => {
    const view = render(<ReportExportPanel detail={{ ...detail, canExport: false, exportFiles: [] }} />);
    expect(view.container.childElementCount).toBe(0);
  });

  it('학생 카드에서 전달한 학생으로 전문 선택을 시작한다', () => {
    const view = render(<ReportExportPanel detail={detail} initialStudentId={5} />);
    expect((view.getByLabelText('출력할 학생') as HTMLSelectElement).value).toBe('5');
    expect(view.getAllByText('학생B').length).toBeGreaterThan(0);
  });

  /**
   * g5 §50-03 · §50-04 · §50-05 — 문서 머리는 흰 바탕 · 이름(크게) + 학년 · 오른쪽 「TN ACADEMY」 · 아래 굵은 선,
   * 수업 줄에 **강사 이름**과 과목색, 칸은 2열(왼쪽 라벨 · 오른쪽 본문)의 한 블록(과목색 왼쪽 막대).
   */
  it('학부모 문서는 원문 머리 · 강사 이름 · 과목색 막대 · 2열 칸이다 (§50)', () => {
    const view = render(<ReportExportPanel detail={detail} />);
    const doc = view.getByTestId('report-document');
    expect(doc.textContent).toContain('TN ACADEMY');
    expect(doc.textContent).not.toContain('티엔아카데미');
    expect(doc.querySelector('header')?.className).toContain('bg-card');
    expect(doc.textContent).toContain('강사');
    const block = view.getByTestId('report-lesson-block');
    // 과목색 막대 — 알려진 과목은 공용 과목색 토큰(var(--sub-ap-chem))
    expect(block.style.borderLeftColor).toContain('--sub-ap-chem');
    expect((within(block).getByText('AP Chemistry') as HTMLElement).style.color)
      .toBe('color-mix(in srgb, var(--sub-ap-chem) 30%, var(--fg))');
    const terms = [...block.querySelectorAll('dt')].map((dt) => dt.textContent);
    expect(terms).toEqual(['수업 내용', '진도 페이지', '숙제 페이지']);
    expect(block.querySelectorAll('dd')).toHaveLength(3);
  });

  /**
   * 강사 393px 점검 — 문서는 overflow-hidden 이라 끊을 곳 없는 긴 글(링크 등)이 넘치면 잘려 안 보인다.
   * 본문 칸은 낱말 안에서도 줄을 바꾸고, 머리의 이름 칸은 줄어들 수 있고 「TN ACADEMY」는 줄지 않는다.
   */
  it('좁은 화면에서도 긴 본문은 줄을 바꾸고 머리 이름 칸이 로고를 밀어내지 않는다 (393px)', () => {
    const view = render(<ReportExportPanel detail={detail} />);
    const block = view.getByTestId('report-lesson-block');
    for (const dd of block.querySelectorAll('dd')) expect(dd.className).toContain('break-words');
    const header = view.getByTestId('report-document').querySelector('header')!;
    expect((header.firstElementChild as HTMLElement).className).toContain('min-w-0');
    expect(view.getByText('TN ACADEMY').className).toContain('shrink-0');
  });
});
