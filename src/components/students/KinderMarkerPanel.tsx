/** @file-guide
 * 목적: BO-09E-01 관리자 학생 프로필의 Kinder 명시 표식 이력·미래 예약 입력·409 복구 UI.
 * 책임/재사용: 생성 OpenAPI hook만 호출하며 학년·나이 추정, 자동 학생 제거, 로컬 성공 합성을 하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useState } from 'react';
import { ApiError, apiMessage } from '@/api/client';
import {
  useCreateStudentKinderMarker, useStudentKinderMarker, type StudentKinderMarkerConflict,
} from '@/api/students';
import { Banner, Button, Input, Label, Panel, QueryState, Select } from '@/components/ui';
import { kstDateTime } from '@/lib/calendar';

const initialEffective = (): string => new Date(Date.now() + 33 * 3600_000).toISOString().slice(0, 16);
const kstInputToIso = (value: string): string | null => {
  const ms = Date.parse(`${value}:00+09:00`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};

function conflictOf(error: unknown): StudentKinderMarkerConflict | null {
  if (!(error instanceof ApiError) || error.code !== 'KINDER_GROUP_CONFLICT') return null;
  return (error.details ?? null) as StudentKinderMarkerConflict | null;
}

export function KinderMarkerPanel({ studentId }: { studentId: number }) {
  const query = useStudentKinderMarker(studentId);
  const save = useCreateStudentKinderMarker();
  const [marked, setMarked] = useState(true);
  const [effective, setEffective] = useState(initialEffective);
  const [reason, setReason] = useState('');
  const conflict = conflictOf(save.error);
  return <QueryState query={query}>{history => {
    const submit = async () => {
      const effectiveFrom = kstInputToIso(effective);
      if (!effectiveFrom) return;
      await save.mutateAsync({
        studentId,
        body: { marked, effectiveFrom, expectedVersion: history.currentVersion, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      }).then(() => setReason('')).catch(() => undefined);
    };
    return <Panel
      title="Kinder 명시 표식"
      sub="학년·나이로 추정하지 않습니다. 미래 실제 수업부터 적용하며 일반 수업은 학생 한 명만 허용합니다."
    >
      <div className="rounded-lg border border-line bg-inset px-3 py-3 text-[12px]">
        <b>현재 상태: {history.current ? history.current.marked ? 'Kinder' : '일반' : '표식 없음'}</b>
        <p className="mt-1 text-fg-subtle">마지막 version {history.currentVersion}{history.current ? ` · ${kstDateTime(history.current.effectiveFrom) ?? history.current.effectiveFrom}부터` : ''}</p>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Label>변경할 상태
          <Select className="mt-1 min-h-11" value={marked ? 'kinder' : 'general'} onChange={event => setMarked(event.target.value === 'kinder')}>
            <option value="kinder">Kinder</option><option value="general">일반</option>
          </Select>
        </Label>
        <Label>효력 시작 (KST)
          <Input className="mt-1 min-h-11" type="datetime-local" step={60} value={effective} onChange={event => setEffective(event.target.value)} />
        </Label>
        <div className="sm:col-span-2"><Label>변경 사유
          <Input className="mt-1 min-h-11" maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder="예: 학부모 확인 후 Kinder 전환" />
        </Label></div>
      </div>
      {save.isError ? <Banner className="mt-3" tone="warning" title={apiMessage(save.error)}>
        {conflict?.serId ? <p className="mt-1 text-[12px]">수업 #{conflict.serId} · 원래 {conflict.onDate} · 실제 {conflict.date} · 충돌기간 {conflict.conflictFrom}~{conflict.conflictTo ?? '종료 없음'}</p> : null}
        <Button className="mt-2" size="sm" onClick={() => void query.refetch()}>최신 이력 다시 불러오기</Button>
      </Banner> : null}
      {save.isSuccess ? <Banner className="mt-3" tone="success">표식을 예약했습니다. 수업 명단은 자동으로 바꾸지 않았습니다.</Banner> : null}
      <Button className="mt-3 min-h-11" disabled={save.isPending || !kstInputToIso(effective)} onClick={() => void submit()}>
        {save.isPending ? '저장 중…' : `version ${history.currentVersion + 1} 예약`}
      </Button>
      <div className="mt-4 border-t border-line pt-3">
        <h3 className="text-[12px] font-bold">변경 이력 {history.items.length}건</h3>
        {history.items.length ? <ul className="mt-2 space-y-2">{history.items.map(item => <li key={item.id} className="rounded-lg border border-line px-3 py-2 text-[12px]">
          <b>v{item.version} · {item.marked ? 'Kinder' : '일반'}</b>
          <span className="ml-2 text-fg-subtle">{kstDateTime(item.effectiveFrom) ?? item.effectiveFrom} · {item.setByName}</span>
          {item.reason ? <p className="mt-1 text-fg-subtle">{item.reason}</p> : null}
        </li>)}</ul> : <p className="mt-2 text-[12px] text-fg-subtle">아직 명시 표식이 없습니다.</p>}
      </div>
    </Panel>;
  }}</QueryState>;
}
