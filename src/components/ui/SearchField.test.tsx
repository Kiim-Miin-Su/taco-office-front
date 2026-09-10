/** @file-guide
 * 목적: SearchField.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createRef, Profiler, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchField, type SearchFieldHandle } from './SearchField';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); });

const props = { label: '상담 검색', placeholder: '이름 · 학교 · 담당 · 사유로 찾기', controls: 'failure-results' };
const tick = (ms: number) => { act(() => { vi.advanceTimersByTime(ms); }); };

function setup(onQueryChange = vi.fn()) {
  const view = render(<SearchField {...props} onQueryChange={onQueryChange} />);
  const input = view.getByRole('searchbox', { name: props.label }) as HTMLInputElement;
  return { ...view, input, onQueryChange };
}

describe('SearchField — 공용 검색 입력과 지연 수명', () => {
  it('검색 입력은 하나이며 라벨·placeholder·결과 영역을 연결하고 초기화는 숨긴다', () => {
    const { input, container, queryByRole, onQueryChange } = setup();
    expect(container.querySelectorAll('input, select, textarea')).toHaveLength(1);
    expect(input.type).toBe('search');
    expect(input.placeholder).toBe(props.placeholder);
    expect(input.getAttribute('aria-controls')).toBe('failure-results');
    expect(queryByRole('button', { name: '초기화' })).toBeNull();
    tick(1000);
    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it('입력값은 즉시 보이고 259ms에는 미반영, 260ms에 한 번 전달한다', () => {
    const { input, onQueryChange } = setup();
    fireEvent.change(input, { target: { value: 'Grace' } });
    expect(input.value).toBe('Grace');
    tick(259);
    expect(onQueryChange).not.toHaveBeenCalled();
    tick(1);
    expect(onQueryChange.mock.calls).toEqual([['Grace']]);
    tick(1000);
    expect(onQueryChange).toHaveBeenCalledOnce();
  });

  it('연속 입력은 이전 예약을 취소하고 마지막 입력부터 시간을 센다', () => {
    const { input, onQueryChange } = setup();
    fireEvent.change(input, { target: { value: 'G' } });
    tick(200);
    fireEvent.change(input, { target: { value: 'Gr' } });
    tick(259);
    expect(onQueryChange).not.toHaveBeenCalled();
    tick(1);
    expect(onQueryChange.mock.calls).toEqual([['Gr']]);
  });

  it('공백과 앞뒤 공백은 업무 정규화 없이 그대로 전달한다', () => {
    const { input, onQueryChange, getByRole } = setup();
    fireEvent.change(input, { target: { value: '  ' } });
    expect(getByRole('button', { name: '초기화' })).toBeTruthy();
    tick(260);
    expect(onQueryChange).toHaveBeenLastCalledWith('  ');
    fireEvent.change(input, { target: { value: '  Grace  ' } });
    tick(260);
    expect(onQueryChange).toHaveBeenLastCalledWith('  Grace  ');
  });

  it('debounceMs로 지연을 조정하고 controls 생략도 허용한다', () => {
    const onQueryChange = vi.fn();
    const view = render(<SearchField label="검색" placeholder="찾기" debounceMs={500} onQueryChange={onQueryChange} />);
    const input = view.getByRole('searchbox');
    expect(input.hasAttribute('aria-controls')).toBe(false);
    fireEvent.change(input, { target: { value: '검색' } });
    tick(499);
    expect(onQueryChange).not.toHaveBeenCalled();
    tick(1);
    expect(onQueryChange.mock.calls).toEqual([['검색']]);
  });

  it('IME 조합 시작은 이전 예약을 취소하고 조합 종료부터 260ms 후 최종 값만 전달한다', () => {
    const { input, onQueryChange } = setup();
    fireEvent.change(input, { target: { value: '기존' } });
    tick(100);
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'ㅎ' } });
    tick(1000);
    fireEvent.change(input, { target: { value: '한글' } });
    tick(1000);
    expect(input.value).toBe('한글');
    expect(onQueryChange).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input, { data: '한글' });
    fireEvent.change(input, { target: { value: '한글' } });
    tick(259);
    expect(onQueryChange).not.toHaveBeenCalled();
    tick(1);
    expect(onQueryChange.mock.calls).toEqual([['한글']]);
  });

  it('IME 조합 중 Escape는 후보 취소에 맡기며 검색을 반영하지 않는다', () => {
    const { input, onQueryChange } = setup();
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '한' } });
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true });
    tick(500);
    expect(input.value).toBe('한');
    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it.each(['button', 'Escape'])('%s 초기화는 즉시 빈 검색을 전달하고 입력으로 focus를 돌린다', (method) => {
    const { input, onQueryChange, getByRole, queryByRole } = setup();
    fireEvent.change(input, { target: { value: '예약 중' } });
    tick(100);
    if (method === 'button') {
      const button = getByRole('button', { name: '초기화' });
      button.focus();
      fireEvent.click(button);
    } else {
      fireEvent.keyDown(input, { key: 'Escape' });
    }
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(queryByRole('button', { name: '초기화' })).toBeNull();
    expect(onQueryChange.mock.calls).toEqual([['']]);
    tick(1000);
    expect(onQueryChange).toHaveBeenCalledOnce();
  });

  it('외부 초기화도 ref.clear()로 같은 입력·예약·결과를 비우고 focus를 돌린다', () => {
    const ref = createRef<SearchFieldHandle>();
    const onQueryChange = vi.fn();
    const view = render(<><SearchField {...props} ref={ref} onQueryChange={onQueryChange} />
      <button onClick={() => ref.current?.clear()}>결과 초기화</button></>);
    const input = view.getByRole('searchbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '없음' } });
    tick(260);
    fireEvent.change(input, { target: { value: '다음 예약' } });
    const button = view.getByRole('button', { name: '결과 초기화' });
    button.focus();
    fireEvent.click(button);
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(onQueryChange.mock.calls).toEqual([['없음'], ['']]);
    tick(1000);
    expect(onQueryChange).toHaveBeenCalledTimes(2);
  });

  it('다른 키는 초기화하지 않는다', () => {
    const { input, onQueryChange } = setup();
    fireEvent.change(input, { target: { value: '계속' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('계속');
    tick(260);
    expect(onQueryChange.mock.calls).toEqual([['계속']]);
  });

  it('언마운트는 예약을 취소하고 남은 콜백을 호출하지 않는다', () => {
    const { input, onQueryChange, unmount } = setup();
    fireEvent.change(input, { target: { value: '예약' } });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    tick(1000);
    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it('callback 변경·재렌더는 예약 시점을 미루지 않고 최신 callback을 호출한다', () => {
    const oldCallback = vi.fn();
    const newCallback = vi.fn();
    const { input, rerender } = setup(oldCallback);
    fireEvent.change(input, { target: { value: '최신' } });
    tick(200);
    rerender(<SearchField {...props} onQueryChange={newCallback} />);
    tick(59);
    expect(newCallback).not.toHaveBeenCalled();
    tick(1);
    expect(oldCallback).not.toHaveBeenCalled();
    expect(newCallback.mock.calls).toEqual([['최신']]);
    rerender(<SearchField {...props} onQueryChange={vi.fn()} />);
    tick(1000);
    expect(newCallback).toHaveBeenCalledOnce();
  });

  it('이미 전달한 값으로 돌아오면 중간 예약만 취소하고 중복 전달하지 않는다', () => {
    const { input, onQueryChange } = setup();
    fireEvent.change(input, { target: { value: '처음' } });
    tick(260);
    fireEvent.change(input, { target: { value: '중간' } });
    tick(200);
    fireEvent.change(input, { target: { value: '처음' } });
    tick(260);
    expect(onQueryChange.mock.calls).toEqual([['처음']]);
  });

  it('StrictMode에서도 mount는 전파하지 않고 한 입력은 local commit 한 번이다', () => {
    const onQueryChange = vi.fn();
    const onRender = vi.fn();
    const view = render(<StrictMode><Profiler id="search" onRender={onRender}>
      <SearchField {...props} onQueryChange={onQueryChange} />
    </Profiler></StrictMode>);
    onRender.mockClear();
    fireEvent.change(view.getByRole('searchbox'), { target: { value: '입력' } });
    expect(onRender).toHaveBeenCalledOnce();
    expect(onQueryChange).not.toHaveBeenCalled();
    tick(260);
    expect(onQueryChange.mock.calls).toEqual([['입력']]);
  });

  it('기존 토큰으로 경계·포커스와 검색 전용 크기를 적용한다', () => {
    const { input, getByRole } = setup();
    expect(input.className).toContain('!border-fg-subtle');
    expect(input.className).toContain('focus-visible:outline-fg');
    expect(input.className).toContain('focus-visible:outline-2');
    expect(input.className).toContain('!h-[38px]');
    expect(input.className).toContain('!px-2');
    expect(input.className).toContain('!text-[12px]');
    expect(input.parentElement?.className).toContain('gap-1.5');
    fireEvent.change(input, { target: { value: '검색' } });
    expect(getByRole('button', { name: '초기화' }).className).toContain('!h-7');
  });

  it('조합 중 외부 초기화 뒤 늦은 compositionEnd가 이전 값을 되살리지 않는다', () => {
    const ref = createRef<SearchFieldHandle>();
    const onQueryChange = vi.fn();
    const view = render(<SearchField {...props} ref={ref} onQueryChange={onQueryChange} />);
    const input = view.getByRole('searchbox') as HTMLInputElement;
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '조합' } });
    act(() => { ref.current?.clear(); });
    fireEvent.compositionEnd(input, { data: '조합' });
    tick(260);
    expect(input.value).toBe('');
    expect(onQueryChange.mock.calls).toEqual([['']]);
  });
});
