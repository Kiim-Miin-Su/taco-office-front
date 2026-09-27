/** @file-guide
 * 목적: PermissionMatrix.tsx — PermissionMatrix (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §76 기능 / 무엇인가 / 누가 / 지금 + 역할 설명 상자.
 *
 * **줄 · 「지금」 · 수 · 문장은 전부 서버가 만든다** (`GET /permissions` · N-98 채택 · W11). 전에는 열네 줄과
 * 「N가지 가능」을 이 파일이 들고 세었다 — 서버 권한 모형(`permsOf` · 사람별 예외 N-68)과 따로 놀 수 있었다.
 * 창 머리 부제(「지금 ○○ 화면입니다 · N가지 가능 / M가지 잠김」)는 창을 여는 쪽이 `sub` 로 적는다(원문 §76 창 머리 · W11 7-3).
 */
import { apiMessage } from '@/api/client';
import type { PermissionRow, PermissionTable } from '@/api/types';
import { Banner, Chip, Table, type Column } from '../ui';

export function PermissionMatrix({ table, loading = false, error = null }: {
  /** 서버의 §76 표 한 벌 */
  table: PermissionTable | undefined;
  loading?: boolean;
  /** 읽지 못했으면 그 오류 — 서버 문장을 그대로 띄운다 */
  error?: unknown;
}) {
  if (error) return <Banner tone="danger">{apiMessage(error)}</Banner>;
  if (!table) {
    return <p className="py-6 text-center text-[12px] text-fg-subtle">{loading ? '읽는 중…' : '권한 표를 읽지 못했습니다'}</p>;
  }
  const columns: Column<PermissionRow>[] = [
    { key: 'feature', head: '기능', cell: (row) => <span className="font-bold">{row.feature}</span> },
    // 원문 §76 은 기능만 왼쪽이고 나머지 셋은 가운데다 · 「누가」 칩은 색을 채운다(g2 76-2 — 칩 낱말은 권한 깃발 이름 · 의도적 차이)
    { key: 'what', head: '무엇인가', align: 'center', cell: (row) => row.what },
    { key: 'who', head: '누가', align: 'center', cell: (row) => <Chip styleKind="solid">{row.who}</Chip> },
    { key: 'now', head: '지금', align: 'center', cell: (row) => (
      <span className={row.allowed ? 'font-bold text-green' : 'text-fg-subtle'}>
        {row.allowed ? '✓ 가능' : '잠김'}
      </span>
    ) },
  ];
  return (
    <div className="flex flex-col gap-3">
      <Table columns={columns} rows={table.rows} rowKey={(row) => row.key} />
      {/*
        원문 §76 초록 상자 — 첫 줄 「역할은 상단 오른쪽에서 바꿉니다」는 프로토타입의 역할 전환 이야기라 옮기지 않는다(N-98).
        역할 줄은 옛 직함 낱말 대신 서버가 지금의 권한 모형에서 센 「역할 이름 · N가지 가능 / M가지 잠김」이다.
      */}
      <Banner tone="success" items={table.roleNotes} />
    </div>
  );
}
