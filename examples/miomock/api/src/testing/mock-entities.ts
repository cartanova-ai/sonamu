import { Entity } from "sonamu";

// MigrationSetTestEntity가 관계를 맺기 위해 필요한 최소한의 가짜 엔티티들
export const CompanyMigrationTestEntity = () =>
  new Entity({
    id: "Company",
    table: "companies",
    props: [{ name: "id", type: "integer", desc: "회사 ID" }],
    indexes: [],
    subsets: {},
    enums: {},
  });

export const ProfileMigrationTestEntity = () =>
  new Entity({
    id: "Profile",
    table: "profiles",
    props: [{ name: "id", type: "integer", desc: "프로필 ID" }],
    indexes: [],
    subsets: {},
    enums: {},
  });

export const PostMigrationTestEntity = () =>
  new Entity({
    id: "Post",
    table: "posts",
    props: [{ name: "id", type: "integer", desc: "게시글 ID" }],
    indexes: [],
    subsets: {},
    enums: {},
  });

export const TagMigrationTestEntity = () =>
  new Entity({
    id: "Tag",
    table: "tags",
    props: [{ name: "id", type: "integer", desc: "태그 ID" }],
    indexes: [],
    subsets: {},
    enums: {},
  });

// MigrationSet 변환 테스트를 위한 종합 엔티티
export const MigrationSetTestEntity = () =>
  new Entity({
    id: "MigrationSetTest",
    table: "migration_set_tests",
    title: "마이그레이션셋 테스트 엔티티",
    props: [
      // 1. 기본 타입 컬럼 테스트
      { name: "id", type: "integer", desc: "기본 ID" },
      { name: "test_string_col", type: "string", length: 255, desc: "테스트 문자열 컬럼" },
      {
        name: "test_integer_nullable",
        type: "integer",
        nullable: true,
        desc: "테스트 Nullable 정수",
      },
      { name: "test_boolean_col", type: "boolean", desc: "테스트 불리언" },
      { name: "test_text_long", type: "string", desc: "긴 텍스트 컬럼" },
      { name: "test_datetime_col", type: "date", desc: "날짜시간 컬럼" },
      { name: "test_json_col", type: "json", id: "TestJson", desc: "JSON 컬럼" },
      { name: "test_uuid_col", type: "uuid", desc: "UUID 컬럼" },

      // 2. 특수 속성 및 기본값 테스트
      {
        name: "test_enum_status",
        type: "enum",
        id: "MigrationSetTestStatusEnum",
        desc: "테스트 Enum 상태",
      },
      {
        name: "test_timestamp_default",
        type: "date",
        dbDefault: "CURRENT_TIMESTAMP",
        desc: "기본값 타임스탬프",
      },
      {
        name: "test_decimal_precision",
        type: "numeric",
        precision: 10,
        scale: 2,
        desc: "정밀 소수점",
      },
      {
        name: "test_float_precision",
        type: "number",
        numberType: "real",
        precision: 8,
        scale: 4,
        desc: "부동 소수점",
      },

      // 3. relation 테스트
      {
        name: "test_belongs_to_one_company",
        type: "relation",
        relationType: "BelongsToOne",
        with: "Company",
        desc: "테스트 BelongsToOne 관계",
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        nullable: true,
      },
      {
        name: "test_one_to_one_profile",
        type: "relation",
        relationType: "OneToOne",
        with: "Profile",
        desc: "테스트 OneToOne 관계",
        hasJoinColumn: true,
        onUpdate: "RESTRICT",
        onDelete: "RESTRICT",
      },
      {
        name: "test_has_many_posts",
        type: "relation",
        relationType: "HasMany",
        with: "Post",
        joinColumn: "migration_set_test_id",
        desc: "테스트 HasMany 관계",
      },
      {
        name: "test_many_to_many_tags",
        type: "relation",
        relationType: "ManyToMany",
        with: "Tag",
        joinTable: "migration_set_tests__tags",
        desc: "테스트 ManyToMany 관계",
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      // 4. virtual컬럼 테스트
      {
        name: "test_virtual_prop",
        type: "virtual",
        id: "TestVirtual",
        desc: "테스트 virtual 컬럼",
      },
    ],
    indexes: [
      { type: "index", columns: [{ name: "test_string_col" }], name: "idx_test_string_col" },
      { type: "unique", columns: [{ name: "test_enum_status" }], name: "uq_test_enum_status" },
      {
        type: "index",
        columns: [{ name: "test_string_col" }, { name: "test_integer_nullable" }],
        name: "idx_composite",
      },
    ],
    subsets: {},
    enums: {
      MigrationSetTestStatusEnum: {
        ACTIVE: "활성",
        INACTIVE: "비활성",
      },
    },
  });
