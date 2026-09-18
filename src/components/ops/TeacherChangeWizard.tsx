/** @file-guide
 * 목적: TeacherChangeWizard.tsx — TeacherChangeWizard (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 강사 교체 마법사 — 6단계 (C93 · 테스트 시나리오 J-97 「강사 교체 요구」 · D-46 「강사 퇴사 — 담당 전체 이관」 · N-132 「강사가 당일 아침 못 나옴」 · D-45 「하루만 대강」).
 *
 * 화면이 보내는 것은 **원래 강사 · 새 강사 · 범위(하루만 / 이 날부터) · 날짜 · (고른 수업 · 학생 · 컴플레인 · 메모)**뿐이다.
 * 여섯 단계(스케줄 · 안내 초안 · 학부모 안내 · 교재 확인 · 정산 시수 · 선생님 전달)는 서버가 **같은 트랜잭션을 돌리고 되돌린 미리보기**로 준다(D-R37) —
 * 화면은 체크를 세지 않고 `steps` 를 그대로 그린다. 겹치면 서버가 409 로 거절하고(아무것도 남지 않는다) 「누구와」는 `fetchConflicts` 로 한 번 묻는다(C84-b).
 * 「교체 확정」은 **지금 입력 그대로** 미리 본 뒤에만 선다 — 수업을 빼거나 날짜를 고치면 다시 본다. 강사 후보는 구성원 전부다(C74 · D-R39).
 */
'use client';
import { useEffect, useId, useState } from 'react';
import { Banner, Button, Checkbox, Chip, Dialog, Input, Label, Segmented, Select } from '../ui';
import { ApiError, apiMessage } from '@/api/client';
import { fetchConflicts, useMeta, useTeacherChange } from '@/api/queries';
import type { TcSeries, TeacherChange, TeacherChangeResult } from '@/api/types';
import { conflictLines, hhmm, todayKst, unavailableLines } from '@/lib/calendar';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export interface TeacherChangePreset {
  cplId?: number;
  studentId?: number;
  studentName?: string | null;
  fromTeacherId?: number;
}

export interface TeacherChangeWizardProps {
  open: boolean;
  preset?: TeacherChangePreset | null;
  onClose: () => void;
  onDone?: (result: TeacherChangeResult) => void;
}

