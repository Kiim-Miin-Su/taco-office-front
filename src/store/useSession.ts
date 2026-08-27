/**
 * 전역에 올리는 것은 **세션 하나**다 (결정 §4-5 · D3).
 * 화면 상태·분할 뷰·리포트 초안은 useReducer 로 지역에 둔다.
 */
import { create } from 'zustand';
import type { Me } from '@/api/types';
import { setAccessToken } from '@/api/client';

interface SessionState {
  me: Me | null;
  ready: boolean;
  signIn: (accessToken: string, me: Me) => void;
  signOut: () => void;
  setMe: (me: Me | null) => void;
}

export const useSession = create<SessionState>((set) => ({
  me: null,
  ready: false,
  signIn: (accessToken, me) => {
    setAccessToken(accessToken);
    set({ me, ready: true });
  },
  signOut: () => {
    setAccessToken(null);
    set({ me: null, ready: true });
  },
  setMe: (me) => set({ me, ready: true }),
}));

/**
 * 권한은 **서버가 내려준 플래그를 읽기만** 한다 (D-R39).
 * `me.role === 'ceo'` 같은 비교를 화면에 적으면 판정이 두 벌이 된다 — eslint 가 막는다.
 */
export const useCan = (name: keyof Me): boolean => {
  const me = useSession((s) => s.me);
  return Boolean(me && me[name]);
};
