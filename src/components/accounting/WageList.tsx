/** @file-guide
 * 목적: WageList.tsx — WageList (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 「정리 · 기준 › 시급」 (W11 · N-37 ① — 원문 정리 · 기준 「단가표 · 시급」).
 *
 * **새 계약이 없다 — 있는 것을 한 자리에 모은다.** 사람마다의 지금 시급은 서랍 구성원 줄과 같은 값
 * (`GET /drawer` 의 `members[].wageRate · wageFrom` — 오늘 붙는 시급)이고, 「시급 수정」은 §17 의 그 창
 * (`WageChangeButton` — 이력 · 새 줄 · 소급 없음 · 같은 날 한 줄은 서버 409)이다.
 * 누구에게 줄이 서는지는 서버의 `wageable`(활성 강사 · 시급 권한), 볼 수 있는지는 `canWage` 가 정한다 (D-R39).
 * 시급 비공개(N-94 · W11 M2)가 켜져 있고 비공개 열람이 없으면 서버가 남의 시급을 null 로 준다 — 적용일(`wageFrom`)은 그대로라
 * 「줄은 있는데 값이 없다」로 읽어 숨긴 금액 낱말(「비공개」 · `lib/money`)을 적는다(줄이 없으면 둘 다 null · 「—」).
 */
'use client';
import { apiMessage } from '@/api/client';
import { useDrawer } from '@/api/queries';
import type { Member } from '@/api/types';
import { Banner, Panel, Table, type Column } from '@/components/ui';
import { WageChangeButton } from '@/components/drawer/WageChangeDialog';
import { MASKED, won } from '@/lib/money';

export function WageList() {
  const drawer = useDrawer();
  const d = drawer.data;
  const rows = (d?.members ?? []).filter((m) => m.wageable);

  const cols: Array<Column<Member>> = [
    { key: 'n', head: '강사', cell: (m) => <span className="font-bold">{m.name}</span> },
    // 줄이 없는 강사는 「시급 없음」이라 적지 않는다 — 「—」와 단추만 서고 첫 줄은 창에서 적는다(서랍과 같은 규칙)
    {
      key: 'r', head: '지금 시급', width: 140, align: 'right',
      cell: (m) => (m.wageRate != null ? <b>{won(m.wageRate)}</b> : <span className="text-fg-subtle">{m.wageFrom ? MASKED : '—'}</span>),
    },
    { key: 'f', head: '언제부터', width: 120, cell: (m) => m.wageFrom ?? <span className="text-fg-subtle">—</span> },
    { key: 'a', head: '', width: 110, align: 'right', cell: (m) => <WageChangeButton member={m} /> },
  ];

  return (
    <Panel title="강사 시급" sub="오늘 붙는 시급입니다 — 바꾸면 그 날짜의 수업부터 새 시급이고, 지난 정산은 그때 시급 그대로입니다">
      {drawer.isError ? (
        <Banner tone="danger">{apiMessage(drawer.error)}</Banner>
      ) : d && !d.canWage ? (
        <Banner tone="neutral">시급을 볼 수 있는 권한이 없습니다.</Banner>
      ) : (
        <Table columns={cols} rows={rows} rowKey={(m) => m.id} empty={drawer.isLoading ? '불러오는 중…' : '시급 줄을 둘 강사가 없습니다'} />
      )}
    </Panel>
  );
}