export function TeacherChangeWizard({ open, preset, onClose, onDone }: TeacherChangeWizardProps) {
  const id = useId();
  const meta = useMeta(open);
  const write = useTeacherChange();
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [mode, setMode] = useState<'day' | 'from'>('from');
  const [date, setDate] = useState('');
  const [memo, setMemo] = useState('');
  const [onlyStudent, setOnlyStudent] = useState(true);
  /** 미리보기가 알려 준 수업들 — 빼면 다시 본다. 첫 미리보기의 목록을 들고 있어야 뺀 줄이 사라지지 않는다 */
  const [known, setKnown] = useState<TcSeries[]>([]);
  const [excluded, setExcluded] = useState<number[]>([]);
  const [preview, setPreview] = useState<TeacherChangeResult | null>(null);
  const [previewOf, setPreviewOf] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setFromId(preset?.fromTeacherId ? String(preset.fromTeacherId) : ''); setToId(''); setMode('from'); setDate(todayKst()); setMemo('');
    setOnlyStudent(true); setKnown([]); setExcluded([]); setPreview(null); setPreviewOf(''); setErr(null); setConflicts([]);
  }, [open, preset?.cplId, preset?.studentId, preset?.fromTeacherId]);

  const staff = meta.data?.staff ?? [];
  const studentId = preset?.studentId && onlyStudent ? preset.studentId : undefined;

  const build = (): { body: TeacherChange } | { issue: string } => {
    if (!fromId) return { issue: '원래 강사를 고르세요' };
    if (!toId) return { issue: '새 강사를 고르세요' };
    if (fromId === toId) return { issue: '원래 강사와 새 강사가 같습니다' };
    if (!ISO.test(date)) return { issue: '날짜를 넣어 주세요' };
    const picked = known.filter((s) => !excluded.includes(s.serId)).map((s) => s.serId);
    if (known.length && !picked.length) return { issue: '수업을 하나는 남겨야 합니다' };
    return {
      body: {
        fromTeacherId: Number(fromId), toTeacherId: Number(toId), mode, date,
        ...(excluded.length ? { serIds: picked } : {}),
        ...(studentId ? { studentId } : {}),
        ...(preset?.cplId ? { cplId: preset.cplId } : {}),
        ...(memo.trim() ? { memo: memo.trim() } : {}),
      },
    };
  };
  const built = build();
  const bodyKey = 'body' in built ? JSON.stringify(built.body) : '';
  const pending = write.isPending;
  const canPreview = 'body' in built && !pending;
  const canApply = canPreview && preview !== null && previewOf === bodyKey;

  /** 409 겹침이면 누구와 부딪혔는지 한 번 묻는다 — 막는 것은 서버이고 이것은 설명이다 (C84-b) */
  const explainConflict = async (body: TeacherChange, e: unknown) => {
    const code = e instanceof ApiError ? e.code : (e as { response?: { data?: { code?: string } } })?.response?.data?.code;
    if (code !== 'RESOURCE_CONFLICT') { setConflicts([]); return; }
    const lines: string[] = [];
    for (const s of known.filter((k) => !excluded.includes(k.serId))) {
      try {
        const rows = await fetchConflicts({ date: s.firstOn, startMin: s.startMin, endMin: s.endMin, teacherId: body.toTeacherId, exceptSerId: s.newSerId ?? s.serId });
        lines.push(...conflictLines(rows));
      } catch { /* 설명을 못 가져와도 원래 문구는 그대로 선다 */ }
    }
    setConflicts([...new Set(lines)]);
  };

  const run = (kind: 'preview' | 'apply') => {
    if (!('body' in built)) return;
    const body = built.body;
    setErr(null); setConflicts([]);
    write.mutate({ kind, body }, {
      onSuccess: (r) => {
        if (kind === 'preview') {
          setPreview(r); setPreviewOf(JSON.stringify(body));
          // 처음 본 목록을 기억한다 — 이미 아는 수업은 값만 갱신
          setKnown((k) => {
            const merged = [...k];
            for (const s of r.series) { const i = merged.findIndex((x) => x.serId === s.serId); if (i >= 0) merged[i] = s; else merged.push(s); }
            return merged;
          });
        } else { onDone?.(r); onClose(); }
      },
      onError: (e) => { setPreview(null); setErr(apiMessage(e)); void explainConflict(body, e); },
    });
  };

  const toggle = (serId: number) => {
    setExcluded((x) => (x.includes(serId) ? x.filter((v) => v !== serId) : [...x, serId]));
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`강사 교체${preset?.studentName ? ` — ${preset.studentName}` : ''}`}
      width={720}
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>취소 (Esc)</Button>
          <Button type="button" variant="secondary" onClick={() => run('preview')} disabled={!canPreview}>{pending ? '서버에 묻는 중…' : '미리 보기'}</Button>
          <Button type="button" onClick={() => run('apply')} disabled={!canApply} title={!canApply ? '지금 입력 그대로 먼저 미리 봅니다' : undefined}>교체 확정</Button>
        </>
      )}
    >
      <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor={`${id}-from`}>원래 강사</Label>
            <Select id={`${id}-from`} value={fromId} onChange={(e) => setFromId(e.target.value)} disabled={pending}>
              <option value="">고르세요</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor={`${id}-to`} hint="구성원 누구나 (자습 감독처럼)">새 강사</Label>
            <Select id={`${id}-to`} value={toId} onChange={(e) => setToId(e.target.value)} disabled={pending}>
              <option value="">고르세요</option>
              {staff.filter((s) => String(s.id) !== fromId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>범위</Label>
            <Segmented ariaLabel="범위" value={mode} disabled={pending} onChange={setMode}
              options={[{ value: 'day', label: '하루만 대강' }, { value: 'from', label: '이 날부터 계속' }]} />
          </div>
          <div>
            <Label htmlFor={`${id}-date`} hint={mode === 'day' ? '그날의 회차만 예외' : '이 날부터 규칙이 갈립니다'}>{mode === 'day' ? '대강 날짜' : '시작일'}</Label>
            <Input id={`${id}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={pending} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {preset?.studentId ? (
            <Checkbox label={`${preset.studentName ?? '이 학생'}의 수업만`} checked={onlyStudent} onChange={(e) => setOnlyStudent(e.target.checked)} disabled={pending} />
          ) : null}
          <div className="min-w-[240px] flex-1">
            <Input aria-label="메모" value={memo} maxLength={300} onChange={(e) => setMemo(e.target.value)} disabled={pending} placeholder="안내·알림에 실을 한 줄 (선택)" />
          </div>
        </div>

        {known.length ? (
          <section aria-label="대상 수업" className="rounded-lg border border-line p-3">
            <p className="mb-1.5 text-[11px] font-bold text-fg-subtle">대상 수업 — 빼면 다시 미리 봅니다</p>
            <ul className="flex flex-col gap-1">
              {known.map((s) => (
                <li key={s.serId} className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                  <Checkbox label={`${s.subName ?? s.title ?? s.kindName} · ${s.ruleLabel} ${hhmm(s.startMin)}–${hhmm(s.endMin)}${s.students.length ? ` · ${s.students.join(' · ')}` : ''}`}
                    checked={!excluded.includes(s.serId)} onChange={() => toggle(s.serId)} disabled={pending} />
                  <Chip tone="info">{mode === 'day' ? `${s.firstOn.slice(5)} 1회` : `${s.firstOn.slice(5)}부터 ${s.occurrences}회`}</Chip>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* 여섯 단계 — 서버가 같은 트랜잭션을 돌리고 되돌린 결과. 화면은 세지 않는다 */}
        {preview ? (
          <section aria-label="교체 미리보기" className="rounded-lg border border-line bg-inset p-3 text-[12px]">
            <p className="mb-1.5 font-bold text-fg">
              {preview.fromTeacher.name} → {preview.toTeacher.name} · {preview.mode === 'day' ? `${preview.date} 하루 대강` : `${preview.date}부터`} · 회차 {preview.occurrences}회
            </p>
            <ol className="flex flex-col gap-1">
              {preview.steps.map((st, i) => (
                <li key={st.key} className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green text-[10px] font-bold text-white" aria-hidden>✓</span>
                  <span className="text-fg"><b>{i + 1}. {st.label}</b> {st.count}{st.key === 'notify' ? '명' : st.key === 'book' ? '권' : st.key === 'schedule' || st.key === 'payout' ? '회' : '건'} <span className="text-fg-2">— {st.note}</span></span>
                </li>
              ))}
            </ol>
            {preview.books.length ? (
              <p className="mt-2 border-t border-line pt-2 text-fg-2">교재 — {preview.books.map((b) => `${b.studentName} · ${b.title}`).join(' / ')}</p>
            ) : null}
            {preview.unavailable.length ? (
              <Banner tone="warning" className="mt-2">
                새 강사의 불가 시간에 걸칩니다 — 막지 않고 알립니다: {unavailableLines(preview.unavailable).join(' / ')}
              </Banner>
            ) : null}
            {preview.cpl ? <p className="mt-2 text-fg-2">컴플레인 #{preview.cpl.id} → 「강사 교체됨」 · {preview.cpl.stage === 'acting' ? '대응 칸으로' : '단계 그대로'}</p> : null}
          </section>
        ) : null}

        <p className="text-[11px] text-fg-subtle">
          스케줄 · 안내 초안 · 학부모 안내 · 교재 확인 · 정산 시수 · 선생님 전달 여섯을 <b>한 번에</b> 합니다. 새 강사가 그 시각에 바쁘면 서버가 막고 아무것도 남지 않습니다.
          미리 본 값 그대로 교체됩니다.
        </p>
        {err ? (
          <Banner tone="danger">
            {err}
            {conflicts.length ? <ul className="mt-1 list-disc pl-4">{conflicts.map((c) => <li key={c}>{c}</li>)}</ul> : null}
          </Banner>
        ) : 'issue' in built ? <p className="text-[11px] text-fg-subtle">{built.issue}</p> : null}
      </div>
    </Dialog>
  );
}
