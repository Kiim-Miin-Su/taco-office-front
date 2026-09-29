/** @file-guide
 * 목적: 문의 카드의 이름·학년·학교·학부모 관계·연락처·원하는 것·유입 경로·담당을 같은 PATCH로 수정한다.
 * 책임/재사용: 서버 LeadPatch 계약과 공용 입력만 조립한다. 단계/등록 학생 정보는 각 전용 흐름에 둔다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useEffect, useState } from 'react';
import { apiMessage } from '@/api/client';
import { useMeta, usePatchLead } from '@/api/queries';
import type { IntakeSource, Lead, LeadPatch } from '@/api/types';
import { Banner, Button, Input, Label, Panel, Select } from '@/components/ui';

export function LeadCoreEditor({ lead, sources, onDone }: { lead: Lead; sources: IntakeSource[]; onDone?: (row: Lead) => void }) {
  const [editing, setEditing] = useState(false);
  const meta = useMeta(editing);
  const patch = usePatchLead();
  const [name, setName] = useState(lead.name);
  const [grade, setGrade] = useState(lead.grade ?? '');
  const [school, setSchool] = useState(lead.school ?? '');
  const [source, setSource] = useState(lead.source ?? '');
  const [ownerId, setOwnerId] = useState(lead.ownerId == null ? '' : String(lead.ownerId));
  const [parentRelation, setParentRelation] = useState(lead.parentRelation ?? '');
  // 고칠 때는 보이는 모양(서버)으로 편다 — 되보낼 때 숫자만으로 줄이는 것도 서버다
  const [parentPhone, setParentPhone] = useState(lead.parentPhoneDisplay ?? '');
  const [want, setWant] = useState(lead.want ?? '');

  useEffect(() => {
    setName(lead.name); setGrade(lead.grade ?? ''); setSchool(lead.school ?? '');
    setSource(lead.source ?? ''); setOwnerId(lead.ownerId == null ? '' : String(lead.ownerId));
    setParentRelation(lead.parentRelation ?? ''); setParentPhone(lead.parentPhoneDisplay ?? ''); setWant(lead.want ?? '');
  }, [lead.id, lead.name, lead.grade, lead.school, lead.source, lead.ownerId, lead.parentRelation, lead.parentPhoneDisplay, lead.want]);

  const save = () => {
    const body: LeadPatch = {};
    const nextName = name.trim();
    const nextGrade = grade.trim() || null;
    const nextSchool = school.trim() || null;
    const nextOwnerId = ownerId ? Number(ownerId) : null;
    if (nextName !== lead.name) body.name = nextName;
    if (nextGrade !== (lead.grade ?? null)) body.grade = nextGrade;
    if (nextSchool !== (lead.school ?? null)) body.school = nextSchool;
    if (nextOwnerId !== (lead.ownerId ?? null)) body.ownerId = nextOwnerId;
    if (source && source !== lead.source) body.source = source as LeadPatch['source'];
    const nextRelation = parentRelation.trim() || null;
    const nextPhone = parentPhone.trim() || null;
    const nextWant = want.trim() || null;
    if (nextRelation !== (lead.parentRelation ?? null)) body.parentRelation = nextRelation;
    if (nextPhone !== (lead.parentPhoneDisplay ?? null)) body.parentPhone = nextPhone;
    if (nextWant !== (lead.want ?? null)) body.want = nextWant;
    if (Object.keys(body).length === 0) { setEditing(false); return; }
    patch.mutate({ id: lead.id, ...body }, { onSuccess: (row) => { setEditing(false); onDone?.(row); } });
  };
  return (
    <Panel title="문의 핵심정보" right={<Button size="sm" onClick={() => setEditing((value) => !value)}>{editing ? '취소' : '고치기'}</Button>}>
      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_96px_1fr]">
            <div><Label htmlFor="lead-core-name">이름</Label><Input id="lead-core-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label htmlFor="lead-core-grade">학년</Label><Input id="lead-core-grade" value={grade} maxLength={10} onChange={(e) => setGrade(e.target.value)} /></div>
            <div><Label htmlFor="lead-core-school">학교</Label><Input id="lead-core-school" value={school} maxLength={60} onChange={(e) => setSchool(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[96px_1fr]">
            <div><Label htmlFor="lead-core-prel">학부모</Label><Input id="lead-core-prel" value={parentRelation} maxLength={20} onChange={(e) => setParentRelation(e.target.value)} placeholder="어머니" /></div>
            <div><Label htmlFor="lead-core-pphone" hint="등록하면 보호자로 이어집니다">연락처</Label><Input id="lead-core-pphone" type="tel" inputMode="tel" autoComplete="off" value={parentPhone} maxLength={20} onChange={(e) => setParentPhone(e.target.value)} placeholder="010-1234-5678" /></div>
          </div>
          <div><Label htmlFor="lead-core-want">원하는 것</Label><Input id="lead-core-want" value={want} maxLength={120} onChange={(e) => setWant(e.target.value)} /></div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div><Label htmlFor="lead-core-source">유입 경로</Label><Select id="lead-core-source" value={source} onChange={(e) => setSource(e.target.value)}>
              {!source ? <option value="">기록 없음</option> : null}
              {sources.filter((item) => item.key !== 'none').map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </Select></div>
            <div><Label htmlFor="lead-core-owner" hint="비우면 미배정">담당</Label><Select id="lead-core-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">미배정</option>
              {(meta.data?.staff ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select></div>
          </div>
          <Button variant="primary" size="sm" disabled={patch.isPending || !name.trim()} onClick={save}>{patch.isPending ? '저장 중…' : '저장'}</Button>
          {patch.isError ? <Banner tone="danger">{apiMessage(patch.error)}</Banner> : null}
        </div>
      ) : (
        <div className="space-y-0.5 text-[12px] text-fg-2">
          <p>{lead.name} · {lead.grade ?? '학년 없음'} · {lead.school ?? '학교 없음'} · {lead.sourceLabel ?? '유입 경로 없음'} · {lead.ownerName ?? '미배정'}</p>
          {/* A-01 — 학부모 · 연락처 · 원하는 것. 번호 모양은 서버(parentPhoneDisplay) */}
          <p>학부모 {lead.parentRelation ?? '—'} · {lead.parentPhoneDisplay ?? '연락처 없음'} · 원하는 것 {lead.want ?? '—'}</p>
        </div>
      )}
    </Panel>
  );
}
