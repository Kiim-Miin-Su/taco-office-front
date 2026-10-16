/** @file-guide
 * 목적: 구성원 등록·수정 공용 입사/생년월일과 수업 프로필 입력.
 * 책임/재사용: KIND 수업 유형(class/mock/study)을 SUBJECT 과목과 분리해 보여 주고 학력 요약 5행만 편집한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';

import { useState } from 'react';
import type { KindRow } from '@/api/types';
import { todayKst } from '@/lib/calendar';
import { Input, Label, Select } from '../ui';

export type EducationRow = { school: string; major: string; degree: string; status: string };
export const blankEducation = (): EducationRow => ({ school: '', major: '', degree: '', status: '' });
export const teachingKindKeys = ['class', 'mock', 'study'] as const;
export type TeachingKindKey = typeof teachingKindKeys[number];
export type EnglishChoice = 'unknown' | 'yes' | 'no';
export const englishChoiceOf = (value: boolean | null | undefined): EnglishChoice => value === true ? 'yes' : value === false ? 'no' : 'unknown';
export const englishValueOf = (value: EnglishChoice): boolean | null => value === 'yes' ? true : value === 'no' ? false : null;

const splitDate = (value: string) => {
  const [year = '', month = '', day = ''] = value.split('-');
  return { year, month, day };
};

export function StaffDateParts({ id, label, value, onChange, disabled, max }: {
  id: string; label: string; value: string; onChange: (value: string) => void; disabled?: boolean; max?: string;
}) {
  const [parts, setParts] = useState(() => splitDate(value));
  const nowYear = Number(todayKst().slice(0, 4));
  const lastYear = max ? nowYear : Math.max(2100, Number(parts.year) || 0);
  const firstYear = Math.min(1900, Number(parts.year) || 1900);
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_unused, index) => String(lastYear - index));
  const choose = (key: keyof typeof parts, next: string) => {
    const changed = { ...parts, [key]: next };
    const lastDay = changed.year && changed.month ? new Date(Number(changed.year), Number(changed.month), 0).getDate() : 31;
    if (Number(changed.day) > lastDay) changed.day = '';
    setParts(changed);
    onChange(changed.year && changed.month && changed.day ? `${changed.year}-${changed.month}-${changed.day}` : '');
  };
  const maxDay = parts.year && parts.month ? new Date(Number(parts.year), Number(parts.month), 0).getDate() : 31;
  return <div>
    <Label htmlFor={`${id}-year`}>{label}</Label>
    <div className="grid grid-cols-3 gap-2">
      <Select id={`${id}-year`} aria-label={`${label} 년`} value={parts.year} onChange={(event) => choose('year', event.target.value)} disabled={disabled}>
        <option value="">년</option>{years.map((year) => <option key={year} value={year}>{year}년</option>)}
      </Select>
      <Select aria-label={`${label} 월`} value={parts.month} onChange={(event) => choose('month', event.target.value)} disabled={disabled}>
        <option value="">월</option>{Array.from({ length: 12 }, (_unused, index) => String(index + 1).padStart(2, '0')).map((month) => <option key={month} value={month}>{Number(month)}월</option>)}
      </Select>
      <Select aria-label={`${label} 일`} value={parts.day} onChange={(event) => choose('day', event.target.value)} disabled={disabled}>
        <option value="">일</option>{Array.from({ length: maxDay }, (_unused, index) => String(index + 1).padStart(2, '0')).map((day) => <option key={day} value={day}>{Number(day)}일</option>)}
      </Select>
    </div>
    {max ? <p className="mt-1 text-[12px] text-fg-subtle">{max} 이전 날짜를 선택해 주세요.</p> : null}
  </div>;
}

export function StaffTeachingFields({ id, kinds, birthOn, onBirthOn, englishOnly, onEnglishOnly, selectedKinds, onKinds, education, onEducation, disabled }: {
  id: string; kinds: KindRow[]; birthOn: string; onBirthOn: (value: string) => void;
  englishOnly: EnglishChoice; onEnglishOnly: (value: EnglishChoice) => void;
  selectedKinds: TeachingKindKey[]; onKinds: (value: TeachingKindKey[]) => void;
  education: EducationRow[]; onEducation: (value: EducationRow[]) => void; disabled?: boolean;
}) {
  const options = kinds.filter((kind): kind is KindRow & { key: TeachingKindKey } =>
    kind.grp === 'lesson' && teachingKindKeys.includes(kind.key as TeachingKindKey));
  const setEducation = (index: number, key: keyof EducationRow, value: string) => onEducation(education.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  return <fieldset className="space-y-3 rounded-xl border border-line p-3">
    <legend className="px-1 text-[12px] font-bold text-fg">수업 프로필</legend>
    <StaffDateParts id={`${id}-birth`} label="생년월일" value={birthOn} onChange={onBirthOn} disabled={disabled} max="오늘·입사일" />
    <div>
      <Label htmlFor={`${id}-english`}>영어 전용 수업</Label>
      <Select id={`${id}-english`} value={englishOnly} onChange={(event) => onEnglishOnly(event.target.value as EnglishChoice)} disabled={disabled}>
        <option value="unknown">미확인</option><option value="yes">가능</option><option value="no">불가능</option>
      </Select>
    </div>
    <div>
      <p className="text-[12px] font-semibold">가능 수업 유형</p>
      <p className="mt-0.5 text-[12px] text-fg-subtle">과목과 별도로 선택합니다. GPA는 제외합니다.</p>
      <div className="mt-2 flex flex-wrap gap-2">{options.map((kind) => <button key={kind.key} type="button" disabled={disabled}
        aria-pressed={selectedKinds.includes(kind.key)} onClick={() => onKinds(selectedKinds.includes(kind.key)
          ? selectedKinds.filter((key) => key !== kind.key) : [...selectedKinds, kind.key])}
        className={`rounded-full border px-3 py-1 text-[12px] ${selectedKinds.includes(kind.key) ? 'border-fg bg-inset font-bold' : 'border-line'}`}>
        {kind.name}
      </button>)}</div>
    </div>
    <div>
      <div className="flex items-center justify-between gap-2"><p className="text-[12px] font-semibold">학력 요약 ({education.length}/5)</p>
        <button type="button" disabled={disabled || education.length >= 5} onClick={() => onEducation([...education, blankEducation()])}
          className="text-[12px] text-fg-2 underline disabled:opacity-40">+ 학력 추가</button></div>
      {education.map((row, index) => <div key={index} className="mt-2 rounded-lg border border-line p-2">
        <div className="mb-2 flex justify-between"><b className="text-[12px]">학력 {index + 1}</b><button type="button" disabled={disabled}
          onClick={() => onEducation(education.filter((_item, rowIndex) => rowIndex !== index))} className="text-[12px] text-fg-subtle underline">삭제</button></div>
        <div className="grid grid-cols-2 gap-2">
          {(['school', 'major', 'degree', 'status'] as const).map((key) => <div key={key}>
            <Label htmlFor={`${id}-education-${index}-${key}`}>{({ school: '학교', major: '전공', degree: '학위', status: '상태' })[key]}</Label>
            <Input id={`${id}-education-${index}-${key}`} value={row[key]} maxLength={key === 'school' || key === 'major' ? 120 : 40}
              onChange={(event) => setEducation(index, key, event.target.value)} disabled={disabled} />
          </div>)}</div>
      </div>)}
    </div>
  </fieldset>;
}
