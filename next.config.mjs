import { fileURLToPath } from 'node:url';

const FRONT_ROOT = fileURLToPath(new URL('.', import.meta.url));

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,

  // 홈 디렉터리의 다른 package-lock.json을 monorepo 루트로 오인하지 않게 이 앱을 tracing SSOT로 고정한다.
  outputFileTracingRoot: FRONT_ROOT,

  // API 는 별도 레포·별도 Vercel 프로젝트다 (D-R42). 여기서 프록시하지 않는다 —
  // 대신 **같은 도메인 아래**(app.tn.kr · api.tn.kr)에 두어 쿠키가 1st-party 로 실리게 한다.
  env: { NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE },

  /**
   * 빌드 산출물 위치. 기본은 .next 다.
   *
   * 소스가 **파일을 지울 수 없는** 파일 시스템(마운트 · 네트워크 드라이브)에 있으면
   * Next 가 오래된 .next 를 정리하지 못하고 「Starting…」에서 멈춘다.
   * 그럴 때만 NEXT_DIST_DIR 로 다른 곳을 준다 — 평소에는 아무것도 안 바뀐다.
   *
   * ⚠️ **상대 경로만** 준다. 절대 경로를 주면 Next 가 tsconfig 의 include 에 그 절대 경로를
   *    적어 넣고, 그 폴더가 사라지면 다음 실행이 「Starting…」에서 멈춘다. 한 번 겪었다.
   */
  distDir: process.env.NEXT_DIST_DIR ?? '.next',

  // 배포 게이트는 release.zsh 가 돈다. 빌드가 조용히 통과하게 두지 않는다 —
  // 여기서 무시하면 타입 오류가 있는 채로 운영에 올라간다.
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },

  poweredByHeader: false,

  /**
   * 보안 헤더. 관리자 백오피스이므로 기본을 조인다.
   *
   * CSP 는 아직 넣지 않는다 — Next 의 인라인 스크립트에 nonce 를 붙이는 작업이 따로 필요하고,
   * 반쯤 적용한 CSP 는 화면을 깨뜨리기만 하고 막지는 못한다. TBO-37(인증)에서 함께 한다.
   */
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        // 학생 개인정보가 보이는 화면이다 — 브라우저·프록시 캐시에 남기지 않는다
        { key: 'Cache-Control', value: 'no-store' },
      ],
    }];
  },
};
