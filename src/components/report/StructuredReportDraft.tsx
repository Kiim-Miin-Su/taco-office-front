/** @file-guide
 * 목적: 최신 수정사항의 일반1대1·그룹·Kinder/모의·진단 리포트 구조화 입력과 저장을 제공한다.
 * 책임/재사용: 서버가 확정한 formKind/version/bookOptions와 생성 DTO를 사용해 입력·검사·저장·프롬프트 복사를 연결한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';

import { useMemo, useState } from 'react';
import { apiMessage } from '@/api/client';
import { useReportMaterialCreate, useReportWrite } from '@/api/queries';
import type { ReportDetail, ReportMaterialCreate, ReportStructuredBody, ReportUpsert } from '@/api/types';
import { autosaveStampLabel, draftKey, useDraftAutosave } from '@/lib/autosave';
import { reportTimeLabel } from '@/lib/report-export';
import { useSession } from '@/store/useSession';
import { Banner, Button, CountedTextarea, Dialog, Input, Label, Segmented } from '@/components/ui';
import { ReportWriterGuide } from './ReportWriterGuide';

export const DEVELOPMENT_AREAS = [
  { key: 'language', label: '언어 발달' },
  { key: 'math', label: '수학 발달' },
  { key: 'emotional', label: '정서적 발달' },
  { key: 'physical', label: '신체 발달' },
] as const;

export const DEVELOPMENT_LEVELS = [
  { value: 'needs', label: '보완 필요' },
  { value: 'usual', label: '보통' },
  { value: 'excellent', label: '우수' },
] as const;

export const INTERVIEW_AREAS = [
  { key: 'fluency', label: '유창성' },
  { key: 'vocabulary', label: '단어 다양성' },
  { key: 'grammar', label: '어법' },
] as const;

type DevelopmentAreaKey = (typeof DEVELOPMENT_AREAS)[number]['key'];
type DevelopmentLevel = (typeof DEVELOPMENT_LEVELS)[number]['value'] | '';
type InterviewAreaKey = (typeof INTERVIEW_AREAS)[number]['key'];
export type StructuredReportKind = 'individual' | 'group' | 'kinder' | 'mock' | 'diagnostic';

export type StructuredBookOption = {
  id: string;
  issueId: number;
  title: string;
  code?: string | null;
  edition?: string | null;
};

type MaterialDraft = {
  bookId: string;
  fromPage: string;
  toPage: string;
  amount: string;
};

type StudentDraft = {
  comment: string;
  mathScore: string;
  englishScore: string;
  mathMistakes: string;
  englishMistakes: string;
  interview: Record<InterviewAreaKey, string>;
  overall: string;
};

type StructuredDraft = {
  kind: StructuredReportKind;
  language: 'ko' | 'en';
  common: { content: string; progress: MaterialDraft; homework: MaterialDraft };
  development: Record<DevelopmentAreaKey, { level: DevelopmentLevel; observation: string }>;
  overall: string;
  students: Record<string, StudentDraft>;
};

const emptyMaterial = (): MaterialDraft => ({ bookId: '', fromPage: '', toPage: '', amount: '' });
const emptyStudent = (): StudentDraft => ({
  comment: '', mathScore: '', englishScore: '', mathMistakes: '', englishMistakes: '',
  interview: { fluency: '', vocabulary: '', grammar: '' }, overall: '',
});

const emptyDraft = (kind: StructuredReportKind, detail: Pick<ReportDetail, 'students'>): StructuredDraft => ({
  kind,
  language: 'ko',
  common: { content: '', progress: emptyMaterial(), homework: emptyMaterial() },
  development: {
    language: { level: '', observation: '' }, math: { level: '', observation: '' },
    emotional: { level: '', observation: '' }, physical: { level: '', observation: '' },
  },
  overall: '',
  students: Object.fromEntries(detail.students.map((student) => [String(student.id), emptyStudent()])),
});

const materialDraft = (value: { issueId: number; fromPage: number; toPage: number; amount?: string | null } | null): MaterialDraft =>
  value ? {
    bookId: `issue:${value.issueId}`,
    fromPage: String(value.fromPage),
    toPage: String(value.toPage),
    amount: value.amount ?? '',
  } : emptyMaterial();

/** 저장 snapshot은 현재 reader가 바뀌어도 같은 입력으로 복원한다. */
const initialDraft = (kind: StructuredReportKind, detail: ReportDetail): StructuredDraft => {
  const initial = emptyDraft(kind, detail);
  const body = detail.structuredBody;
  if (!body || body.kind !== kind) return initial;
  initial.language = detail.lang === 'en' ? 'en' : 'ko';
  if (body.kind === 'individual' || body.kind === 'group') {
    initial.common = {
      content: body.content,
      progress: materialDraft(body.progress),
      homework: materialDraft(body.homework),
    };
    if (body.kind === 'group') {
      for (const student of body.students) {
        const id = String(student.studentId);
        if (initial.students[id]) initial.students[id] = { ...initial.students[id], comment: student.comment };
      }
    }
  } else if (body.kind === 'kinder' || body.kind === 'mock') {
    initial.development = Object.fromEntries(DEVELOPMENT_AREAS.map(({ key }) => [key, {
      level: body.development[key].level ?? '', observation: body.development[key].observation,
    }])) as StructuredDraft['development'];
    initial.overall = body.overall;
  } else {
    for (const student of body.students) {
      const id = String(student.studentId);
      if (!initial.students[id]) continue;
      initial.students[id] = {
        ...initial.students[id],
        mathScore: student.mathScore === null ? '' : String(student.mathScore),
        englishScore: student.englishScore === null ? '' : String(student.englishScore),
        mathMistakes: student.mathMistakes,
        englishMistakes: student.englishMistakes,
        interview: {
          fluency: student.interview.fluency === null ? '' : String(student.interview.fluency),
          vocabulary: student.interview.vocabulary === null ? '' : String(student.interview.vocabulary),
          grammar: student.interview.grammar === null ? '' : String(student.interview.grammar),
        },
        overall: student.overall,
      };
    }
  }
  return initial;
};

