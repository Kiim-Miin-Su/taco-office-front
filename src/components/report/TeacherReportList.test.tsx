/** @file-guide
 * 목적: 강사 리포트 목록의 모바일 카드·웹 표가 같은 행과 선택 동작을 공유하는지 검증한다.
 * 책임/재사용: CSS breakpoint 자체가 아니라 두 표현의 데이터·액션 동등성을 확인한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { fireEvent, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { ReportRow } from '@/api/types';
import { TeacherReportList } from './TeacherReportList';

const row: ReportRow = {
  id: 1, serId: 11, date: '2026-09-14', onDate: '2026-09-14', startMin: 600, endMin: 660,
  subKey: 'writing', kindKey: 'class', teacherId: 7, teacherName: '김재훈', state: 'none', written: false,
  students: [{ id: 1, name: '학생A', deliver: true, late: false }], minutesSinceEnd: 30, penalty: 0,
};

it('모바일 카드와 웹 표가 같은 리포트를 열고 같은 상태를 표시한다', () => {
  const onOpen = vi.fn();
  const view = render(<TeacherReportList rows={[row]} subjectName={() => 'Writing'} onOpen={onOpen} />);
  expect(view.getAllByText('Writing')).toHaveLength(2);
  expect(view.getAllByText('미작성')).toHaveLength(2);
  fireEvent.click(view.getAllByRole('button', { name: /Writing/ })[0]);
  expect(onOpen).toHaveBeenCalledWith(row);
  const desktopAction = view.getByRole('button', { name: 'Writing 리포트 상세 열기' });
  expect(desktopAction.tagName).toBe('BUTTON');
  fireEvent.click(desktopAction);
  expect(onOpen).toHaveBeenCalledTimes(2);
});

it('grouped — 덱 slide 18 목록처럼 날짜 묶음 머리 「9월 14일 (월) · 2건」 아래에 시각 · 학생 · 과목 · 상태 줄이 선다', () => {
  const onOpen = vi.fn();
  const second: ReportRow = { ...row, id: 2, serId: 12, startMin: 900, endMin: 960, state: 'rej', students: [{ id: 2, name: '학생B', deliver: true, late: false }] };
  const other: ReportRow = { ...row, id: 3, serId: 13, date: '2026-09-12', onDate: '2026-09-12' };
  const view = render(<TeacherReportList rows={[row, second, other]} subjectName={() => 'Writing'} onOpen={onOpen} grouped />);
  const groups = view.getAllByRole('group');
  expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual(['9월 14일 (월) · 2건', '9월 12일 (토) · 1건']);
  // 표·모바일 카드 두 벌이 아니라 한 목록 — 같은 줄이 한 번만 선다
  expect(view.queryByRole('table')).toBeNull();
  expect(view.getAllByText('학생A')).toHaveLength(2);
  const rowButton = view.getByRole('button', { name: /10:00 학생B|15:00 학생B/ });
  fireEvent.click(rowButton);
  expect(onOpen).toHaveBeenCalledWith(second);
  expect(view.getByText('반려')).toBeTruthy();
});

it('grouped + head — 덱 slide 18 머리 띠(이름 · 서버 수)와 고른 줄 표시 · 비었거나 불러오는 중에도 머리는 선다', () => {
  const onOpen = vi.fn();
  const view = render(<TeacherReportList grouped rows={[row]} subjectName={() => 'Writing'} onOpen={onOpen}
    head={{ title: '아직 안 쓴 리포트', tone: 'danger', count: 5 }} selected={{ serId: 11, onDate: '2026-09-14' }} />);
  const region = view.getByRole('region', { name: '아직 안 쓴 리포트' });
  expect(region.firstElementChild?.textContent).toBe('아직 안 쓴 리포트5');
  expect(region.firstElementChild?.className).toContain('bg-red');
  expect(view.getByRole('button', { name: /10:00 학생A/ }).getAttribute('aria-current')).toBe('true');
  view.rerender(<TeacherReportList grouped rows={[]} subjectName={() => 'Writing'} onOpen={onOpen}
    head={{ title: '작성한 리포트', tone: 'dark' }} />);
  expect(view.getByRole('region', { name: '작성한 리포트' }).textContent).toBe('작성한 리포트0리포트가 없습니다');
  view.rerender(<TeacherReportList grouped rows={[]} subjectName={() => 'Writing'} onOpen={onOpen}
    head={{ title: '작성한 리포트', tone: 'dark' }} status="loading" />);
  expect(view.getByText('리포트를 불러오는 중…')).toBeTruthy();
  view.rerender(<TeacherReportList grouped rows={[]} subjectName={() => 'Writing'} onOpen={onOpen}
    head={{ title: '작성한 리포트', tone: 'dark' }} status="error" />);
  expect(view.getByText('리포트를 불러오지 못했습니다.')).toBeTruthy();
});
