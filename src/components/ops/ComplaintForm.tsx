/** @file-guide
 * 목적: ComplaintForm.tsx — ComplaintCreateButton (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §67 「+ 접수」 (C93 · 테스트 시나리오 J-96 「수업 진도 불만 접수」 · J-98 기한 · N-46 ①).
 *
 * 화면이 보내는 것은 **갈래 · 학생 · 내용 · 담당 · 기한 · 심각도**뿐이고 상태는 보내지 않는다 — 접수는 언제나 「접수」 칸이다(서버).
 * 갈래·심각도 낱말은 `GET /ops` 의 `cplAreas`·`cplSeverities`(D-R18), 학생·담당은 `GET /meta` — 창을 열 때만 읽는다.
 */
'use client';
import { useEffect, useId, useState } from 'react';
import { Banner, Button, Dialog, Input, Label, Segmented, Select, Textarea } from '../ui';
import { apiMessage } from '@/api/client';
import { useCreateComplaint, useMeta } from '@/api/queries';
import type { Complaint, ComplaintCreate, CplWord } from '@/api/types';

export interface ComplaintCreateButtonProps {
  areas: CplWord[];
  severities: CplWord[];
  onDone?: (row: Complaint) => void;
}

export function ComplaintCreateButton({ areas, severities, onDone }: ComplaintCreateButtonProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const meta = useMeta(open);
  const write = useCreateComplaint();
  const [area, setArea] = useState<ComplaintCreate['area'] | ''>('');
  const [studentId, setStudentId] = useState('');
  const [body, setBody] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [severity, setSeverity] = useState<NonNullable<ComplaintCreate['severity']> | ''>('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setArea(''); setStudentId(''); setBody(''); setOwnerId(''); setDueOn(''); setSeverity(''); setErr(null);
  }, [open]);

  const pending = write.isPending;
  const canSubmit = !!area && body.trim().length > 0 && !pending;

  const submit = () => {
    if (!canSubmit) return;
    const payload: ComplaintCreate = {
      area, body: body.trim(),
      ...(studentId ? { studentId: Number(studentId) } : {}),
      ...(ownerId ? { ownerId: Number(ownerId) } : {}),
      ...(dueOn ? { dueOn } : {}),
      ...(severity ? { severity } : {}),
    };
    setErr(null);
    write.mutate(payload, {
      onSuccess: (row) => { setOpen(false); onDone?.(row); },
      onError: (e) => setErr(apiMessage(e)),
    });
  };

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>+ 접수</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="컴플레인 접수"
        width={560}
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>취소 (Esc)</Button>
            <Button type="button" onClick={submit} disabled={!canSubmit}>{pending ? '접수 중…' : '접수'}</Button>
          </>
        )}
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`${id}-area`}>갈래</Label>
              <Select id={`${id}-area`} value={area} onChange={(e) => setArea(e.target.value as ComplaintCreate['area'] | '')} disabled={pending}>
                <option value="">고르세요</option>
                {areas.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor={`${id}-stu`} hint="없으면 문의자">학생</Label>
              <Select id={`${id}-stu`} value={studentId} onChange={(e) => setStudentId(e.target.value)} disabled={pending}>
                <option value="">문의자</option>
                {(meta.data?.students ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}{s.grade ? ` · ${s.grade}` : ''}</option>)}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor={`${id}-body`}>내용</Label>
            <Textarea id={`${id}-body`} value={body} maxLength={1000} onChange={(e) => setBody(e.target.value)} disabled={pending} placeholder="무엇을 말씀하셨는지 그대로" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`${id}-owner`} hint="정하면 알림이 갑니다">담당</Label>
              <Select id={`${id}-owner`} value={ownerId} onChange={(e) => setOwnerId(e.target.value)} disabled={pending}>
                <option value="">아직 없음</option>
                {(meta.data?.staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor={`${id}-due`} hint="지나면 붉게 셉니다">대응 기한</Label>
              <Input id={`${id}-due`} type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} disabled={pending} />
            </div>
          </div>
          <div>
            <Label>심각도</Label>
            {/* 낱말은 서버의 셋이다 — 화면은 고르기만 한다 */}
            <Segmented<NonNullable<ComplaintCreate['severity']> | ''> ariaLabel="심각도" value={severity} disabled={pending} onChange={setSeverity}
              options={[{ value: '', label: '미정' }, ...severities.map((s) => ({ value: s.key as NonNullable<ComplaintCreate['severity']>, label: s.label }))]} />
          </div>
          {err ? <Banner tone="danger">{err}</Banner> : null}
          <p className="text-[11px] text-fg-subtle">접수하면 「접수」 칸에 서고 담당을 정해야 「대응」으로 옮길 수 있습니다 (§67).</p>
        </div>
      </Dialog>
    </>
  );
}
