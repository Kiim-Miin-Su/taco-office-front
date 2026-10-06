/** @file-guide
 * 목적: 최신 수정사항의 그룹·Kinder/모의·진단 리포트 입력을 서버 계약 전 로컬 초안으로 제공한다.
 * 책임/재사용: 화면 입력과 검증만 소유한다. 종류 판정은 명시 kind/marker만 사용하고 현 3문자열 writer로 우회 저장하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';

import { useMemo, useState } from 'react';
import type { ReportDetail } from '@/api/types';
import { autosaveStampLabel, draftKey, useDraftAutosave } from '@/lib/autosave';
import { useSession } from '@/store/useSession';
import { Banner, Button, CountedTextarea, Input, Label, Segmented } from '@/components/ui';

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
export type StructuredReportKind = 'group' | 'kinder' | 'mock' | 'diagnostic';

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
  common: { content: string };
  development: Record<DevelopmentAreaKey, { level: DevelopmentLevel; observation: string }>;
  overall: string;
  students: Record<string, StudentDraft>;
};

const emptyStudent = (): StudentDraft => ({
  comment: '', mathScore: '', englishScore: '', mathMistakes: '', englishMistakes: '',
  interview: { fluency: '', vocabulary: '', grammar: '' }, overall: '',
});

const initialDraft = (kind: StructuredReportKind, detail: Pick<ReportDetail, 'students'>): StructuredDraft => ({
  kind,
  language: 'ko',
  common: { content: '' },
  development: {
    language: { level: '', observation: '' }, math: { level: '', observation: '' },
    emotional: { level: '', observation: '' }, physical: { level: '', observation: '' },
  },
  overall: '',
  students: Object.fromEntries(detail.students.map((student) => [String(student.id), emptyStudent()])),
});

const textValue = (value: unknown): string => typeof value === 'string' ? value.slice(0, 2000) : '';
const objectValue = (value: unknown): Record<string, unknown> => value && typeof value === 'object'
  ? value as Record<string, unknown>
  : {};

/** localStorage 값은 신뢰하지 않고 현재 학생·영역 집합 안의 문자열만 복원한다. */
function restoreDraft(stored: unknown, initial: StructuredDraft): StructuredDraft {
  const source = objectValue(stored);
  if (source.kind !== initial.kind) return initial;
  const common = objectValue(source.common);
  const development = objectValue(source.development);
  const students = objectValue(source.students);
  const next: StructuredDraft = {
    ...initial,
    language: source.language === 'en' ? 'en' : 'ko',
    common: { content: textValue(common.content) },
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
      mathScore: textValue(row.mathScore),
      englishScore: textValue(row.englishScore),
      mathMistakes: textValue(row.mathMistakes),
      englishMistakes: textValue(row.englishMistakes),
      interview: {
        fluency: textValue(interview.fluency),
        vocabulary: textValue(interview.vocabulary),
        grammar: textValue(interview.grammar),
      },
      overall: textValue(row.overall),
    };
  }
  return next;
}

/** 과목명·학년으로 Kinder를 추정하지 않는다. `class` 1명은 marker DTO가 올 때까지 기존 일반 1대1이다. */
export function structuredReportKind(detail: Pick<ReportDetail, 'kindKey' | 'state' | 'students'>): StructuredReportKind | null {
  if (detail.state !== 'none') return null;
  if (detail.kindKey === 'diagx') return 'diagnostic';
  if (detail.kindKey === 'mock') return 'mock';
  if (detail.kindKey === 'class' && detail.students.length > 1) return 'group';
  return null;
}

function scoreIssue(value: string): string | null {
  if (value === '') return '점수를 입력해 주세요.';
  const score = Number(value);
  return Number.isInteger(score) && score >= 0 && score <= 100 ? null : '0부터 100 사이의 정수로 입력해 주세요.';
}

export function interviewAverage(student: StudentDraft): string | null {
  const scores = INTERVIEW_AREAS.map(({ key }) => student.interview[key]);
  if (scores.some((score) => scoreIssue(score))) return null;
  return (scores.reduce((sum, score) => sum + Number(score), 0) / scores.length).toFixed(1);
}

