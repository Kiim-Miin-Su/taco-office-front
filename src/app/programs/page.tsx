/** @file-guide
 * 목적: page.tsx — ProgramsPage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 프로그램 · 과목 관리 — **§18 서랍의 「프로그램 · 과목 전체 열기」가 가는 자리**.
 *
 * 이 화면은 원본 61컷에 없다. 서랍에 단추만 있고 목적지가 없었다 —
 * 대표 결정(2026-09-12)으로 신설했다.
 *
 * **지우기를 두지 않는다.** 시간표가 이 낱말로 저장돼 있어서, 지우면 지난 학기 기록이 이름을 잃는다.
 * 과목은 끄고, 프로그램은 원문에 끄는 자리조차 없어 고치기만 둔다 — 없는 동작을 지어내지 않는다.
 */
'use client';
import { useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import {
  Banner, Button, Checkbox, Chip, Input, Label, PageHeader, Panel, Segmented, Select, Table, type Column,
} from '@/components/ui';
import { apiMessage } from '@/api/client';
import { useCatalog, useCreateKind, useCreateSub, usePatchKind, usePatchSub } from '@/api/queries';
import type { CatalogKind, CatalogSub, KindCreate } from '@/api/types';

/* 낱말은 생성 타입에서 그대로 가져온다 — 화면에 코드표를 다시 적으면 서버와 갈린다 (D-R18) */
type Grp = KindCreate['grp'];
type RepForm = NonNullable<KindCreate['repForm']>;

const GRP: Array<{ value: Grp; label: string }> = [
  { value: 'lesson', label: '수업' },
  { value: 'intake', label: '상담·진단' },
  { value: 'meeting', label: '회의' },
];
const FORM: Array<{ value: '' | RepForm; label: string }> = [
  { value: '', label: '없음' },
  { value: 'dev', label: '성장(dev)' },
  { value: 'assess', label: '평가(assess)' },
];
const asGrp = (v: string): Grp => (GRP.some((g) => g.value === v) ? (v as Grp) : 'lesson');
const asForm = (v: string): RepForm | null => (v === 'dev' || v === 'assess' ? v : null);

/*
 * 새로 만드는 프로그램·과목의 **시작 색**이다. D-R41 은 화면에 색을 적지 말라고 하는데,
 * 이건 디자인 토큰이 아니라 **사용자가 곧바로 바꾸는 데이터의 초깃값**이다 —
 * 토큰으로 만들면 어디에도 안 쓰이는 토큰이 하나 늘고, 색 고르개는 빈 값을 못 받는다.
 */
// eslint-disable-next-line no-restricted-syntax -- 데이터 초깃값이지 디자인 토큰이 아니다
const START_COLOR = '#7C6A58';

const NEW_KIND = { key: '', name: '', color: START_COLOR, cap: 4, grp: 'lesson' as Grp, rep: false, repForm: '' as '' | RepForm, extra: false };
const NEW_SUB = { key: '', name: '', color: START_COLOR };

function Swatch({ color }: { color: string }) {
  return <span className="inline-block h-3 w-3 rounded-sm align-middle" style={{ backgroundColor: color }} />;
}

export default function ProgramsPage() {
  const q = useCatalog();
  const createKind = useCreateKind();
  const patchKind = usePatchKind();
  const createSub = useCreateSub();
  const patchSub = usePatchSub();
  const [tab, setTab] = useState<'kinds' | 'subs'>('kinds');
  const [kindForm, setKindForm] = useState({ ...NEW_KIND });
  const [subForm, setSubForm] = useState({ ...NEW_SUB });
  const [editKind, setEditKind] = useState<CatalogKind | null>(null);

  const kindCols: Array<Column<CatalogKind>> = [
    { key: 'c', head: '', width: 34, cell: (r) => <Swatch color={r.color} /> },
    { key: 'n', head: '이름', width: 150, cell: (r) => <span className="font-bold">{r.name}</span> },
    { key: 'k', head: '코드', width: 120, cell: (r) => <span className="text-fg-subtle">{r.key}</span> },
    { key: 'g', head: '묶음', width: 100, cell: (r) => r.grpLabel },
    { key: 'p', head: '정원', width: 70, align: 'right', cell: (r) => `${r.cap}명` },
    {
      key: 'r', head: '리포트', width: 110,
      cell: (r) => (r.rep
        ? <Chip size="compact" tone="info">{r.repForm === 'assess' ? '평가' : '성장'}</Chip>
        : <span className="text-fg-subtle">—</span>),
    },
    // 추가 수업(C94-d · C-38) — 시간표 「추가」 배지 · §54 「추가 수업」 칸 · 청구서 제 줄. 낱말은 서버의 extra 다
    { key: 'e', head: '추가', width: 70, cell: (r) => (r.extra ? <Chip size="compact" tone="info">추가</Chip> : <span className="text-fg-subtle">—</span>) },
    { key: 'u', head: '쓰는 수업', width: 100, align: 'right', cell: (r) => `${r.serCount}개` },
    {
      key: 'x', head: '', width: 80,
      cell: (r) => <Button size="sm" variant="secondary" onClick={() => setEditKind(r)}>고치기</Button>,
    },
  ];

  const subCols: Array<Column<CatalogSub>> = [
    { key: 'c', head: '', width: 34, cell: (r) => <Swatch color={r.color} /> },
    { key: 'n', head: '이름', width: 180, cell: (r) => <span className="font-bold">{r.name}</span> },
    { key: 'k', head: '코드', width: 150, cell: (r) => <span className="text-fg-subtle">{r.key}</span> },
    { key: 'u', head: '쓰는 수업', width: 100, align: 'right', cell: (r) => `${r.serCount}개` },
    {
      key: 'a', head: '상태', width: 90,
      cell: (r) => <Chip tone={r.active ? 'success' : 'neutral'}>{r.active ? '켜짐' : '꺼짐'}</Chip>,
    },
    {
      key: 'x', head: '', width: 90,
      cell: (r) => (
        <Button
          size="sm"
          variant={r.active ? 'secondary' : 'primary'}
          disabled={patchSub.isPending}
          onClick={() => patchSub.mutate({ key: r.key, active: !r.active })}
        >
          {r.active ? '끄기' : '켜기'}
        </Button>
      ),
    },
  ];

  return (
    <RequireAuth>
      <AppShell>
        <PageHeader
          title="프로그램 · 과목 관리"
          sub="서랍의 「프로그램 · 과목」은 목록만 보여 줍니다. 만들고 고치는 일은 여기서 합니다. 코드는 시간표가 쓰고 있어 바꾸지 않습니다."
        />

        <Segmented
          className="mb-3"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'kinds', label: `프로그램 ${q.data?.kinds.length ?? 0}` },
            { value: 'subs', label: `과목 ${q.data?.subs.length ?? 0}` },
          ]}
        />

        {tab === 'kinds' ? (
          <>
            <Panel className="mb-4" title="프로그램 추가" sub="리포트 대상이면 서식을 함께 고릅니다">
              <div className="grid grid-cols-6 gap-3">
                <div><Label htmlFor="k-key">코드</Label><Input id="k-key" value={kindForm.key} onChange={(e) => setKindForm({ ...kindForm, key: e.target.value })} placeholder="class" /></div>
                <div><Label htmlFor="k-name">이름</Label><Input id="k-name" value={kindForm.name} onChange={(e) => setKindForm({ ...kindForm, name: e.target.value })} placeholder="정규 수업" /></div>
                <div><Label htmlFor="k-color">색</Label><Input id="k-color" type="color" value={kindForm.color} onChange={(e) => setKindForm({ ...kindForm, color: e.target.value })} /></div>
                <div><Label htmlFor="k-cap">정원</Label><Input id="k-cap" type="number" min={1} value={kindForm.cap} onChange={(e) => setKindForm({ ...kindForm, cap: Number(e.target.value) })} /></div>
                <div>
                  <Label htmlFor="k-grp">묶음</Label>
                  <Select id="k-grp" value={kindForm.grp} onChange={(e) => setKindForm({ ...kindForm, grp: asGrp(e.target.value) })}>
                    {GRP.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="k-form">리포트 서식</Label>
                  <Select id="k-form" value={kindForm.repForm} onChange={(e) => setKindForm({ ...kindForm, repForm: asForm(e.target.value) ?? '', rep: e.target.value !== '' })}>
                    {FORM.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </Select>
                </div>
              </div>
              {/* 추가 수업 (C-38) — 정규 밖의 수업이라 청구서에 제 줄로 서고 §54·시간표가 따로 센다. 단가는 회계 「단가표」에서 둔다 */}
              <div className="mt-2">
                <Checkbox label="추가 수업 — 정규 밖의 수업이라 청구서에 따로 잡힙니다 (단가는 회계 「단가표」에서)" checked={kindForm.extra} onChange={(e) => setKindForm({ ...kindForm, extra: e.target.checked })} />
              </div>
              {createKind.isError ? <Banner tone="danger" className="mt-3">{apiMessage(createKind.error)}</Banner> : null}
              <div className="mt-3 flex justify-end">
                <Button
                  disabled={createKind.isPending || kindForm.key.trim() === '' || kindForm.name.trim() === ''}
                  onClick={() => createKind.mutate({
                    key: kindForm.key.trim(), name: kindForm.name.trim(), color: kindForm.color,
                    cap: kindForm.cap, grp: kindForm.grp,
                    rep: kindForm.repForm !== '', repForm: asForm(kindForm.repForm) ?? undefined,
                    extra: kindForm.extra,
                  }, { onSuccess: () => setKindForm({ ...NEW_KIND }) })}
                >
                  만들기
                </Button>
              </div>
            </Panel>

            {editKind ? (
              <Panel className="mb-4" title={`「${editKind.name}」 고치기`} sub={`코드 ${editKind.key} 는 바꾸지 않습니다 — 수업 ${editKind.serCount}개가 이 낱말로 저장돼 있습니다`}>
                <div className="grid grid-cols-5 gap-3">
                  <div><Label htmlFor="e-name">이름</Label><Input id="e-name" value={editKind.name} onChange={(e) => setEditKind({ ...editKind, name: e.target.value })} /></div>
                  <div><Label htmlFor="e-color">색</Label><Input id="e-color" type="color" value={editKind.color} onChange={(e) => setEditKind({ ...editKind, color: e.target.value })} /></div>
                  <div><Label htmlFor="e-cap">정원</Label><Input id="e-cap" type="number" min={1} value={editKind.cap} onChange={(e) => setEditKind({ ...editKind, cap: Number(e.target.value) })} /></div>
                  <div>
                    <Label htmlFor="e-grp">묶음</Label>
                    <Select id="e-grp" value={editKind.grp} onChange={(e) => setEditKind({ ...editKind, grp: asGrp(e.target.value) })}>
                      {GRP.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="e-form">리포트 서식</Label>
                    <Select id="e-form" value={editKind.repForm ?? ''} onChange={(e) => setEditKind({ ...editKind, repForm: asForm(e.target.value), rep: e.target.value !== '' })}>
                      {FORM.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </Select>
                  </div>
                </div>
                <div className="mt-2">
                  <Checkbox label="추가 수업 — 정규 밖의 수업이라 청구서에 따로 잡힙니다" checked={editKind.extra} onChange={(e) => setEditKind({ ...editKind, extra: e.target.checked })} />
                </div>
                {patchKind.isError ? <Banner tone="danger" className="mt-3">{apiMessage(patchKind.error)}</Banner> : null}
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setEditKind(null)}>취소</Button>
                  <Button
                    disabled={patchKind.isPending}
                    onClick={() => patchKind.mutate({
                      key: editKind.key, name: editKind.name, color: editKind.color, cap: editKind.cap,
                      grp: asGrp(editKind.grp), rep: editKind.rep, repForm: asForm(editKind.repForm ?? ''),
                      extra: editKind.extra,
                    }, { onSuccess: () => setEditKind(null) })}
                  >
                    저장
                  </Button>
                </div>
              </Panel>
            ) : null}

            <Panel title={`프로그램 ${q.data?.kinds.length ?? 0}종`} sub="리포트 표시가 붙은 프로그램만 리포트 작성·차감 대상입니다 (§18 원문)">
              <Table columns={kindCols} rows={q.data?.kinds ?? []} rowKey={(r) => r.key} empty="프로그램이 없습니다" />
            </Panel>
          </>
        ) : (
          <>
            <Panel className="mb-4" title="과목 추가">
              <div className="grid grid-cols-3 gap-3">
                <div><Label htmlFor="s-key">코드</Label><Input id="s-key" value={subForm.key} onChange={(e) => setSubForm({ ...subForm, key: e.target.value })} placeholder="ap-chem" /></div>
                <div><Label htmlFor="s-name">이름</Label><Input id="s-name" value={subForm.name} onChange={(e) => setSubForm({ ...subForm, name: e.target.value })} placeholder="AP Chemistry" /></div>
                <div><Label htmlFor="s-color">색</Label><Input id="s-color" type="color" value={subForm.color} onChange={(e) => setSubForm({ ...subForm, color: e.target.value })} /></div>
              </div>
              {createSub.isError ? <Banner tone="danger" className="mt-3">{apiMessage(createSub.error)}</Banner> : null}
              <div className="mt-3 flex justify-end">
                <Button
                  disabled={createSub.isPending || subForm.key.trim() === '' || subForm.name.trim() === ''}
                  onClick={() => createSub.mutate({ key: subForm.key.trim(), name: subForm.name.trim(), color: subForm.color },
                    { onSuccess: () => setSubForm({ ...NEW_SUB }) })}
                >
                  만들기
                </Button>
              </div>
            </Panel>

            <Panel title={`과목 ${q.data?.subs.length ?? 0}종`} sub="끄면 새 수업에서 고를 수 없습니다. 이미 도는 수업은 그대로 둡니다">
              <Table columns={subCols} rows={q.data?.subs ?? []} rowKey={(r) => r.key} empty="과목이 없습니다" />
            </Panel>
          </>
        )}
      </AppShell>
    </RequireAuth>
  );
}
