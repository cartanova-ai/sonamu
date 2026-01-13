import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // text[]를 jsonb로 변환하려면 먼저 array_to_json을 거쳐야 합니다
  await knex.raw(`
    ALTER TABLE projects
    ALTER COLUMN image_urls TYPE jsonb
    USING CASE
      WHEN image_urls IS NULL THEN NULL
      ELSE array_to_json(image_urls)::jsonb
    END
  `);
}

export async function down(knex: Knex): Promise<void> {
  // jsonb를 text[]로 롤백
  // jsonb 배열의 각 요소를 문자열로 추출하여 text[] 배열로 변환합니다
  await knex.raw(`
    ALTER TABLE projects
    ALTER COLUMN image_urls TYPE text[]
    USING CASE
      WHEN image_urls IS NULL THEN NULL
      ELSE (
        SELECT array_agg(elem::text)
        FROM jsonb_array_elements(image_urls) AS elem
      )
    END
  `);
}
