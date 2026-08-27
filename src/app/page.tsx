/**
 * 골격 확인용 첫 화면. 화면은 트랙 B 에서 명세서 70컷을 그대로 만든다 (TBO-22 §0).
 * 여기서 확인하는 것 하나 — **토큰이 Tailwind 로 이어졌는가.**
 */
import { KIND_KEYS, SUB_KEYS } from '@/lib/tokens';

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-pad">
      <h1 className="text-2xl font-bold text-fg">TACO ERP</h1>
      <p className="mt-2 text-sm text-fg-subtle">
        골격만 세워 둔 상태입니다. 화면은 개발 명세서 v2 의 70컷을 트랙 B 에서 만듭니다.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-bold text-fg-2">수업 종류 {KIND_KEYS.length}종</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {KIND_KEYS.map((k) => (
            <span
              key={k}
              className="rounded-sm px-2 py-1 text-xs font-bold text-card"
              style={{ background: `var(--kind-${k})` }}
            >
              {k}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-bold text-fg-2">과목 {SUB_KEYS.length}종</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {SUB_KEYS.map((k) => (
            <span
              key={k}
              className="rounded-sm px-2 py-1 text-xs font-bold text-card"
              style={{ background: `var(--sub-${k})` }}
            >
              {k}
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}
