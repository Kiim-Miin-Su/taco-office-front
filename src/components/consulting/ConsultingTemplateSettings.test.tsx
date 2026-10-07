/** @file-guide
 * 목적: BOC-04D-03c 기본 항목 설정이 활성 version을 읽어 새 version writer 계약만 보내는지 검증한다.
 * 책임/재사용: 실제 설정 컴포넌트를 렌더하고 query/mutation hook만 대역한다.
 */
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsultingTemplateSettings } from './ConsultingTemplateSettings';

const mutate = vi.fn();
vi.mock('@/api/queries', () => ({
  useConsultingTemplates: () => ({
    data: { items: [
      { consType: 'admissions', label: '국제학교 지원', version: 1, enabled: true, blockedReason: null,
        items: [{ seq: 1, label: '지원서 작성', required: true }] },
      { consType: 'essay', label: '에세이 지도', version: null, enabled: false,
        blockedReason: '기본 항목 미설정', items: [] },
    ] },
    isPending: false, isError: false, error: null, refetch: vi.fn(),
  }),
  useWriteConsultingTemplate: () => ({ mutate, isPending: false, isError: false, error: null }),
}));

describe('ConsultingTemplateSettings', () => {
  beforeEach(() => mutate.mockReset());

  it('미설정 유형의 첫 저장은 expectedVersion=0과 requestKey, 순서·필수값을 보낸다', () => {
    const view = render(<ConsultingTemplateSettings />);
    fireEvent.change(view.getByLabelText('컨설팅 유형'), { target: { value: 'essay' } });
    fireEvent.click(view.getByRole('button', { name: '+ 항목' }));
    fireEvent.change(view.getByLabelText('기본 항목 1'), { target: { value: ' 에세이 초안 ' } });
    fireEvent.click(view.getByRole('button', { name: '새 버전 저장' }));
    expect(mutate).toHaveBeenCalledWith({
      consType: 'essay', expectedVersion: 0, requestKey: expect.any(String),
      items: [{ label: '에세이 초안', required: true }],
    }, expect.any(Object));
  });
});
