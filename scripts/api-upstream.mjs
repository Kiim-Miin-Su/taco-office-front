/** @file-guide
 * 목적: api-upstream.mjs — same-origin API proxy의 upstream 주소를 fail-closed로 검증한다.
 * 책임/재사용: next.config.mjs가 개발 기본값, 운영 필수값, 자기 자신을 향하는 재귀 proxy 방지를 한 곳에서 판정한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function hostOf(raw) {
  if (!raw) return null;
  const withProtocol = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withProtocol).host;
  } catch {
    return null;
  }
}

function originHostOf(raw) {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    return parsed.host;
  } catch {
    return null;
  }
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
export function resolveApiUpstream(env = process.env) {
  const explicit = env.TACO_API_UPSTREAM ?? env.NEXT_PUBLIC_API_BASE;
  const production = env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production';
  if (!explicit?.trim() && production) {
    throw new Error('운영 빌드에는 TACO_API_UPSTREAM이 필요합니다. localhost로 자동 대체하지 않습니다.');
  }

  const raw = (explicit?.trim() || 'http://localhost:3001/api/v1').replace(/\/$/, '');
  let upstream;
  try {
    upstream = new URL(raw);
  } catch {
    throw new Error('TACO_API_UPSTREAM은 http(s) absolute URL이어야 합니다. 예: https://api.example.com/api/v1');
  }
  if (!['http:', 'https:'].includes(upstream.protocol)) {
    throw new Error('TACO_API_UPSTREAM은 http(s) absolute URL이어야 합니다. 예: https://api.example.com/api/v1');
  }

  const explicitFront = env.TACO_FRONT_ORIGIN?.trim();
  if (production && !explicitFront) {
    throw new Error('운영 빌드에는 TACO_FRONT_ORIGIN이 필요합니다. 커스텀 도메인까지 포함한 front origin을 정확히 적으세요.');
  }
  if (explicitFront && originHostOf(explicitFront) === null) {
    throw new Error('TACO_FRONT_ORIGIN은 path·query·userinfo 없는 http(s) absolute origin이어야 합니다.');
  }

  const frontHosts = new Set([
    originHostOf(explicitFront),
    hostOf(env.VERCEL_URL),
    hostOf(env.VERCEL_PROJECT_PRODUCTION_URL),
    hostOf(env.NEXT_PUBLIC_APP_URL),
  ].filter(Boolean));
  const frontPort = env.PORT || '3000';
  if (LOCAL_HOSTS.has(upstream.hostname)) {
    frontHosts.add(`localhost:${frontPort}`);
    frontHosts.add(`127.0.0.1:${frontPort}`);
    frontHosts.add(`[::1]:${frontPort}`);
  }
  if (frontHosts.has(upstream.host)) {
    throw new Error(`TACO_API_UPSTREAM이 front 자신(${upstream.host})을 가리킵니다. 별도 back origin을 지정하세요.`);
  }

  return raw;
}
