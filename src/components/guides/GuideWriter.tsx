/** @file-guide
 * 목적: GuideWriter.tsx — GuideWriter (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §43 「안내 작성」.
 *
 * **상태 낱말을 보내지 않는다.** 화면은 「썼다」만 말하고, 그 결과 어느 상태가 되는지는
 * 서버가 정한다 (D-R18) — `'ready'` 를 화면이 적어 보내면 낱말이 두 곳에 살게 된다.
 *
 * 문구 틀은 **복사해** 온다. 고른 틀의 본문을 칸에 넣을 뿐이고 어느 틀에서 왔는지는 남기지 않는다 —
 * 나중에 틀이 바뀌어도 보낸 말이 달라지면 안 되기 때문이다(`guide` 에 `gtpl_id` 가 없는 이유).
 *
 * **자동 채움으로 열린다** (C98 · F-60). 일곱 칸(학생·학년·강사·과목·형태·시작일·교재)은 서버가
 * 지금 사실로 만들어 `guide.autoFill` 에 실어 보내고, 화면은 그 문자열로 칸을 채울 뿐이다.
 * 사람이 지우면 지워진다 — 서버 값을 다시 밀어 넣지 않는다. 못 채운 칸의 문장도 서버 것이다 (D-R18).
 *
 * **같은 반 학생이 함께 골라져 있다** (PDF F-60 · all160 2026-09-30). 형제 목록 · 옮길 수 있는가 · 못 옮기는 까닭은
 * 서버(`guide.siblings`)가 복사와 같은 규칙으로 준다. 화면은 고르기만 하고 「나머지 학생에게 복사」가 고른 학생에게만 옮긴다.
 *
 * **그룹이면 인원별 단가 · 학생별 진단 탭** (PDF F-60 · F-61 · 부분 구현 2026-09-30). 단가는 §79 카드와 같은 서버 계산을 읽고
 * (금액은 돈 권한만), 진단은 반 학생 수만큼 탭을 세워 적는다 — 사용자 결정 「탭에서 관리자도 입력」(C61 넓힘).
 */
'use client';
import { useState } from 'react';
import { Banner, Button, Checkbox, Chip, Label, Panel, Select, Textarea } from '@/components/ui';
import { apiMessage } from '@/api/client';
import { useCopyGuide, useGuideClassDiagnostics, useGuideTemplates, useLessonTracking, useWriteGuideBody, useWriteGuideClassDiagnostics } from '@/api/queries';
import type { Guide, GuideCopyResult } from '@/api/types';
import { won } from '@/lib/money';

type DiagDraft = { levelSummary: string; strengths: string; weaknesses: string; curriculum: string };
const DIAG_FIELDS: Array<[keyof DiagDraft, string]> = [['levelSummary', '현재 수준'], ['strengths', '강점'], ['weaknesses', '약점'], ['curriculum', '권장 커리큘럼']];

