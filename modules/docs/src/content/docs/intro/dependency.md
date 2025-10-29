---
title: 시작하기 전에
description: Sonamu 개발 환경 구성을 위한 사전 준비사항
---

Sonamu를 사용하기 위해 필요한 도구들을 안내합니다.

## 사전 설치

### Node.js

Sonamu는 Node.js 기반 프레임워크로, 서버 실행과 빌드 도구 실행에 필요합니다.

- **요구 버전**: 18.x 이상 (LTS 버전 권장)
- **공식 웹사이트**: [https://nodejs.org](https://nodejs.org)

### Yarn

Sonamu는 패키지 관리자로 Yarn Berry(v3+)를 사용합니다.

- **공식 웹사이트**: [https://yarnpkg.com](https://yarnpkg.com)

:::tip
`yarn create sonamu@latest`로 프로젝트를 생성하면 Yarn Berry가 자동으로 설정됩니다.
:::

### MySQL 클라이언트

데이터베이스 마이그레이션 실행과 직접 DB 접근을 위해 MySQL 클라이언트가 필요합니다.

- **MySQL 클라이언트**: [https://dev.mysql.com/downloads/shell](https://dev.mysql.com/downloads/shell)
- **MySQL Workbench** (GUI): [https://dev.mysql.com/downloads/workbench](https://dev.mysql.com/downloads/workbench)

:::tip
GUI 도구를 선호한다면 DBeaver, TablePlus, DataGrip 등을 사용할 수 있습니다.
:::

## 추가 권장 도구 (선택사항)

### Docker Desktop

개발 환경의 MySQL 데이터베이스를 Docker 컨테이너로 실행하기 위해 필요합니다. 로컬 환경을 오염시키지 않고 독립적인 DB 환경을 구성할 수 있습니다.

- **공식 웹사이트**: [https://www.docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop)

:::note
Docker Desktop 대신 직접 MySQL을 설치하여 사용할 수도 있습니다. 이 경우 `configs/db.ts`에서 연결 정보를 직접 설정하세요.
:::

### 코드 에디터

**Visual Studio Code** (권장)
- TypeScript 지원이 뛰어남
- 추천 확장 프로그램: REST Client
  - Sonamu가 생성하는 `.http` 파일을 테스트할 수 있습니다.
- **공식 웹사이트**: [https://code.visualstudio.com](https://code.visualstudio.com)

## 핵심 의존성

Sonamu가 사용하는 주요 라이브러리들입니다. (프로젝트 생성 시 자동 설치됨)

### 백엔드
- **[Fastify](https://fastify.dev)**: HTTP 서버 프레임워크
- **[Knex.js](https://knexjs.org)**: SQL 쿼리 빌더 및 마이그레이션
- **[MySQL2](https://www.npmjs.com/package/mysql2)**: MySQL 데이터베이스 드라이버
- **[Zod](https://zod.dev)**: 스키마 검증 및 타입 안전성

### 프론트엔드 (선택적)
- **[Axios](https://axios-http.com)**: HTTP 클라이언트
- **[SWR](https://swr.vercel.app)**: React Hooks 데이터 페칭

:::note
자세한 기술 스택 정보는 [소개 - 기술 스택](/intro#기술-스택) 섹션을 참고하세요.
:::

## 다음 단계

환경 설정이 완료되었다면, [튜토리얼](/tutorial)을 따라 첫 Sonamu 프로젝트를 만들어보세요.
