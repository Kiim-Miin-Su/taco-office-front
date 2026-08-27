/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // API 는 별도 레포·별도 Vercel 프로젝트다 (D-R42). 여기서 프록시하지 않는다.
  env: { NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE },
};
