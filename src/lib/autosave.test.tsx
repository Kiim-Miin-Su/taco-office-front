/** @file-guide
 * 목적: autosave.test.tsx — N-69 브라우저 자동 저장(키 · 되살리기 · 덮지 않기 · 비우기 · 막힌 저장소)의 회귀.
 * 책임/재사용: lib/autosave 의 공개 함수와 훅만 부른다. 화면(리포트 · 대표 보고)의 연결은 각 화면 시험이 본다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { act, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSessionQueries } from '@/api/session-cache';
import {
  autosaveStampLabel, autosaveTimeLabel, clearAllDrafts, draftKey, readDraft, useDraftAutosave, useLastAutosave, writeDraft,
} from './autosave';

const KEY = draftKey(7, 'report', '21:2026-09-25');

beforeEach(() => { window.localStorage.clear(); clearAllDrafts(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('저장소 — 키 = 사용자 · 대상 · 막힌 저장소는 조용히 없다', () => {
  it('사용자와 대상이 키에 든다 · 로그아웃 비우기는 우리 초안만 지운다', () => {
    expect(draftKey(7, 'report', '21:2026-09-25')).not.toBe(draftKey(8, 'report', '21:2026-09-25'));
    expect(draftKey(7, 'exec-memo', 'day:2026-09-25')).toContain('exec-memo');
    window.localStorage.setItem('other-app', 'keep');
    writeDraft(KEY, { content: '쓰던 글' }, 'none|{}');
    expect(readDraft<{ content: string }>(KEY)?.value.content).toBe('쓰던 글');
    clearAllDrafts();
    expect(readDraft(KEY)).toBeNull();
    expect(window.localStorage.getItem('other-app')).toBe('keep');
  });

  it('세션 경계(로그아웃 · 계정 전환 · 만료)가 쿼리 캐시와 함께 초안도 비운다 — 머리줄 시각도 「—」로', () => {
    writeDraft(KEY, { content: '쓰던 글' }, 'none|{}');
    writeDraft(draftKey(7, 'exec-memo', 'day:2026-09-25'), { mkt: '메모' }, 'new|none|[]');
    const view = render(<Status />);
    expect(view.getByTestId('status').textContent).not.toBe('—');
    const clear = vi.fn();
    act(() => clearSessionQueries({ clear }));
    expect(clear).toHaveBeenCalledOnce();
    expect(readDraft(KEY)).toBeNull();
    expect(readDraft(draftKey(7, 'exec-memo', 'day:2026-09-25'))).toBeNull();
    expect(view.getByTestId('status').textContent).toBe('—');
  });

  it('저장소가 던져도(사생활 모드 · 막힌 저장소) 화면을 깨지 않는다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    expect(writeDraft(KEY, { content: 'x' }, 'b')).toBe(false);
    expect(readDraft(KEY)).toBeNull();
    expect(() => clearAllDrafts()).not.toThrow();
  });

  it('모양이 틀린 기록은 없는 것으로 읽는다', () => {
    window.localStorage.setItem(KEY, '{not json');
    expect(readDraft(KEY)).toBeNull();
    window.localStorage.setItem(KEY, JSON.stringify({ value: 1 }));
    expect(readDraft(KEY)).toBeNull();
  });

  it('시각 — 머리줄은 KST 「HH:MM」(없으면 —) · 되살린 글은 다른 날이면 날짜까지', () => {
    const at = Date.parse('2026-09-25T14:05:00+09:00');
    expect(autosaveTimeLabel(null)).toBe('—');
    expect(autosaveTimeLabel(at)).toBe('14:05');
    expect(autosaveStampLabel(at, Date.parse('2026-09-25T23:59:00+09:00'))).toBe('14:05');
    expect(autosaveStampLabel(at, Date.parse('2026-09-26T00:01:00+09:00'))).toBe('09-25 14:05');
  });
});

/** 훅을 부르는 가장 작은 입력 — 서버 글(server)에서 시작해 value 를 고친다 */
function Harness({ server, base, enabled = true, onRestored }: {
  server: string; base: string; enabled?: boolean; onRestored?: (at: number | null) => void;
}) {
  const [value, setValue] = useState(server);
  const autosave = useDraftAutosave<string>({
    key: KEY, base, value, dirty: value !== server, enabled, onRestore: setValue, delayMs: 500,
  });
  onRestored?.(autosave.restoredAt);
  return (
    <div>
      <input aria-label="글" value={value} onChange={(event) => setValue(event.currentTarget.value)} />
      <button type="button" onClick={() => { autosave.discard(); setValue(server); }}>버리기</button>
    </div>
  );
}

