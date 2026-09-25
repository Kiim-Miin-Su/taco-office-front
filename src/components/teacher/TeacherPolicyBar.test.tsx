/** @file-guide
 * 목적: TeacherPolicyBar.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import { TEACHER_POLICIES_FIXTURE } from './teacher-policies.fixture';
import { TeacherPolicyBar } from './TeacherPolicyBar';

const meta = vi.hoisted(() => ({ policies: [] as unknown[], enabled: [] as boolean[] }));
vi.mock('@/api/queries', () => ({
  useMeta: (enabled: boolean) => {
    meta.enabled.push(enabled);
    return { data: enabled ? { teacherPolicies: meta.policies } : undefined };
  },
}));

const me = (canAdminPage: boolean) => ({ id: 5, name: '강사', canAdminPage, canCrudAll: canAdminPage }) as unknown as Me;

describe('TeacherPolicyBar — 강사 화면 최상단 정책 띠 (대표 결정 2026-09-25)', () => {
  afterEach(() => { cleanup(); useSession.setState({ me: null, ready: false }); meta.enabled.length = 0; meta.policies = TEACHER_POLICIES_FIXTURE; });
  meta.policies = TEACHER_POLICIES_FIXTURE;

  it('강사에게는 그 화면의 서버 낱말(제목·줄)을 그대로 그린다', () => {
    useSession.setState({ me: me(false), ready: true });
    const view = render(<TeacherPolicyBar screen="suggestions" />);
    const note = view.getByRole('note', { name: '건의 규칙' });
    expect([...note.querySelectorAll('li')].map((li) => li.textContent)).toEqual(TEACHER_POLICIES_FIXTURE[3].lines);
  });

  it('관리 화면 로그인에는 그리지 않고 코드표도 부르지 않는다', () => {
    useSession.setState({ me: me(true), ready: true });
    expect(render(<TeacherPolicyBar screen="history" />).container.textContent).toBe('');
    expect(meta.enabled.every((on) => on === false)).toBe(true);
  });

  it('서버가 그 화면의 정책을 주지 않으면 지어내지 않는다', () => {
    useSession.setState({ me: me(false), ready: true });
    meta.policies = TEACHER_POLICIES_FIXTURE.filter((p) => p.screen !== 'guides');
    expect(render(<TeacherPolicyBar screen="guides" />).container.textContent).toBe('');
  });
});
