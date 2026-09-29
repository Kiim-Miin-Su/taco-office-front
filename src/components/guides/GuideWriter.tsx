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
 */
'use client';
import { useState } from 'react';
import { Banner, Button, Checkbox, Chip, Label, Panel, Select, Textarea } from '@/components/ui';
import { apiMessage } from '@/api/client';
import { useCopyGuide, useGuideTemplates, useWriteGuideBody } from '@/api/queries';
import type { Guide, GuideCopyResult } from '@/api/types';

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
