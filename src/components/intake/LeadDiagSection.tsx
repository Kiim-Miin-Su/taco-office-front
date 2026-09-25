/** @file-guide
 * 목적: LeadDiagSection.tsx — LeadDiagSection, diagScoresLabel (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §23 상담 카드 상세의 「진단 점수」 (DQ1 대표 답변 2026-09-25 「점수만 저장 + 담당자가 선택」 · A-04 · N-53).
 *
 * 지금 값은 서버가 준 `lead.latestDiag` 를 그대로 그린다 — 서랍을 여는 것만으로는 아무것도 묻지 않는다(카드와 같은 응답).
 * 이력은 「이력 보기」, 교재 목록은 「+ 점수 기록」을 눌렀을 때만 부른다(C50 — 고르기만 해도 부르면 상담 화면이 값을 치른다).
 * 레벨·교재는 **담당자가 고른다** — 화면은 점수로 레벨을 짐작하거나 교재를 추천하지 않는다. 만점·경계는 정해지지 않았다.
 * 레벨 낱말은 서버의 `levels`, 교재는 `GET /books` 그대로다(D-R18). 부모는 `key={lead.id}` 로 세운다 — 쓰다 만 줄이 다른 건에 붙지 않는다.
 */
'use client';
import { useId, useState } from 'react';
import { Banner, Button, Input, Label, Select, Textarea } from '../ui';
import { apiMessage } from '@/api/client';
import { useAddLeadDiag, useBooks, useLeadDiag } from '@/api/queries';
import type { Lead, LeadDiag, LeadDiagList, LeadDiagWrite } from '@/api/types';

export interface LeadDiagSectionProps {
  lead: Lead;
  onDone?: (list: LeadDiagList) => void;
}

/** 「62·71·58」 — 영어·수학·인터뷰 차례. 적지 않은 점수는 「—」. 카드 칩과 서랍이 같은 모양을 쓴다 */
export const diagScoresLabel = (d: Pick<LeadDiag, 'english' | 'math' | 'interview'>): string =>
  [d.english, d.math, d.interview].map((v) => (v == null ? '—' : String(v))).join('·');

const SCORE = /^\d+$/;
const FIELDS = [
  { key: 'english', label: '영어' },
  { key: 'math', label: '수학' },
  { key: 'interview', label: '인터뷰' },
] as const;
type ScoreKey = (typeof FIELDS)[number]['key'];

interface Draft {
  english: string; math: string; interview: string;
  takenOn: string; level: string; bookId: string; note: string;
}
const EMPTY: Draft = { english: '', math: '', interview: '', takenOn: '', level: '', bookId: '', note: '' };
const text = (v: number | string | null | undefined) => (v == null ? '' : String(v));

/** 적은 칸만 싣는다 — 빈 칸은 키째 뺀다(서버가 그 줄의 NULL 로 적는다). 못 만들면 이유 */
function build(d: Draft): { body: LeadDiagWrite } | { issue: string | null } {
  const body: LeadDiagWrite = {};
  for (const f of FIELDS) {
    const v = d[f.key].trim();
    if (!v) continue;
    if (!SCORE.test(v)) return { issue: `${f.label} 점수는 0 이상의 정수로 적어 주세요` };
    body[f.key as ScoreKey] = Number(v);
  }
  if (d.takenOn) body.takenOn = d.takenOn;
  if (d.level) body.level = d.level as LeadDiagWrite['level'];
  if (d.bookId) body.bookId = Number(d.bookId);
  const note = d.note.trim();
  if (note) body.note = note;
  const said = body.english != null || body.math != null || body.interview != null || body.level != null || body.bookId != null;
  return said ? { body } : { issue: null };
}

