---
title: 들어가기 전에
description: A guide in my new Starlight docs site.
---

## 사전 설치

- Node.js

  - 18버전 이상의 Node.js가 설치되어 있어야 합니다.

- yarn

  - yarn이 global 설치되어 있어야 합니다.
    ```shell
    npm i -g yarn
    ```

- Docker Desktop

  - Docker Desktop이 설치되어 있어야 합니다. [공식 웹사이트](https://www.docker.com/products/docker-desktop/)에서 다운로드 할 수 있습니다.

- MySQL 클라이언트
  - MySQL 클라이언트가 설치되어 있어야 합니다. [공식 웹사이트](https://dev.mysql.com/downloads/workbench/)에서 다운로드 할 수 있습니다.
  - Mac 사용자의 경우 `brew install mysql`로 설치할 수 있습니다.

## 사용하는 패키지

- [fastify](https://fastify.dev/)

  - Fastify는 Node.js 에서 가장 좋은 평가를 받고 있는 성숙된 경량형 웹서버 프레임워크입니다.
  - Sonamu는 Fastify를 통해 웹서버를 서빙하며, 따라서 웹서버와 관련된 모든 추가 기능(e.g formbody, logging, static, cors, session, cookie, passport, file upload 등)은 Fastify Ecosystem 을 통해 구현 가능합니다.
  - 참고: [Fastify Plugins](https://fastify.dev/docs/latest/Reference/Plugins)

- [knex.js](https://knexjs.org/) + [mysql2](https://www.npmjs.com/package/mysql2)

  - Knex.js는 Node.js에서 가장 널리 사용되는 쿼리 빌더 라이브러리입니다.
  - Sonamu는 쿼리빌드, 마이그레이션 실행 등 DB와 직접적으로 통신하는 모든 작업에 Knex.js를 사용합니다.
  - RDB는 MySQL에 최적화되어 있으며, 추후 PostgreSQL, SQLite를 서포트할 계획이 있습니다.

- [Zod](https://zod.dev/)

  - Zod는 TypeScript 타입 스키마 정의 / 동적 밸리데이션 라이브러리입니다.
  - Sonamu는 모든 타입 정의와 E2E Type-safety 구현 플로우에 Zod를 사용합니다.
  - SMD 정의시 해당 SMD의 프로퍼티들을 자동으로 BaseSchema Zod 타입으로 생성하여, 이를 확장하는 컨벤션을 사용합니다.

- [Axios](https://axios-http.com/kr/docs/intro), [SWR](https://swr.vercel.app/ko)

  - Sonamu는 API 데코레이터 정의를 통해 API가 생성되는 경우 함께 HTTP 클라이언트 코드가 자동생성 되는데, 이 때 `httpClients` 옵션에 따라 axios와 swr 각각의 클라이언트를 생성할 수 있습니다.
    - axios 가 지정된 경우 Axios 기반의 일반 HTTP Fetching 함수가 생성됩니다.
    - swr 이 지정된 경우 SWR을 기반으로 React Hooks 함수가 생성됩니다.

- Vite, React, Semantic UI, prettier

## 문서 구조

- `explanation`
  - Sonamu에 대해 설명하는 문서
- `tutorial`
  - Sonamu를 기반으로 간단한 프로젝트를 만드는 튜토리얼입니다.
  - Sonamu의 기본적인 사용법..
- `guide`: Sonamu의 가이드
- `reference`: Sonamu의 레퍼런스
