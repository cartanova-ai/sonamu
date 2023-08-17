import fastify from "fastify";
import { Sonamu } from "sonamu";

export async function createApiServer(options: {
  listen: {
    host: string;
    port: number;
  };
  appRoot: string;
}) {
  const { listen, appRoot } = options;

  const server = fastify();

  server.get("/api", async (_request, _reply) => {
    return { hello: "world", now: new Date() };
  });

  server.get("/api/t1", async () => {
    const { apiRootPath, isInitialized } = Sonamu;
    return {
      appRoot,
      apiRootPath,
      __dirname,
      isInitialized,
    };
  });

  server.get("/api/all_routes", async () => {
    return {
      // apis: Sonamu.syncer.apis,
      models: Sonamu.syncer.models,
    };
  });

  server
    .listen(listen)
    .then(() => {
      console.log(
        `sonamu-ui API Server is listening on ${listen.host}:${listen.port}`
      );
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

/*
  필요 API 리스트

  1. 엔티티 관련
    - [R] 전체 엔티티 리스트
      - 각 엔티티별 props, indexes, enums, subsets
    - [C] 엔티티 Stub 생성
    - [U] 엔티티 수정
      - props 추가/수정/삭제
        - 프롭 타입별 입력 로직
      - indexes 추가/수정/삭제
        - 인덱스/유니크 각각 입력 로직
        - 컬럼명 쿼리 로직
      - enums 추가/수정/삭제
      - subsets 추가/수정/삭제
    - [D] 엔티티 삭제
  2. 모델/API 관련
    - [R] 전체 모델/API 리스트
      - 각 모델별 API 리스트
      - httpMethod, clients, path, guards, description 등
      - 각 모델을 HTTP 테스팅 할 수 있는 기능
    - [C] 모델 Scaffold 생성
  3. DB 마이그레이션 관련
    - [R] 전체 DB커넥션 설정 리스트
    - [R] 각 DB커넥션별 knex_migrations 리스트
    - [R] 전체 마이그레이션 파일 리스트
      - 마이그레이션 파일의 대상 테이블 및 설명(설명은 추가 필요)
      - 컴파일 상태 (TS/JS 기준 각각으로 뽑아 비교하여 추출)
    - [R] 현재 마이그레이션 모드 체크 (마이그레이션 파일 생성 모드 / 실행 모드)
    - 마이그레이션 생성
    - 마이그레이션 실행 (DB커넥션 복수 선택)
    - 마이그레이션 롤백 (DB커넥션 복수 선택)
  4. Scaffold/Stub 관련
    - Stub Practice
    - Stub Entity (위에 있음)
    - Scaffold Model (위에 있음)
    - Scaffold Component - List
    - Scaffold Component - Form
    - Scaffold Component - IdAsyncSelect
    - Scaffold Component - EnumsSelect

*/