export function LeadDiagSection({ lead, onDone }: LeadDiagSectionProps) {
  const id = useId();
  const [adding, setAdding] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [err, setErr] = useState<string | null>(null);
  // 레벨 낱말은 이력 응답에 실려 온다 — 적거나 이력을 볼 때만 부른다
  const diag = useLeadDiag(lead.id, adding || showHistory);
  const books = useBooks(adding);
  const write = useAddLeadDiag();
  const latest = lead.latestDiag ?? null;
  const pending = write.isPending;
  const built = build(draft);
  const canSubmit = 'body' in built && !pending;

  const set = (patch: Partial<Draft>) => { setDraft((d) => ({ ...d, ...patch })); setErr(null); };
  /** 지난 줄을 채워 두고 연다 — 바뀐 칸만 고치면 새 줄이 된다(지난 줄은 그대로 · 메모는 줄마다 새로) */
  const open = () => {
    setDraft(latest ? {
      english: text(latest.english), math: text(latest.math), interview: text(latest.interview),
      takenOn: text(latest.takenOn), level: text(latest.level), bookId: text(latest.bookId), note: '',
    } : EMPTY);
    setErr(null); setAdding(true);
  };
  const submit = () => {
    if (!('body' in built) || pending) return;
    write.mutate({ id: lead.id, ...built.body }, {
      onSuccess: (list) => { setAdding(false); setDraft(EMPTY); onDone?.(list); },
      onError: (e) => setErr(apiMessage(e)),
    });
  };

  return (
    <section aria-label="진단 점수" className="rounded-lg border border-line bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="text-[12px] font-bold text-fg">진단 점수</span>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="ghost" aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? '이력 닫기' : '이력 보기'}
          </Button>
          {!adding ? <Button type="button" size="sm" variant="secondary" onClick={open}>+ 점수 기록</Button> : null}
        </div>
      </div>

      {latest ? (
        <dl className="grid grid-cols-3 gap-x-3 gap-y-1.5 px-3 py-2 text-[12px]">
          {FIELDS.map((f) => (
            <div key={f.key}><dt className="text-[10.5px] text-fg-subtle">{f.label}</dt><dd className="font-bold text-fg">{text(latest[f.key]) || '—'}</dd></div>
          ))}
          <div><dt className="text-[10.5px] text-fg-subtle">레벨</dt><dd className="text-fg">{latest.levelLabel ?? '아직 고르지 않음'}</dd></div>
          <div className="col-span-2"><dt className="text-[10.5px] text-fg-subtle">교재</dt><dd className="text-fg">{latest.bookTitle ?? '아직 고르지 않음'}</dd></div>
          <div className="col-span-3 text-[11px] text-fg-subtle">
            {latest.takenOn ? `본 날 ${latest.takenOn} · ` : ''}{latest.byName ?? '—'} 기록{latest.note ? ` · ${latest.note}` : ''}
          </div>
        </dl>
      ) : (
        <p className="px-3 py-2 text-[12px] text-fg-subtle">아직 적은 진단 점수가 없습니다.</p>
      )}
      {/* 사용자에게 규칙을 한 줄로 — 자동으로 정해지는 것은 없다 (DQ1) */}
      <p className="border-t border-line px-3 py-1.5 text-[11px] text-fg-subtle">레벨과 교재는 담당자가 고릅니다 — 점수로 자동 판정하거나 배치하지 않습니다.</p>

      {adding ? (
        <div className="flex flex-col gap-2 border-t border-line bg-inset px-3 py-2">
          <div className="grid grid-cols-4 gap-2">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <Label htmlFor={`${id}-${f.key}`}>{f.label}</Label>
                <Input id={`${id}-${f.key}`} type="number" inputMode="numeric" min={0} step={1} value={draft[f.key]} disabled={pending}
                  onChange={(e) => set({ [f.key]: e.target.value } as Partial<Draft>)} />
              </div>
            ))}
            <div>
              <Label htmlFor={`${id}-on`}>본 날 (선택)</Label>
              <Input id={`${id}-on`} type="date" value={draft.takenOn} disabled={pending} onChange={(e) => set({ takenOn: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`${id}-level`} hint="담당자가 고릅니다">레벨</Label>
              <Select id={`${id}-level`} value={draft.level} disabled={pending} onChange={(e) => set({ level: e.target.value })}>
                <option value="">고르지 않음</option>
                {(diag.data?.levels ?? []).map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor={`${id}-book`} hint="담당자가 고릅니다">교재</Label>
              <Select id={`${id}-book`} value={draft.bookId} disabled={pending} onChange={(e) => set({ bookId: e.target.value })}>
                <option value="">고르지 않음</option>
                {(books.data?.items ?? []).map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor={`${id}-note`}>메모 (선택)</Label>
            <Textarea id={`${id}-note`} rows={2} maxLength={500} className="min-h-[44px]" value={draft.note} disabled={pending} onChange={(e) => set({ note: e.target.value })} />
          </div>
          {latest ? <p className="text-[11px] text-fg-subtle">지난 기록을 채워 두었습니다 — 바뀐 칸만 고치면 새 줄로 남고 지난 줄은 그대로입니다.</p> : null}
          {err ? <Banner tone="danger">{err}</Banner> : 'issue' in built && built.issue ? <p className="text-[11px] text-red">{built.issue}</p> : null}
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={submit} disabled={!canSubmit} title={!canSubmit && !pending ? '점수·레벨·교재 중 하나는 적어야 합니다' : undefined}>
              {pending ? '적는 중…' : '기록'}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { setAdding(false); setErr(null); }}>취소</Button>
          </div>
        </div>
      ) : null}

      {showHistory ? (
        <div className="border-t border-line">
          {diag.isPending ? <p className="px-3 py-2 text-[12px] text-fg-subtle">불러오는 중…</p>
            : diag.isError ? <Banner tone="danger" className="m-2">{apiMessage(diag.error)}</Banner>
            : (diag.data?.items ?? []).length === 0 ? <p className="px-3 py-2 text-[12px] text-fg-subtle">이력이 없습니다.</p>
            : (
              <ul aria-label="진단 이력" className="divide-y divide-line">
                {(diag.data?.items ?? []).map((d) => (
                  <li key={d.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-1.5 text-[12px]">
                    <b className="text-fg">{diagScoresLabel(d)}</b>
                    <span className="text-fg-2">{d.levelLabel ?? '레벨 없음'} · {d.bookTitle ?? '교재 없음'}</span>
                    {d.takenOn ? <span className="text-fg-subtle">본 날 {d.takenOn}</span> : null}
                    <span className="ml-auto text-[11px] text-fg-subtle">{d.byName ?? '—'} · {d.at.replace('T', ' ').slice(5, 16)}</span>
                  </li>
                ))}
              </ul>
            )}
        </div>
      ) : null}
    </section>
  );
}
