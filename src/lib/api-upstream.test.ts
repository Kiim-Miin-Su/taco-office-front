/** @file-guide
 * 목적: api-upstream.test.ts — 운영 API proxy가 localhost/self-origin으로 fail-open하지 않는 회귀 시험
 * 책임/재사용: scripts/api-upstream.mjs의 환경별 주소 판정을 실제 배포 환경 변수 모양으로 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { describe, expect, it } from 'vitest';
// 설정 파일과 Node가 그대로 공유하는 순수 ESM 모듈이다.
// @ts-expect-error JavaScript 설정 helper는 선언 파일 없이 JSDoc 타입을 사용한다.
import { resolveApiUpstream } from '../../scripts/api-upstream.mjs';

describe('same-origin API upstream', () => {
  it('개발에서는 명시 값이 없을 때에만 로컬 back 기본값을 쓴다', () => {
    expect(resolveApiUpstream({ NODE_ENV: 'development' })).toBe('http://localhost:3001/api/v1');
  });

  it('운영은 upstream 누락을 localhost로 숨기지 않는다', () => {
    expect(() => resolveApiUpstream({ NODE_ENV: 'production' })).toThrow('TACO_API_UPSTREAM');
  });

  it('front 자신을 upstream으로 지정한 재귀 proxy를 거절한다', () => {
    expect(() => resolveApiUpstream({
      NODE_ENV: 'production',
      TACO_API_UPSTREAM: 'https://front.example.com/api/v1',
      TACO_FRONT_ORIGIN: 'https://front.example.com',
      VERCEL_PROJECT_PRODUCTION_URL: 'front.example.com',
    })).toThrow('front 자신');
    expect(() => resolveApiUpstream({
      NODE_ENV: 'production',
      TACO_API_UPSTREAM: 'http://127.0.0.1:3102/api/v1',
      TACO_FRONT_ORIGIN: 'http://127.0.0.1:3102',
      PORT: '3102',
    })).toThrow('front 자신');
  });

  it('별도 back origin은 끝 slash만 정규화해 보존한다', () => {
    expect(resolveApiUpstream({
      NODE_ENV: 'production',
      TACO_API_UPSTREAM: 'https://back.example.com/api/v1/',
      TACO_FRONT_ORIGIN: 'https://front.example.com',
      VERCEL_PROJECT_PRODUCTION_URL: 'front.example.com',
    })).toBe('https://back.example.com/api/v1');
  });

  it('운영은 커스텀 front origin을 명시하고 그 origin을 upstream으로 돌리지 못한다', () => {
    expect(() => resolveApiUpstream({
      NODE_ENV: 'production',
      TACO_API_UPSTREAM: 'https://app.tn.kr/api/v1',
      TACO_FRONT_ORIGIN: 'https://app.tn.kr',
      VERCEL_PROJECT_PRODUCTION_URL: 'front.vercel.app',
    })).toThrow('front 자신');
    expect(() => resolveApiUpstream({
      NODE_ENV: 'production',
      TACO_API_UPSTREAM: 'https://back.example.com/api/v1',
    })).toThrow('TACO_FRONT_ORIGIN');
    expect(() => resolveApiUpstream({
      NODE_ENV: 'production',
      TACO_API_UPSTREAM: 'https://back.example.com/api/v1',
      TACO_FRONT_ORIGIN: 'https://front.example.com/not-an-origin',
    })).toThrow('absolute origin');
  });
});
