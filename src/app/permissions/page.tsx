/**
 * §76 권한 — 지금 역할에서 무엇이 되고 무엇이 잠기는지.
 *
 * 화면이 role 을 비교하지 않는다. 서버가 /auth/me 로 내려준 플래그를 **읽기만** 한다 (D-R39).
 * eslint 가 `me.role === …` 을 막는다.
 */
'use client';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { PermissionMatrix } from '@/components/data/PermissionMatrix';
import { Banner, Chip, PageHeader, Panel } from '@/components/ui';
import { useSession } from '@/store/useSession';

/** 서버가 내려준 플래그 그대로. 이름을 화면에서 새로 짓지 않는다. */
const FLAGS: Array<{ key: 'canAdminPage' | 'canCrudAll' | 'canSeeProfit' | 'canCrudAttendance'; label: string }> = [
  { key: 'canAdminPage', label: '관리 화면 진입' },
  { key: 'canCrudAll', label: '전 항목 CRUD' },
  { key: 'canSeeProfit', label: '금액 · 손익 보기' },
  { key: 'canCrudAttendance', label: '출결 CRUD' },
];

export default function PermissionsPage() {
  const me = useSession((s) => s.me);

  return (
    <RequireAuth><AppShell>
      <PageHeader
        title="권한"
        sub="역할은 4종뿐이고, 판단은 세 줄에서 나옵니다. 직함은 권한이 아닙니다."
      />

      <Panel className="mb-4" title="지금 내 권한" sub="서버가 내려준 값입니다 — 화면이 다시 계산하지 않습니다.">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] font-bold text-fg">{me?.name}</span>
          <Chip tone="info">{me?.role}</Chip>
          {me?.title ? <Chip>{me.title}</Chip> : null}
          <span className="mx-2 h-4 w-px bg-line" />
          {FLAGS.map((f) => (
            <Chip key={f.key} tone={me && me[f.key] ? 'success' : 'danger'}>
              {f.label} {me && me[f.key] ? '됨' : '잠김'}
            </Chip>
          ))}
        </div>
      </Panel>

      <PermissionMatrix myRole={me?.role} />

      <Banner tone="info" className="mt-4">
        화면은 역할을 직접 비교하지 않습니다. 서버가 <b>canAdminPage · canCrudAll · canSeeProfit</b> 를
        내려주고 화면은 그것만 읽습니다 — 판정이 두 벌이 되면 한쪽만 고쳐지는 날이 옵니다.
      </Banner>
    </AppShell></RequireAuth>
  );
}