function Status() {
  return <span data-testid="status">{autosaveTimeLabel(useLastAutosave())}</span>;
}

describe('useDraftAutosave — 쓰는 동안 남기고 · 같은 서버 글에서만 되살린다', () => {
  it('멈추면 남기고(머리줄 시각이 선다) · 서버 글과 같아지면 지운다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-09-25T10:30:00+09:00'));
    const view = render(<><Harness server="" base="none|a" /><Status /></>);
    expect(view.getByTestId('status').textContent).toBe('—');
    const input = view.getByLabelText('글') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '쓰던 글' } });
    expect(readDraft(KEY)).toBeNull();
    act(() => { vi.advanceTimersByTime(500); });
    expect(readDraft<string>(KEY)).toMatchObject({ value: '쓰던 글', base: 'none|a' });
    expect(view.getByTestId('status').textContent).toBe('10:30');
    fireEvent.change(input, { target: { value: '' } });
    expect(readDraft(KEY)).toBeNull();
  });

  it('같은 서버 글(base)에서 시작한 초안만 되살린다 — 되살린 뒤 같은 글을 다시 남기지 않는다', () => {
    vi.useFakeTimers();
    writeDraft(KEY, '어제 쓰던 글', 'none|a', Date.parse('2026-09-24T21:00:00+09:00'));
    const restored = vi.fn();
    const view = render(<Harness server="" base="none|a" onRestored={restored} />);
    expect((view.getByLabelText('글') as HTMLInputElement).value).toBe('어제 쓰던 글');
    expect(restored).toHaveBeenLastCalledWith(Date.parse('2026-09-24T21:00:00+09:00'));
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    act(() => { vi.advanceTimersByTime(2000); });
    expect(setItem).not.toHaveBeenCalled();
    expect(readDraft<string>(KEY)?.value).toBe('어제 쓰던 글');
  });

  it('탭을 닫았다 다시 열어 되살리면 머리줄에 그 초안의 저장 시각이 선다 — 「—」로 두지 않는다 (N-141 · all160)', () => {
    // 새 탭 = 모듈 기억이 빈 채로 저장소만 남은 상태 — writeDraft 를 부르면 기억이 채워지므로 저장소에 직접 넣는다
    window.localStorage.setItem(KEY, JSON.stringify({ value: '닫기 전 쓰던 글', base: 'none|a', savedAt: Date.parse('2026-09-30T02:35:00+09:00') }));
    const view = render(<><Harness server="" base="none|a" /><Status /></>);
    expect((view.getByLabelText('글') as HTMLInputElement).value).toBe('닫기 전 쓰던 글');
    expect(view.getByTestId('status').textContent).toBe('02:35');
  });

  it('서버 글이 그새 바뀌었으면(제출 · 다른 사람의 저장) 되살리지 않고 지운다 — 덮지 않는다', () => {
    writeDraft(KEY, '옛 초안', 'none|a');
    const view = render(<Harness server="제출된 글" base="wait|b" />);
    expect((view.getByLabelText('글') as HTMLInputElement).value).toBe('제출된 글');
    expect(readDraft(KEY)).toBeNull();
  });

  it('쓸 수 없는 글(enabled=false)이면 그 초안을 지우고 남기지도 않는다', () => {
    vi.useFakeTimers();
    writeDraft(KEY, '옛 초안', 'wait|b');
    const view = render(<Harness server="승인된 글" base="wait|b" enabled={false} />);
    expect((view.getByLabelText('글') as HTMLInputElement).value).toBe('승인된 글');
    expect(readDraft(KEY)).toBeNull();
    fireEvent.change(view.getByLabelText('글'), { target: { value: '고침' } });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(readDraft(KEY)).toBeNull();
  });

  it('「버리기」는 초안을 지우고 서버 글로 돌아간다', () => {
    writeDraft(KEY, '어제 쓰던 글', 'none|a');
    const restored = vi.fn();
    const view = render(<Harness server="" base="none|a" onRestored={restored} />);
    fireEvent.click(view.getByRole('button', { name: '버리기' }));
    expect((view.getByLabelText('글') as HTMLInputElement).value).toBe('');
    expect(readDraft(KEY)).toBeNull();
    expect(restored).toHaveBeenLastCalledWith(null);
  });
});

