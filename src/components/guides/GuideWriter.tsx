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
 */
'use client';
import { useState } from 'react';
import { Banner, Button, Label, Panel, Select, Textarea } from '@/components/ui';
import { apiMessage } from '@/api/client';
import { useGuideTemplates, useWriteGuideBody } from '@/api/queries';
import type { Guide } from '@/api/types';

export function GuideWriter({ guide, onClose }: { guide: Guide; onClose: () => void }) {
  const tpls = useGuideTemplates();
  const write = useWriteGuideBody();
  const [body, setBody] = useState(guide.body ?? '');
  const [pick, setPick] = useState('');

  return (
    <Panel
      className="mb-4"
      title={`안내 작성 — ${guide.studentName ?? ''}`}
      sub="쓰면 보낼 준비가 됩니다. 이미 보낸 안내는 고칠 수 없습니다"
    >
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

      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>취소</Button>
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
