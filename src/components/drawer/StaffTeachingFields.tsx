/** @file-guide
 * 목적: 구성원 등록·수정 공용 입사/생년월일과 수업 프로필 입력.
 * 책임/재사용: 가능 과목은 서버가 준 수업·모의수업·자습 묶음의 실제 과목(SUB) 칩, 학력 학위·상태는 서버 코드표 드롭다운이다(p8 결정 2026-10-16).
 *   과목의 종류·사용 여부와 코드표 판정은 서버가 소유하고 화면은 받은 낱말을 그린다(D-R18). migration 127 수업 유형은 읽기 전용 안내만 한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';

import { useState } from 'react';
import type { StaffTeachingKind, StaffTeachingSubject, StaffTeachingSubjectGroup } from '@/api/types';
import { todayKst } from '@/lib/calendar';
import { Button, Input, Label, Segmented, Select } from '../ui';

export type EducationRow = { school: string; major: string; degree: string; status: string };
export const blankEducation = (): EducationRow => ({ school: '', major: '', degree: '', status: '' });
export type EnglishChoice = 'unknown' | 'yes' | 'no';
export const englishChoiceOf = (value: boolean | null | undefined): EnglishChoice => value === true ? 'yes' : value === false ? 'no' : 'unknown';
export const englishValueOf = (value: EnglishChoice): boolean | null => value === 'yes' ? true : value === 'no' ? false : null;

/** 서버 DrawerDto 의 가능 과목 묶음과 학력 코드표 — 구성원 만들기·수정 창이 그대로 받는다 */
export type TeachingOptions = { subjectGroups: StaffTeachingSubjectGroup[]; degrees: string[]; statuses: string[] };
export const NO_TEACHING_OPTIONS: TeachingOptions = { subjectGroups: [], degrees: [], statuses: [] };

const splitDate = (value: string) => {
  const [year = '', month = '', day = ''] = value.split('-');
  return { year, month, day };
};

