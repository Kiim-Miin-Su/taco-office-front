/** @file-guide
 * 목적: LeadEnrollDialog.tsx — LeadEnrollDialog (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §23 상담 카드의 「등록 확정」 창 (C91 · 테스트 시나리오 A-05 「한 번에 일곱 가지」 · A-06 · A-07 · A-14 · N-137).
 *
 * 화면이 보내는 것은 **학생 칸 · 시작일 · 배치안 줄들 · 청구서 여부 · 메모**뿐이다. 첫 수업일·청구액·겹침·불가 시간·안내 초안 수는
 * 서버가 **같은 트랜잭션을 돌리고 되돌린 미리보기**로 준다(D-R37) — 화면이 요일을 세거나 단가를 곱하면 미리 본 값과 실제가 갈린다.
 * 겹치면 서버가 409 로 거절하고(A-06) 그때 「누구와」는 기존 `fetchConflicts` 로 한 번 묻는다(C84-b). 코드표(종류·과목·강사·강의실·학생)는
 * `GET /meta`, 교재는 `GET /books` — 창을 열 때만 읽는다. 모달은 공용 `Dialog`, 요일 단추는 `SessionEditor` 와 같은 모양이다.
 */
'use client';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Banner, Button, Checkbox, Chip, Dialog, Input, Label, Select } from '../ui';
import { ApiError, apiMessage } from '@/api/client';
import { fetchConflicts, useBooks, useEnrollLead, useMeta } from '@/api/queries';
import type { EnrollResult, Lead, LeadEnroll } from '@/api/types';
import { KO_DOW, buildRrule, conflictLines, hhmm, parseHm, todayKst, unavailableLines } from '@/lib/calendar';
import { won } from '@/lib/money';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const md = (iso: string) => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;

/** 배치안 줄의 화면 초안 — 보내기 전 낱말이다. 규칙·분은 보낼 때 만든다 */
interface LineDraft {
  key: number;
  kindKey: string;
  subKey: string;
  mode: 'offline' | 'online';
  days: number[];
  start: string;
  end: string;
  teacherId: string;
  roomId: string;
  sessions: string;
  libId: string;
}
let seq = 0;
const newLine = (): LineDraft => ({ key: ++seq, kindKey: '', subKey: '', mode: 'offline', days: [], start: '16:00', end: '17:00', teacherId: '', roomId: '', sessions: '', libId: '' });

export interface LeadEnrollDialogProps {
  open: boolean;
  lead: Lead;
  onClose: () => void;
  /** 등록이 끝난 뒤 — 부모가 창을 닫고 갱신한다 */
  onDone?: (result: EnrollResult) => void;
}

