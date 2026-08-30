/**
 * 역할 4종의 **이름**. 판정이 아니라 표시용이다 (D-R39).
 *
 * 권한 판정은 서버가 내려준 `canAdminPage` / `canCrudAll` / `canSeeProfit` 를 읽어서 한다 —
 * 화면에서 `role === 'ceo'` 를 적으면 판정이 두 벌이 되고, eslint 가 그것을 막는다.
 * 여기 있는 것은 「강사」라고 **써 주는** 일뿐이므로 비교가 아니라 표에서 꺼낸다.
 */
export const ROLES = [
  { key: 'teacher', label: '강사', desc: '수업과 자기 리포트만' },
  { key: 'manager', label: '매니저', desc: '관리 화면 전부 · 돈 숫자만 잠김' },
  { key: 'admin', label: '관리자', desc: '매니저와 같음 · 계정 관리 추가' },
  { key: 'ceo', label: '대표', desc: '전부 · 손익과 단가까지' },
] as const;

export type RoleKey = (typeof ROLES)[number]['key'];

export const ROLE_LABEL: Record<string, string> =
  Object.fromEntries(ROLES.map((r) => [r.key, r.label]));

/** 강사만 회색, 나머지는 파랑 — 「관리 화면에 들어오는 사람」이 한눈에 갈린다 */
export const ROLE_TONE: Record<string, 'neutral' | 'info'> = {
  teacher: 'neutral', manager: 'info', admin: 'info', ceo: 'info',
};

/**
 * 요청 종류의 이름 — 서버 `lib/approval.ts` 의 `REQ_TYPE_LABEL` 과 **같은 표**다.
 * 승인 줄의 제목은 서버가 이 이름으로 만들고, §20 이력 표는 여기서 꺼내 쓴다.
 * 표에 없는 값은 감추지 않고 그대로 보여 준다 — 새 종류가 생긴 것을 알아야 한다.
 */
export const REQ_TYPE_LABEL: Record<string, string> = {
  wage_change: '시급 변경', unav_add: '불가 시간 추가', doc: '서류',
  time: '시간 변경', time_move: '시간 이동', teacher: '강사 변경',
  room: '강의실 변경', off: '휴강', cancel: '취소',
};
