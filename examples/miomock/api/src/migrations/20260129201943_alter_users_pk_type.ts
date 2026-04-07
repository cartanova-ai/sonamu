import { type Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // employees.user_id FK 제약조건 삭제
  await knex.raw('ALTER TABLE "employees" DROP CONSTRAINT "employees_user_id_foreign"');
  // PK 제약조건 삭제
  await knex.raw('ALTER TABLE "users" DROP CONSTRAINT "users_pkey"');
  // PK 컬럼 타입 변경
  await knex.raw('ALTER TABLE "users" ALTER COLUMN "id" TYPE text USING "id"::text');
  // employees.user_id 컬럼 타입 변경
  await knex.raw('ALTER TABLE "employees" ALTER COLUMN "user_id" TYPE text USING "user_id"::text');
  // PK 제약조건 복구
  await knex.raw('ALTER TABLE "users" ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id")');
  // employees.user_id FK 제약조건 복구
  await knex.raw(
    'ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_foreign" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE CASCADE',
  );
}

export async function down(knex: Knex): Promise<void> {
  // employees.user_id FK 제약조건 삭제
  await knex.raw('ALTER TABLE "employees" DROP CONSTRAINT "employees_user_id_foreign"');
  // PK 제약조건 삭제
  await knex.raw('ALTER TABLE "users" DROP CONSTRAINT "users_pkey"');
  // PK 컬럼 타입 원복
  await knex.raw('ALTER TABLE "users" ALTER COLUMN "id" TYPE integer USING "id"::integer');
  // employees.user_id 컬럼 타입 원복
  await knex.raw(
    'ALTER TABLE "employees" ALTER COLUMN "user_id" TYPE integer USING "user_id"::integer',
  );
  // PK 제약조건 복구
  await knex.raw('ALTER TABLE "users" ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id")');
  // employees.user_id FK 제약조건 복구
  await knex.raw(
    'ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_foreign" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE CASCADE',
  );
}
