/** @file-guide
 * 목적: Board.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Board, type BoardColumn } from './Board';

afterEach(cleanup);

type Item = { id: number; name: string };
const columns: Array<BoardColumn<Item>> = [
  { key: 'hold', label: '보류', tone: 'danger', items: [{ id: 1, name: '정하윤' }] },
  { key: 'enrolled', label: '등록', tone: 'success', fill: true, divideBefore: true, items: [{ id: 2, name: '박시온' }, { id: 3, name: '홍채원' }] },
];
const col = (container: HTMLElement, key: string) => container.querySelector(`[data-board-column="${key}"]`) as HTMLElement;

describe('Board — 칸 윗선 단계색 · 칸 바탕 · 구분선 · 이름 옆 건수(§23 23-09 · §26 26-05)', () => {
  it('기본(accent 끔)은 지금 모양이다 — 윗선 없음 · 건수는 오른쪽 칩', () => {
    const v = render(<Board columns={[{ ...columns[0] }]} itemKey={(i) => i.id} renderCard={(i) => i.name} />);
    const hold = col(v.container, 'hold');
    expect(hold.className).toContain('bg-inset');
    expect(hold.className).not.toContain('border-t-[3px]');
    expect(within(hold).getByText('1').className).toContain('rounded-full');
  });

  it('accent 는 칸 톤 윗선을 긋고, fill 칸은 톤 옅은 바탕, divideBefore 칸 앞에 구분선이 선다', () => {
    const v = render(<Board columns={columns} accent countStyle="inline" itemKey={(i) => i.id} renderCard={(i) => i.name} />);
    const hold = col(v.container, 'hold');
    const enrolled = col(v.container, 'enrolled');
    expect(hold.className).toContain('border-t-[3px] border-t-red');
    expect(enrolled.className).toContain('border-t-green');
    expect(enrolled.className).toContain('bg-green/5');
    expect(enrolled.className).toContain("before:content-['']");
    expect(hold.className).not.toContain('before:');
    // 이름 바로 옆 톤 색 숫자 — 칩이 아니다
    const count = within(enrolled).getByText('2');
    expect(count.className).toContain('text-green');
    expect(count.className).not.toContain('rounded-full');
  });

  it('accent 가 켜지면 번호 원이 칸 톤으로 채워지고, big 건수는 오른쪽 큰 톤 숫자다(§26)', () => {
    const v = render(<Board columns={columns} numbered accent countStyle="big" itemKey={(i) => i.id} renderCard={(i) => i.name} />);
    const enrolled = col(v.container, 'enrolled');
    expect(within(enrolled).getByText('2', { selector: 'span.h-5' }).className).toContain('bg-green text-white');
    const count = within(enrolled).getByText('2', { selector: 'span.text-\\[20px\\]' });
    expect(count.className).toContain('text-green');
  });
});
