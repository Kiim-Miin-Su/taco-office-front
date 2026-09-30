/** @file-guide
 * 목적: ReportDeliveryQueue.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReportDeliveryQueue as Queue, ReportDetail } from '@/api/types';
import * as queries from '@/api/queries';
import * as reportExport from '@/lib/report-export';
import { ReportDeliveryQueue } from './ReportDeliveryQueue';

vi.mock('@/api/queries', () => ({
  useReportDelivery: vi.fn(),
  useReportDeliverySend: vi.fn(),
}));

const report = (id: number, studentId: number, studentName: string): ReportDetail => ({
  id, serId: id + 100, date: '2026-09-04', onDate: '2026-09-04', startMin: 960, endMin: 1020,
  mode: 'offline',
  subKey: 'ap-chem', kindKey: 'class', teacherId: 3, teacherName: '강사', state: 'ok', written: true,
  students: [{ id: studentId, name: studentName, grade: '고2', deliver: true, late: false }],
  minutesSinceEnd: 30, penalty: 0,
  body: { content: '수업', progress: '42p', homework: '43p' },
  fields: [
    { key: 'content', label: '③ 수업 내용', hint: '', min: 1, max: 2000 },
    { key: 'progress', label: '④ 진도', hint: '', min: 1, max: 2000 },
    { key: 'homework', label: '⑤ 과제', hint: '', min: 1, max: 2000 },
  ],
  canEdit: false, canReview: false, canExport: true, canDeliver: true,
  exportFiles: [{
    studentId,
    fileName: `20260904_${studentName}_고2_AP Chemistry_16-00.png`,
    plainText: `${studentName} 서버 본문`,
    revision: String(id).padStart(64, '0'),
  }],
  subjectName: 'AP Chemistry', lang: 'ko', writtenAt: '2026-09-04T08:00:00Z',
  submittedAt: '2026-09-04T08:00:00Z', reviewedAt: '2026-09-04T09:00:00Z', rejectReason: null,
});

const first = report(11, 21, '학생A');
const second = report(12, 22, '학생B');
// 미승인(검토 대기) 수업 — 서버가 내보내기 descriptor 를 주지 않는다
const blocked: ReportDetail = { ...report(13, 23, '학생C'), state: 'wait', canExport: false, exportFiles: [] };

const queue: Queue = {
  onDate: '2026-09-04', total: 3, remaining: 2, blocked: 1,
  students: [
    { student: first.students[0], reports: [first], canSend: true, blockedCount: 0, lastSendId: null, lastSentAt: null },
    { student: second.students[0], reports: [second], canSend: true, blockedCount: 0, lastSendId: null, lastSentAt: null },
    { student: blocked.students[0], reports: [blocked], canSend: false, blockedCount: 1, lastSendId: null, lastSentAt: null },
  ],
};

describe('ReportDeliveryQueue — 학생 단위 계약 재사용', () => {
  const mutateAsync = vi.fn();

  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  beforeEach(() => {
    vi.mocked(queries.useReportDelivery).mockReturnValue({ data: queue, isLoading: false, isError: false } as never);
    vi.mocked(queries.useReportDeliverySend).mockReturnValue({ mutateAsync, isPending: false } as never);
    mutateAsync.mockReset();
    vi.spyOn(reportExport, 'renderReportPng').mockResolvedValue('data:image/png;base64,iVBORw0KGgo=');
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002');
  });

  /**
   * G-68 「강사별 독촉 버튼 제공」 — 막힌(내보낼 수 없는) 수업을 강사별로 모아 이 화면에서 바로 독촉한다. 독촉할 수 있는 강사인지는
   * 「안 쓴 리포트」와 같은 서버 집합(byTeacher)이 정한다 — 승인만 남은 강사는 단추 대신 「승인 대기」라 적는다(독촉해도 할 일이 없다).
   */
  it('막힌 수업을 강사별로 모아 독촉 단추를 세우고, 승인만 남은 강사는 「승인 대기」라 적는다 (G-68)', () => {
    const draft: ReportDetail = { ...report(14, 24, '학생D'), teacherId: 7, teacherName: '박은지', state: 'draft', canExport: false, exportFiles: [] };
    vi.mocked(queries.useReportDelivery).mockReturnValue({ data: {
      ...queue, blocked: 2,
      students: [...queue.students, { student: draft.students[0], reports: [draft], canSend: false, blockedCount: 1, lastSendId: null, lastSentAt: null }],
    }, isLoading: false, isError: false } as never);
    const onRemind = vi.fn();
    const view = render(<ReportDeliveryQueue onOpenReport={vi.fn()} remind={{ teacherIds: new Set([7]), pending: false, message: null, onRemind }} />);
    const strip = view.getByRole('region', { name: '강사별 독촉' });
    expect(strip.textContent).toContain('박은지 1건');
    expect(strip.textContent).toMatch(/강사 1건\s*· 승인 대기/);
    fireEvent.click(view.getByRole('button', { name: '박은지 강사에게 독촉' }));
    expect(onRemind).toHaveBeenCalledWith(7);
    expect(view.queryByRole('button', { name: '강사 강사에게 독촉' })).toBeNull();
  });

  /** all160 G-68+ — 실제 미승인(`wait`) 줄은 전문을 볼 수 있다(canExport). 그래도 발송은 막히므로 강사별 줄에 「승인 대기」로 선다 */
  it('전문을 볼 수 있는 미승인 줄도 막힌 수업으로 센다 — 서버 blockedCount 와 같은 정의 (G-68)', () => {
    const waiting: ReportDetail = { ...report(15, 25, '학생E'), teacherId: 9, teacherName: '김재훈', state: 'wait' };
    vi.mocked(queries.useReportDelivery).mockReturnValue({ data: {
      ...queue, blocked: 2,
      students: [...queue.students, { student: waiting.students[0], reports: [waiting], canSend: false, blockedCount: 1, lastSendId: null, lastSentAt: null }],
    }, isLoading: false, isError: false } as never);
    const view = render(<ReportDeliveryQueue onOpenReport={vi.fn()} remind={{ teacherIds: new Set(), pending: false, message: null, onRemind: vi.fn() }} />);
    const strip = view.getByRole('region', { name: '강사별 독촉' });
    expect(strip.textContent).toMatch(/김재훈 1건\s*· 승인 대기/);
    expect(view.queryByRole('button', { name: '김재훈 강사에게 독촉' })).toBeNull();
  });

  it('미승인 학생은 선택하지 않고 PNG를 학생별 요청으로 순차 전송한다', async () => {
    mutateAsync.mockResolvedValueOnce({ id: 1 }).mockRejectedValueOnce(new Error('second failed'));
    const view = render(<ReportDeliveryQueue onOpenReport={vi.fn()} />);

    expect((view.getByRole('checkbox', { name: /학생C/ }) as HTMLInputElement).disabled).toBe(true);
    // 원문 §49 오른쪽 한 단추 「9명 전부 완료」 — 아무도 고르지 않았으면 보낼 수 있는(서버 canSend) 학생 전부다 (g5 49-02)
    expect(view.queryByRole('button', { name: '전체 선택' })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: '2명 전부 완료' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    expect(mutateAsync.mock.calls[0]?.[0]).toMatchObject({
      requestKey: '00000000-0000-4000-8000-000000000001',
      onDate: '2026-09-04',
      studentId: 21,
      files: [{ repId: 11, fileName: '20260904_학생A_고2_AP Chemistry_16-00.png', revision: first.exportFiles[0].revision }],
    });
    expect(mutateAsync.mock.calls[1]?.[0]).toMatchObject({ studentId: 22, files: [{ revision: second.exportFiles[0].revision }] });
    expect(mutateAsync.mock.calls[0]?.[0]).not.toBeInstanceOf(Array);
    expect(await view.findByText('1명까지 저장했습니다. 나머지는 이력을 확인한 뒤 다시 시도해 주세요.'))
      .toBeTruthy();
  });

  it('재조회로 미작성 수업이 유입되면 기존 선택도 서버 canSend 판정에 따라 발송에서 제외한다', () => {
    const onOpenReport = vi.fn();
    const view = render(<ReportDeliveryQueue onOpenReport={onOpenReport} />);
    fireEvent.click(view.getByRole('checkbox', { name: /학생A/ }));
    // 고르면 한 단추가 고른 학생만 보낸다(원문 동작 「개별 완료」)
    expect((view.getByRole('button', { name: '1명 완료' }) as HTMLButtonElement).disabled).toBe(false);

    const incoming: ReportDetail = { ...report(14, 21, '학생A'), state: 'none', written: false,
      canExport: false, canDeliver: false, exportFiles: [] };
    const current: Queue = { ...queue, remaining: 1, blocked: 2, students: [
      { ...queue.students[0], reports: [first, incoming], canSend: false, blockedCount: 1 },
      ...queue.students.slice(1),
    ] };
    vi.mocked(queries.useReportDelivery).mockReturnValue({ data: current, isLoading: false, isError: false } as never);
    view.rerender(<ReportDeliveryQueue onOpenReport={onOpenReport} />);
    const checkbox = view.getByRole('checkbox', { name: /학생A/ }) as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
    expect(checkbox.checked).toBe(false);
    // 고른 학생이 막혔다고 고르지 않은 학생을 대신 보내지 않는다 — 단추는 0명으로 잠긴다
    const send = view.getByRole('button', { name: '0명 완료' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(send);
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(reportExport.renderReportPng).not.toHaveBeenCalled();
  });

  /**
   * 원문 §49 — 「전문 보기 ›」는 **학생 카드에 한 번**이고(동작 「학생 카드 → 전문 보기」), 수업 줄은 읽는 줄이다(g5 49-05 · 50-01).
   * 아직 내보낼 수 없는(미승인) 수업 줄만 검토 서랍을 여는 단추로 남는다.
   */
  it('전문 보기는 학생 카드에 한 번이고 그 학생의 하루 묶음을 넘긴다 · 미승인 줄만 검토로 연다', () => {
    const onOpenReport = vi.fn();
    const onOpenStudent = vi.fn();
    const view = render(<ReportDeliveryQueue onOpenReport={onOpenReport} onOpenStudent={onOpenStudent} />);
    const card = view.getByRole('checkbox', { name: /학생A/ }).closest('article') as HTMLElement;
    const links = [...card.querySelectorAll('button')].filter((button) => /전문 보기/.test(button.textContent ?? ''));
    expect(links.length).toBe(1);
    fireEvent.click(links[0]!);
    expect(onOpenStudent).toHaveBeenCalledWith(queue.students[0]);
    // 승인된 수업 줄은 단추가 아니다
    expect(card.querySelectorAll('[data-report-line] button, button[data-report-line]').length).toBe(0);

    const blockedCard = view.getByRole('checkbox', { name: /학생C/ }).closest('article') as HTMLElement;
    expect([...blockedCard.querySelectorAll('button')].some((button) => /전문 보기/.test(button.textContent ?? ''))).toBe(false);
    fireEvent.click(blockedCard.querySelector('button[data-report-line]') as HTMLButtonElement);
    expect(onOpenReport).toHaveBeenCalledWith(blocked, 23);
  });

  it('머리 오른쪽은 「학생 N명」 한 줄과 한 단추다 (§49 · g5 49-02)', () => {
    const view = render(<ReportDeliveryQueue onOpenReport={vi.fn()} />);
    expect(view.getByText('학생 3명')).toBeTruthy();
    expect(view.queryByText(/보낼 수 있음/)).toBeNull();
    expect(view.getAllByRole('button').filter((button) => /완료$/.test(button.textContent ?? '')).length).toBe(1);
  });

  /**
   * 원본 §49 는 줄마다 **누가 쓴 리포트인지**를 적는다 — C86-f.
   * 한 학생에게 여러 강사의 리포트가 함께 나가는 자리라, 이름이 없으면
   * 「누가 쓴 것을 보내는지」를 모른다. 서버는 **처음부터 싣고 있었고 화면만 안 그렸다.**
   */
  it('보낼 리포트 줄에 강사 이름이 선다 (§49)', () => {
    const view = render(<ReportDeliveryQueue onOpenReport={vi.fn()} />);
    expect(view.container.textContent).toContain('AP Chemistry');
    expect(view.container.textContent).toContain('강사 강사');
  });

  /**
   * g5 §49-01 · §49-03 · §49-04 · §49-05 — 머리 「26년 9월 4일 금요일 수업분」 / 「어제 한 수업을 오늘 보냅니다」,
   * 넓은 화면 5열, 카드 머리 = 이름 · 학년 칩 · 오른쪽 「N건」, 수업 줄 왼쪽 과목색 막대 · 시각 · 과목 · 강사.
   */
  it('머리는 긴 날짜, 카드는 학년 칩과 건수, 줄은 과목색 막대다 (§49)', () => {
    const view = render(<ReportDeliveryQueue onOpenReport={vi.fn()} subjectColorOf={() => 'rgb(86, 119, 165)'} />);
    expect(view.getByRole('heading', { name: '26년 9월 4일 금요일 수업분' })).toBeTruthy();
    expect(view.getByText('어제 한 수업을 오늘 보냅니다')).toBeTruthy();
    expect(view.getByTestId('delivery-cards').className).toContain('2xl:grid-cols-5');
    const card = view.getByRole('checkbox', { name: /학생A/ }).closest('article') as HTMLElement;
    expect(card.textContent).toContain('고2');
    expect(card.textContent).toContain('1건');
    const line = card.querySelector('[data-report-line]') as HTMLElement;
    expect(line.style.borderLeftColor).toBe('rgb(86, 119, 165)');
    expect(line.textContent).toContain('16:00');
  });
});
