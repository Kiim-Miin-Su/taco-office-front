/**
 * Overlay/Permission — §76 권한.
 *
 * 역할은 넷뿐이고 판정은 **세 줄**에서 나온다 (D-R39).
 * 이 표는 서버가 내려준 플래그를 **보여 주기만** 한다 — 화면이 role 을 비교하지 않는다.
 */
import { Chip, Panel, Table, type Column } from '../ui';
import { ROLES } from '@/lib/roles';
import { cn } from '../ui/cn';

// 역할 이름표는 lib/roles.ts 한 곳에서만 온다 — 서랍 §17 도 같은 것을 읽는다
export { ROLES } from '@/lib/roles';

/** 세 줄에서 파생되는 결과를 표로 편 것. 값을 여기서 다시 정하지 않는다. */
const MATRIX: Array<{ what: string; rule?: string; by: [string, string, string, string] }> = [
  { what: '관리 화면 들어가기', rule: 'canAdminPage', by: ['잠김', '됨', '됨', '됨'] },
  { what: '모든 학생 · 수업 만들고 고치기', rule: 'canCrudAll', by: ['잠김', '됨', '됨', '됨'] },
  { what: '자기 수업 · 자기 리포트', by: ['됨', '됨', '됨', '됨'] },
  { what: '출결 확인 (D-R35)', by: ['오늘 것 최초 1회만', '됨', '됨', '됨'] },
  { what: '승인 대기함 · 결재', rule: 'canApprove', by: ['잠김', '됨', '됨', '됨'] },
  { what: '금액 · 단가 · 손익 보기', rule: 'canSeeProfit', by: ['잠김', '잠김', '잠김', '됨'] },
  { what: '강사료 정산 확정', by: ['자기 것 보기만', '됨', '됨', '됨'] },
  { what: '계정 만들고 역할 바꾸기', by: ['잠김', '잠김', '됨', '됨'] },
];

const cell = (v: string) =>
  v === '됨' ? <span className="font-bold text-green">됩니다</span>
    : v === '잠김' ? <span className="font-bold text-red">잠깁니다</span>
      : <span className="font-bold text-amber">{v}</span>;

export function PermissionMatrix({ myRole }: { myRole?: string }) {
  type Row = (typeof MATRIX)[number];
  const columns: Array<Column<Row>> = [
    {
      key: 'what', head: '무엇을',
      cell: (m) => (
        <>
          <span className="font-bold text-fg">{m.what}</span>
          {m.rule ? <span className="ml-2 text-[10px] text-fg-subtle">{m.rule}</span> : null}
        </>
      ),
    },
    ...ROLES.map((r, i) => ({
      key: r.key,
      // 내 역할의 열만 파랗게 — 표에서 내 줄을 먼저 찾게
      head: <span className={cn(r.key === myRole && 'text-blue')}>{r.key}</span>,
      cell: (m: Row) => cell(m.by[i]),
    })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-fg p-4">
        <div className="text-[11px] font-bold text-line-2">판단하는 세 줄</div>
        <div className="mt-2 grid grid-cols-3 gap-3">
          {[
            ['canAdminPage', "role !== 'teacher'"],
            ['canCrudAll', "role !== 'teacher'"],
            ['canSeeProfit', "role === 'ceo'"],
          ].map(([a, b]) => (
            <div key={a}>
              <div className="text-[12.5px] font-bold text-white">{a}</div>
              <div className="mt-0.5 text-[11px] text-line-2">{b}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {ROLES.map((r) => (
          <div key={r.key} className={cn('rounded-xl border bg-card p-3', r.key === myRole ? 'border-blue' : 'border-line')}>
            <Chip tone={r.key === myRole ? 'info' : 'neutral'}>{r.key}</Chip>
            <div className="mt-1.5 text-[13px] font-bold text-fg">{r.label}</div>
            <div className="mt-0.5 text-[10.5px] text-fg-subtle">{r.desc}</div>
          </div>
        ))}
      </div>

      {/* 표는 ui/Table 하나만 쓴다 — 손으로 그렸다가 줄 높이와 테두리가 여기만 달라져 있었다 */}
      <Table
        columns={columns}
        rows={MATRIX}
        rowKey={(m) => m.what}
      />

      <Panel title="직함은 권한이 아닙니다" sub="교수실장 · 상담실장 · 코디네이터는 STAFF.title 에 들어가는 이름표일 뿐입니다.">
        <div className="flex gap-2">
          {['교수실장', '상담실장', '코디네이터'].map((t) => (
            <Chip key={t}>{t} = manager</Chip>
          ))}
        </div>
      </Panel>
    </div>
  );
}
