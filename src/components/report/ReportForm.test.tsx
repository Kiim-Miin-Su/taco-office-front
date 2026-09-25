/** @file-guide
 * 목적: ReportForm.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cleanup, fireEvent, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Me, ReportBody, ReportDetail, ReportField } from '@/api/types';
import { useSession } from '@/store/useSession';
import { LATE_TIERS_FIXTURE } from '@/components/teacher/late-tiers.fixture';
import { ReportEditor, ReportForm } from './ReportForm';

vi.mock('@/api/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/queries')>()),
  // 지각 차감 띠는 코드표(/meta)의 서버 구간을 그린다 — 네트워크 대신 서버 응답 모양 한 벌
  useMeta: (enabled = true) => ({ data: enabled ? { lateReportTiers: LATE_TIERS_FIXTURE } : undefined }),
}));

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
      id: 1, serId: 2, date: '2026-09-03', onDate: '2026-09-03', startMin: 960, endMin: 1020,
      subKey: 'ap-chem', kindKey: 'class', teacherId: 3, teacherName: '강사', state: 'wait',
      written: true, students: [{ id: 4, name: '학생', grade: '고2', deliver: true }], minutesSinceEnd: 30, penalty: 0,
      body: { content: '수업', progress: '42p', homework: '43p' }, fields,
      canEdit: false, canReview: true, lang: 'ko', writtenAt: '2026-09-03T08:00:00Z',
      canExport: true, canDeliver: false,
      exportFiles: [{ studentId: 4, fileName: '20260903_학생_고2_AP Chemistry_16-00.png', plainText: '학생 본문', revision: 'a'.repeat(64) }],
      subjectName: 'AP Chemistry',
      submittedAt: '2026-09-03T08:00:00Z', reviewedAt: null, rejectReason: null,
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const view = render(
      <QueryClientProvider client={client}><ReportEditor detail={detail} subject="AP Chemistry" /></QueryClientProvider>,
    );

    expect(view.container.querySelectorAll('textarea')).toHaveLength(0);
    fireEvent.click(view.getByText('반려'));
    expect(view.container.textContent).toContain('16:00–17:00');
    expect(view.container.querySelectorAll('textarea')).toHaveLength(1);
    expect((view.getByText('사유와 함께 반려') as HTMLButtonElement).disabled).toBe(true);

    // 같은 편집기는 강사 캘린더의 미래 회차에서도 사용한다. 시간 판정은 서버 값을 소비한다.
    view.rerender(
      <QueryClientProvider client={client}>
        <ReportEditor detail={{ ...detail, state: 'plan', minutesSinceEnd: -60, canReview: false }} subject="AP Chemistry" />
      </QueryClientProvider>,
    );
    expect(view.getByText('수업이 끝난 뒤 리포트를 작성할 수 있습니다.')).toBeTruthy();
    expect(view.queryByText('임시저장')).toBeNull();
    expect(view.queryByText('제출')).toBeNull();
    view.rerender(
      <QueryClientProvider client={client}>
        <ReportEditor detail={{ ...detail, startMin: null, endMin: null }} subject="AP Chemistry" />
      </QueryClientProvider>,
    );
    expect(view.container.textContent).toContain('시간 미정');
    expect(view.container.textContent).not.toContain('00:00');
  });
});

describe('ReportEditor — 지각 차감 안내는 쓰는 강사에게만 최상단 (대표 지시 2026-09-25)', () => {
  afterEach(() => { cleanup(); useSession.setState({ me: null, ready: false }); });
  const detail = (canEdit: boolean): ReportDetail => ({
    id: 1, serId: 2, date: '2026-09-03', onDate: '2026-09-03', startMin: 960, endMin: 1020,
    subKey: 'ap-chem', kindKey: 'class', teacherId: 3, teacherName: '강사', state: canEdit ? 'none' : 'wait',
    written: !canEdit, students: [{ id: 4, name: '학생', grade: '고2', deliver: true }], minutesSinceEnd: 30, penalty: 0,
    body: { content: '', progress: '', homework: '' }, fields,
    canEdit, canReview: false, lang: 'ko', writtenAt: null,
    canExport: false, canDeliver: false, exportFiles: [], subjectName: 'AP Chemistry',
    submittedAt: null, reviewedAt: null, rejectReason: null,
  });
  const mount = (d: ReportDetail) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(<QueryClientProvider client={client}><ReportEditor detail={d} subject="AP Chemistry" /></QueryClientProvider>);
  };
  const as = (canAdminPage: boolean) => useSession.setState({
    me: { id: 3, name: '강사', canAdminPage, canCrudAll: canAdminPage } as unknown as Me, ready: true,
  });

  it('강사가 쓸 수 있는 양식이면 첫 줄에 안내가 온다', () => {
    as(false);
    const view = mount(detail(true));
    const note = view.getByRole('note', { name: '리포트 지각 제출 차감' });
    expect(note.textContent).toContain('1시간 지각 시5,000원 차감');
    expect(note.textContent).toContain('4시간 이후10,000원 차감');
    expect(view.container.firstElementChild?.firstElementChild?.contains(note)).toBe(true);
  });

  it('읽기 전용이거나 관리 화면 로그인이면 그리지 않는다', () => {
    as(false);
    expect(mount(detail(false)).queryByRole('note')).toBeNull();
    as(true);
    expect(mount(detail(true)).queryByRole('note')).toBeNull();
  });
});
