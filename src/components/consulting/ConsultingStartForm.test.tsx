/** @file-guide
 * 목적: §29 시작 폼이 생성 DTO만 보내고 10종·복수 학생·지정 공개를 보존하는지 검증한다.
 * 책임/재사용: 실제 ConsultingStartForm을 렌더하며 서버 단계나 기본 항목을 테스트 fixture로 발명하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cleanup, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConsultingCreate, Meta } from '@/api/types';
import { todayKst } from '@/lib/calendar';
import { ConsultingStartForm } from './ConsultingStartForm';

/** 서버 `ConsultingListDto.types · requesters` 의 모양 — 화면은 이 낱말만 그린다(29-02 · 표를 따로 들지 않는다) */
const TYPE_WORDS = [
  { key: 'admissions', label: '국제학교 지원' }, { key: 'boarding', label: '미국 보딩스쿨' }, { key: 'transfer', label: '편입 · 전학' },
  { key: 'essay', label: '에세이 지도' }, { key: 'interview', label: '인터뷰 대비' }, { key: 'exam', label: '입학시험 대비' },
  { key: 'roadmap', label: '연간 로드맵' }, { key: 'college', label: '대학 지원' }, { key: 'portfolio', label: '포트폴리오' },
  { key: 'visa', label: '비자 · 서류' },
];
const REQUESTER_WORDS = [{ key: 'mother', label: '어머니' }, { key: 'father', label: '아버지' }];
const PICK_WORDS = { typeWords: TYPE_WORDS, requesterWords: REQUESTER_WORDS };

const meta = {
  kinds: [], subs: [], rooms: [], zaccs: [], invTypes: [], cancelReasons: [], cancelTreats: [], lateReportTiers: [], teacherPolicies: [], genders: [],
  staff: [
    { id: 2, name: '김민수', role: 'admin', canAdminPage: true, canGpaPack: true },
    { id: 3, name: '김범준', role: 'manager', canAdminPage: true, canGpaPack: true },
    { id: 6, name: '김재훈', role: 'teacher', canAdminPage: false, canGpaPack: false },
  ],
  students: [
    { id: 10, name: '고은성', grade: 'G12' },
    { id: 11, name: '강라율', grade: 'G11' },
  ],
} satisfies Meta;

