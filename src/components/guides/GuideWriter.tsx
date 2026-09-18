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
 */
'use client';
import { useState } from 'react';
import { Banner, Button, Chip, Label, Panel, Select, Textarea } from '@/components/ui';
import { apiMessage } from '@/api/client';
import { useCopyGuide, useGuideTemplates, useWriteGuideBody } from '@/api/queries';
import type { Guide, GuideCopyResult } from '@/api/types';

export function GuideWriter({ guide, onClose }: { guide: Guide; onClose: () => void }) {
  const tpls = useGuideTemplates();
  const write = useWriteGuideBody();
  const copy = useCopyGuide();
  // 쓴 말이 있으면 그것이 정본이고, 없으면 서버가 만든 자동 채움으로 연다 (F-60)
  const [body, setBody] = useState(guide.body ?? guide.autoFill?.body ?? '');
  const [pick, setPick] = useState('');
  const [copied, setCopied] = useState<GuideCopyResult | null>(null);
  const facts = guide.autoFill?.facts ?? [];
  const canCopy = guide.siblingCount > 0;

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

      <Label htmlFor="g-body">안내 본문</Label>
      <Textarea id="g-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />

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
            disabled={write.isPending || copy.isPending || body.trim() === ''}
            title={`같은 수업 같은 날의 다른 학생 ${guide.siblingCount}명에게 옮깁니다`}
            onClick={() =>
              write.mutate({ id: guide.id, body }, {
                onSuccess: () => copy.mutate({ id: guide.id }, { onSuccess: setCopied }),
              })
            }
          >
            작성하고 나머지 학생에게 복사
          </Button>
        ) : null}
        <Button
          disabled={write.isPending || body.trim() === ''}
          onClick={() => write.mutate({ id: guide.id, body }, { onSuccess: onClose })}
        >
          작성
        </Button>
      </div>
    </Panel>
  );
}
