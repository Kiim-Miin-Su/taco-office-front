/** @file-guide
 * 목적: PermissionMatrix.tsx — PermissionMatrix (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/** §76 기능 / 무엇인가 / 누가 / 지금. 역할 추정 대신 서버의 최종 권한만 읽는다. */
import type { Me, PermName } from '@/api/types';
import { Chip, Table, type Column } from '../ui';

type PermissionRow = { feature: string; description: string; who: string; permission: PermName };

const ROWS: PermissionRow[] = [
  { feature: '회계 탭 전체', description: '매출 · 수납 · 지출 · 정산 화면', who: '회계 권한', permission: 'canMoney' },
  { feature: '입금 처리', description: '받은 돈으로 확정하기', who: '매니저 이상', permission: 'canCrudAll' },
  { feature: '사용 내역 승인 · 반려', description: '직원이 올린 지출 결재', who: '결재 권한', permission: 'canApprove' },
  { feature: '청구서 삭제 · 수정', description: '발행 뒤에도 고칠 수 있음', who: '매니저 이상', permission: 'canCrudAll' },
  { feature: '강사 시급 공개 지정', description: '다른 담당자에게 열어줄지 결정', who: '시급 권한', permission: 'canWage' },
  { feature: '컨설팅비 보기', description: '고액 계약 금액', who: '회계 권한', permission: 'canMoney' },
  { feature: '내역 비공개 지정', description: '특정 항목을 나만 보게', who: '비공개 권한', permission: 'canHide' },
  { feature: '보고 승인 · 반려', description: '일일 · 주간 · 월간 보고 결재', who: '결재 권한', permission: 'canApprove' },
  { feature: '기획 결재', description: '기한 승인 → 최종 승인', who: '결재 권한', permission: 'canApprove' },
  { feature: '마케팅 코멘트', description: '대표 피드백 남기기', who: '매니저 이상', permission: 'canCrudAll' },
  { feature: '비공개 컨설팅 열람', description: '지정 · 전체 비공개 건까지', who: '비공개 권한', permission: 'canHide' },
  { feature: '보정 승인', description: '금액 조정 결재', who: '결재 권한', permission: 'canApprove' },
  { feature: '자료 요청 접수', description: '시험 대비 · 자습 자료', who: '자료 요청 권한', permission: 'canGpaPack' },
  { feature: '강사 시수 기준', description: '정산 기준 시수 확인', who: '시급 권한', permission: 'canWage' },
];

export function PermissionMatrix({ me }: { me: Me | null }) {
  const allowed = (row: PermissionRow) => Boolean(me?.canAdminPage && me[row.permission]);
  const possible = ROWS.filter(allowed).length;
  const columns: Column<PermissionRow>[] = [
    { key: 'feature', head: '기능', cell: (row) => <span className="font-bold">{row.feature}</span> },
    // 원문 §76 은 기능만 왼쪽이고 나머지 셋은 가운데다 · 「누가」 칩은 색을 채운다(g2 76-2 — 칩 낱말은 권한 깃발 이름 · 의도적 차이)
    { key: 'description', head: '무엇인가', align: 'center', cell: (row) => row.description },
    { key: 'who', head: '누가', align: 'center', cell: (row) => <Chip styleKind="solid">{row.who}</Chip> },
    { key: 'now', head: '지금', align: 'center', cell: (row) => (
      <span className={allowed(row) ? 'font-bold text-green' : 'text-fg-subtle'}>
        {allowed(row) ? '✓ 가능' : '잠김'}
      </span>
    ) },
  ];
  /*
   * 원문 §76 부제는 「지금 대표 화면입니다 · 대표 전용 12가지 · …까지 2가지」다(g2 76-4 · D-R44).
   * 앞말(누구의 화면인가)은 서버 낱말 `roleLabel` 로 그대로 따르고, 등급별 수는 지금 권한 모형
   * (대표 결정 2026-09-21 「매니저에게도 모든 권한」 + 사람별 예외)과 맞지 않아 **이 계정의 가능/잠김 수**를 잇는다.
   * 수 부분의 「N가지 가능 / M가지 잠김」 모양은 예전 그대로 둔다 — 권한 QA 스크립트(qa-l-perm)가 그 글을 읽는다.
   */
  const who = me ? `지금 ${me.roleLabel} 화면입니다` : '로그인 정보가 없습니다';
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-fg-subtle">{who} · {possible}가지 가능 / {ROWS.length - possible}가지 잠김</p>
      <Table columns={columns} rows={ROWS} rowKey={(row) => row.feature} />
      <p className="text-[11px] text-fg-subtle">
        현재 계정의 권한입니다. 개인별 권한과 컨설팅 공개 범위에 따라 실제 접근 범위가 달라질 수 있습니다.
        강사는 자기 수업 출결을 조회만 할 수 있습니다.
      </p>
    </div>
  );
}
