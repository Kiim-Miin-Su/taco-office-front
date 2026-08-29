/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // API 는 별도 레포·별도 Vercel 프로젝트다 (D-R42). 여기서 프록시하지 않는다.
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
};