export function StaffDateParts({ id, label, value, onChange, disabled, max, hint }: {
  id: string; label: string; value: string; onChange: (value: string) => void; disabled?: boolean; max?: string;
  /** 라벨 오른쪽 짧은 안내 — 10/14 PPTX p8 「지난 날짜도 됩니다」 · 「연 · 월 · 일을 고릅니다」 */
  hint?: string;
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
    <Label htmlFor={`${id}-year`} hint={hint}>{label}</Label>
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

export function StaffTeachingFields({ id, options, birthOn, onBirthOn, englishOnly, onEnglishOnly, selectedSubjects, onSubjects,
  heldSubjects = [], legacyKinds = [], education, onEducation, disabled }: {
  id: string; options: TeachingOptions; birthOn: string; onBirthOn: (value: string) => void;
  englishOnly: EnglishChoice; onEnglishOnly: (value: EnglishChoice) => void;
  selectedSubjects: string[]; onSubjects: (value: string[]) => void;
  /** 이미 저장된 과목 — 지금 꺼 둔 과목이라 선택지에 없어도 칩으로 남겨 빼거나 그대로 둘 수 있게 한다 */
  heldSubjects?: StaffTeachingSubject[];
  /** migration 127 수업 유형(읽기 전용 이전 입력) — 과목이 아직 없을 때만 부모가 넘긴다(N-25: 과목으로 추정 변환하지 않는다) */
  legacyKinds?: StaffTeachingKind[];
  education: EducationRow[]; onEducation: (value: EducationRow[]) => void; disabled?: boolean;
}) {
  const setEducation = (index: number, key: keyof EducationRow, value: string) => onEducation(education.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  // 10/14 PPTX p8 「수정본」 ④ — 수업 · 모의수업 · 자습 줄마다 실제 과목 칩. 꺼 둔 과목을 이미 가진 강사는 그 칩을 제 종류 줄 끝에 둔다
  const groups = options.subjectGroups.map((group) => ({
    ...group,
    subjects: [...group.subjects, ...heldSubjects
      .filter((held) => held.kindKey === group.kindKey && !group.subjects.some((subject) => subject.key === held.key))
      .map((held) => ({ key: held.key, name: held.name }))],
  }));
  const toggle = (key: string) => onSubjects(selectedSubjects.includes(key) ? selectedSubjects.filter((item) => item !== key) : [...selectedSubjects, key]);
  return <fieldset className="space-y-4 rounded-xl border border-line p-3">
    <legend className="px-1 text-[12px]"><b className="text-fg">강사 정보</b> <span className="text-fg-subtle">학력 · 100% 영어 수업 · 가능 과목 · 생년월일</span></legend>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <StaffDateParts id={`${id}-birth`} label="생년월일" hint="연 · 월 · 일을 고릅니다" value={birthOn} onChange={onBirthOn} disabled={disabled} max="오늘·입사일" />
      <div>
        <p className="mb-1 text-[12px] font-bold text-fg-subtle">100% 영어 수업</p>
        <Segmented<EnglishChoice> ariaLabel="100% 영어 수업" value={englishOnly} onChange={onEnglishOnly} disabled={disabled}
          options={[{ value: 'yes', label: '가능' }, { value: 'no', label: '불가' }, { value: 'unknown', label: '미확인' }]} />
      </div>
    </div>
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[12px] font-bold text-fg-subtle">가능 과목</p>
        <span className="text-[12px] text-fg-subtle">{selectedSubjects.length}개 고름 · 수업 배정 때 참고합니다</span>
      </div>
      {legacyKinds.length ? <p className="mt-1 text-[12px] text-fg-subtle">
        {`이전 입력(수업 유형): ${legacyKinds.map((kind) => kind.name).join(' · ')} — 과목으로 다시 골라 주세요`}</p> : null}
      <div className="mt-2 space-y-2">{groups.map((group) => (
        <div key={group.kindKey} role="group" aria-label={`가능 과목 · ${group.kindName}`}
          className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-2">
          <span className="pt-2 text-[12px] font-bold text-fg-subtle">{group.kindName}</span>
          <div className="flex flex-wrap gap-2">{group.subjects.map((subject) => {
            const on = selectedSubjects.includes(subject.key);
            return <button key={subject.key} type="button" disabled={disabled} aria-pressed={on} onClick={() => toggle(subject.key)}
              className={`min-h-9 rounded-full border px-4 text-[12px] font-bold transition-colors ${on ? 'border-fg bg-fg text-card' : 'border-line bg-card text-fg-2 hover:border-fg-subtle'}`}>
              {on ? <span aria-hidden className="mr-1">✓</span> : null}{subject.name}
            </button>;
          })}</div>
        </div>
      ))}</div>
    </div>
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[12px] font-bold text-fg-subtle">학력</p>
        <span className="text-[12px] text-fg-subtle">최대 5줄 · 적은 차례대로 보입니다</span>
      </div>
      {education.length ? <ul className="mt-2 space-y-2">{education.map((row, index) => <li key={index}
        className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        {(['school', 'major'] as const).map((key) => {
          const name = ({ school: '학교', major: '전공' })[key];
          return <Input key={key} id={`${id}-education-${index}-${key}`} aria-label={name} placeholder={name} value={row[key]}
            maxLength={120} onChange={(event) => setEducation(index, key, event.target.value)} disabled={disabled} />;
        })}
        {(['degree', 'status'] as const).map((key) => {
          const name = key === 'degree' ? '학위' : '상태';
          const codes = key === 'degree' ? options.degrees : options.statuses;
          // 127 시절 자유 입력으로 저장된 값은 고치지 않고 「기존 입력」으로 남긴다 — 서버도 같은 값의 재전송만 받는다
          const legacy = row[key] && !codes.includes(row[key]) ? row[key] : null;
          return <Select key={key} id={`${id}-education-${index}-${key}`} aria-label={name} value={row[key]}
            onChange={(event) => setEducation(index, key, event.target.value)} disabled={disabled}>
            <option value="">{name}</option>
            {codes.map((code) => <option key={code} value={code}>{code}</option>)}
            {legacy ? <option value={legacy}>{`${legacy} (기존 입력)`}</option> : null}
          </Select>;
        })}
        <Button type="button" size="sm" variant="ghost" disabled={disabled} className="col-span-2 sm:col-span-1"
          onClick={() => onEducation(education.filter((_item, rowIndex) => rowIndex !== index))}>빼기</Button>
      </li>)}</ul> : null}
      <Button type="button" size="sm" variant="ghost" className="mt-2" disabled={disabled || education.length >= 5}
        onClick={() => onEducation([...education, blankEducation()])}>+ 학력 추가</Button>
    </div>
  </fieldset>;
}
