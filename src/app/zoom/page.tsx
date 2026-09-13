/** @file-guide
 * 목적: page.tsx — ZoomAccountsPage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 줌 계정 관리 — **§21 서랍의 「줌 계정 관리」가 가는 자리**.
 *
 * 이 화면은 원본 61컷에 없다. 서랍에 단추만 있고 목적지가 없었다 —
 * 대표 결정(2026-09-12)으로 신설했다. 서랍은 그대로 「칸이 비었는지」만 보여 주고,
 * 고치는 일은 전부 여기서 한다.
 *
 * 격자·「지금 가능」·「만석 시간대」는 **서버가 한 배열에서 센 값**을 그대로 그린다.
 * 화면이 다시 세면 서랍과 이 화면의 숫자가 갈린다.
 */
'use client';
import { useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Button, Chip, Input, Label, PageHeader, Panel, StatCard, Table, type Column } from '@/components/ui';
import { apiMessage } from '@/api/client';
import { useCreateZoomAccount, usePatchZoomAccount, useZoom } from '@/api/queries';
import { ZoomGrid } from '@/components/zoom/ZoomGrid';
import type { ZoomAcct } from '@/api/types';

const EMPTY = { label: '', loginEmail: '', joinUrl: '', meetingId: '', loginSecret: '', meetingPw: '' };

