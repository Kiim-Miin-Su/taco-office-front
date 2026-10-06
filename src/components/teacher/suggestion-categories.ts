/** @file-guide
 * 목적: 강사 건의 분류의 라벨과 설명을 전체 화면·회차 건의 초안에서 공유한다.
 * 책임/재사용: 분류 표시는 이 파일을 정본으로 쓰고 API 쿼터·저장 판정은 서버 owner에 둔다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

export const TEACHER_SUGGESTION_CATEGORIES = [
  { key: 'lesson', label: '수업 관련', sub: '교재 · 진행 · 학생' },
  { key: 'pay', label: '시급 관련', sub: '정산 · 보강' },
  { key: 'schedule', label: '스케줄 관련', sub: '시간 · 요일 · 이동' },
  { key: 'etc', label: '기타', sub: '그 밖의 이야기' },
] as const;

export type TeacherSuggestionCategory = (typeof TEACHER_SUGGESTION_CATEGORIES)[number]['key'];