function DevelopmentDraft({ kind, value, onChange }: {
  kind: 'kinder' | 'mock'; value: StructuredDraft; onChange: (value: StructuredDraft) => void;
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
            <Segmented
              ariaLabel={`${area.label} 평가`}
              className="mt-2 flex w-full [&>button]:min-h-11 [&>button]:grow"
              options={[...DEVELOPMENT_LEVELS]}
              value={row.level}
              onChange={(level) => onChange({
                ...value,
                development: { ...value.development, [area.key]: { ...row, level } },
              })}
            />
            <div className="mt-3">
              <Label htmlFor={`structured-${area.key}-observation`} hint="30자 이상">관찰</Label>
              <CountedTextarea
                id={`structured-${area.key}-observation`}
                min={30}
                value={row.observation}
                onChange={(observation) => onChange({
                  ...value,
                  development: { ...value.development, [area.key]: { ...row, observation } },
                })}
                placeholder="수업에서 직접 관찰한 행동을 적어 주세요"
              />
            </div>
          </section>
        );
      })}
      <div>
        <Label htmlFor="structured-development-overall" hint="60자 이상">종합 소견</Label>
        <CountedTextarea id="structured-development-overall" min={60} value={value.overall}
          onChange={(overall) => onChange({ ...value, overall })} />
      </div>
    </div>
  );
}

function GroupDraft({ detail, value, onChange }: {
  detail: Pick<ReportDetail, 'students'>; value: StructuredDraft; onChange: (value: StructuredDraft) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Banner tone="info" title="그룹 공통 사항과 학생별 의견">
        수업 내용은 60자 이상, 학생별 의견은 각 40자 이상 작성합니다. 교재·쪽 범위는 BOC-08 계약과 연결 전까지 저장하지 않습니다.
      </Banner>
      <div>
        <Label htmlFor="structured-group-content" hint="60자 이상">공통 수업 내용</Label>
        <CountedTextarea id="structured-group-content" min={60} value={value.common.content}
          onChange={(content) => onChange({ ...value, common: { ...value.common, content } })} />
      </div>
      {detail.students.map((student) => {
        const id = String(student.id);
        return (
          <div key={id}>
            <Label htmlFor={`structured-group-student-${id}`} hint="40자 이상">{student.name} 개별 의견</Label>
            <CountedTextarea id={`structured-group-student-${id}`} min={40} value={value.students[id]?.comment ?? ''}
              onChange={(comment) => onChange({
                ...value,
                students: { ...value.students, [id]: { ...(value.students[id] ?? emptyStudent()), comment } },
              })} />
          </div>
        );
      })}
    </div>
  );
}

function ScoreInput({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  const issue = value ? scoreIssue(value) : null;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" min={0} max={100} step={1} value={value} error={Boolean(issue)}
        onChange={(event) => onChange(event.currentTarget.value)} placeholder="0–100" />
      {issue ? <p role="alert" className="mt-1 text-[11px] font-bold text-red">{issue}</p> : null}
    </div>
  );
}