export function LeadEnrollDialog({ open, lead, onClose, onDone }: LeadEnrollDialogProps) {
  const id = useId();
  const meta = useMeta(open);
  // 교재 목록도 창을 열 때만 — 카드를 고르기만 해도 /books 를 부르면 상담 화면이 값을 치른다 (C50 의 교훈 · 회귀가 GET 수를 센다)
  const books = useBooks(open);
  const write = useEnrollLead();
  const [existing, setExisting] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [school, setSchool] = useState('');
  const [startedOn, setStartedOn] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [issueInvoice, setIssueInvoice] = useState(true);
  /* 함께 내는 청구서의 납부 기한 — 미리 채우지 않는다(대표 결정 2026-09-20 · S3 · D-R44) */
  const [dueOn, setDueOn] = useState('');
  const [allowSameName, setAllowSameName] = useState(false);
  const [memo, setMemo] = useState('');
  const [preview, setPreview] = useState<EnrollResult | null>(null);
  const [previewOf, setPreviewOf] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);

  // 열 때마다 비운다 — 지난 창의 줄이 남아 있으면 그대로 등록된다
  useEffect(() => {
    if (!open) return;
    setExisting(false); setStudentId(''); setName(lead.name); setGrade(''); setSchool(lead.school ?? '');
    setStartedOn(todayKst()); setLines([newLine()]); setIssueInvoice(true); setAllowSameName(false); setMemo('');
    setPreview(null); setPreviewOf(''); setErr(null); setConflicts([]);
  }, [open, lead.id, lead.name, lead.school]);

  // 강사 후보는 SessionEditor 와 같이 구성원 전부다 — 자습 감독처럼 강사가 아니어도 맡는 수업이 있다 (C74) · role 을 화면이 비교하지 않는다 (D-R39)
  const teachers = meta.data?.staff ?? [];
  const patch = (key: number, p: Partial<LineDraft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const toggleDay = (key: number, d: number) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, days: l.days.includes(d) ? l.days.filter((x) => x !== d) : [...l.days, d] } : l)));

  /** 보낼 몸통 — 못 만들면 null 과 이유. 규칙은 서버 `formatRule` 형식(`buildRrule`) 그대로 */
  const build = (): { body: LeadEnroll } | { issue: string } => {
    if (!ISO.test(startedOn)) return { issue: '시작일을 넣어 주세요' };
    if (existing && !studentId) return { issue: '붙일 학생을 고르세요' };
    if (!existing && !name.trim()) return { issue: '학생 이름이 필요합니다' };
    if (!lines.length) return { issue: '배치안 줄이 하나는 있어야 합니다' };
    if (issueInvoice && !ISO.test(dueOn)) return { issue: '청구서를 함께 내려면 납부 기한을 고르세요' };
    const out: LeadEnroll['lines'] = [];
    for (const l of lines) {
      if (!l.kindKey) return { issue: '줄마다 종류를 고르세요' };
      const s = parseHm(l.start); const e = parseHm(l.end);
      if (s === null || e === null || s >= 1440) return { issue: '시각은 HH:MM 입니다' };
      out.push({
        kindKey: l.kindKey, subKey: l.subKey || null, mode: l.mode, rrule: buildRrule(l.days), startMin: s, endMin: e,
        teacherId: l.teacherId ? Number(l.teacherId) : null, roomId: l.roomId ? Number(l.roomId) : null, title: null,
        sessions: l.sessions ? Number(l.sessions) : null, libId: l.libId ? Number(l.libId) : null,
      });
    }
    return {
      body: {
        ...(existing ? { studentId: Number(studentId) } : { student: { name: name.trim(), ...(grade.trim() ? { grade: grade.trim() } : {}), school: school.trim() } }),
        startedOn, lines: out, issueInvoice, ...(issueInvoice ? { dueOn } : {}),
        ...(allowSameName ? { allowSameName: true } : {}), ...(memo.trim() ? { memo: memo.trim() } : {}),
      },
    };
  };
  const built = build();
  const bodyKey = 'body' in built ? JSON.stringify(built.body) : '';
  const pending = write.isPending;
  const canPreview = 'body' in built && !pending;
  // 「등록 확정」은 **지금 입력 그대로** 미리 본 뒤에만 선다 — 미리 본 뒤 줄을 고치면 다시 본다
  const canEnroll = canPreview && preview !== null && previewOf === bodyKey;

  /** 409 겹침이면 누구와 부딪혔는지 한 번 묻는다 — 막는 것은 서버이고 이것은 설명이다 (C84-b) */
  const explainConflict = async (body: LeadEnroll, e: unknown) => {
    const code = e instanceof ApiError ? e.code : (e as { response?: { data?: { code?: string } } })?.response?.data?.code;
    if (code !== 'RESOURCE_CONFLICT') { setConflicts([]); return; }
    const lines: string[] = [];
    for (const l of body.lines) {
      try {
        // 시작일 이후 첫 회차 날짜는 서버가 정한다 — 여기서는 시작일부터 일주일 안의 그 요일들을 물어 본다
        const dates: string[] = [];
        for (let i = 0; i < 7 && dates.length < 2; i += 1) {
          const d = new Date(`${body.startedOn}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + i);
          const iso = d.toISOString().slice(0, 10);
          if (l.rrule === 'ONCE' ? i === 0 : l.rrule.includes(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][d.getUTCDay()]!)) dates.push(iso);
        }
        for (const date of dates) {
          const rows = await fetchConflicts({ date, startMin: l.startMin, endMin: l.endMin, teacherId: l.teacherId, roomId: l.roomId });
          lines.push(...conflictLines(rows));
        }
      } catch { /* 설명을 못 가져와도 원래 문구는 그대로 선다 */ }
    }
    setConflicts([...new Set(lines)]);
  };

  const run = (kind: 'preview' | 'enroll') => {
    if (!('body' in built)) return;
    const body = built.body;
    setErr(null); setConflicts([]);
    write.mutate({ id: lead.id, kind, body }, {
      onSuccess: (r) => {
        if (kind === 'preview') { setPreview(r); setPreviewOf(JSON.stringify(body)); }
        else { onDone?.(r); onClose(); }
      },
      onError: (e) => { setPreview(null); setErr(apiMessage(e)); void explainConflict(body, e); },
    });
  };

  const field = (label: string, children: ReactNode, hint?: string) => (
    <div><Label hint={hint}>{label}</Label>{children}</div>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`등록 확정 — ${lead.name}`}
      width={760}
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>취소 (Esc)</Button>
          <Button type="button" variant="secondary" onClick={() => run('preview')} disabled={!canPreview}>{pending ? '서버에 묻는 중…' : '미리 보기'}</Button>
          <Button type="button" onClick={() => run('enroll')} disabled={!canEnroll} title={!canEnroll ? '지금 입력 그대로 먼저 미리 봅니다' : undefined}>등록 확정</Button>
        </>
      )}
    >
      <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
        {/* 학생 — 새로 만들거나 있는 학생에게 붙인다 (형제·재등록). 동명이인은 학년·학교로 가른다 (N-137) */}
        <section aria-label="학생" className="rounded-lg border border-line bg-inset p-3">
          <div className="mb-2 flex items-center gap-3">
            <Checkbox label="이미 있는 학생에게 붙입니다 (형제 · 재등록)" checked={existing} onChange={(e) => setExisting(e.target.checked)} disabled={pending} />
          </div>
          {existing ? (
            <div>
              <Label htmlFor={`${id}-stu`}>학생</Label>
              <Select id={`${id}-stu`} value={studentId} onChange={(e) => setStudentId(e.target.value)} disabled={pending}>
                <option value="">고르세요</option>
                {(meta.data?.students ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}{s.grade ? ` · ${s.grade}` : ''}</option>)}
              </Select>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <div><Label htmlFor={`${id}-name`}>이름</Label><Input id={`${id}-name`} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} disabled={pending} /></div>
              <div><Label htmlFor={`${id}-grade`} hint="동명이인을 가릅니다">학년</Label><Input id={`${id}-grade`} value={grade} maxLength={10} onChange={(e) => setGrade(e.target.value)} disabled={pending} placeholder="예: 고2" /></div>
              <div><Label htmlFor={`${id}-school`}>학교</Label><Input id={`${id}-school`} value={school} maxLength={60} onChange={(e) => setSchool(e.target.value)} disabled={pending} /></div>
            </div>
          )}
        </section>

        <div className="grid grid-cols-3 gap-2">
          <div><Label htmlFor={`${id}-start`} hint="이 날 이후 첫 요일이 첫 수업">시작일</Label><Input id={`${id}-start`} type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} disabled={pending} /></div>
          <div className="col-span-2"><Label htmlFor={`${id}-memo`}>메모</Label><Input id={`${id}-memo`} value={memo} maxLength={300} onChange={(e) => setMemo(e.target.value)} disabled={pending} placeholder="상담 카드에 남습니다" /></div>
        </div>

        {/* 배치안 줄 — 줄마다 시간표 규칙 하나 + 등록 한 줄 (+ 교재) */}
        <section aria-label="배치안" className="flex flex-col gap-2">
          {lines.map((l, i) => (
            <div key={l.key} className="rounded-lg border border-line p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-bold text-fg">수업 {i + 1}</span>
                {lines.length > 1 ? <button type="button" className="text-[11px] text-fg-subtle hover:text-red" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} disabled={pending}>줄 빼기</button> : null}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {field('종류', (
                  <Select aria-label={`수업 ${i + 1} 종류`} value={l.kindKey} onChange={(e) => patch(l.key, { kindKey: e.target.value })} disabled={pending}>
                    <option value="">고르세요</option>
                    {(meta.data?.kinds ?? []).map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}
                  </Select>
                ))}
                {field('과목', (
                  <Select aria-label={`수업 ${i + 1} 과목`} value={l.subKey} onChange={(e) => patch(l.key, { subKey: e.target.value })} disabled={pending}>
                    <option value="">없음</option>
                    {(meta.data?.subs ?? []).map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
                  </Select>
                ))}
                {field('강사', (
                  <Select aria-label={`수업 ${i + 1} 강사`} value={l.teacherId} onChange={(e) => patch(l.key, { teacherId: e.target.value })} disabled={pending}>
                    <option value="">미정</option>
                    {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                ))}
                {field('방식 · 강의실', (
                  <div className="flex gap-1">
                    <Select aria-label={`수업 ${i + 1} 방식`} value={l.mode} onChange={(e) => patch(l.key, { mode: e.target.value as 'offline' | 'online' })} disabled={pending}>
                      <option value="offline">현장</option><option value="online">온라인</option>
                    </Select>
                    <Select aria-label={`수업 ${i + 1} 강의실`} value={l.roomId} onChange={(e) => patch(l.key, { roomId: e.target.value })} disabled={pending}>
                      <option value="">—</option>
                      {(meta.data?.rooms ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </Select>
                  </div>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2">
                <div className="col-span-2">
                  <Label hint="안 고르면 시작일 하루">요일</Label>
                  <div className="mt-1 flex gap-1">
                    {KO_DOW.map((d, di) => (
                      <button key={d} type="button" aria-pressed={l.days.includes(di)} aria-label={`수업 ${i + 1} ${d}요일`} onClick={() => toggleDay(l.key, di)} disabled={pending}
                        className={`h-8 w-8 rounded-lg border text-[12px] font-bold transition-colors ${l.days.includes(di) ? 'border-blue bg-blue text-white' : 'border-line text-fg-subtle hover:border-blue'}`}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                {field('시작 · 끝', (
                  <div className="flex gap-1">
                    <Input aria-label={`수업 ${i + 1} 시작`} value={l.start} onChange={(e) => patch(l.key, { start: e.target.value })} disabled={pending} placeholder="16:00" />
                    <Input aria-label={`수업 ${i + 1} 끝`} value={l.end} onChange={(e) => patch(l.key, { end: e.target.value })} disabled={pending} placeholder="17:00" />
                  </div>
                ))}
                {field('회차 · 교재', (
                  <div className="flex gap-1">
                    <Input aria-label={`수업 ${i + 1} 회차`} type="number" min={1} value={l.sessions} onChange={(e) => patch(l.key, { sessions: e.target.value })} disabled={pending} placeholder="회차" className="w-16" />
                    <Select aria-label={`수업 ${i + 1} 교재`} value={l.libId} onChange={(e) => patch(l.key, { libId: e.target.value })} disabled={pending}>
                      <option value="">교재 미정</option>
                      {(books.data?.items ?? []).filter((b) => !l.subKey || !b.subKey || b.subKey === l.subKey).map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
                    </Select>
                  </div>
                ), '미정이면 배정 알림')}
              </div>
            </div>
          ))}
          <div>
            <Button type="button" size="sm" variant="secondary" onClick={() => setLines((ls) => [...ls, newLine()])} disabled={pending || lines.length >= 10}>+ 수업 줄</Button>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-4">
          <Checkbox label="첫 달 수업료 청구서를 함께 냅니다 (§53)" checked={issueInvoice} onChange={(e) => setIssueInvoice(e.target.checked)} disabled={pending} />
          {issueInvoice ? (
            <div className="mt-2 max-w-48">
              <Label htmlFor={`${id}-due`} hint="이 날이 지나면 「기한 지남」에 듭니다">납부 기한</Label>
              <Input id={`${id}-due`} type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} disabled={pending} />
            </div>
          ) : null}
        </div>

        {/* 미리보기 — 서버가 같은 트랜잭션을 돌리고 되돌린 값. 화면이 세지 않는다 */}
        {preview ? (
          <section aria-label="등록 미리보기" className="rounded-lg border border-line bg-inset p-3 text-[12px]">
            <p className="mb-1.5 font-bold text-fg">
              {preview.studentName} · {preview.studentCreated ? '새 학생' : '있는 학생에게'} · {md(preview.startedOn)}부터 · 수업 {preview.series.length}개
            </p>
            <ul className="flex flex-col gap-1">
              {preview.series.map((s) => (
                <li key={s.serId} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-fg-2">{s.subName ?? s.title} · {s.ruleLabel} {hhmm(s.startMin)}–{hhmm(s.endMin)}{s.teacherName ? ` · ${s.teacherName}` : ''}</span>
                  <Chip tone={s.firstLessonOn ? 'info' : 'warning'}>{s.firstLessonOn ? `첫 수업 ${md(s.firstLessonOn)} · 이달 ${s.monthCount}회` : '첫 수업 없음'}</Chip>
                </li>
              ))}
            </ul>
            <ul className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
              <li className="text-fg-2">
                청구서 — {preview.invoice
                  ? <b className="text-fg">{preview.invoice.yearMonth} · {preview.invoice.amount == null ? '금액은 대표만' : won(preview.invoice.amount)} · {preview.invoice.lines.map((x) => `${x.label} ${x.count}회`).join(' + ')}</b>
                  : preview.invoiceSkipped ? <span className="text-red">건너뜀 — {preview.invoiceSkipped.message}</span> : '내지 않음'}
              </li>
              <li className="text-fg-2">
                교재 — 요청 {preview.bookIssues.length}건{preview.booksMissing.length ? <span className="text-amber"> · 배정 필요 {preview.booksMissing.map((b) => b.label).join(' · ')}</span> : null}
              </li>
              <li className="text-fg-2">안내 초안 {preview.guideDrafts}건 · 알림 강사 {preview.notifiedTeachers}명 · 관리자 {preview.notifiedStaff}명</li>
            </ul>
            {preview.unavailable.length ? (
              <Banner tone="warning" className="mt-2">
                강사 불가 시간에 걸칩니다 — 막지 않고 알립니다: {unavailableLines(preview.unavailable).join(' / ')}
              </Banner>
            ) : null}
          </section>
        ) : null}

        <p className="text-[11px] text-fg-subtle">
          학생 · 등록 · 시간표 · 첫 달 청구서 · 교재 요청 · 첫 수업 안내 초안 · 알림이 <b>한 번에</b> 만들어지고 상담은 「등록」으로 옮겨집니다.
          겹치는 시간이면 서버가 막고 아무것도 남지 않습니다. 미리 본 값 그대로 등록됩니다.
        </p>
        {err ? (
          <Banner tone="danger">
            {err}
            {conflicts.length ? <ul className="mt-1 list-disc pl-4">{conflicts.map((c) => <li key={c}>{c}</li>)}</ul> : null}
            {err.includes('allowSameName') ? (
              <div className="mt-1.5"><Checkbox label="동명이인입니다 — 다른 사람으로 새로 만듭니다" checked={allowSameName} onChange={(e) => setAllowSameName(e.target.checked)} /></div>
            ) : null}
          </Banner>
        ) : 'issue' in built ? <p className="text-[11px] text-fg-subtle">{built.issue}</p> : null}
      </div>
    </Dialog>
  );
}
