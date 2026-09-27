/** @file-guide
 * 목적: EventBlock.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Occurrence } from '@/api/types';
import { EventBlock, blockDetailLines } from './EventBlock';
import { Legend } from './Legend';

const occurrence: Occurrence = {
  serId: 1,
  date: '2026-09-03',
  onDate: '2026-09-03',
  startMin: 960,
  endMin: 1020,
  kindKey: 'class',
  extra: false,
  subKey: 'ap-chem',
  title: 'AP Chemistry',
  teacherId: 6,
  teacherName: '이다현',
  roomId: 1,
  roomName: '2층 A강의실',
  zaccId: null,
  mode: 'offline',
  canceled: false,
  hasException: false,
  recurring: true,
  repState: 'ok', ended: true,
  written: true,
  attendanceMode: 'readonly',
  attendance: null,
  students: [],
};

describe('EventBlock', () => {
  it('드래그 권한이 없어도 읽기 전용 상세 버튼은 활성 상태로 열린다', () => {
    const onClick = vi.fn();
    const view = render(<EventBlock occ={occurrence} draggable={false} onClick={onClick} />);
    const button = view.getByRole('button', { name: /AP Chemistry/ });

    expect(button.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('추가 수업(extra)은 「추가」 배지로 갈린다 — 판정은 서버의 extra 다 (C94-d · C-38)', () => {
    const view = render(<EventBlock occ={{ ...occurrence, extra: true }} draggable={false} />);
    expect(view.getByText('추가')).toBeTruthy();
    cleanup();
    const plain = render(<EventBlock occ={occurrence} draggable={false} />);
    expect(plain.queryByText('추가')).toBeNull();
  });

  it('관리자 과목색은 리포트 상태가 바뀌어도 유지되고 온라인만 점선·사선으로 구분한다', () => {
    const view = render(<EventBlock occ={{ ...occurrence, repState: 'plan' }} color="#5677A5" />);
    const block = view.getByRole('button', { name: /AP Chemistry/ });
    expect(block.style.getPropertyValue('--event-color')).toBe('#5677A5');
    expect(block.className).toContain('subject');
    expect(block.classList.contains('border-solid')).toBe(true);
    expect(block.className).not.toContain('online');
    expect(block.classList.contains('bg-blue/10')).toBe(false);

    view.rerender(<EventBlock occ={{ ...occurrence, repState: 'rej', mode: 'online' }} color="#5677A5" />);
    expect(block.style.getPropertyValue('--event-color')).toBe('#5677A5');
    expect(block.classList.contains('border-dashed')).toBe(true);
    expect(block.className).toContain('online');
    expect(block.classList.contains('bg-violet/10')).toBe(false);
  });

  it('색 주입 뒤에도 학생명·취소·예외·선택·modifier와 resize 클릭 경계를 유지한다', () => {
    const onClick = vi.fn();
    const onSelect = vi.fn();
    const occ = { ...occurrence, canceled: true, hasException: true,
      students: [{ id: 1, name: '수강 학생', droppedOnce: false, paused: false }] };
    const view = render(<EventBlock occ={occ} color="#5677A5" selected draggable resizable onClick={onClick} onSelect={onSelect} />);
    const block = view.getByRole('button', { name: /AP Chemistry/ });
    expect(view.getByText('수강 학생')).toBeTruthy();
    expect(view.getByText('예외 있음')).toBeTruthy();
    expect(block.className).toContain('line-through');
    expect(block.className).toContain('opacity-45');
    expect(block.className).toContain('ring-2');
    expect(block.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(block, { ctrlKey: true });
    expect(onSelect).toHaveBeenLastCalledWith(occ, 'toggle');
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(block, { shiftKey: true });
    expect(onSelect).toHaveBeenLastCalledWith(occ, 'range');
    fireEvent.click(view.getByLabelText('길이 조절'));
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.keyDown(block, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith(occ, 'single');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('색을 주입하지 않은 기존 상태 표현의 예정 파랑을 유지한다', () => {
    const view = render(<EventBlock occ={{ ...occurrence, repState: 'plan' }} />);
    const block = view.getByRole('button', { name: /AP Chemistry/ });
    expect(block.classList.contains('bg-blue/10')).toBe(true);
    expect(block.style.getPropertyValue('--event-color')).toBe('');
  });

  /**
   * 원문 §07·§08 블록 = 제목 / 담당 강사 / 「학생, 학생 외 N · 현장 6호」 + 오른쪽 배지(종류 · 리포트 상태).
   * 전부 이미 오는 값(Occurrence · 코드표)이다 — 블록이 새로 판정하지 않는다.
   */
  it('블록은 담당 강사 줄과 「학생 · 장소」 줄, 종류·리포트 배지를 이미 온 값으로 그린다 (§07·§08)', () => {
    const occ: Occurrence = {
      ...occurrence, kindKey: 'study', repState: 'rej',
      students: ['강라율', '고은설', '양찬욱'].map((name, i) => ({ id: i + 1, name, droppedOnce: false, paused: false })),
    };
    const view = render(<EventBlock occ={occ} subName="학습실" kindName="자습" color="#59988B" />);
    const block = view.getByRole('button', { name: /학습실/ });
    expect(view.getByText('이다현')).toBeTruthy();
    // 원문 「양찬욱, 고은설 외 3」 — 둘까지 적고 나머지는 수로 접는다
    expect(view.getByText('강라율, 고은설 외 1')).toBeTruthy();
    expect(view.getByText('현장 2층 A강의실')).toBeTruthy();
    expect(view.getByText('자습')).toBeTruthy();
    expect(view.getByText('리포트 반려')).toBeTruthy();
    // 접힌 이름과 배지는 title 로 되찾는다 — 잘린 글자는 언제나 되찾을 수 있어야 한다
    const title = block.getAttribute('title') ?? '';
    for (const word of ['16:00–17:00', '학습실', '이다현', '강라율', '고은설', '양찬욱', '현장 2층 A강의실', '자습', '리포트 반려']) {
      expect(title).toContain(word);
    }
  });

  it('온라인은 줌 계정 이름을 장소로 쓰고, 기본 종류(수업)와 끝난 리포트에는 배지를 달지 않는다', () => {
    const view = render(<EventBlock occ={{ ...occurrence, mode: 'online', roomName: null, zaccId: 1, repState: 'ok' }}
      subName="AP Chem" kindName="수업" zaccLabel="TN Zoom 1" color="#5677A5" />);
    expect(view.getByText('온라인 TN Zoom 1')).toBeTruthy();
    expect(view.queryByText('수업')).toBeNull();
    expect(view.queryByText('승인')).toBeNull();
    cleanup();
    const waiting = render(<EventBlock occ={{ ...occurrence, repState: 'wait' }} subName="AP Chem" kindName="수업" />);
    expect(waiting.getByText('승인 대기')).toBeTruthy();
  });

  it('원문 §07 범례 「[미작성] 리포트」 — 끝났는데 리포트가 없는 수업은 과목색 보기에서도 빨간 「미작성」 배지를 단다', () => {
    const three = ['양찬욱', '이유찬', '오유준'].map((name, i) => ({ id: i + 1, name, droppedOnce: false, paused: false }));
    const late = { ...occurrence, repState: 'none' as const, written: false, students: three };
    const view = render(<EventBlock occ={late} subName="MAP Math" color="#5677A5" cap={4} />);
    const badge = view.getByText('미작성');
    expect(badge.className).toContain('bg-red');
    expect(badge.className).toContain('text-white');
    expect(view.getByRole('button', { name: /MAP Math/ }).getAttribute('title')).toContain('미작성');
    // 배지 자리는 하나다 — 배지가 서면 정원 점은 title 로만 간다(승인 대기 · 반려와 같은 규칙)
    expect(view.container.querySelector('[data-cap-dots]')).toBeNull();
    cleanup();

    // 예정 · 작성 중 · 승인은 배지가 없다 — 원문 어느 블록·범례에도 그 배지가 없다
    for (const repState of ['plan', 'draft', 'ok'] as const) {
      const other = render(<EventBlock occ={{ ...occurrence, repState }} subName="MAP Math" color="#5677A5" />);
      expect(other.queryByText('미작성')).toBeNull();
      cleanup();
    }
  });

  it('「승인 대기」와 「리포트 반려」 배지는 컷(§07 · §08)처럼 같은 황토 채움 · 흰 글자다', () => {
    for (const [repState, word] of [['wait', '승인 대기'], ['rej', '리포트 반려']] as const) {
      const view = render(<EventBlock occ={{ ...occurrence, repState }} subName="MAP Math" color="#5677A5" />);
      const badge = view.getByText(word);
      expect(badge.className).toContain('bg-amber');
      expect(badge.className).toContain('text-white');
      cleanup();
    }
  });

  it('휴강 회차는 서버가 리포트 대상 아님(na)으로 보낸다 — 블록은 받은 값 그대로라 리포트 배지가 없다', () => {
    // 판정은 서버 한 곳(스케줄 목록 = 리포트 목록 · A′) — 화면은 휴강을 다시 보고 배지를 고르지 않는다
    const canceled = { ...occurrence, repState: 'na' as const, written: false, canceled: true, cancelTreatLabel: '이월' };
    const view = render(<EventBlock occ={canceled} subName="MAP Math" color="#5677A5" />);
    for (const word of ['미작성', '승인 대기', '리포트 반려']) expect(view.queryByText(word)).toBeNull();
    expect(view.getByRole('button', { name: /MAP Math/ }).getAttribute('title')).toContain('휴강 · 이월');
  });

  it('과목도 제목도 없는 회차는 코드값 대신 종류 이름을 제목으로 쓰고, 같은 낱말을 배지로 또 달지 않는다', () => {
    const meeting = { ...occurrence, kindKey: 'meeting', subKey: null, title: null };
    const view = render(<EventBlock occ={meeting} kindName="회의" />);
    expect(view.getAllByText('회의')).toHaveLength(1);
    expect(view.queryByText('meeting')).toBeNull();
    expect(view.getByRole('button', { name: /회의/ }).getAttribute('title')).not.toContain('meeting');
  });

  it('세부 줄은 블록 높이만큼만 그린다 — 짧은 블록에 넘치지 않고 빠진 줄은 title 로 되찾는다', () => {
    // 시간 비례 격자 높이(HOUR_PX 56 · 위아래 2px) — 30분 26px · 45분 40px · 60분 54px · 90분 82px
    expect([26, 40, 54, 68, 82].map(blockDetailLines)).toEqual([0, 1, 2, 3, 4]);

    const occ: Occurrence = {
      ...occurrence, repState: 'wait', canceled: true, cancelTreatLabel: '이월',
      students: [{ id: 1, name: '수강 학생', droppedOnce: false, paused: false }],
    };
    const one = render(<EventBlock occ={occ} subName="AP Chem" lines={1} />);
    expect(one.getByText('이다현')).toBeTruthy();
    expect(one.queryByText('수강 학생')).toBeNull();
    expect(one.queryByText(/휴강 · 이월/)).toBeNull();
    expect(one.getByRole('button', { name: /AP Chem/ }).getAttribute('title')).toContain('휴강 · 이월');
    cleanup();

    // 두 줄이면 회계가 읽는 휴강 처리가 학생 이름보다 먼저 남는다 (C92)
    const two = render(<EventBlock occ={occ} subName="AP Chem" lines={2} />);
    expect(two.getByText('이다현')).toBeTruthy();
    expect(two.getByText(/휴강 · 이월/)).toBeTruthy();
    expect(two.queryByText('수강 학생')).toBeNull();
    cleanup();

    // compact(30분·월간 칸)는 제목 줄 하나 — 강사·배지도 그리지 않는다
    const compact = render(<EventBlock occ={occ} subName="AP Chem" compact />);
    expect(compact.queryByText('이다현')).toBeNull();
    expect(compact.queryByText('승인 대기')).toBeNull();
    expect(compact.getByRole('button', { name: /AP Chem/ }).getAttribute('title')).toContain('이다현');
  });

  it('범례는 활성 표의 과목/종류를 중복 없이 같은 색 resolver로 표시한다', () => {
    const colorOf = vi.fn((o: { subKey?: string | null }) => o.subKey ? '#5677A5' : '#736CAE');
    const meeting = { ...occurrence, serId: 2, subKey: null, title: '회의', kindKey: 'meeting' };
    const view = render(<Legend items={[occurrence, occurrence, meeting]} colorOf={colorOf}
      subName={() => 'AP Chemistry'} kindName={() => '회의'} />);
    expect(view.getAllByText('AP Chemistry')).toHaveLength(1);
    expect(view.getByText('AP Chemistry').style.getPropertyValue('--event-color')).toBe('#5677A5');
    expect(view.getByText('회의').style.getPropertyValue('--event-color')).toBe('#736CAE');
    expect(view.getByText('현장')).toBeTruthy();
    expect(view.getByText('온라인').className).toContain('online');
    expect(view.getByText('취소된 수업')).toBeTruthy();
    expect(view.queryByText('색 = 리포트를 썼는가')).toBeNull();
  });
});