function DiagnosticDraft({ detail, value, onChange }: {
  detail: Pick<ReportDetail, 'students'>; value: StructuredDraft; onChange: (value: StructuredDraft) => void;
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
        return (
          <section key={id} aria-labelledby={`diagnostic-student-${id}`} className="rounded-xl border border-line bg-card p-4">
            <h3 id={`diagnostic-student-${id}`} className="text-[14px] font-bold text-fg">{student.name} 진단</h3>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ScoreInput id={`diagnostic-${id}-math`} label="수학 점수" value={row.mathScore}
                onChange={(mathScore) => set({ ...row, mathScore })} />
              <ScoreInput id={`diagnostic-${id}-english`} label="영어 점수" value={row.englishScore}
                onChange={(englishScore) => set({ ...row, englishScore })} />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor={`diagnostic-${id}-math-mistakes`}>수학 틀린 문항 · 영역 · 틀린 이유</Label>
                <CountedTextarea id={`diagnostic-${id}-math-mistakes`} value={row.mathMistakes}
                  onChange={(mathMistakes) => set({ ...row, mathMistakes })} />
              </div>
              <div>
                <Label htmlFor={`diagnostic-${id}-english-mistakes`}>영어 틀린 문항 · 영역 · 틀린 이유</Label>
                <CountedTextarea id={`diagnostic-${id}-english-mistakes`} value={row.englishMistakes}
                  onChange={(englishMistakes) => set({ ...row, englishMistakes })} />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {INTERVIEW_AREAS.map((area) => (
                <ScoreInput key={area.key} id={`diagnostic-${id}-${area.key}`} label={`인터뷰 · ${area.label}`}
                  value={row.interview[area.key]}
                  onChange={(score) => set({ ...row, interview: { ...row.interview, [area.key]: score } })} />
              ))}
            </div>
            <p aria-live="polite" className="mt-2 text-[12px] font-bold text-fg-2">
              인터뷰 평균 {average ?? '—'} · 전체 평균은 산식 결정 대기
            </p>
            <div className="mt-3">
              <Label htmlFor={`diagnostic-${id}-overall`}>종합 소견</Label>
              <CountedTextarea id={`diagnostic-${id}-overall`} value={row.overall}
                onChange={(overall) => set({ ...row, overall })} />
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function StructuredReportDraft({ detail, kind }: { detail: ReportDetail; kind: StructuredReportKind }) {
  const userId = useSession((state) => state.me?.id ?? null);
  const initial = useMemo(() => initialDraft(kind, detail), [detail, kind]);
  const [draft, setDraft] = useState(initial);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const autosave = useDraftAutosave<StructuredDraft>({
    key: userId === null ? null : draftKey(userId, 'report', `structured:${detail.serId}:${detail.onDate}`),
    base: `${detail.state}|${kind}|${detail.students.map((student) => student.id).join(',')}`,
    value: draft,
    dirty,
    enabled: detail.canEdit,
    onRestore: (stored) => setDraft(restoreDraft(stored, initial)),
  });

  const invalidKinderCount = kind === 'kinder' && detail.students.length !== 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Label>작성 언어</Label>
          <Segmented ariaLabel="작성 언어" className="[&>button]:min-h-11"
            options={[{ value: 'ko', label: '한국어' }, { value: 'en', label: 'English' }]}
            value={draft.language} onChange={(language) => setDraft({ ...draft, language })} />
        </div>
        {autosave.restoredAt !== null && dirty ? (
          <span className="text-[11px] text-fg-subtle">로컬 초안 복원 · {autosaveStampLabel(autosave.restoredAt)}</span>
        ) : null}
      </div>

      {invalidKinderCount ? (
        <Banner tone="danger" title="Kinder 학생 수 오류">
          Kinder는 학생 한 명인 회차만 작성할 수 있습니다. 정원 확인이나 관리자 대리 작성으로 우회할 수 없습니다.
        </Banner>
      ) : null}
      {!invalidKinderCount && kind === 'group' ? <GroupDraft detail={detail} value={draft} onChange={setDraft} /> : null}
      {!invalidKinderCount && (kind === 'kinder' || kind === 'mock') ? <DevelopmentDraft kind={kind} value={draft} onChange={setDraft} /> : null}
      {!invalidKinderCount && kind === 'diagnostic' ? <DiagnosticDraft detail={detail} value={draft} onChange={setDraft} /> : null}

      <Banner tone="warning" title="구조화 저장 계약 연결 전">
        이 초안은 현재 브라우저에만 보존됩니다. 학생 identity, 양식 버전, 언어, expectedVersion과 구조화 본문 DTO가 없어
        기존 content/progress/homework writer로 변환하거나 저장 성공으로 표시하지 않습니다.
      </Banner>
      <div className="flex flex-wrap justify-end gap-2">
        {dirty ? <Button className="min-h-11" onClick={() => { autosave.discard(); setDraft(initial); }}>초안 비우기</Button> : null}
        <Button className="min-h-11" disabled title="구조화 DTO/OpenAPI 연결 후 활성화">임시 저장 계약 준비 중</Button>
        <Button className="min-h-11" variant="success" disabled title="양식 버전·expectedVersion·서버 검증 연결 후 활성화">승인 요청 계약 준비 중</Button>
      </div>
    </div>
  );
}