export function GuideWriter({ guide, onClose }: { guide: Guide; onClose: () => void }) {
  const tpls = useGuideTemplates();
  const write = useWriteGuideBody();
  const copy = useCopyGuide();
  // 쓴 말이 있으면 그것이 정본이고, 없으면 서버가 만든 자동 채움으로 연다 (F-60)
  const [body, setBody] = useState(guide.body ?? guide.autoFill?.body ?? '');
  // §44-3 두 상자 — 저장된 값으로 연다. 바꾼 칸만 보낸다: 안 보낸 칸은 서버가 그대로 두므로 본문만 고친 사람이 남의 메모를 덮지 않는다
  const [direction, setDirection] = useState(guide.direction ?? '');
  const [adminNote, setAdminNote] = useState(guide.adminNote ?? '');
  const [pick, setPick] = useState('');
  const [copied, setCopied] = useState<GuideCopyResult | null>(null);
  const facts = guide.autoFill?.facts ?? [];
  const siblings = guide.siblings ?? [];
  const canCopy = guide.siblingCount > 0;
  // 옮길 수 있는 형제는 처음부터 골라 둔다 — 「같은 반 학생이 함께 선택됨」
  const [picked, setPicked] = useState<number[]>(() => siblings.filter((x) => x.copyable).map((x) => x.id));
  const togglePick = (id: number) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  /*
   * F-60 「그룹이면 인원별 단가가 계산되어 표시」 — §79 수강 학생 카드와 같은 서버 계산(lib/rules.rosterPricing)을 읽는다.
   * 금액은 돈 권한만 받는다(서버가 null 로 가린다 · D-R39). 그룹이 아니면 묻지 않는다.
   */
  const isGroup = siblings.length > 0;
  const tracking = useLessonTracking(guide.serId ?? null, guide.eventOn ?? null, isGroup);
  const pricing = tracking.data && typeof tracking.data.priced === 'boolean' ? tracking.data : null;
  /*
   * F-60 「진단 입력 탭이 인원수만큼」 · F-61 진단 복사 — 반 학생마다 탭 하나. 최신 진단으로 채워 열고, 첫 탭(또는 보고 있는 탭)을
   * 나머지에 복사한 뒤 각자 고쳐 한 번에 저장한다. 사용자 결정 2026-09-30 「탭에서 관리자도 입력」(C61 넓힘) — 쓰기는 서버가 반을 다시 본다.
   */
  const classDiag = useGuideClassDiagnostics(guide.id);
  const writeDiag = useWriteGuideClassDiagnostics();
  const members = Array.isArray(classDiag.data?.items) ? classDiag.data!.items : [];
  const [tab, setTab] = useState<number | null>(null);
  const [diags, setDiags] = useState<Record<number, DiagDraft>>({});
  const [diagSaved, setDiagSaved] = useState<string | null>(null);
  const baseOf = (studentId: number): DiagDraft => {
    const d = members.find((m) => m.studentId === studentId)?.diagnostic;
    return { levelSummary: d?.levelSummary ?? '', strengths: d?.strengths ?? '', weaknesses: d?.weaknesses ?? '', curriculum: d?.curriculum ?? '' };
  };
  const draftOf = (studentId: number): DiagDraft => diags[studentId] ?? baseOf(studentId);
  const current = tab ?? members[0]?.studentId ?? null;
  const setField = (studentId: number, key: keyof DiagDraft, value: string) =>
    setDiags((all) => ({ ...all, [studentId]: { ...draftOf(studentId), [key]: value } }));
  const copyDiagToOthers = () => {
    if (current === null) return;
    const src = draftOf(current);
    setDiags((all) => Object.fromEntries([...Object.entries(all), ...members.map((m) => [m.studentId, { ...src }] as const)]));
  };
  // 바뀐 탭만 보낸다 — 현재 수준이 빈 탭은 보내지 않는다(서버도 409 로 막는다)
  const dirty = members.filter((m) => {
    const d = draftOf(m.studentId);
    return d.levelSummary.trim() !== '' && JSON.stringify(d) !== JSON.stringify(baseOf(m.studentId));
  });
  const payload = {
    id: guide.id, body,
    ...(direction !== (guide.direction ?? '') ? { direction } : {}),
    ...(adminNote !== (guide.adminNote ?? '') ? { adminNote } : {}),
  };

  return (
    <Panel
      className="mb-4"
      title={`안내 작성 — ${guide.studentName ?? ''}`}
      sub="쓰면 보낼 준비가 됩니다. 이미 보낸 안내는 고칠 수 없습니다"
    >
      {facts.length > 0 ? (
        <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="자동으로 채운 것">
          {facts.map((f) => (
            <li key={f.key}>
              <Chip tone={f.filled ? 'info' : 'warning'}>
                {f.label} · {f.value ?? '아직'}
              </Chip>
            </li>
          ))}
        </ul>
      ) : null}

      {isGroup && pricing ? (
        <p aria-label="인원별 단가" className="mb-3 text-[12px] text-fg">
          <b>인원별 단가</b>{' '}
          {pricing.priced
            ? pricing.unitPrice !== null && pricing.unitPrice !== undefined
              ? `${pricing.count}명 · 1인 ${won(pricing.unitPrice)} · 수업당 ${won(pricing.total ?? null)}`
              : `${pricing.count}명 기준으로 계산됨 · 금액은 회계 권한이 있어야 보입니다`
            : `${pricing.count}명 · 이 수업의 단가표가 없어 계산하지 않았습니다`}
        </p>
      ) : null}

      <div className="mb-3">
        <Label htmlFor="g-tpl">문구 틀에서 가져오기</Label>
        <Select
          id="g-tpl"
          value={pick}
          onChange={(e) => {
            const id = e.target.value;
            setPick(id);
            const t = (tpls.data ?? []).find((x) => String(x.id) === id);
            // 본문만 복사한다 — 어느 틀에서 왔는지는 남기지 않는다
            if (t) setBody(t.body);
          }}
        >
          <option value="">고르지 않음</option>
          {(tpls.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </div>

      {siblings.length > 0 ? (
        <fieldset className="mb-3 rounded-lg border border-line px-3 py-2" aria-label="같은 반 학생">
          <legend className="px-1 text-[12px] font-bold text-fg">
            같은 반 학생 — 함께 보냅니다 · {picked.length}명 골라짐
          </legend>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
            {siblings.map((x) => (
              <li key={x.id} className="flex items-center gap-1.5">
                <Checkbox
                  label={x.studentName ?? '이름 없음'}
                  checked={picked.includes(x.id)}
                  disabled={!x.copyable || write.isPending || copy.isPending}
                  onChange={() => togglePick(x.id)}
                />
                {x.skipReason ? <span className="text-[11px] text-fg-subtle">{x.skipReason}</span> : null}
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}

      <Label htmlFor="g-body">안내 본문</Label>
      <Textarea id="g-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label htmlFor="g-direction">지도 방향</Label>
          <Textarea id="g-direction" rows={3} maxLength={4000} value={direction} onChange={(e) => setDirection(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="g-admin-note">관리자 코멘트 · 강사만</Label>
          <Textarea id="g-admin-note" rows={3} maxLength={4000} value={adminNote} onChange={(e) => setAdminNote(e.target.value)} />
          <p className="mt-1 text-[11px] text-fg-subtle">강사에게만 보입니다. 안내 본문과 안내문 PNG에는 들어가지 않습니다.</p>
        </div>
      </div>

      {members.length > 0 ? (
        <section aria-label="학생별 진단" className="mt-3 rounded-lg border border-line px-3 py-2">
          <div role="tablist" aria-label="진단 입력 탭" className="mb-2 flex flex-wrap gap-1">
            {members.map((m) => (
              <button key={m.studentId} type="button" role="tab" aria-selected={current === m.studentId}
                className={`rounded-full border px-3 py-1 text-[12px] font-bold ${current === m.studentId ? 'border-fg bg-fg text-white' : 'border-line bg-card text-fg'}`}
                onClick={() => setTab(m.studentId)}>
                {m.studentName ?? '이름 없음'}
              </button>
            ))}
          </div>
          {members.filter((m) => m.studentId === current).map((m) => {
            const d = draftOf(m.studentId);
            const name = m.studentName ?? '이름 없음';
            return (
              <div key={m.studentId} role="tabpanel" aria-label={`${name} 진단`}>
                <p className="mb-1.5 text-[11px] text-fg-subtle">
                  {m.diagnostic ? `마지막 진단 ${m.diagnostic.createdAt.slice(0, 10)} — 고쳐 저장하면 새 진단 한 줄이 쌓입니다` : '아직 진단이 없습니다'}
                </p>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {DIAG_FIELDS.map(([key, label]) => (
                    <div key={key}>
                      <Label htmlFor={`g-diag-${m.studentId}-${key}`}>{label}</Label>
                      <Textarea id={`g-diag-${m.studentId}-${key}`} aria-label={`${name} ${label}`} rows={2} maxLength={2000}
                        value={d[key]} onChange={(e) => setField(m.studentId, key, e.target.value)} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            {diagSaved ? <span role="status" className="mr-auto text-[11px] text-green">{diagSaved}</span> : null}
            {members.length > 1 ? (
              <Button size="sm" variant="secondary" onClick={copyDiagToOthers} disabled={writeDiag.isPending}>이 진단을 나머지 학생에게 복사</Button>
            ) : null}
            <Button size="sm" disabled={dirty.length === 0 || writeDiag.isPending}
              onClick={() => writeDiag.mutate(
                { id: guide.id, items: dirty.map((m) => ({ studentId: m.studentId, ...draftOf(m.studentId) })) },
                { onSuccess: () => { setDiags({}); setDiagSaved(`${dirty.length}명의 진단을 저장했습니다`); } },
              )}>
              {`진단 저장 · ${dirty.length}명`}
            </Button>
          </div>
          {writeDiag.isError ? <Banner tone="danger" className="mt-2">{apiMessage(writeDiag.error)}</Banner> : null}
        </section>
      ) : null}

      {write.isError ? <Banner tone="danger" className="mt-3">{apiMessage(write.error)}</Banner> : null}
      {copy.isError ? <Banner tone="danger" className="mt-3">{apiMessage(copy.error)}</Banner> : null}
      {copied ? (
        <Banner tone="success" className="mt-3">
          {copied.copied.length}명에게 옮겼습니다
          {copied.copied.length > 0 ? ` — ${copied.copied.map((g) => g.studentName ?? '이름 없음').join(', ')}` : ''}
          {copied.headReplaced ? ' · 머리말은 각 학생 것으로 다시 만들었습니다' : ' · 머리말 앞자락이 달라 본문을 그대로 옮겼습니다'}
          {copied.skipped.length > 0
            ? ` · 건너뜀 ${copied.skipped.map((s) => `${s.studentName}(${s.reason})`).join(', ')}`
            : ''}
        </Banner>
      ) : null}

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>취소</Button>
        {canCopy ? (
          <Button
            variant="secondary"
            disabled={write.isPending || copy.isPending || body.trim() === '' || (siblings.length > 0 && picked.length === 0)}
            title={`같은 수업 같은 날의 다른 학생 ${siblings.length > 0 ? picked.length : guide.siblingCount}명에게 옮깁니다`}
            onClick={() =>
              write.mutate(payload, {
                onSuccess: () => copy.mutate(
                  { id: guide.id, ...(siblings.length > 0 ? { targetIds: picked } : {}) },
                  { onSuccess: setCopied },
                ),
              })
            }
          >
            작성하고 나머지 학생에게 복사
          </Button>
        ) : null}
        <Button
          disabled={write.isPending || body.trim() === ''}
          onClick={() => write.mutate(payload, { onSuccess: onClose })}
        >
          작성
        </Button>
      </div>
    </Panel>
  );
}