/**
 * 원문 §07·§08 블록 오른쪽 위 「●●●○」(범례 「●●○ 정원 · 여석」) · 시간 비례 격자는 제목에 시각을 안 붙인다(§08 #5)
 * · 월간 칸은 테두리 없는 띠 모양(§09 #4) · 개인표 세 줄(§10 #7).
 */
describe('EventBlock 정원 점 · 시각 생략 · 월간 모양 · 개인표 줄', () => {
  const three = ['양찬욱', '이유찬', '오유준'].map((name, i) => ({ id: i + 1, name, droppedOnce: false, paused: false }));

  it('정원 점은 그날 명단(빠짐·휴원 제외)이 채운 자리만큼 차고 나머지는 빈 점이다 — title 에 「정원 3/4명」', () => {
    const occ: Occurrence = {
      ...occurrence, repState: 'ok',
      students: [...three, { id: 9, name: '빠진 학생', droppedOnce: true, paused: false }],
    };
    const view = render(<EventBlock occ={occ} subName="MAP Math" kindName="수업" cap={4} />);
    const dots = view.container.querySelector('[data-cap-dots]')!;
    expect(dots.querySelectorAll('.bg-current')).toHaveLength(3);
    expect(dots.querySelectorAll('.border-current')).toHaveLength(1);
    expect(view.getByRole('button', { name: /MAP Math/ }).getAttribute('title')).toContain('정원 3/4명');
  });

  it('배지 자리가 이미 찼거나(종류·리포트) 정원이 1이거나 점이 한 줄을 넘는 정원이면 점을 그리지 않는다', () => {
    const occ: Occurrence = { ...occurrence, students: three };
    const withReport = render(<EventBlock occ={{ ...occ, repState: 'rej' }} subName="MAP Math" cap={4} />);
    expect(withReport.container.querySelector('[data-cap-dots]')).toBeNull();
    expect(withReport.getByRole('button', { name: /MAP Math/ }).getAttribute('title')).toContain('정원 3/4명');
    cleanup();
    const study = render(<EventBlock occ={{ ...occ, kindKey: 'study' }} subName="학습실" kindName="자습" cap={12} />);
    expect(study.container.querySelector('[data-cap-dots]')).toBeNull();
    cleanup();
    const solo = render(<EventBlock occ={occ} subName="GPA" cap={1} />);
    expect(solo.container.querySelector('[data-cap-dots]')).toBeNull();
    cleanup();
    const compact = render(<EventBlock occ={occ} subName="MAP Math" cap={4} compact />);
    expect(compact.container.querySelector('[data-cap-dots]')).toBeNull();
  });

  it('시간 비례 격자(hideTime)는 제목에 시각을 붙이지 않고, 월간(기본)은 「16:00 AP Chem」처럼 붙인다 — 시각은 title 에 남는다', () => {
    const grid = render(<EventBlock occ={occurrence} subName="AP Chem" hideTime />);
    const block = grid.getByRole('button', { name: /AP Chem/ });
    expect(block.textContent?.startsWith('AP Chem')).toBe(true);
    expect(block.getAttribute('title')).toContain('16:00–17:00');
    cleanup();
    const month = render(<EventBlock occ={occurrence} subName="AP Chem" compact />);
    expect(month.getByRole('button', { name: /AP Chem/ }).textContent).toBe('16:00AP Chem');
  });

  it('월간 칸(flat)은 테두리 없는 왼쪽 띠 모양이다 — 과목색이 있을 때만(상태색 블록은 그대로)', () => {
    const flat = render(<EventBlock occ={occurrence} subName="AP Chem" color="#5677A5" flat compact />);
    expect(flat.getByRole('button', { name: /AP Chem/ }).className).toContain('flat');
    cleanup();
    const status = render(<EventBlock occ={occurrence} subName="AP Chem" flat compact />);
    expect(status.getByRole('button', { name: /AP Chem/ }).className).not.toContain('flat');
  });

  it('개인표 세 줄 — 과목 / 시간대 / 학생별이면 담당 강사 · 선생님별이면 학생 (원문 §10·§11)', () => {
    const occ: Occurrence = { ...occurrence, students: three };
    const student = render(<EventBlock occ={occ} subName="모의수업 B" person="student" lines={4} />);
    const block = student.getByRole('button', { name: /모의수업 B/ });
    expect(block.textContent).toBe('모의수업 B16:00 –17:00이다현');
    cleanup();
    const teacher = render(<EventBlock occ={occ} subName="GPA 관리" person="teacher" lines={4} />);
    expect(teacher.getByRole('button', { name: /GPA 관리/ }).textContent).toBe('GPA 관리16:00 –17:00양찬욱, 이유찬 외 1');
  });
});

