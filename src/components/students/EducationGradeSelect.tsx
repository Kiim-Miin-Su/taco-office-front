/** @file-guide
 * 목적: 등록·상담·학생 목록이 같은 서버 학년 projection과 기존값 보존 규칙을 사용하게 한다.
 * 책임/재사용: native select와 안내만 그린다. 대응표·정렬·저장값은 서버 응답을 그대로 쓴다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { Select } from '@/components/ui';
import { educationGradeOption, educationGradeOptions, hasEducationGradeContract } from '@/lib/education-grades';

export interface EducationGradeSelectProps {
  id?: string;
  ariaLabel?: string;
  source?: unknown;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  emptyLabel?: string;
  /** 현행 학생 목록 필터처럼 서버가 준 literal 목록을 계약 전에도 그대로 고르게 할 때만 사용한다. */
  legacyValues?: readonly string[];
  showContractState?: boolean;
}

export function EducationGradeSelect({
  id, ariaLabel, source, value, onChange, disabled = false, emptyLabel = '학년 없음', legacyValues = [], showContractState = true,
}: EducationGradeSelectProps) {
  const contractReady = hasEducationGradeContract(source);
  const options = educationGradeOptions(source);
  const picked = educationGradeOption(source, value);
  const legacy = !picked && !!value;
  const fallback = contractReady ? [] : [...new Set(legacyValues.filter(Boolean))];
  const canChoose = contractReady ? options.length > 0 : fallback.length > 0;
  const groups = options.reduce<Array<{ label: string; items: typeof options }>>((out, item) => {
    const current = out.at(-1);
    if (current?.label === item.systemLabel) current.items.push(item);
    else out.push({ label: item.systemLabel, items: [item] });
    return out;
  }, []);

  const message = picked?.equivalenceHint
    ?? (legacy ? '기존 학년 값입니다. 새 선택지로 자동 변환하지 않습니다.'
      : !contractReady && showContractState ? '학년 선택 DTO 연결 전입니다. 기존 값은 그대로 보존됩니다.' : null);

  return (
    <div className="min-w-0">
      <Select id={id} aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled || !canChoose}>
        <option value="">{contractReady ? emptyLabel : canChoose ? emptyLabel : '학년 선택지 연결 대기'}</option>
        {legacy && !fallback.includes(value) ? <option value={value}>{value} · 기존 값</option> : null}
        {contractReady ? groups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.items.map((item) => <option key={`${item.system}:${item.value}`} value={item.value}>{item.optionLabel}</option>)}
          </optgroup>
        )) : fallback.map((item) => <option key={item} value={item}>{item}</option>)}
      </Select>
      {message ? <p role="status" className="mt-1 text-[10px] text-fg-subtle">{message}</p> : null}
    </div>
  );
}