const textValue = (value: unknown, max = 2000): string => typeof value === 'string' ? value.slice(0, max) : '';
const objectValue = (value: unknown): Record<string, unknown> => value && typeof value === 'object'
  ? value as Record<string, unknown>
  : {};

function restoreMaterial(value: unknown, allowedBookIds: ReadonlySet<string>): MaterialDraft {
  const source = objectValue(value);
  const bookId = textValue(source.bookId, 100);
  return {
    bookId: allowedBookIds.has(bookId) ? bookId : '',
    fromPage: textValue(source.fromPage, 5),
    toPage: textValue(source.toPage, 5),
    amount: textValue(source.amount, 100),
  };
}

/** localStorage 값은 신뢰하지 않고 현재 kind·학생·교재·영역 집합 안의 문자열만 복원한다. */
function restoreDraft(stored: unknown, initial: StructuredDraft, bookOptions: readonly StructuredBookOption[]): StructuredDraft {
  const source = objectValue(stored);
  if (source.kind !== initial.kind) return initial;
  const common = objectValue(source.common);
  const development = objectValue(source.development);
  const students = objectValue(source.students);
  const allowedBookIds = new Set(bookOptions.map((book) => book.id));
  const next: StructuredDraft = {
    ...initial,
    language: source.language === 'en' ? 'en' : 'ko',
    common: {
      content: textValue(common.content),
      progress: restoreMaterial(common.progress, allowedBookIds),
      homework: restoreMaterial(common.homework, allowedBookIds),
    },
    overall: textValue(source.overall),
    development: { ...initial.development },
    students: { ...initial.students },
  };
  for (const area of DEVELOPMENT_AREAS) {
    const row = objectValue(development[area.key]);
    const level = DEVELOPMENT_LEVELS.some((item) => item.value === row.level) ? row.level as DevelopmentLevel : '';
    next.development[area.key] = { level, observation: textValue(row.observation) };
  }
  for (const id of Object.keys(initial.students)) {
    const row = objectValue(students[id]);
    const interview = objectValue(row.interview);
    next.students[id] = {
      comment: textValue(row.comment),
      mathScore: textValue(row.mathScore, 3),
      englishScore: textValue(row.englishScore, 3),
      mathMistakes: textValue(row.mathMistakes),
      englishMistakes: textValue(row.englishMistakes),
      interview: {
        fluency: textValue(interview.fluency, 3),
        vocabulary: textValue(interview.vocabulary, 3),
        grammar: textValue(interview.grammar, 3),
      },
      overall: textValue(row.overall),
    };
  }
  return next;
}

/** 과목명·학년으로 Kinder를 추정하지 않는다. marker 전 `class` 한 명은 일반 1대1이다. */
export function structuredReportKind(
  detail: Pick<ReportDetail, 'formKind' | 'formatVersion' | 'kindKey' | 'state' | 'students'>,
): StructuredReportKind | null {
  if (detail.formKind !== undefined) return detail.formKind;
  if (detail.state !== 'none' || detail.formatVersion === 0) return null;
  if (detail.kindKey === 'diagx') return 'diagnostic';
  if (detail.kindKey === 'mock') return 'mock';
  if (detail.kindKey === 'class' && detail.students.length > 1) return 'group';
  if (detail.kindKey === 'class' && detail.students.length === 1) return 'individual';
  return null;
}

function scoreIssue(value: string): string | null {
  if (value === '') return '점수를 입력해 주세요.';
  const score = Number(value);
  return Number.isInteger(score) && score >= 0 && score <= 100 ? null : '0부터 100 사이의 정수로 입력해 주세요.';
}

function materialIssue(value: MaterialDraft, bookOptions: readonly StructuredBookOption[], requireAmount: boolean): string | null {
  if (!bookOptions.some((book) => book.id === value.bookId)) return '교재를 선택해 주세요.';
  const from = Number(value.fromPage);
  const to = Number(value.toPage);
  if (!Number.isInteger(from) || from < 1 || !Number.isInteger(to) || to < from) {
    return '시작 쪽과 끝 쪽을 1 이상의 순서로 입력해 주세요.';
  }
  if (requireAmount && !value.amount.trim()) return '숙제 분량을 입력해 주세요.';
  return null;
}

export function interviewAverage(student: StudentDraft): string | null {
  const scores = INTERVIEW_AREAS.map(({ key }) => student.interview[key]);
  if (scores.some((score) => scoreIssue(score))) return null;
  return (scores.reduce((sum, score) => sum + Number(score), 0) / scores.length).toFixed(1);
}

/**
 * 최종 강사 수정사항 p21·p79 권고안: Interview 3점수 평균 뒤 Math·English·Interview 세 영역을 같은 비중으로 계산한다.
 * 서버가 저장값을 다시 계산하며 이 함수는 입력 중 미리보기만 담당한다. 정책 변경 시 Back/OpenAPI/문서/portfolio와 함께 고친다.
 */
