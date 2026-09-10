'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Button } from './Button';
import { Input } from './Field';

export interface SearchFieldHandle { clear(): void }

export interface SearchFieldProps {
  label: string;
  placeholder: string;
  onQueryChange: (query: string) => void;
  debounceMs?: number;
  controls?: string;
  ref?: Ref<SearchFieldHandle>;
}

/** Form/Search — 입력/IME/예약만 소유한다. 검색 대상과 정규화는 소비 화면이 결정한다. */
export function SearchField({ label, placeholder, onQueryChange, debounceMs = 260, controls, ref }: SearchFieldProps) {
  const [value, setValue] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const callback = useRef(onQueryChange);
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; value: string } | null>(null);
  const composing = useRef(false);
  const lastQuery = useRef('');

  useEffect(() => { callback.current = onQueryChange; }, [onQueryChange]);

  const cancelPending = useCallback(() => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
  }, []);
  useEffect(() => cancelPending, [cancelPending]);

  const schedule = (next: string) => {
    // compositionEnd 뒤 같은 값의 input 이벤트가 와도 예약 시점을 미루지 않는다.
    if (pending.current?.value === next) return;
    cancelPending();
    if (lastQuery.current === next) return;
    pending.current = { value: next, timer: setTimeout(() => {
      pending.current = null;
      lastQuery.current = next;
      callback.current(next);
    }, debounceMs) };
  };

  const clear = useCallback(() => {
    cancelPending();
    composing.current = false;
    setValue('');
    lastQuery.current = '';
    callback.current('');
    // 기존 Input의 props 계약을 바꾸지 않고, 이 검색 안의 입력에만 focus를 돌린다.
    root.current?.querySelector('input')?.focus();
  }, [cancelPending]);
  useImperativeHandle(ref, () => ({ clear }), [clear]);

  return (
    <div ref={root} className="flex min-w-0 items-center gap-1.5">
      <Input
        type="search"
        aria-label={label}
        aria-controls={controls}
        placeholder={placeholder}
        value={value}
        className="min-w-0 flex-1 !h-[38px] !px-2 !text-[12px] leading-[18px] !border-fg-subtle focus:!border-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg [&::-webkit-search-cancel-button]:appearance-none"
        onChange={(event) => {
          const next = event.currentTarget.value;
          setValue(next);
          if (composing.current || (event.nativeEvent as InputEvent).isComposing) {
            composing.current = true;
            cancelPending();
          } else schedule(next);
        }}
        onCompositionStart={() => { composing.current = true; cancelPending(); }}
        onCompositionEnd={(event) => {
          if (!composing.current) return;
          composing.current = false;
          const next = event.currentTarget.value;
          setValue(next);
          schedule(next);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || composing.current || event.nativeEvent.isComposing) return;
          event.preventDefault();
          event.stopPropagation();
          clear();
        }}
      />
      {value.length > 0 ? <Button size="sm" className="!h-7 shrink-0 leading-[18px]" onClick={clear}>초기화</Button> : null}
    </div>
  );
}
