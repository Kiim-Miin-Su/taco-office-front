/** @file-guide
 * 목적: ComplaintDetail.tsx — ComplaintDetail (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §67 카드 처리 창 (C93 · 테스트 시나리오 J-101 「마무리 처리」 · J-97 「강사 교체 요구」 · J-98 기한).
 *
 * 담당 · 단계 · 조치 · 결과 · 기한 · 심각도를 **바뀐 칸만** 보낸다. 「대응은 담당이 있어야」「마무리는 결과가 있어야」는 서버가 409 로 말하고
 * 화면은 그 문장을 그대로 띄운다 — 단계 이름·한 줄·심각도 낱말은 전부 `GET /ops` 의 것이다(D-R18). 「강사 교체」는 마법사를, 「수강 종료 · 환불」은 C94-c 창을 연다(둘 다 부모가 소유 · J-97 · J-99).
 */
'use client';
import { useEffect, useId, useState } from 'react';
import { Banner, Button, Chip, Dialog, Input, Label, Segmented, Select, Textarea } from '../ui';
import { apiMessage } from '@/api/client';
import { useMeta, usePatchComplaint } from '@/api/queries';
import type { Complaint, ComplaintPatch, CplWord } from '@/api/types';

export interface ComplaintDetailProps {
  complaint: Complaint | null;
  stages: Array<{ key: string; label: string; sub: string }>;
  severities: CplWord[];
  onClose: () => void;
  /** 「강사 교체」 — 부모가 마법사를 연다 (컴플레인·학생을 미리 채운다) */
  onTeacherChange?: (c: Complaint) => void;
  /** 「수강 종료 · 환불」 — 부모가 C94-c 창을 연다 (J-99 · 학생이 있는 건만 · 사유에 컴플레인을 적어 잇는다) */
  onWithdraw?: (c: Complaint) => void;
}

export function ComplaintDetail({ complaint, stages, severities, onClose, onTeacherChange, onWithdraw }: ComplaintDetailProps) {
  const id = useId();
  const open = complaint !== null;
  const meta = useMeta(open);
  const write = usePatchComplaint();
  const [stage, setStage] = useState<NonNullable<ComplaintPatch['stage']>>('received');
  const [ownerId, setOwnerId] = useState('');
  const [action, setAction] = useState('');
  const [result, setResult] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [severity, setSeverity] = useState<NonNullable<ComplaintPatch['severity']> | ''>('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!complaint) return;
    setStage(complaint.stage as NonNullable<ComplaintPatch['stage']>); setOwnerId(complaint.ownerId ? String(complaint.ownerId) : ''); setAction(complaint.action ?? '');
    setResult(complaint.result ?? ''); setDueOn(complaint.dueOn ?? ''); setSeverity((complaint.severity ?? '') as NonNullable<ComplaintPatch['severity']> | ''); setErr(null);
  }, [complaint]);

  if (!complaint) return null;
  const pending = write.isPending;

  /** 바뀐 칸만 — 안 바뀐 칸을 보내면 서버가 그 값으로 다시 쓴다(같은 값이라 해는 없지만 LOG 가 지저분해진다) */
  const diff = (): ComplaintPatch => {
    const out: ComplaintPatch = {};
    if (stage !== complaint.stage) out.stage = stage;
    const owner = ownerId ? Number(ownerId) : null;
    if (owner !== (complaint.ownerId ?? null)) out.ownerId = owner;
    if (action.trim() !== (complaint.action ?? '')) out.action = action.trim() || null;
    if (result.trim() !== (complaint.result ?? '')) out.result = result.trim() || null;
    if ((dueOn || null) !== (complaint.dueOn ?? null)) out.dueOn = dueOn || null;
    if ((severity || null) !== (complaint.severity ?? null)) out.severity = severity || null;
    return out;
  };
  const changes = diff();
  const dirty = Object.keys(changes).length > 0;

  const save = () => {
    if (!dirty || pending) return;
    setErr(null);
    write.mutate({ id: complaint.id, ...changes }, {
      onSuccess: () => onClose(),
      onError: (e) => setErr(apiMessage(e)),
    });
  };
  const stageSub = stages.find((s) => s.key === stage)?.sub;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`컴플레인 — ${complaint.studentName ?? '문의자'} · ${complaint.areaLabel}`}
      width={620}
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>닫기 (Esc)</Button>
          {onTeacherChange && complaint.stage !== 'closed' ? (
            <Button type="button" variant="secondary" onClick={() => onTeacherChange(complaint)} disabled={pending}>강사 교체</Button>
          ) : null}
          {onWithdraw && complaint.stage !== 'closed' && complaint.studentId ? (
            <Button type="button" variant="secondary" onClick={() => onWithdraw(complaint)} disabled={pending}>수강 종료 · 환불</Button>
          ) : null}
          <Button type="button" onClick={save} disabled={!dirty || pending}>{pending ? '저장 중…' : '저장'}</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <Chip tone="purple">{complaint.areaLabel}</Chip>
          {complaint.severityLabel ? <Chip tone={complaint.severity === 'severe' ? 'danger' : complaint.severity === 'normal' ? 'warning' : 'neutral'}>{complaint.severityLabel}</Chip> : null}
          {complaint.teacherChanged ? <Chip tone="info">강사 교체됨</Chip> : null}
          <span className="text-fg-subtle">{complaint.createdAt} 접수 · {complaint.ageDays}일 지남</span>
          {complaint.overdueDays > 0 ? <Chip tone="danger">기한 {complaint.overdueDays}일 지남</Chip> : null}
        </div>
        <p className="rounded-lg border border-line bg-inset p-3 text-[12px] leading-relaxed text-fg">{complaint.body}</p>

        <div>
          <Label hint={stageSub}>단계</Label>
          {/* 칸 이름은 서버의 것 — 화면은 고르기만 하고 「담당이 있어야」「결과가 있어야」는 서버가 판정한다 */}
          <Segmented<NonNullable<ComplaintPatch['stage']>> ariaLabel="단계" value={stage} disabled={pending} onChange={setStage}
            options={stages.map((s) => ({ value: s.key as NonNullable<ComplaintPatch['stage']>, label: s.label }))} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label htmlFor={`${id}-owner`}>담당</Label>
            <Select id={`${id}-owner`} value={ownerId} onChange={(e) => setOwnerId(e.target.value)} disabled={pending}>
              <option value="">담당 없음</option>
              {(meta.data?.staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor={`${id}-due`}>대응 기한</Label>
            <Input id={`${id}-due`} type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} disabled={pending} />
          </div>
          <div>
            <Label htmlFor={`${id}-sev`}>심각도</Label>
            <Select id={`${id}-sev`} value={severity} onChange={(e) => setSeverity(e.target.value as NonNullable<ComplaintPatch['severity']> | '')} disabled={pending}>
              <option value="">미정</option>
              {severities.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor={`${id}-action`} hint="「대응」 칸에 적힙니다">조치</Label>
          <Textarea id={`${id}-action`} value={action} maxLength={1000} onChange={(e) => setAction(e.target.value)} disabled={pending} className="min-h-[64px]" />
        </div>
        <div>
          <Label htmlFor={`${id}-result`} hint="마무리에 필요합니다">결과</Label>
          <Textarea id={`${id}-result`} value={result} maxLength={1000} onChange={(e) => setResult(e.target.value)} disabled={pending} className="min-h-[64px]" />
        </div>
        {err ? <Banner tone="danger">{err}</Banner> : null}
      </div>
    </Dialog>
  );
}