export function diagnosticTotalAverage(student: StudentDraft): string | null {
  const interview = interviewAverage(student);
  if (scoreIssue(student.mathScore) || scoreIssue(student.englishScore) || interview === null) return null;
  return ((Number(student.mathScore) + Number(student.englishScore) + Number(interview)) / 3).toFixed(1);
}

function selectedBook(value: MaterialDraft, books: readonly StructuredBookOption[]): StructuredBookOption | undefined {
  return books.find((book) => book.id === value.bookId);
}

function materialText(label: string, value: MaterialDraft, books: readonly StructuredBookOption[]): string {
  const book = selectedBook(value, books);
  const bookName = book ? `${book.title}${book.edition ? ` · ${book.edition}` : ''}` : '교재 미선택';
  const pages = value.fromPage && value.toPage ? `p.${value.fromPage}–${value.toPage}` : '쪽 범위 미입력';
  return `${label}: ${bookName} · ${pages}${value.amount ? ` · 분량 ${value.amount}` : ''}`;
}

function studentLabel(detail: Pick<ReportDetail, 'students'>, studentId: string): string {
  const student = detail.students.find((item) => String(item.id) === studentId);
  return student ? `${student.name}${student.grade ? ` (${student.grade})` : ''}` : `학생 #${studentId}`;
}

function promptHeader(detail: ReportDetail, studentId: string, kindLabel: string): string {
  return [
    '[수업 정보]',
    `학생: ${studentLabel(detail, studentId)}`,
    `날짜: ${detail.date}`,
    `시간: ${reportTimeLabel(detail)}`,
    `과목: ${detail.subjectName}`,
    `구분: ${kindLabel}`,
  ].join('\n');
}

/** 최종 수정사항의 종류별 prompt. 화면이 외부 AI로 보내지 않고 이 문자열만 clipboard에 복사한다. */
export function buildStructuredReportPrompt(
  detail: ReportDetail,
  kind: StructuredReportKind,
  draft: StructuredDraft,
  books: readonly StructuredBookOption[],
  studentId: string,
): string {
  const intro = kind === 'diagnostic'
    ? '당신은 국제학교 준비 학생의 담당 강사입니다. 아래 진단고사 채점 결과를 바탕으로 학부모님께 보낼 진단고사 리포트를 작성해 주세요.'
    : kind === 'group'
      ? '당신은 국제학교 준비 학생의 담당 강사입니다. 아래 그룹 수업 기록을 바탕으로 학부모님께 보낼 학생별 수업 리포트를 작성해 주세요. 공통 부분은 같게 쓰고 개별 의견만 학생에 맞게 씁니다.'
      : '당신은 국제학교 준비 학생의 담당 강사입니다. 아래 수업 기록을 바탕으로 학부모님께 보낼 수업 리포트를 작성해 주세요.';
  const kindLabel = kind === 'individual' ? '일반 1:1 수업'
    : kind === 'group' ? `그룹 수업 · ${detail.students.length}명`
      : kind === 'kinder' ? 'Kinder 수업'
        : kind === 'mock' ? '모의수업' : '진단고사';
  const lines = [intro, '', promptHeader(detail, studentId, kindLabel), ''];

  if (kind === 'individual' || kind === 'group') {
    lines.push(
      kind === 'group' ? '[공통 수업 사항]' : '[오늘 수업 내용]',
      draft.common.content || '(입력해 주세요)',
      '',
      '[진도 페이지]',
      materialText('진도', draft.common.progress, books),
      '',
      '[숙제 페이지]',
      materialText('숙제', draft.common.homework, books),
    );
    if (kind === 'group') lines.push('', '[학생 개별 의견]', draft.students[studentId]?.comment || '(입력해 주세요)');
  } else if (kind === 'kinder' || kind === 'mock') {
    lines.push('[관찰 기록]');
    for (const area of DEVELOPMENT_AREAS) {
      const row = draft.development[area.key];
      const level = DEVELOPMENT_LEVELS.find((item) => item.value === row.level)?.label ?? '미선택';
      lines.push(`${area.label} — 수준: ${level} / 관찰 내용: ${row.observation || '(입력해 주세요)'}`);
    }
    lines.push('', '[종합 소견]', draft.overall || '(입력해 주세요)');
  } else {
    const student = draft.students[studentId] ?? emptyStudent();
    lines.push(
      '[채점 결과]',
      `수학: ${student.mathScore || '-'} / 100`,
      `틀린 문항 정리: ${student.mathMistakes || '(입력해 주세요)'}`,
      `영어: ${student.englishScore || '-'} / 100`,
      `틀린 문항 정리: ${student.englishMistakes || '(입력해 주세요)'}`,
      `인터뷰: 유창성 ${student.interview.fluency || '-'} / 단어 다양성 ${student.interview.vocabulary || '-'} / 어법 ${student.interview.grammar || '-'}`,
      `인터뷰 평균: ${interviewAverage(student) ?? '-'}`,
      '',
      '[종합 소견]',
      student.overall || '(입력해 주세요)',
    );
  }

  lines.push(
    '',
    '[작성 규칙]',
    '사실과 관찰만 쓰고, 잘한 점과 가능성을 먼저 적습니다.',
    '학생을 단정하거나 다른 학생과 비교하지 않습니다.',
    '마크다운 기호를 쓰지 않고 존댓말로 250~450자, 두세 문단으로 작성합니다.',
  );
  return lines.join('\n');
}

