/** @file-guide
 * 목적: §30 계약서·서명본이 함께 쓰는 키보드/클릭/드래그앤드롭 파일 선택 영역이다.
 * 책임/재사용: 브라우저 File 선택만 전달하고 개수·권한·저장 판정은 호출자와 서버에 맡긴다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';
import { useRef, useState, type DragEvent } from 'react';

export function ConsultingFileDropzone({ label, hint, multiple = false, disabled = false, onFiles }: {
  label: string;
  hint: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const deliver = (files: File[]) => {
    if (!disabled && files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
  };
  const drop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);
    deliver(Array.from(event.dataTransfer.files));
  };
  return <>
    <input ref={inputRef} className="sr-only" type="file" multiple={multiple} disabled={disabled}
      onChange={(event) => { deliver(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ''; }} />
    <button
      type="button"
      disabled={disabled}
      onClick={() => inputRef.current?.click()}
      onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
      className={`w-full rounded-lg border border-dashed p-4 text-left text-[12px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${dragging ? 'border-blue bg-blue/5' : 'border-line hover:border-blue'}`}
    >
      {label} <span className="font-normal text-fg-subtle">· {hint}</span>
    </button>
  </>;
}
