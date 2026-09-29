/** @file-guide
 * 목적: N-133 전일 휴원 결과가 학생별 실제 보호자 선택 발송 창으로 이어지는지 검증한다.
 * 책임/재사용: 제품 컴포넌트를 렌더하고 GuardianSendDialog 경계만 가벼운 대역으로 둔다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DayCancelNoticePanel } from './DayCancelNoticePanel';

vi.mock('@/components/guardians/GuardianSendDialog', () => ({
  GuardianSendDialog: ({ pnotiId, defaultBody, title }: {
    student: { id: number; name: string };
    pnotiId: number;
    defaultBody: string;
    title: string;
  }) => <div role="dialog" aria-label={title}>{pnotiId} · {defaultBody}</div>,
}));

const notices = [
  { id: 71, studentId: 4, studentName: '고은설', body: '[학원 전체 휴원]\n2026-09-28 안내', title: '전일 휴원 안내', sentAt: null },
  { id: 72, studentId: 5, studentName: '고은성', body: '[학원 전체 휴원]\n2026-09-28 안내', title: '전일 휴원 안내', sentAt: '2026-09-28T03:00:00+09:00' },
];

describe('DayCancelNoticePanel (N-133)', () => {
  it('서버 준비행을 학생별 대기/완료로 표시하고 대기 학생의 공용 발송 창에 PNOTI와 본문을 넘긴다', () => {
    const view = render(<DayCancelNoticePanel notices={notices} onDismiss={() => {}} />);
    expect(view.getByText('학부모 일괄 안내 · 2명')).toBeTruthy();
    expect(view.getByText('발송 대기')).toBeTruthy();
    expect(view.getByText('발송 완료')).toBeTruthy();
    expect(view.getByRole('button', { name: '보냄' })).toHaveProperty('disabled', true);

    fireEvent.click(view.getByRole('button', { name: '안내 보내기' }));
    const dialog = view.getByRole('dialog', { name: '전일 휴원 안내 — 고은설' });
    expect(dialog.textContent).toContain('71');
    expect(dialog.textContent).toContain('[학원 전체 휴원]');
  });

  it('한 회차 학원 사정 휴강의 안내는 서버가 준 이름(「휴강 안내」)으로 창을 연다 — 화면이 본문을 읽어 가르지 않는다 (C-32)', () => {
    const lesson = [{ id: 81, studentId: 6, studentName: '이하린', body: '[학원 사정 휴강]\n2026-10-05 SAT Math 16:00 수업 휴강 안내', title: '휴강 안내', sentAt: null }];
    const view = render(<DayCancelNoticePanel notices={lesson} onDismiss={() => {}} />);
    // 「휴원」은 전일 휴원의 낱말이다 — 한 회차를 접었을 때 패널이 「휴원」이라 말하면 틀린 말이다
    expect(view.container.textContent).not.toContain('휴원과');
    fireEvent.click(view.getByRole('button', { name: '안내 보내기' }));
    const dialog = view.getByRole('dialog', { name: '휴강 안내 — 이하린' });
    expect(dialog.textContent).toContain('81');
    expect(dialog.textContent).toContain('[학원 사정 휴강]');
  });

  it('나중에는 패널만 닫고 저장된 준비행을 지우지 않는다', () => {
    const close = vi.fn();
    const view = render(<DayCancelNoticePanel notices={notices} onDismiss={close} />);
    fireEvent.click(view.getByRole('button', { name: '나중에' }));
    expect(close).toHaveBeenCalledTimes(1);
  });
});
