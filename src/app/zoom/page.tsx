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
import { useEffect, useRef, useState } from 'react';
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
  // isPending 반영 전 같은 이벤트 묶음의 연속 클릭도 한 번만 저장한다.
  const writing = useRef(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [editor, setEditor] = useState<'create' | number | null>(null);
  const editorForm = useRef<HTMLFormElement>(null);
  useEffect(() => {
    // 긴 계정 목록 아래에서 열어도 새 편집 입력을 바로 보고 키보드로 이어 쓴다.
    if (editor !== null) editorForm.current?.querySelector('input')?.focus();
  }, [editor]);
  /** 참가 링크는 **펼쳐야** 보인다 — 표에 늘 떠 있으면 화면 공유 중에 그대로 찍힌다 */
  const [shownUrl, setShownUrl] = useState<number | null>(null);

  const board = q.data;
  const pending = create.isPending || patch.isPending;
  const canSave = form.label.trim() !== '' && form.loginEmail.trim() !== '' && form.joinUrl.trim() !== '';

  // 생성과 수정은 같은 입력 계약이다. 모드를 바꾸거나 닫을 때 비밀 초안을 폐기한다.
  const openEditor = (account?: ZoomAcct) => {
    if (writing.current) return;
    create.reset(); patch.reset();
    setForm(account ? { ...EMPTY, label: account.label, loginEmail: account.loginEmail, joinUrl: account.joinUrl, meetingId: account.meetingId ?? '' } : { ...EMPTY });
    setEditor(account?.id ?? 'create');
  };
  const closeEditor = () => {
    if (writing.current) return;
    setEditor(null); setForm({ ...EMPTY }); create.reset(); patch.reset();
  };
  const save = () => {
    if (!canSave || writing.current || pending || editor === null) return;
    writing.current = true;
    const body = {
      label: form.label.trim(), loginEmail: form.loginEmail.trim(), joinUrl: form.joinUrl.trim(),
      meetingId: form.meetingId.trim(),
      ...(form.loginSecret ? { loginSecret: form.loginSecret } : {}),
      ...(form.meetingPw ? { meetingPw: form.meetingPw } : {}),
    };
    const callbacks = {
      onSuccess: () => { writing.current = false; closeEditor(); },
      onSettled: () => { writing.current = false; },
    };
    if (editor === 'create') create.mutate(body, callbacks);
    else patch.mutate({ id: editor, ...body }, callbacks);
  };
  const toggleActive = (account: ZoomAcct) => {
    if (writing.current) return;
    writing.current = true;
    patch.mutate({ id: account.id, active: !account.active }, { onSettled: () => { writing.current = false; } });
  };

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
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => openEditor(r)}>
            고치기
          </Button>
          <Button
            size="sm"
            variant={r.active ? 'secondary' : 'primary'}
            disabled={pending}
            onClick={() => toggleActive(r)}
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
          <Button disabled={pending} onClick={() => editor === 'create' ? closeEditor() : openEditor()}>{editor === 'create' ? '닫기' : '+ 계정 추가'}</Button>
        </div>

        {q.isError ? <Banner tone="danger" className="mb-3">{apiMessage(q.error)}</Banner> : null}
        {patch.isError ? <Banner tone="danger" className="mb-3">{apiMessage(patch.error)}</Banner> : null}
        {editor !== null ? (
          <Panel className="mb-4" title={editor === 'create' ? '줌 계정 추가' : '계정 고치기'} sub={editor === 'create' ? '비밀은 암호화해 저장하고 화면으로 다시 내려보내지 않습니다' : '비밀 칸을 비워 두면 지금 저장된 값을 그대로 둡니다'}>
            <form ref={editorForm} onSubmit={(event) => { event.preventDefault(); save(); }}>
              <fieldset disabled={pending} className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div><Label htmlFor="z-label">이름</Label><Input id="z-label" required maxLength={20} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Boarding" /></div>
                <div><Label htmlFor="z-email">로그인 계정</Label><Input id="z-email" required maxLength={120} value={form.loginEmail} onChange={(e) => setForm({ ...form, loginEmail: e.target.value })} placeholder="zoom@tnacademy.kr" /></div>
                <div><Label htmlFor="z-url">참가 링크</Label><Input id="z-url" type="url" required maxLength={500} value={form.joinUrl} onChange={(e) => setForm({ ...form, joinUrl: e.target.value })} placeholder="https://zoom.us/j/..." /></div>
                <div><Label htmlFor="z-mid">회의 ID</Label><Input id="z-mid" maxLength={30} value={form.meetingId} onChange={(e) => setForm({ ...form, meetingId: e.target.value })} /></div>
                <div><Label htmlFor="z-secret">로그인 비밀</Label><Input id="z-secret" type="password" autoComplete="new-password" maxLength={200} value={form.loginSecret} onChange={(e) => setForm({ ...form, loginSecret: e.target.value })} /></div>
                <div><Label htmlFor="z-pw">회의 비밀번호</Label><Input id="z-pw" type="password" autoComplete="new-password" maxLength={50} value={form.meetingPw} onChange={(e) => setForm({ ...form, meetingPw: e.target.value })} /></div>
              </fieldset>
              {create.isError ? <Banner tone="danger" className="mt-3">{apiMessage(create.error)}</Banner> : null}
              <div className="mt-3 flex justify-end gap-2">
                <Button type="button" variant="secondary" disabled={pending} onClick={closeEditor}>취소</Button>
                <Button type="submit" disabled={!canSave || pending}>{editor === 'create' ? '만들기' : '저장'}</Button>
              </div>
            </form>
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
