import { fireEvent, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { ReportBody, ReportDetail, ReportField } from '@/api/types';
import { ReportEditor, ReportForm } from './ReportForm';

const fields: ReportField[] = [
  { key: 'content', label: '③ 수업 내용', hint: '이번 수업에서 다룬 내용', min: 1, max: 2000 },
  { key: 'progress', label: '④ 진도', hint: '어디까지 나갔는가', min: 1, max: 2000 },
  { key: 'homework', label: '⑤ 과제', hint: '다음 수업 전까지 할 일', min: 1, max: 2000 },
];
const body: ReportBody = { content: '', progress: '', homework: '' };

describe('ReportForm — OpenAPI 리포트 입력 계약', () => {
  it('서버가 내려준 순서와 세 키로만 입력을 그린다', () => {
    const view = render(<ReportForm fields={fields} value={body} onChange={() => undefined} />);
    const textareas = view.container.querySelectorAll('textarea');
    expect(textareas).toHaveLength(3);
    expect([...textareas].map((node) => node.id)).toEqual(['rep-content', 'rep-progress', 'rep-homework']);
    expect([...textareas].map((node) => node.maxLength)).toEqual([2000, 2000, 2000]);
  });

  it('입력한 키만 바꾼 같은 ReportBody를 돌려준다', () => {
    const onChange = vi.fn();
    const view = render(<ReportForm fields={fields} value={body} onChange={onChange} />);
    fireEvent.change(view.container.querySelector('#rep-progress')!, { target: { value: '수학 II 42p' } });
    expect(onChange).toHaveBeenCalledWith({ content: '', progress: '수학 II 42p', homework: '' });
  });

  it('읽기 전용은 입력 요소를 노출하지 않는다', () => {
    const view = render(<ReportForm fields={fields} value={{ ...body, content: '수업 내용' }} onChange={() => undefined} readOnly />);
    expect(view.container.querySelectorAll('textarea')).toHaveLength(0);
    expect(view.container.textContent).toContain('수업 내용');
  });

  it('승인 대기는 읽기 전용이며 반려를 선택할 때만 사유 입력 하나를 연다', () => {
    const detail: ReportDetail = {
      id: 1, serId: 2, date: '2026-09-03', onDate: '2026-09-03', startMin: 960,
      subKey: 'ap-chem', kindKey: 'class', teacherId: 3, teacherName: '강사', state: 'wait',
      written: true, students: [{ id: 4, name: '학생', grade: '고2', deliver: true }], minutesSinceEnd: 30, penalty: 0,
      body: { content: '수업', progress: '42p', homework: '43p' }, fields,
      canEdit: false, canReview: true, lang: 'ko', writtenAt: '2026-09-03T08:00:00Z',
      canExport: true, canDeliver: false,
      exportFiles: [{ studentId: 4, fileName: '20260903_학생_고2_AP Chemistry_16:00.png', plainText: '학생 본문' }],
      subjectName: 'AP Chemistry',
      submittedAt: '2026-09-03T08:00:00Z', reviewedAt: null, rejectReason: null,
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const view = render(
      <QueryClientProvider client={client}><ReportEditor detail={detail} subject="AP Chemistry" /></QueryClientProvider>,
    );

    expect(view.container.querySelectorAll('textarea')).toHaveLength(0);
    fireEvent.click(view.getByText('반려'));
    expect(view.container.querySelectorAll('textarea')).toHaveLength(1);
    expect((view.getByText('사유와 함께 반려') as HTMLButtonElement).disabled).toBe(true);
  });
});