describe('ConsultingStartForm', () => {
  it('「전체 비공개」는 대표만 고른다 — canSetPrivate 이 아니면 칸 자체가 없다 (S4 · §76)', () => {
    const view = render(<ConsultingStartForm {...PICK_WORDS} meta={meta} canSetPrivate={false} pending={false} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    expect(view.queryByRole('button', { name: '전체 비공개' })).toBeNull();
    // 나머지 셋은 그대로 — 막는 것은 비공개 지정 하나다
    expect(view.getByRole('button', { name: '전체 공개' })).toBeTruthy();
    expect(view.getByRole('button', { name: '수납만 공개' })).toBeTruthy();
    expect(view.getByRole('button', { name: '지정 공개' })).toBeTruthy();
    cleanup();
    const ceo = render(<ConsultingStartForm {...PICK_WORDS} meta={meta} canSetPrivate pending={false} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    expect(ceo.getByRole('button', { name: '전체 비공개' })).toBeTruthy();
  });

  it('원본 10종을 보이고 DTO 외 단계·기본 항목을 보내지 않는다', () => {
    const submit = vi.fn<(body: ConsultingCreate) => void>();
    const view = render(<ConsultingStartForm {...PICK_WORDS} meta={meta} canSetPrivate={false} pending={false} onCancel={vi.fn()} onSubmit={submit} />);
    expect(view.getAllByRole('button', { pressed: false }).filter((button) => button.textContent?.includes('학교') || button.textContent?.includes('지도')).length).toBeGreaterThan(0);
    expect(view.getByRole('button', { name: '국제학교 지원', pressed: true })).toBeTruthy();
    // 원본 §29 칩 그대로 — 가운뎃점 앞뒤를 띄운다(29-02). 낱말은 서버 것이다
    expect(view.getByRole('button', { name: '비자 · 서류' })).toBeTruthy();
    expect(view.getByRole('button', { name: '편입 · 전학' })).toBeTruthy();
    expect(view.getAllByRole('button').filter((b) => TYPE_WORDS.some((t) => t.label === b.textContent))).toHaveLength(10);

    fireEvent.click(view.getByRole('button', { name: '에세이 지도' }));
    fireEvent.click(view.getByRole('button', { name: '고은성' }));
    fireEvent.click(view.getByRole('button', { name: '강라율' }));
    fireEvent.click(view.getByRole('button', { name: '아버지' }));
    fireEvent.change(view.getByLabelText('담당 *'), { target: { value: '3' } });
    fireEvent.change(view.getByLabelText('금액 *'), { target: { value: '800000' } });
    fireEvent.change(view.getByLabelText('회차 *'), { target: { value: '6' } });
    fireEvent.change(view.getByLabelText('시작 *'), { target: { value: '2026-09-21' } });
    fireEvent.change(view.getByLabelText('종료 *'), { target: { value: '2026-10-20' } });
    fireEvent.click(view.getByRole('button', { name: '지정 공개' }));
    fireEvent.click(view.getByRole('button', { name: '김민수' }));
    fireEvent.click(view.getByRole('button', { name: '시작하기' }));

    expect(submit).toHaveBeenCalledWith({
      consType: 'essay', studentIds: [10, 11], requester: 'father', ownerId: 3,
      amount: 800000, sessions: 6, startOn: '2026-09-21', endOn: '2026-10-20',
      share: 'picked', pickedStaffIds: [2],
    });
    expect(Object.keys(submit.mock.calls[0][0]).sort()).not.toContain('stage');
    expect(Object.keys(submit.mock.calls[0][0]).sort()).not.toContain('items');
  });

  it('시작일은 오늘(KST)로 채워져 열린다 — 원본 §29 의 「08/21/2026」(컷의 오늘) · 종료는 비워 둔다(「꼭」 · 29-05)', () => {
    const view = render(<ConsultingStartForm {...PICK_WORDS} meta={meta} canSetPrivate={false} pending={false} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    expect((view.getByLabelText('시작 *') as HTMLInputElement).value).toBe(todayKst());
    expect((view.getByLabelText('종료 *') as HTMLInputElement).value).toBe('');
  });

  it('학생·날짜 순서·지정 공개 대상을 제출 전에 막는다', () => {
    const submit = vi.fn();
    const view = render(<ConsultingStartForm {...PICK_WORDS} meta={meta} canSetPrivate={false} pending={false} onCancel={vi.fn()} onSubmit={submit} />);
    fireEvent.change(view.getByLabelText('금액 *'), { target: { value: '1' } });
    fireEvent.change(view.getByLabelText('회차 *'), { target: { value: '1' } });
    fireEvent.change(view.getByLabelText('시작 *'), { target: { value: '2026-10-20' } });
    fireEvent.change(view.getByLabelText('종료 *'), { target: { value: '2026-09-21' } });
    fireEvent.submit(view.container.querySelector('form') as HTMLFormElement);
    expect(view.getByText('학생을 한 명 이상 선택해 주세요.')).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it('날짜 순서와 지정 공개 대상을 각각 막는다', () => {
    const submit = vi.fn();
    const view = render(<ConsultingStartForm {...PICK_WORDS} meta={meta} canSetPrivate={false} pending={false} onCancel={vi.fn()} onSubmit={submit} />);
    fireEvent.click(view.getByRole('button', { name: '고은성' }));
    fireEvent.change(view.getByLabelText('금액 *'), { target: { value: '1' } });
    fireEvent.change(view.getByLabelText('회차 *'), { target: { value: '1' } });
    fireEvent.change(view.getByLabelText('시작 *'), { target: { value: '2026-10-20' } });
    fireEvent.change(view.getByLabelText('종료 *'), { target: { value: '2026-09-21' } });
    fireEvent.submit(view.container.querySelector('form') as HTMLFormElement);
    expect(view.getByText('시작일과 종료일을 올바른 순서로 입력해 주세요.')).toBeTruthy();

    fireEvent.change(view.getByLabelText('종료 *'), { target: { value: '2026-11-20' } });
    fireEvent.click(view.getByRole('button', { name: '지정 공개' }));
    fireEvent.submit(view.container.querySelector('form') as HTMLFormElement);
    expect(view.getByText('지정 공개 대상을 한 명 이상 선택해 주세요.')).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it('전체 공개에서는 선택 대상 필드를 보내지 않고 관리자·매니저도 금액을 입력한다', () => {
    const submit = vi.fn<(body: ConsultingCreate) => void>();
    const view = render(<ConsultingStartForm {...PICK_WORDS} meta={meta} canSetPrivate={false} pending={false} onCancel={vi.fn()} onSubmit={submit} />);
    fireEvent.click(view.getByRole('button', { name: '고은성' }));
    fireEvent.change(view.getByLabelText('담당 *'), { target: { value: '3' } });
    fireEvent.change(view.getByLabelText('금액 *'), { target: { value: '900000' } });
    fireEvent.change(view.getByLabelText('회차 *'), { target: { value: '4' } });
    fireEvent.change(view.getByLabelText('시작 *'), { target: { value: '2026-09-21' } });
    fireEvent.change(view.getByLabelText('종료 *'), { target: { value: '2026-10-20' } });
    fireEvent.submit(view.container.querySelector('form') as HTMLFormElement);
    expect(submit.mock.calls[0][0].amount).toBe(900000);
    expect(submit.mock.calls[0][0]).not.toHaveProperty('pickedStaffIds');
  });
  it('원본 §29 모양 — 「누가 요청」 칩(필수 표시 없음) · 공개 범위 뜻 한 줄(서버 낱말) · 「시작하면」 세 줄 · 바닥 「취소」 왼쪽 (29-03 · 29-06 · 29-07 · 29-08)', () => {
    const words = [
      { key: 'all', label: '전체 공개', meaning: '관리자 누구나 봅니다' },
      { key: 'money_only', label: '수납만 공개', meaning: '금액만 보이고 내용은 숨깁니다' },
      { key: 'picked', label: '지정 공개', meaning: '고른 사람만 봅니다' },
      { key: 'private', label: '전체 비공개', meaning: '담당자와 대표만 봅니다' },
    ] as const;
    const view = render(<ConsultingStartForm {...PICK_WORDS} meta={meta} canSetPrivate={false} shareWords={words} pending={false} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    expect(view.getByText('누가 요청')).toBeTruthy();
    expect(view.queryByText('누가 요청 *')).toBeNull();
    expect(view.getByRole('button', { name: '어머니', pressed: true })).toBeTruthy();
    expect(view.getByText('관리자 누구나 봅니다')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '수납만 공개' }));
    expect(view.getByText('금액만 보이고 내용은 숨깁니다')).toBeTruthy();
    expect(view.getByText('꼭')).toBeTruthy();
    const box = view.getByRole('region', { name: '시작하면' });
    expect(box.textContent).toContain('금액을 넣으면 회계에 잡힙니다');
    fireEvent.change(view.getByLabelText('금액 *'), { target: { value: '800000' } });
    expect(box.textContent).toContain('계약 단계로 들어갑니다 · 계약서 → 피드백 → 전달 → 서명 → 수납');
    expect(box.textContent).toContain('회계에 ₩800,000으로 잡힙니다');
    expect(box.textContent).toContain('회차를 넣으면 스케줄에 컨설팅으로 들어갑니다');
    const footer = view.getByRole('button', { name: '시작하기' }).parentElement!;
    expect(footer.className).toContain('justify-between');
    expect(footer.firstElementChild?.textContent).toBe('취소');
  });
});
