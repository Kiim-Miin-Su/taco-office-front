/** @file-guide
 * 목적: BOC-04D-03c 유형별 기본 항목을 version 단위로 설정한다.
 * 책임/재사용: 생성 OpenAPI 타입과 공용 Field/Button만 사용하며 과거 계약 항목을 수정하지 않는다.
 * 검증/작업 지침: docs/sprint/TBO-55/features/BOC-04D3C-CONSULTING-WRITER-2026-10-08.md
 */
'use client';
import { useEffect, useState } from 'react';
import { apiMessage } from '@/api/client';
import { useConsultingTemplates, useWriteConsultingTemplate } from '@/api/queries';
import type { ConsultingTemplateWrite } from '@/api/types';
import { Banner, Button, Checkbox, Input, QueryState, Select } from '@/components/ui';
import { useRequestKey } from '@/lib/request-key';

type DraftItem = ConsultingTemplateWrite['items'][number];

export function ConsultingTemplateSettings({ onDone }: { onDone?: () => void }) {
  const query = useConsultingTemplates();
  const write = useWriteConsultingTemplate();
  const requestKey = useRequestKey();
  const [type, setType] = useState('admissions');
  const selected = query.data?.items.find((item) => item.consType === type);
  const [items, setItems] = useState<DraftItem[]>([]);
  useEffect(() => setItems(selected?.items.map(({ label, required }) => ({ label, required })) ?? []), [selected?.consType, selected?.version]);
  const save = () => {
    const clean = items.map((item) => ({ label: item.label.trim(), required: item.required })).filter((item) => item.label);
    if (clean.length === 0) return;
    const body = { expectedVersion: selected?.version ?? 0, items: clean };
    write.mutate({ consType: type, ...body, requestKey: requestKey.keyFor(body) }, {
      onSuccess: () => { requestKey.reset(); onDone?.(); },
    });
  };
  return <QueryState query={query}>
    {(data) => <div className="space-y-4">
      <div><label className="mb-1 block text-[12px] font-bold" htmlFor="consulting-template-type">컨설팅 유형</label>
        <Select id="consulting-template-type" value={type} onChange={(event) => setType(event.currentTarget.value)}>
          {data.items.map((item) => <option key={item.consType} value={item.consType}>{item.label} · {item.version == null ? '미설정' : `v${item.version}`}</option>)}
        </Select></div>
      <p className="text-[12px] text-fg-subtle">저장하면 새 버전이 생깁니다. 이미 시작한 컨설팅의 항목은 바뀌지 않습니다.</p>
      <div className="space-y-2">
        {items.map((item, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
          <Input aria-label={`기본 항목 ${index + 1}`} value={item.label} maxLength={80} onChange={(event) => {
            const label = event.currentTarget.value;
            setItems((rows) => rows.map((row, i) => i === index ? { ...row, label } : row));
          }} />
          <Checkbox label="필수" checked={item.required} onChange={(event) => {
            const required = event.currentTarget.checked;
            setItems((rows) => rows.map((row, i) => i === index ? { ...row, required } : row));
          }} />
          <Button size="sm" onClick={() => setItems((rows) => rows.filter((_row, i) => i !== index))}>빼기</Button>
        </div>)}
      </div>
      <div className="flex justify-between gap-2"><Button onClick={() => setItems((rows) => [...rows, { label: '', required: true }])}>+ 항목</Button>
        <Button variant="primary" disabled={write.isPending || items.every((item) => !item.label.trim())} onClick={save}>{write.isPending ? '저장 중…' : '새 버전 저장'}</Button></div>
      {write.isError ? <Banner tone="danger">{apiMessage(write.error)}</Banner> : null}
    </div>}
  </QueryState>;
}
