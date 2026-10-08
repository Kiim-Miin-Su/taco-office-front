/** @file-guide
 * 목적: 프로그램별 과목 선택지를 한 곳에서 만들고 구형/신형 Meta 응답의 롤링 배포를 안전하게 잇는다.
 * 책임/재사용: 생성된 Meta/Sub 타입을 읽기만 한다. 서버 계약을 수기로 복제하거나 쓰기 DTO를 만들지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { Sub } from '@/api/types';

type SubjectLike = Pick<Sub, 'key' | 'name' | 'kindKey'>;
type SubjectList = { subs: readonly SubjectLike[] };

export interface SubjectOption {
  key: string;
  name: string;
  /** 현재 프로그램에는 속하지 않지만 과거 저장값을 잃지 않도록 보여 주는 선택지 */
  legacy: boolean;
}

/**
 * BOC-01D-01 생성 계약을 직접 읽는다. null은 migration이 추정하지 않은 legacy 미연결 과목이다.
 */
export function subjectProgramKey(subject: SubjectLike): string | null {
  return subject.kindKey?.trim() || null;
}

export function hasSubjectProgramContract(meta?: SubjectList): boolean {
  return (meta?.subs ?? []).some((subject) => subjectProgramKey(subject) !== null);
}

/**
 * 구형 서버(관계 필드 없음)는 기존처럼 모든 과목을 보인다. 관계 필드가 하나라도 내려오면 고른 프로그램의
 * 과목만 새 선택지로 허용한다. 이미 저장된 다른/퇴역 과목은 현재 값 한 개만 남겨 수정 중 유실을 막는다.
 */
export function subjectOptions(
  meta: SubjectList | undefined,
  kindKey: string | null | undefined,
  currentKey?: string | null,
): SubjectOption[] {
  const subjects = meta?.subs ?? [];
  const relationReady = hasSubjectProgramContract(meta);
  const visible = !relationReady || !kindKey
    ? subjects
    : subjects.filter((subject) => subjectProgramKey(subject) === kindKey);
  const options = visible.map((subject) => ({ key: subject.key, name: subject.name, legacy: false }));

  if (!currentKey || options.some((subject) => subject.key === currentKey)) return options;
  const current = subjects.find((subject) => subject.key === currentKey);
  return [
    { key: currentKey, name: current?.name ?? currentKey, legacy: relationReady && !!kindKey },
    ...options,
  ];
}

/** 프로그램 변경 때 현재 과목을 유지해도 되는가. 구형 서버에서는 기존 동작을 그대로 허용한다. */
export function subjectAvailableForProgram(
  meta: SubjectList | undefined,
  kindKey: string | null | undefined,
  subjectKey: string | null | undefined,
): boolean {
  if (!subjectKey || !kindKey || !hasSubjectProgramContract(meta)) return true;
  const subject = (meta?.subs ?? []).find((item) => item.key === subjectKey);
  return !!subject && subjectProgramKey(subject) === kindKey;
}