export default function ZoomAccountsPage() {
  const [onDate, setOnDate] = useState<string | undefined>(undefined);
  const q = useZoom(onDate);
  const create = useCreateZoomAccount();
  const patch = usePatchZoomAccount();
  const [form, setForm] = useState({ ...EMPTY });
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  /** 참가 링크는 **펼쳐야** 보인다 — 표에 늘 떠 있으면 화면 공유 중에 그대로 찍힌다 */
  const [shownUrl, setShownUrl] = useState<number | null>(null);
  const [draft, setDraft] = useState({ ...EMPTY });

  const board = q.data;
  const canSave = form.label.trim() !== '' && form.loginEmail.trim() !== '' && form.joinUrl.trim() !== '';

  const cols: Array<Column<ZoomAcct>> = [
    { key: 'l', head: '이름', width: 130, cell: (r) => <span className="font-bold">{r.label}</span> },
    { key: 'e', head: '로그인 계정', width: 200, cell: (r) => r.loginEmail },
    { key: 'm', head: '회의 ID', width: 140, cell: (r) => r.meetingId ?? '—' },
    {
      key: 's', head: '비밀', width: 90,
      // 값은 내려오지 않는다 — **저장돼 있는가**만 말한다 (D-R39 와 같은 이유)
      cell: (r) => <Chip size="compact" tone={r.hasSecret ? 'success' : 'warning'}>{r.hasSecret ? '저장됨' : '없음'}</Chip>,
    },
    { key: 'u', head: '오늘 쓰는 회차', width: 120, align: 'right', cell: (r) => `${r.usedCount}건` },
    {
      // 서랍(§21)이 격자가 되면서 옮겨 온 자리다 — 없앤 것이 아니다.
      // 로그인 정보와 **같은 줄에 두지 않는다**: 값은 펼쳐야 보인다.
      key: 'j', head: '참가 링크', width: 110,
      cell: (r) => (
        <Button size="sm" variant="ghost" onClick={() => setShownUrl(shownUrl === r.id ? null : r.id)}>
          {shownUrl === r.id ? '숨기기' : '보기'}
        </Button>
      ),
    },
    {
      key: 'a', head: '상태', width: 90,
      cell: (r) => <Chip tone={r.active ? 'success' : 'neutral'}>{r.active ? '켜짐' : '꺼짐'}</Chip>,
    },
    {
      key: 'x', head: '', width: 150,
      cell: (r) => (
        <div className="flex gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => { setEditing(r.id); setDraft({ ...EMPTY, label: r.label, loginEmail: r.loginEmail, joinUrl: r.joinUrl, meetingId: r.meetingId ?? '' }); }}>
            고치기
          </Button>
          <Button
            size="sm"
            variant={r.active ? 'secondary' : 'primary'}
            disabled={patch.isPending}
            onClick={() => patch.mutate({ id: r.id, active: !r.active })}
          >
            {r.active ? '끄기' : '켜기'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <RequireAuth>
      <AppShell>
        <PageHeader
          title="줌 계정 관리"
          sub="서랍의 「줌 계정」은 칸이 비었는지만 보여 줍니다. 계정을 만들고 고치는 일은 여기서 합니다."
        />

        <div className="mb-4 grid grid-cols-4 gap-3">
          <StatCard label="계정" value={board ? `${board.accounts.length}개` : '—'} note="꺼진 것 포함" />
          <StatCard
            label="지금 가능"
            value={board && board.nowHour !== null ? `${board.freeNow}개` : '—'}
            tone="success"
            note={board?.nowHour == null ? '오늘만 셉니다' : `${String(board.nowHour).padStart(2, '0')}시에 비어 있는 계정`}
          />
          <StatCard label="만석 시간대" value={board ? `${board.fullHours}` : '—'} tone="danger" note="한 계정도 안 남은 시간" />
          <StatCard label="기준일" value={board?.onDate ?? '—'} note="KST" />
        </div>

        <div className="mb-3 flex items-center gap-2">
          <Label htmlFor="zoom-date">기준일</Label>
          <Input id="zoom-date" type="date" value={onDate ?? board?.onDate ?? ''} onChange={(e) => setOnDate(e.target.value || undefined)} className="w-44" />
          <Button size="sm" variant="secondary" onClick={() => setOnDate(undefined)}>오늘</Button>
          <span className="grow" />
          <Button onClick={() => setOpenForm((v) => !v)}>{openForm ? '닫기' : '+ 계정 추가'}</Button>
        </div>

        {openForm ? (
          <Panel className="mb-4" title="줌 계정 추가" sub="비밀은 암호화해 저장하고 화면으로 다시 내려보내지 않습니다">
            <div className="grid grid-cols-3 gap-3">
              <div><Label htmlFor="z-label">이름</Label><Input id="z-label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Boarding" /></div>
              <div><Label htmlFor="z-email">로그인 계정</Label><Input id="z-email" value={form.loginEmail} onChange={(e) => setForm({ ...form, loginEmail: e.target.value })} placeholder="zoom@tnacademy.kr" /></div>
              <div><Label htmlFor="z-url">참가 링크</Label><Input id="z-url" value={form.joinUrl} onChange={(e) => setForm({ ...form, joinUrl: e.target.value })} placeholder="https://zoom.us/j/..." /></div>
              <div><Label htmlFor="z-mid">회의 ID</Label><Input id="z-mid" value={form.meetingId} onChange={(e) => setForm({ ...form, meetingId: e.target.value })} /></div>
              <div><Label htmlFor="z-secret">로그인 비밀</Label><Input id="z-secret" type="password" value={form.loginSecret} onChange={(e) => setForm({ ...form, loginSecret: e.target.value })} /></div>
              <div><Label htmlFor="z-pw">회의 비밀번호</Label><Input id="z-pw" type="password" value={form.meetingPw} onChange={(e) => setForm({ ...form, meetingPw: e.target.value })} /></div>
            </div>
            {create.isError ? <Banner tone="danger" className="mt-3">{apiMessage(create.error)}</Banner> : null}
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setOpenForm(false); setForm({ ...EMPTY }); }}>취소</Button>
              <Button
                disabled={!canSave || create.isPending}
                onClick={() => create.mutate({
                  label: form.label.trim(), loginEmail: form.loginEmail.trim(), joinUrl: form.joinUrl.trim(),
                  meetingId: form.meetingId.trim() || undefined,
                  loginSecret: form.loginSecret || undefined, meetingPw: form.meetingPw || undefined,
                }, { onSuccess: () => { setOpenForm(false); setForm({ ...EMPTY }); } })}
              >
                만들기
              </Button>
            </div>
          </Panel>
        ) : null}

        {editing !== null ? (
          <Panel className="mb-4" title="계정 고치기" sub="비밀 칸을 비워 두면 지금 저장된 값을 그대로 둡니다">
            <div className="grid grid-cols-3 gap-3">
              <div><Label htmlFor="e-label">이름</Label><Input id="e-label" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></div>
              <div><Label htmlFor="e-email">로그인 계정</Label><Input id="e-email" value={draft.loginEmail} onChange={(e) => setDraft({ ...draft, loginEmail: e.target.value })} /></div>
              <div><Label htmlFor="e-url">참가 링크</Label><Input id="e-url" value={draft.joinUrl} onChange={(e) => setDraft({ ...draft, joinUrl: e.target.value })} /></div>
              <div><Label htmlFor="e-mid">회의 ID</Label><Input id="e-mid" value={draft.meetingId} onChange={(e) => setDraft({ ...draft, meetingId: e.target.value })} /></div>
              <div><Label htmlFor="e-secret">로그인 비밀</Label><Input id="e-secret" type="password" value={draft.loginSecret} onChange={(e) => setDraft({ ...draft, loginSecret: e.target.value })} /></div>
              <div><Label htmlFor="e-pw">회의 비밀번호</Label><Input id="e-pw" type="password" value={draft.meetingPw} onChange={(e) => setDraft({ ...draft, meetingPw: e.target.value })} /></div>
            </div>
            {patch.isError ? <Banner tone="danger" className="mt-3">{apiMessage(patch.error)}</Banner> : null}
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>취소</Button>
              <Button
                disabled={patch.isPending}
                onClick={() => patch.mutate({
                  id: editing,
                  label: draft.label.trim(), loginEmail: draft.loginEmail.trim(), joinUrl: draft.joinUrl.trim(),
                  meetingId: draft.meetingId.trim(),
                  ...(draft.loginSecret ? { loginSecret: draft.loginSecret } : {}),
                  ...(draft.meetingPw ? { meetingPw: draft.meetingPw } : {}),
                }, { onSuccess: () => setEditing(null) })}
              >
                저장
              </Button>
            </div>
          </Panel>
        ) : null}

        <Panel className="mb-4" title={`하루 점유 ${board?.onDate ?? ''}`} sub={`${board?.fromHour ?? 8}시 ~ ${board?.toHour ?? 21}시 · 색이 찬 칸은 그 시간에 쓰는 중입니다`}>
          {/* 서랍 §21 과 **같은 컴포넌트**다. 같은 것을 두 모양으로 그리면 한쪽만 고쳐진다 */}
          {board ? <ZoomGrid board={board} /> : null}
          {board && board.freeLabels.length > 0 ? (
            <p className="mt-3 text-[12px] text-fg-2">
              지금 쓸 수 있는 계정 — <b className="text-fg">{board.freeLabels.join(' · ')}</b>
            </p>
          ) : null}
        </Panel>

        <Panel title={`계정 ${board?.accounts.length ?? 0}개`} sub="끄면 새 배정에서 빠집니다. 이미 붙은 회차는 그대로 둡니다">
          <Table columns={cols} rows={board?.accounts ?? []} rowKey={(r) => r.id} empty="줌 계정이 없습니다" />
          {shownUrl !== null ? (
            <p className="mt-2 break-all rounded bg-inset px-2 py-1.5 text-[11px] text-fg-2">
              {board?.accounts.find((a) => a.id === shownUrl)?.joinUrl ?? '—'}
            </p>
          ) : null}
        </Panel>
      </AppShell>
    </RequireAuth>
  );
}
