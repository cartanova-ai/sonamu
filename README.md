# 🌲Sonamu — TypeScript Fullstack API Framework

- [Sonamu Documentation (test-docs, outdated)](https://rurruur.github.io/test-docs/)

Sonamu는 Node.js/TypeScript 기반의 풀스택 프레임워크입니다.

Sonamu는 E2E Type-safety, 효율적인 서브셋 쿼리, 스캐폴딩을 통한 반복작업 자동화 등 프론트엔드와 백엔드가 타입스크립트라는 동일한 언어를 사용한다는 장점을 최대화합니다.

## 프로젝트 셋업

### 1. 프로젝트 클론

```bash
git clone https://github.com/sonamu-kit/sonamu.git
cd sonamu
```

### 2. 의존성 설치

```bash
yarn install
```
워크스페이스 내 모든 package들의 의존성이 최상단 `.yarn/cache` 디렉토리에 설치됩니다.

### 3. 예제 프로젝트 실행
```bash
yarn build
yarn miomock
```
Miomock 프로젝트가 의존하는 모든 프레임워크 패키지를 빌드하고, Miomock API, Web와 Sonamu UI를 실행합니다.