describe('EventBlock 휴강 사유·휴원 모양 (원문 §07 범례)', () => {
  it('학생 결석 휴강은 「학생 결강」, 다른 사유는 「학원 취소」, 명단이 모두 휴원이면 「휴원」 모양이다', () => {
    const student = render(<EventBlock occ={{ ...occurrence, canceled: true, cancelKind: 'student_absent' }} subName="AP Chem" color="#5677A5" />);
    expect(student.getByRole('button', { name: /AP Chem/ }).className).toContain('cancelStudent');
    cleanup();
    const academy = render(<EventBlock occ={{ ...occurrence, canceled: true, cancelKind: 'holiday' }} subName="AP Chem" color="#5677A5" />);
    expect(academy.getByRole('button', { name: /AP Chem/ }).className).toContain('cancelAcademy');
    cleanup();
    const paused = render(<EventBlock occ={{ ...occurrence, students: [{ id: 1, name: '쉬는 학생', droppedOnce: false, paused: true }] }}
      subName="AP Chem" color="#5677A5" />);
    expect(paused.getByRole('button', { name: /AP Chem/ }).className).toContain('paused');
    cleanup();
    const plain = render(<EventBlock occ={{ ...occurrence, students: [{ id: 1, name: '나온 학생', droppedOnce: false, paused: false }] }}
      subName="AP Chem" color="#5677A5" />);
    const cls = plain.getByRole('button', { name: /AP Chem/ }).className;
    expect(cls).not.toContain('paused');
    expect(cls).not.toContain('cancel');
  });

  it('범례는 블록이 실제로 그리는 모양만 적는다 — 학생 결강 · 학원 취소 · 휴원 · 정원 · 여석, 접으면 줄이 접힌다', () => {
    const view = render(<Legend items={[occurrence]} colorOf={() => '#5677A5'} />);
    for (const word of ['학생 결강', '학원 취소', '휴원', '정원 · 여석']) expect(view.getByText(word)).toBeTruthy();
    expect(view.queryByText('강사 불가')).toBeNull();
    // 원문 「[미작성] 리포트」 — 블록 배지와 같은 낱말 · 같은 색(한 값)
    const unwritten = view.container.querySelector('[data-legend-unwritten]') as HTMLElement;
    expect(unwritten.textContent).toBe('미작성리포트');
    expect(unwritten.firstElementChild?.className).toContain('bg-red');
    // 「강사 불가」 띠는 회색 빗금이다 — §07 범례 견본 · 강사 덱 slide 16 「불가 시간이 회색」 (격자 띠와 범례가 같은 클래스)
    const css = readFileSync(join(process.cwd(), 'src/components/cal/EventBlock.module.css'), 'utf8');
    const band = css.match(/\.unavBand\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(band).toContain('var(--fg-subtle)');
    expect(band).not.toContain('var(--orange)');
    fireEvent.click(view.getByRole('button', { name: '접기' }));
    expect(view.queryByText('학생 결강')).toBeNull();
    expect(view.getByRole('button', { name: '펼치기' }).getAttribute('aria-expanded')).toBe('false');
  });
});

/**
 * 회차 메모 (N-57) — 원문 §08 블록 맨 아래 한 줄 「▎모의고사 오답 리뷰 우선」, 원문 §07 은 줄이 못 서는 블록에 「노트」 배지.
 * 높이가 모자라면 메모 줄이 가장 먼저 빠지고 그때만 배지가 선다. 글은 언제나 title 로 되찾는다.
 */
describe('EventBlock 회차 메모 (N-57)', () => {
  const memo: Occurrence = {
    ...occurrence, memo: '모의고사 오답 리뷰 우선',
    students: [{ id: 1, name: '고은성', droppedOnce: false, paused: false }],
  };

  it('줄이 들어가면 맨 아래 메모 줄로 서고 「노트」 배지는 달지 않는다', () => {
    const view = render(<EventBlock occ={memo} subName="SAT Reading" lines={3} />);
    const button = view.getByRole('button', { name: /SAT Reading/ });
    expect(button.textContent).toContain('모의고사 오답 리뷰 우선');
    expect(view.queryByText('노트')).toBeNull();
    expect(button.getAttribute('title')).toContain('노트: 모의고사 오답 리뷰 우선');
    cleanup();
  });

  it('높이가 모자라면 메모 줄이 먼저 빠지고 「노트」 배지가 대신 선다 — 강사·학생 줄은 남는다', () => {
    const view = render(<EventBlock occ={memo} subName="SAT Reading" lines={2} />);
    const button = view.getByRole('button', { name: /SAT Reading/ });
    expect(button.textContent).not.toContain('모의고사 오답 리뷰 우선');
    expect(view.getByText('노트')).toBeTruthy();
    expect(button.textContent).toContain('이다현');
    expect(button.textContent).toContain('고은성');
    // 빠진 글은 title 로 되찾는다
    expect(button.getAttribute('title')).toContain('노트: 모의고사 오답 리뷰 우선');
    cleanup();
  });

  it('메모가 없거나 공백뿐이면 줄도 배지도 없다', () => {
    const blank = render(<EventBlock occ={{ ...memo, memo: '   ' }} subName="SAT Reading" lines={1} />);
    expect(blank.queryByText('노트')).toBeNull();
    expect(blank.getByRole('button').getAttribute('title')).not.toContain('노트');
    cleanup();
    const none = render(<EventBlock occ={{ ...memo, memo: null }} subName="SAT Reading" lines={1} />);
    expect(none.queryByText('노트')).toBeNull();
    cleanup();
  });
});