function MaterialFields({ id, label, value, books, requireAmount, inspected, onChange, onAdd }: {
  id: string;
  label: string;
  value: MaterialDraft;
  books: readonly StructuredBookOption[];
  requireAmount: boolean;
  inspected: boolean;
  onChange: (value: MaterialDraft) => void;
  onAdd: () => void;
}) {
  const issue = materialIssue(value, books, requireAmount);
  const from = Number(value.fromPage);
  const to = Number(value.toPage);
  const numericIssue = (value.fromPage !== '' || value.toPage !== '')
    && (!Number.isInteger(from) || from < 1 || !Number.isInteger(to) || to < from);
  const pageError = (inspected && Boolean(issue)) || numericIssue;
  const amountError = inspected && requireAmount && !value.amount.trim();
  return (
    <section aria-labelledby={`${id}-title`} className="rounded-xl border border-line bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${id}-title`} className="text-[13px] font-bold text-fg">{label}</h3>
        <span className="text-[12px] text-fg-subtle">교재 정식 이름 · 쪽 범위{requireAmount ? ' · 분량' : ''}</span>
      </div>
      {books.length ? (
        <div role="group" aria-label={`${label} 교재`} className="mt-2 flex flex-wrap gap-2">
          {books.map((book) => (
            <Button key={book.id} size="sm" className="min-h-11 whitespace-normal" variant={value.bookId === book.id ? 'primary' : 'secondary'}
              aria-pressed={value.bookId === book.id} onClick={() => onChange({ ...value, bookId: book.id })}>
              {book.title}{book.edition ? ` · ${book.edition}` : ''}
            </Button>
          ))}
          <Button size="sm" className="min-h-11" onClick={onAdd}>＋ 새 교재·자료 추가</Button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-[12px] font-bold text-amber">배부 교재를 찾지 못했습니다. 새 교재·자료를 등록해 연결해 주세요.</p>
          <Button size="sm" className="min-h-11" onClick={onAdd}>＋ 새 교재·자료 추가</Button>
        </div>
      )}
      <div className={`mt-3 grid grid-cols-1 gap-3 ${requireAmount ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <div>
          <Label htmlFor={`${id}-from`}>시작 쪽</Label>
          <Input id={`${id}-from`} type="number" inputMode="numeric" min={1} step={1} value={value.fromPage}
            error={pageError} aria-invalid={pageError}
            onChange={(event) => onChange({ ...value, fromPage: event.currentTarget.value })} placeholder="12" />
        </div>
        <div>
          <Label htmlFor={`${id}-to`}>끝 쪽</Label>
          <Input id={`${id}-to`} type="number" inputMode="numeric" min={1} step={1} value={value.toPage}
            error={pageError} aria-invalid={pageError}
            onChange={(event) => onChange({ ...value, toPage: event.currentTarget.value })} placeholder="18" />
        </div>
        {requireAmount ? (
          <div>
            <Label htmlFor={`${id}-amount`}>숙제 분량</Label>
            <Input id={`${id}-amount`} value={value.amount} maxLength={100} error={amountError} aria-invalid={amountError}
              onChange={(event) => onChange({ ...value, amount: event.currentTarget.value })} placeholder="홀수 문제 전부" />
          </div>
        ) : null}
      </div>
      {inspected && issue ? <p role="alert" className="mt-2 text-[12px] font-bold text-red">{issue}</p> : null}
    </section>
  );
}

function LessonContentDraft({ kind, detail, value, books, inspected, onChange, onAddMaterial }: {
  kind: 'individual' | 'group';
  detail: Pick<ReportDetail, 'students'>;
  value: StructuredDraft;
  books: readonly StructuredBookOption[];
  inspected: boolean;
  onChange: (value: StructuredDraft) => void;
  onAddMaterial: (target: 'progress' | 'homework') => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Banner tone="info" title={kind === 'group' ? '그룹 공통 사항과 학생별 의견' : '일반 1대1 리포트'}>
        수업 내용은 60자 이상{kind === 'group' ? ', 학생별 의견은 각 40자 이상' : ''} 작성하고 진도·숙제는 교재와 쪽 범위로 나눕니다.
      </Banner>
      <div>
        <Label htmlFor="structured-class-content" hint="60자 이상">{kind === 'group' ? '공통 수업 사항' : '수업 내용'}</Label>
        <CountedTextarea id="structured-class-content" min={60} value={value.common.content} showError={inspected}
          onChange={(content) => onChange({ ...value, common: { ...value.common, content } })} />
      </div>
      <MaterialFields id="structured-progress" label="진도 페이지" value={value.common.progress} books={books} inspected={inspected}
        requireAmount={false} onAdd={() => onAddMaterial('progress')}
        onChange={(progress) => onChange({ ...value, common: { ...value.common, progress } })} />
      <MaterialFields id="structured-homework" label="숙제 페이지" value={value.common.homework} books={books} inspected={inspected}
        requireAmount onAdd={() => onAddMaterial('homework')}
        onChange={(homework) => onChange({ ...value, common: { ...value.common, homework } })} />
      {kind === 'group' ? detail.students.map((student) => {
        const id = String(student.id);
        return (
          <div key={id}>
            <Label htmlFor={`structured-group-student-${id}`} hint="40자 이상">{student.name} 개별 의견</Label>
            <CountedTextarea id={`structured-group-student-${id}`} min={40} showError={inspected}
              value={value.students[id]?.comment ?? ''}
              onChange={(comment) => onChange({
                ...value,
                students: { ...value.students, [id]: { ...(value.students[id] ?? emptyStudent()), comment } },
              })} />
          </div>
        );
      }) : null}
    </div>
  );
}

function DevelopmentDraft({ kind, value, inspected, onChange }: {
  kind: 'kinder' | 'mock'; value: StructuredDraft; inspected: boolean; onChange: (value: StructuredDraft) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Banner tone="info" title={`${kind === 'kinder' ? 'Kinder' : '모의수업'} 4영역 리포트`}>
        영역마다 3단계 평가와 30자 이상 관찰을 적고, 종합 소견은 60자 이상 작성합니다.
        Kinder에는 그룹 공통 사항이나 학생별 그룹 의견을 만들지 않습니다.
      </Banner>
      {DEVELOPMENT_AREAS.map((area, index) => {
        const row = value.development[area.key];
        return (
          <section key={area.key} aria-labelledby={`structured-${area.key}-title`} className="rounded-xl border border-line bg-card p-3">
            <h3 id={`structured-${area.key}-title`} className="text-[13px] font-bold text-fg">{index + 1}. {area.label}</h3>
            <Segmented ariaLabel={`${area.label} 평가`} className="mt-2 flex w-full [&>button]:min-h-11 [&>button]:grow"
              options={[...DEVELOPMENT_LEVELS]} value={row.level}
              onChange={(level) => onChange({ ...value, development: { ...value.development, [area.key]: { ...row, level } } })} />
            {inspected && !row.level ? <p role="alert" className="mt-1 text-[12px] font-bold text-red">평가 단계를 선택해 주세요.</p> : null}
            <div className="mt-3">
              <Label htmlFor={`structured-${area.key}-observation`} hint="30자 이상">관찰</Label>
              <CountedTextarea id={`structured-${area.key}-observation`} min={30} showError={inspected}
                value={row.observation} onChange={(observation) => onChange({
                  ...value,
                  development: { ...value.development, [area.key]: { ...row, observation } },
                })} placeholder="수업에서 직접 관찰한 행동을 적어 주세요" />
            </div>
          </section>
        );
      })}
      <div>
        <Label htmlFor="structured-development-overall" hint="60자 이상">종합 소견</Label>
        <CountedTextarea id="structured-development-overall" min={60} showError={inspected} value={value.overall}
          onChange={(overall) => onChange({ ...value, overall })} />
      </div>
    </div>
  );
}

function ScoreInput({ id, label, value, inspected, onChange }: {
  id: string; label: string; value: string; inspected: boolean; onChange: (value: string) => void;
}) {
  const issue = value || inspected ? scoreIssue(value) : null;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" inputMode="numeric" min={0} max={100} step={1} value={value} error={Boolean(issue)}
        aria-invalid={Boolean(issue)} onChange={(event) => onChange(event.currentTarget.value)} placeholder="0–100" />
      {issue ? <p role="alert" className="mt-1 text-[12px] font-bold text-red">{issue}</p> : null}
    </div>
  );
}

function DiagnosticDraft({ detail, value, inspected, onChange }: {
  detail: Pick<ReportDetail, 'students'>; value: StructuredDraft; inspected: boolean; onChange: (value: StructuredDraft) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Banner tone="info" title="학생별 진단 리포트">
        진단 그룹도 학생마다 별도 양식을 사용합니다. 자동 레벨 판정은 하지 않습니다.
      </Banner>
      {detail.students.map((student) => {
        const id = String(student.id);
        const row = value.students[id] ?? emptyStudent();
        const set = (next: StudentDraft) => onChange({ ...value, students: { ...value.students, [id]: next } });
        const average = interviewAverage(row);
        const totalAverage = diagnosticTotalAverage(row);
        return (
          <section key={id} aria-labelledby={`diagnostic-student-${id}`} className="rounded-xl border border-line bg-card p-4">
            <h3 id={`diagnostic-student-${id}`} className="text-[14px] font-bold text-fg">{student.name} 진단</h3>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ScoreInput id={`diagnostic-${id}-math`} label="수학 점수" value={row.mathScore} inspected={inspected}
                onChange={(mathScore) => set({ ...row, mathScore })} />
              <ScoreInput id={`diagnostic-${id}-english`} label="영어 점수" value={row.englishScore} inspected={inspected}
                onChange={(englishScore) => set({ ...row, englishScore })} />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor={`diagnostic-${id}-math-mistakes`}>수학 틀린 문항 · 영역 · 틀린 이유</Label>
                <CountedTextarea id={`diagnostic-${id}-math-mistakes`} min={1} showError={inspected} value={row.mathMistakes}
                  onChange={(mathMistakes) => set({ ...row, mathMistakes })} />
              </div>
              <div>
                <Label htmlFor={`diagnostic-${id}-english-mistakes`}>영어 틀린 문항 · 영역 · 틀린 이유</Label>
                <CountedTextarea id={`diagnostic-${id}-english-mistakes`} min={1} showError={inspected} value={row.englishMistakes}
                  onChange={(englishMistakes) => set({ ...row, englishMistakes })} />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {INTERVIEW_AREAS.map((area) => (
                <ScoreInput key={area.key} id={`diagnostic-${id}-${area.key}`} label={`인터뷰 · ${area.label}`}
                  value={row.interview[area.key]} inspected={inspected}
                  onChange={(score) => set({ ...row, interview: { ...row.interview, [area.key]: score } })} />
              ))}
            </div>
            <p aria-live="polite" className="mt-2 text-[12px] font-bold text-fg-2">
              인터뷰 평균 {average ?? '—'} · 전체 평균 {totalAverage ?? '—'}
            </p>
            <div className="mt-3">
              <Label htmlFor={`diagnostic-${id}-overall`}>종합 소견</Label>
              <CountedTextarea id={`diagnostic-${id}-overall`} min={1} showError={inspected} value={row.overall}
                onChange={(overall) => set({ ...row, overall })} />
            </div>
          </section>
        );
      })}
    </div>
  );
}

function draftIssues(kind: StructuredReportKind, detail: Pick<ReportDetail, 'students'>, value: StructuredDraft, books: readonly StructuredBookOption[]): string[] {
  const issues: string[] = [];
  if (kind === 'individual' || kind === 'group') {
    if (value.common.content.trim().length < 60) issues.push(kind === 'group' ? '공통 수업 사항 60자' : '수업 내용 60자');
    if (materialIssue(value.common.progress, books, false)) issues.push('진도 교재·쪽 범위');
    if (materialIssue(value.common.homework, books, true)) issues.push('숙제 교재·쪽 범위·분량');
    if (kind === 'group') {
      for (const student of detail.students) {
        if ((value.students[String(student.id)]?.comment ?? '').trim().length < 40) issues.push(`${student.name} 개별 의견 40자`);
      }
    }
  } else if (kind === 'kinder' || kind === 'mock') {
    for (const area of DEVELOPMENT_AREAS) {
      const row = value.development[area.key];
      if (!row.level || row.observation.trim().length < 30) issues.push(`${area.label} 평가·관찰 30자`);
    }
    if (value.overall.trim().length < 60) issues.push('종합 소견 60자');
  } else {
    for (const student of detail.students) {
      const row = value.students[String(student.id)] ?? emptyStudent();
      if ([row.mathScore, row.englishScore, ...INTERVIEW_AREAS.map(({ key }) => row.interview[key])].some((score) => scoreIssue(score))) {
        issues.push(`${student.name} 점수 0–100`);
      }
      if (!row.mathMistakes.trim() || !row.englishMistakes.trim() || !row.overall.trim()) issues.push(`${student.name} 오답·종합 소견`);
    }
  }
  return issues;
}

function writeMaterial(value: MaterialDraft, books: readonly StructuredBookOption[]): {
  issueId: number; fromPage: number; toPage: number; amount?: string | null;
} | null {
  const book = selectedBook(value, books);
  if (!book || materialIssue(value, books, false)) return null;
  return {
    issueId: book.issueId,
    fromPage: Number(value.fromPage),
    toPage: Number(value.toPage),
    amount: value.amount.trim() || null,
  };
}

const nullableScore = (value: string): number | null => scoreIssue(value) ? null : Number(value);

/** 생성된 ReportUpsert 계약으로만 변환한다. 평균·교재 identity는 서버가 다시 계산하고 확정한다. */
function structuredWriteBody(
  detail: ReportDetail,
  kind: StructuredReportKind,
  draft: StructuredDraft,
  books: readonly StructuredBookOption[],
): ReportUpsert {
  let structuredBody: ReportStructuredBody;
  if (kind === 'individual' || kind === 'group') {
    const common = {
      content: draft.common.content,
      progress: writeMaterial(draft.common.progress, books),
      homework: writeMaterial(draft.common.homework, books),
    };
    structuredBody = kind === 'individual' ? { kind, ...common } : {
      kind,
      ...common,
      students: detail.students.map((student) => ({
        studentId: student.id,
        comment: draft.students[String(student.id)]?.comment ?? '',
      })),
    };
  } else if (kind === 'kinder' || kind === 'mock') {
    const development = Object.fromEntries(DEVELOPMENT_AREAS.map(({ key }) => [key, {
        level: draft.development[key].level || null,
        observation: draft.development[key].observation,
      }])) as Extract<ReportStructuredBody, { kind: 'kinder' }>['development'];
    structuredBody = kind === 'kinder'
      ? { kind, development, overall: draft.overall }
      : { kind, development, overall: draft.overall };
  } else {
    structuredBody = {
      kind,
      students: detail.students.map((student) => {
        const row = draft.students[String(student.id)] ?? emptyStudent();
        return {
          studentId: student.id,
          mathScore: nullableScore(row.mathScore),
          englishScore: nullableScore(row.englishScore),
          mathMistakes: row.mathMistakes,
          englishMistakes: row.englishMistakes,
          interview: {
            fluency: nullableScore(row.interview.fluency),
            vocabulary: nullableScore(row.interview.vocabulary),
            grammar: nullableScore(row.interview.grammar),
          },
          overall: row.overall,
        };
      }),
    };
  }
  return { formatVersion: 1, expectedVersion: detail.version, language: draft.language, structuredBody };
}

function ReportPromptPanel({ detail, kind, draft, books }: {
  detail: ReportDetail; kind: StructuredReportKind; draft: StructuredDraft; books: readonly StructuredBookOption[];
}) {
  const entries = detail.students.map((student) => ({
    id: String(student.id),
    label: student.name,
    text: buildStructuredReportPrompt(detail, kind, draft, books, String(student.id)),
  }));
  const [selectedId, setSelectedId] = useState(entries[0]?.id ?? '');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const selected = entries.find((entry) => entry.id === selectedId) ?? entries[0];

  const copy = async (entry: typeof entries[number]) => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(entry.text);
      setSelectedId(entry.id);
      setMessage({ ok: true, text: '프롬프트가 복사되었습니다' });
    } catch {
      setMessage({ ok: false, text: '복사하지 못했습니다. 브라우저 권한을 확인하거나 아래 글을 직접 복사해 주세요.' });
    }
  };

  if (!selected) return null;
  return (
    <section aria-labelledby="structured-prompt-title" className="overflow-hidden rounded-xl border border-fg bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 bg-fg px-4 py-3 text-white">
        <div>
          <h3 id="structured-prompt-title" className="text-[13px] font-bold">리포트 작성용 AI 프롬프트</h3>
          <p className="mt-0.5 text-[12px] text-white/75">복사해서 AI에 붙여 넣으면 초안이 나옵니다. 이 화면은 외부로 전송하지 않습니다.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {entries.map((entry) => (
            <Button key={entry.id} size="sm" variant="primary" className="min-h-11" onClick={() => void copy(entry)}>
              {entries.length > 1 ? `${entry.label} 복사하기` : '복사하기'}
            </Button>
          ))}
        </div>
      </header>
      {entries.length > 1 ? (
        <div role="tablist" aria-label="학생별 프롬프트" className="flex flex-wrap gap-2 border-b border-line px-4 py-2">
          {entries.map((entry) => (
            <Button key={entry.id} size="sm" variant={selected.id === entry.id ? 'primary' : 'secondary'}
              id={`structured-prompt-tab-${entry.id}`} aria-controls={`structured-prompt-panel-${entry.id}`}
              aria-selected={selected.id === entry.id} role="tab" onClick={() => setSelectedId(entry.id)}>{entry.label}</Button>
          ))}
        </div>
      ) : null}
      <pre
        id={`structured-prompt-panel-${selected.id}`}
        role={entries.length > 1 ? 'tabpanel' : undefined}
        aria-labelledby={entries.length > 1 ? `structured-prompt-tab-${selected.id}` : undefined}
        tabIndex={0}
        className="max-h-80 overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-sans text-[12px] leading-relaxed text-fg"
      >{selected.text}</pre>
      {message ? <p role="status" className={`border-t border-line px-4 py-2 text-[12px] font-bold ${message.ok ? 'text-green' : 'text-red'}`}>{message.text}</p> : null}
    </section>
  );
}

export function StructuredReportDraft({ detail, kind, bookOptions = [], showWriterGuide = true }: {
  detail: ReportDetail;
  kind: StructuredReportKind;
  bookOptions?: readonly StructuredBookOption[];
  showWriterGuide?: boolean;
}) {
  const userId = useSession((state) => state.me?.id ?? null);
  const initial = useMemo(() => initialDraft(kind, detail), [detail, kind]);
  const [draft, setDraft] = useState(initial);
  const [inspected, setInspected] = useState(false);
  const [inspectionMessage, setInspectionMessage] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const write = useReportWrite();
  const createMaterial = useReportMaterialCreate();
  const [materialTarget, setMaterialTarget] = useState<'progress' | 'homework' | null>(null);
  const [materialKind, setMaterialKind] = useState<ReportMaterialCreate['kind']>('regular');
  const [materialTitle, setMaterialTitle] = useState('');
  const [materialRequestKey, setMaterialRequestKey] = useState('');
  const [materialError, setMaterialError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const bookIds = bookOptions.map((book) => book.id).join(',');
  const autosave = useDraftAutosave<StructuredDraft>({
    key: userId === null ? null : draftKey(userId, 'report', `structured:${detail.serId}:${detail.onDate}`),
    base: `${detail.state}|${kind}|${detail.students.map((student) => student.id).join(',')}|${bookIds}`,
    value: draft,
    dirty,
    enabled: detail.canEdit,
    onRestore: (stored) => setDraft(restoreDraft(stored, initial, bookOptions)),
  });

  const invalidKinderCount = kind === 'kinder' && detail.students.length !== 1;
  const openMaterial = (target: 'progress' | 'homework') => {
    setMaterialTarget(target);
    setMaterialKind('regular');
    setMaterialTitle('');
    setMaterialRequestKey(globalThis.crypto.randomUUID());
    setMaterialError(null);
  };
  const closeMaterial = () => {
    if (createMaterial.isPending) return;
    setMaterialTarget(null);
    setMaterialError(null);
  };
  const saveMaterial = () => {
    const title = materialTitle.trim();
    if (!materialTarget || !title || createMaterial.isPending) return;
    setMaterialError(null);
    createMaterial.mutate(
      {
        serId: detail.serId,
        onDate: detail.onDate,
        body: { kind: materialKind, title, expectedVersion: detail.version, requestKey: materialRequestKey },
      },
      {
        onSuccess: (result) => {
          const selected = `issue:${result.selectedIssueId}`;
          setDraft((current) => ({
            ...current,
            common: {
              ...current.common,
              [materialTarget]: { ...current.common[materialTarget], bookId: selected },
            },
          }));
          setMaterialTarget(null);
          setSaveMessage({ tone: 'success', text: `${title} 자료를 등록하고 선택했습니다.` });
        },
        onError: (error) => setMaterialError(apiMessage(error)),
      },
    );
  };
  const inspect = () => {
    setInspected(true);
    const issues = draftIssues(kind, detail, draft, bookOptions);
    setInspectionMessage(issues.length ? `확인할 항목: ${issues.join(' · ')}` : '현재 화면의 필수 입력 검사를 통과했습니다.');
  };
  const save = (action: 'draft' | 'submit') => {
    if (!detail.canEdit || write.isPending || invalidKinderCount) return;
    const issues = draftIssues(kind, detail, draft, bookOptions);
    if (action === 'submit' && issues.length) {
      setInspected(true);
      setInspectionMessage(`확인할 항목: ${issues.join(' · ')}`);
      return;
    }
    setSaveMessage(null);
    write.mutate(
      {
        action,
        serId: detail.serId,
        onDate: detail.onDate,
        body: structuredWriteBody(detail, kind, draft, bookOptions),
      },
      {
        onSuccess: () => {
          autosave.discard();
          setSaveMessage({
            tone: 'success',
            text: action === 'draft' ? '구조화 리포트를 임시 저장했습니다.' : '구조화 리포트의 승인을 요청했습니다.',
          });
        },
        onError: (error) => setSaveMessage({ tone: 'danger', text: apiMessage(error) }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <fieldset disabled={!detail.canEdit || write.isPending || createMaterial.isPending} className="contents">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Label>작성 언어</Label>
          <Segmented ariaLabel="작성 언어" className="[&>button]:min-h-11"
            options={[{ value: 'ko', label: '한국어' }, { value: 'en', label: 'English' }]}
            value={draft.language} onChange={(language) => setDraft({ ...draft, language })} />
        </div>
        {autosave.restoredAt !== null && dirty ? (
          <span className="text-[12px] text-fg-subtle">로컬 초안 복원 · {autosaveStampLabel(autosave.restoredAt)}</span>
        ) : null}
      </div>

      {invalidKinderCount ? (
        <Banner tone="danger" title="Kinder 학생 수 오류">
          Kinder는 학생 한 명인 회차만 작성할 수 있습니다. 정원 확인이나 관리자 대리 작성으로 우회할 수 없습니다.
        </Banner>
      ) : null}
      {!invalidKinderCount && (kind === 'individual' || kind === 'group') ? (
        <LessonContentDraft kind={kind} detail={detail} value={draft} books={bookOptions} inspected={inspected}
          onChange={setDraft} onAddMaterial={openMaterial} />
      ) : null}
      {!invalidKinderCount && (kind === 'kinder' || kind === 'mock') ? (
        <DevelopmentDraft kind={kind} value={draft} inspected={inspected} onChange={setDraft} />
      ) : null}
      {!invalidKinderCount && kind === 'diagnostic' ? (
        <DiagnosticDraft detail={detail} value={draft} inspected={inspected} onChange={setDraft} />
      ) : null}

      {!invalidKinderCount && showWriterGuide && detail.canEdit ? <ReportWriterGuide /> : null}
      {!invalidKinderCount ? <ReportPromptPanel detail={detail} kind={kind} draft={draft} books={bookOptions} /> : null}

      </fieldset>

      <Dialog
        open={materialTarget !== null}
        onClose={closeMaterial}
        title="새 교재·자료 추가"
        sub="이름과 종류를 저장하면 현재 리포트의 진도·숙제 교재로 바로 선택됩니다."
        closeX
        footer={(
          <>
            <Button variant="secondary" disabled={createMaterial.isPending} onClick={closeMaterial}>취소</Button>
            <Button disabled={!materialTitle.trim() || createMaterial.isPending} onClick={saveMaterial}>
              {createMaterial.isPending ? '저장 중…' : '저장하고 선택'}
            </Button>
          </>
        )}
      >
        <div className="flex flex-col gap-4">
          <div>
            <Label>자료 종류</Label>
            <Segmented
              ariaLabel="자료 종류"
              className="[&>button]:min-h-11"
              options={[
                { value: 'regular', label: '일반 교재' },
                { value: 'supplementary', label: '보충 자료' },
                { value: 'personal', label: '개인 자료' },
              ]}
              value={materialKind}
              onChange={setMaterialKind}
            />
          </div>
          <div>
            <Label htmlFor="report-material-title">교재·자료 이름</Label>
            <Input
              id="report-material-title"
              autoFocus
              maxLength={120}
              value={materialTitle}
              onChange={(event) => setMaterialTitle(event.currentTarget.value)}
              placeholder="정식 이름을 입력해 주세요"
            />
          </div>
          {materialKind === 'regular' ? (
            <Banner tone="info">일반 교재는 저장 즉시 관리자 교재 카탈로그에도 표시됩니다.</Banner>
          ) : null}
          {materialError ? <Banner tone="danger">{materialError}</Banner> : null}
        </div>
      </Dialog>

      {inspectionMessage ? <Banner tone={inspectionMessage.startsWith('확인할') ? 'danger' : 'success'}>{inspectionMessage}</Banner> : null}
      {saveMessage ? <Banner tone={saveMessage.tone}>{saveMessage.text}</Banner> : null}
      {detail.canEdit ? (
        <div className="flex flex-wrap justify-end gap-2">
          {dirty ? <Button className="min-h-11" disabled={write.isPending} onClick={() => { autosave.discard(); setDraft(initial); setInspected(false); setInspectionMessage(null); }}>초안 비우기</Button> : null}
          <Button className="min-h-11" disabled={write.isPending} onClick={inspect}>입력 검사</Button>
          <Button className="min-h-11" disabled={write.isPending} onClick={() => save('draft')}>임시 저장</Button>
          <Button className="min-h-11" variant="success" disabled={write.isPending} onClick={() => save('submit')}>승인 요청하기</Button>
        </div>
      ) : null}
    </div>
  );
}
