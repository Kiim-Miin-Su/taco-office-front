/** @file-guide
 * 목적: ShellSearch.test.tsx (test)
 * 책임/재사용: 머리줄 「검색 ⌘K」가 보는 사람이 이미 볼 수 있는 것(권한 판정 · /meta 투영)만 찾는지와 이동을 검증한다. 메뉴·권한 규칙을 테스트에 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Me, Meta } from '@/api/types';
import { ShellSearch, shellSearchResults } from './ShellSearch';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const students = [
  { id: 5, name: '강태윤', grade: 'G10', school: 'SIS' },
  { id: 6, name: '강하늘', grade: null, school: null },
] as Meta['students'];
vi.mock('@/api/queries', () => ({ useMeta: (enabled: boolean) => ({ data: enabled ? { students } : undefined }) }));

const ceo: Me = {
  id: 1, name: '김민선', role: 'ceo', roleLabel: '대표', title: '대표', canAdminPage: true, canCrudAll: true,
  canMoney: true, canWage: true, canApprove: true, canSeeProfit: true, canHide: true, canCrudAttendance: true, canGpaPack: true,
};
const manager: Me = { ...ceo, role: 'manager', roleLabel: '매니저', title: null, canMoney: false };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('머리줄 검색 — 이미 볼 수 있는 것만 (g1 S1 · D-R44)', () => {
  it('화면은 권한 판정을 지난 것만 — 금액 권한이 없으면 회계가 나오지 않는다', () => {
    expect(shellSearchResults('회계', ceo, students).map((h) => h.href)).toEqual(['/accounting']);
    expect(shellSearchResults('회계', manager, students)).toEqual([]);
    // 강사 전용 화면(개인용)은 관리 화면 사용자에게 나오지 않는다
    expect(shellSearchResults('불가 시간', ceo, students)).toEqual([]);
  });

  it('학생은 서버가 실어 준 목록 안에서만 — 없으면(강사 투영 = 빈 목록) 0건', () => {
    const hits = shellSearchResults('강', ceo, students);
    expect(hits.map((h) => [h.group, h.label, h.href, h.sub])).toEqual([
      ['학생', '강태윤', '/schedule?studentId=5', 'G10 · SIS'],
      ['학생', '강하늘', '/schedule?studentId=6', undefined],
    ]);
    expect(shellSearchResults('강', ceo, [])).toEqual([]);
    expect(shellSearchResults('   ', ceo, students)).toEqual([]);
  });

  it('창에서 고르면 닫고 그 자리로 간다', async () => {
    const onClose = vi.fn();
    const view = render(<ShellSearch open onClose={onClose} me={ceo} />);
    const dialog = view.getByRole('dialog', { name: '검색' });
    fireEvent.change(within(dialog).getByRole('searchbox', { name: '검색어' }), { target: { value: '태윤' } });
    const hit = await within(dialog).findByRole('button', { name: /강태윤/ });
    fireEvent.click(hit);
    expect(onClose).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/schedule?studentId=5');
  });
});
