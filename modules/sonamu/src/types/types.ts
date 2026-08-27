import { type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";

import { type ApiDecoratorOptions, type Context } from "../api";
import { type CacheControlHandler } from "../cache-control/types";
import { type GuardKey } from "./../api/decorators";

/*
  Utility Types
*/
export function zArrayable<T extends z.ZodTypeAny>(shape: T): z.ZodUnion<[T, z.ZodArray<T>]> {
  return z.union([shape, shape.array()]);
}
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- any is used to make the type distributive
export type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

/*
  Model-Definition
*/

/**
 * 부모 Entity fixture 생성 시 함께 생성할 companion Entity 설정
 *
 * 예: User fixture 생성 시 credentials Account를 함께 생성
 */
export type FixtureCompanion = {
  /** 함께 생성할 Entity 이름 */
  entity: string;

  /**
   * 고정 오버라이드 값.
   * "{{fieldName}}" 형식으로 부모 fixture의 필드 값을 참조할 수 있다.
   * 예: { "account_id": "{{email}}" } → 부모 User의 email 값 사용
   */
  overrides?: Record<string, unknown>;

  /**
   * 부모 1개당 생성할 companion 개수. 기본값 1.
   * 예: count: 2 → User 1개당 companion 2개 생성
   */
  count?: number;
};

/**
 * cone: 범용 메타데이터 시스템
 *
 * Entity, Prop, Enum, Subset에 "솔방울을 단다"는 개념으로 붙이는 단일 서술 메타데이터입니다.
 * note 하나로 비즈니스 의미와 fixture 생성 힌트를 함께 기술합니다.
 */
export type Cone = {
  note?: string; // 이 대상이 무엇인지 설명 (비즈니스 의미 + fixture 힌트 통합)
  tags?: string[]; // 분류/검색용 태그

  // Fixture 생성 관련
  fixtureGenerator?: string; // Faker.js 코드 또는 커스텀 함수
  fixtureDefault?: unknown; // 기본값
  fixtureStrategy?: "sequence"; // string 타입이지만 DB sequence로 관리되는 PK (better-auth 등)
  fixtureCompanions?: FixtureCompanion[]; // 부모 fixture 생성 시 함께 생성할 companion Entity 목록
  fixtureParentOverrides?: Record<string, unknown>; // parentId 엔티티의 부모 생성 시 사용할 override 값 (예: { achievement_type: "PAPER" })

  // 참조 데이터 관련
  dataSource?: {
    strategy: "sample" | "ids" | "query" | "file" | "recent" | "random";
    config?: unknown; // 전략별 설정
  };

  // 확장성
  [key: string]: unknown; // 사용자 정의 메타데이터
};

export type GeneratedColumnType = "STORED" | "VIRTUAL";
export type GeneratedColumn = {
  type: GeneratedColumnType;
  expression: string;
};
export type CommonProp = {
  name: string;
  nullable?: boolean;
  toFilter?: true;
  desc?: string;
  dbDefault?: string;
  generated?: GeneratedColumn;
  cone?: Cone; // cone 메타데이터
};

/**
 * prop의 설명을 반환합니다.
 *
 * cone.note가 있으면 우선 사용하고, 없으면 prop.desc를 사용합니다.
 */
export function getDescription(item: { desc?: string; cone?: Cone }): string | undefined {
  return item.cone?.note || item.desc;
}
export type IntegerProp = CommonProp & {
  type: "integer";
}; // PG: integer / TS: number / JSON: number
export type IntegerArrayProp = CommonProp & {
  type: "integer[]";
}; // PG: integer[] / TS: number[] / JSON: number[]
export type BigIntegerProp = CommonProp & {
  type: "bigInteger";
}; // PG: bigint / TS: bigint / JSON: bigint
export type BigIntegerArrayProp = CommonProp & {
  type: "bigInteger[]";
}; // PG: bigint[] / TS: bigint[] / JSON: bigint[]

/**
 * Zod 4 String Format 타입
 * entity.json에서 string 타입의 prop에 zodFormat 옵션을 지정하여
 * BaseSchema 생성 시 Zod의 string format validation을 적용합니다.
 */
export const ZodStringFormat = z.enum([
  // 기본 포맷
  "email",
  "uuid",
  "url",
  "httpUrl",
  "hostname",
  "emoji",
  "base64",
  "base64url",
  "hex",
  "jwt",
  "nanoid",
  "cuid",
  "cuid2",
  "ulid",
  "ipv4",
  "ipv6",
  "mac",
  "cidrv4",
  "cidrv6",
  // hash 포맷 (알고리즘별)
  "hashMd5",
  "hashSha1",
  "hashSha256",
  "hashSha384",
  "hashSha512",
  // ISO 포맷
  "isoDate",
  "isoTime",
  "isoDatetime",
  "isoDuration",
]);
export type ZodStringFormat = z.infer<typeof ZodStringFormat>;

export type StringProp = CommonProp & {
  type: "string";
  length?: number; // PG: varchar(n), text / TS: string / JSON: string
  zodFormat?: ZodStringFormat;
}; // PG: text / TS: string / JSON: string
export type StringArrayProp = CommonProp & {
  type: "string[]";
  length?: number; // PG: varchar(n)[], text[] / TS: string[] / JSON: string[]
  zodFormat?: ZodStringFormat;
}; // PG: varchar(n)[], text[] / TS: string[] / JSON: string[]
export type EnumProp = CommonProp & {
  type: "enum";
  id: string;
  length?: number;
}; // PG: text / TS: string / JSON: string
export type EnumArrayProp = CommonProp & {
  type: "enum[]";
  id: string;
}; // PG: text[] / TS: string[] / JSON: string[]
export type NumberProp = CommonProp & {
  type: "number";
  precision?: number; // PG: numeric(p, s) / TS: number / JSON: number
  scale?: number; // PG: numeric(p, s) / TS: number / JSON: number
  numberType?: "real" | "double precision" | "numeric"; // 기본값: numeric
}; // PG: numeric(p, s) / TS: number / JSON: number
export type NumberArrayProp = CommonProp & {
  type: "number[]";
  precision?: number;
  scale?: number;
  numberType?: "real" | "double precision" | "numeric"; // 기본값: numeric
}; // PG: numeric(p, s)[] / TS: number[] / JSON: number[]
export type NumericProp = CommonProp & {
  type: "numeric";
  precision?: number;
  scale?: number;
}; // PG: numeric(p, s) / TS: string / JSON: string
export type NumericArrayProp = CommonProp & {
  type: "numeric[]";
  precision?: number;
  scale?: number;
}; // PG: numeric(p, s)[] / TS: string[] / JSON: string[]
export type BooleanProp = CommonProp & {
  type: "boolean";
}; // PG: boolean / TS: boolean / JSON: boolean
export type BooleanArrayProp = CommonProp & {
  type: "boolean[]";
}; // PG: boolean[] / TS: boolean[] / JSON: boolean[]
export type DateProp = CommonProp & {
  type: "date";
  // 기본값은 3, microseconds를 쓰려면 6을 써야함 (0 ~ 6)
  precision?: number;
}; // PG: timestampz / TS: Date / JSON: string(ISOString)
export type DateArrayProp = CommonProp & {
  type: "date[]";
  // 기본값은 3, microseconds를 쓰려면 6을 써야함 (0 ~ 6)
  precision?: number;
}; // PG: timestamptz[] / TS: Date[] / JSON: string[]
export type JsonProp = CommonProp & {
  type: "json";
  id: string;
}; // PG: json / TS: any(id) / JSON: any
export type SearchTextSourceColumn = {
  name: string;
  caseInsensitive?: boolean;
};
export type SearchTextProp = CommonProp & {
  type: "searchText";
  sourceColumns: SearchTextSourceColumn[];
}; // PG: text (generated) / TS: string / JSON: string
export type UuidProp = CommonProp & {
  type: "uuid";
}; // PG: uuid / TS: string / JSON: string
export type UuidArrayProp = CommonProp & {
  type: "uuid[]";
}; // PG: uuid[] / TS: string[] / JSON: string[]
export type VirtualProp = CommonProp & {
  type: "virtual";
  id: string;
  virtualType?: "query" | "code"; // default: "code"
}; // PG: none / TS: any(id) / JSON: any
export type VectorProp = CommonProp & {
  type: "vector";
  dimensions: number;
};
export type VectorArrayProp = CommonProp & {
  type: "vector[]";
  dimensions: number;
};
export type TsVectorProp = CommonProp & {
  type: "tsvector";
};
export type RelationType = "HasMany" | "BelongsToOne" | "ManyToMany" | "OneToOne";
export type RelationOn = "CASCADE" | "SET NULL" | "NO ACTION" | "SET DEFAULT" | "RESTRICT";
type _RelationProp = {
  type: "relation";
  name: string;
  with: string;
  nullable?: boolean; // DEFAULT: false
  toFilter?: true; // DEFAULT: false
  desc?: string;
  cone?: Cone; // cone 메타데이터
};
export type OneToOneRelationProp = _RelationProp & {
  relationType: "OneToOne";
  customJoinClause?: string;
} & (
    | {
        hasJoinColumn: true;
        useConstraint?: boolean; // DEFAULT: true
        onUpdate?: RelationOn; // DEFAULT: RESTRICT
        onDelete?: RelationOn; // DEFAULT: RESTRICT
      }
    | {
        hasJoinColumn: false;
      }
  );
export type BelongsToOneRelationProp = _RelationProp & {
  relationType: "BelongsToOne";
  customJoinClause?: string;
  useConstraint?: boolean; // DEFAULT: true
  onUpdate?: RelationOn; // DEFAULT: RESTRICT
  onDelete?: RelationOn; // DEFAULT: RESTRICT
};
export type HasManyRelationProp = _RelationProp & {
  relationType: "HasMany";
  joinColumn: string;
  fromColumn?: string;
};
export type ManyToManyRelationProp = _RelationProp & {
  relationType: "ManyToMany";
  joinTable: `${string}__${string}`;
  onUpdate: RelationOn;
  onDelete: RelationOn;
};
export type RelationProp =
  | OneToOneRelationProp
  | BelongsToOneRelationProp
  | HasManyRelationProp
  | ManyToManyRelationProp;

export type EntityProp =
  | IntegerProp
  | IntegerArrayProp
  | BigIntegerProp
  | BigIntegerArrayProp
  | StringProp
  | StringArrayProp
  | EnumProp
  | EnumArrayProp
  | NumberProp
  | NumberArrayProp
  | NumericProp
  | NumericArrayProp
  | BooleanProp
  | BooleanArrayProp
  | DateProp
  | DateArrayProp
  | UuidProp
  | UuidArrayProp
  | JsonProp
  | SearchTextProp
  | VirtualProp
  | VectorProp
  | VectorArrayProp
  | TsVectorProp
  | RelationProp;

/**
 * SonamuFile Types
 *
 * 파일 업로드를 위한 JSON 타입입니다.
 * Entity의 json 속성에서 id로 "SonamuFile" 또는 "SonamuFile[]"을 지정하여 사용합니다.
 *
 * 프로젝트별 도메인 필드를 추가하려면 `SonamuFileExtend`를 확장합니다.
 * (Context의 `ContextExtend`와 동일한 declaration merging 패턴)
 */
export interface SonamuFileExtend {}

export type SonamuFileBase = {
  name: string;
  url: string;
  mime_type: string;
  size: number;
};

export interface SonamuFile extends SonamuFileBase, SonamuFileExtend {}

/**
 * UploadParams
 *
 * FileInput의 uploader 호출 시 전달할 업로드 파라미터 타입입니다.
 * 프로젝트별 업로드 파라미터를 추가하려면 declaration merging으로 확장합니다.
 */
export interface UploadParams {}

export const SonamuFileSchema: z.ZodType<SonamuFile> = z
  .looseObject({
    name: z.string(),
    url: z.string(),
    mime_type: z.string(),
    size: z.number(),
  })
  .describe("SonamuFile");

export const SonamuFileArraySchema = z.array(SonamuFileSchema).describe("SonamuFile[]");

/**
 * Sonamu 코어에서 제공하는 내장 JSON 타입 ID 목록
 * 새로운 내장 타입 추가 시 이 배열에 추가하면 자동으로 UI에 노출됩니다.
 */
export const BUILT_IN_TYPE_IDS = ["SonamuFile", "SonamuFile[]"] as const;
export type BuiltInTypeId = (typeof BUILT_IN_TYPE_IDS)[number];

/**
 * pgvector 거리 연산자 클래스
 *
 * @description
 * - `vector_cosine_ops`: 코사인 거리 (Cosine Distance) - 권장
 *   - SQL 연산자: `<=>`
 *   - 벡터의 방향만 비교 (크기 무시), 1 - cosine_similarity
 *   - 텍스트 임베딩, 시맨틱 검색에 가장 일반적으로 사용
 *   - 사용 예: OpenAI, Voyage 등 대부분의 임베딩 모델에 권장
 *
 * - `vector_ip_ops`: 내적 (Inner Product)
 *   - SQL 연산자: `<#>`
 *   - 두 벡터의 내적을 계산 (sum(a[i] * b[i]))
 *   - 정규화된 벡터에서 코사인 유사도와 동일한 결과
 *   - 값이 클수록 유사 (음수 연산자이므로 ORDER BY에서 주의)
 *   - 사용 예: 이미 정규화된 임베딩에서 가장 빠른 성능
 *
 * - `vector_l2_ops`: 유클리드 거리 (L2 Distance)
 *   - SQL 연산자: `<->`
 *   - 두 벡터 간의 직선 거리를 계산 (sqrt(sum((a[i] - b[i])^2)))
 *   - 벡터의 크기(magnitude)가 중요할 때 사용
 *   - 사용 예: 이미지 유사도, 절대적 거리 측정이 필요한 경우
 */
export type VectorOps = "vector_cosine_ops" | "vector_ip_ops" | "vector_l2_ops";

export const KnownOpclassValues = [
  "gin_trgm_ops",
  "gist_trgm_ops",
  "gin_bigm_ops",
  "vector_cosine_ops",
  "vector_ip_ops",
  "vector_l2_ops",
  "pgroonga_varchar_full_text_search_ops_v2",
  "pgroonga_jsonb_full_text_search_ops_v2",
] as const;
export type KnownOpclass = (typeof KnownOpclassValues)[number];

type EntityIndexColumn = {
  name: string;
  nullsFirst?: boolean;
  sortOrder?: "ASC" | "DESC";
  /** pgvector 인덱스에서 사용할 거리 연산자 (vector 컬럼에만 적용) */
  vectorOps?: VectorOps;
  /** generic 인덱스 opclass (vectorOps는 하위호환 목적으로 유지) */
  opclass?: KnownOpclass | string;
};
export type EntityIndex = {
  type: "index" | "unique" | "hnsw" | "ivfflat";
  columns: EntityIndexColumn[];
  name: string;
  using?: "btree" | "hash" | "gin" | "gist" | "pgroonga";
  nullsNotDistinct?: boolean; // unique index only
  /** PostgreSQL partial index predicate. Raw SQL WHERE expression without the WHERE keyword. */
  where?: string;
  /**
   * HNSW (Hierarchical Navigable Small World) 인덱스: 각 노드의 최대 연결 수
   *
   * @description
   * 그래프에서 각 노드가 가질 수 있는 최대 연결 수입니다.
   * HNSW는 빠른 검색 속도와 높은 정확도를 제공하므로 권장됩니다.
   * - 기본값: 16
   * - 범위: 2 ~ 100
   * - 높을수록: 정확도↑, 빌드 시간↑, 메모리↑
   * - 권장: 빠른 빌드(8), 균형(16), 높은 정확도(32), 최고 정확도(64)
   */
  m?: number;
  /**
   * HNSW (Hierarchical Navigable Small World) 인덱스: 구성 시 탐색 범위
   *
   * @description
   * 인덱스 구성 시 각 노드에서 탐색할 범위입니다.
   * - 기본값: 64
   * - 범위: 4 ~ 1000
   * - 높을수록: 정확도↑, 빌드 시간↑
   * - 권장: 빠른 빌드(32), 균형(64), 높은 정확도(128), 최고 정확도(256)
   */
  efConstruction?: number;
  /**
   * IVFFlat (Inverted File with Flat Compression) 인덱스: 클러스터링 리스트 수
   *
   * @description
   * 벡터를 클러스터링할 버킷 수를 지정합니다.
   * IVFFlat은 빠른 빌드와 낮은 메모리 사용이 필요할 때 사용합니다.
   * - 권장값: sqrt(row_count) ~ row_count / 1000
   * - 예시: 10,000행 → 100, 100,000행 → 300, 1,000,000행 → 1000
   * - 많을수록 정확도↑, 검색 속도↓
   */
  lists?: number;
};

// SubsetField 타입: string 또는 internal 옵션이 있는 객체
export type SubsetField = string | { field: string; internal?: boolean };

export function normalizeSubsetField(f: SubsetField): string {
  return typeof f === "string" ? f : f.field;
}
export function isInternalSubsetField(f: SubsetField): boolean {
  return typeof f !== "string" && f.internal === true;
}

/**
 * SubsetDef: Subset 정의
 *
 * 하위 호환성을 위해 SubsetField[] 배열 형태도 지원합니다.
 */
export type SubsetDef =
  | SubsetField[] // 기존 배열 형태
  | {
      // 새로운 객체 형태
      fields: SubsetField[];
      cone?: Cone;
    };

/**
 * EnumDef: Enum 정의
 *
 * 하위 호환성을 위해 Record<string, string> 형태도 지원합니다.
 */
export type EnumDef =
  | Record<string, string> // 기존 Record 형태
  | {
      // 새로운 객체 형태
      values: Record<string, string>;
      cone?: Cone;
    };

/**
 * SubsetDef가 새로운 객체 형태인지 확인
 */
export function isSubsetDefWithCone(def: SubsetDef): def is { fields: SubsetField[]; cone?: Cone } {
  return !Array.isArray(def) && "fields" in def;
}

/**
 * EnumDef가 새로운 객체 형태인지 확인
 */
export function isEnumDefWithCone(
  def: EnumDef,
): def is { values: Record<string, string>; cone?: Cone } {
  return (
    "values" in def && !("cone" in def && def.cone === undefined && Object.keys(def).length > 1)
  );
}

/**
 * SubsetDef에서 fields 추출
 */
export function getSubsetFields(def: SubsetDef): SubsetField[] {
  return Array.isArray(def) ? def : def.fields;
}

/**
 * EnumDef에서 values 추출
 */
export function getEnumDefValues(def: EnumDef): Record<string, string> {
  return isEnumDefWithCone(def) ? def.values : def;
}

export type EntityJson = {
  id: string;
  parentId?: string;
  table: string;
  title?: string;
  cone?: Cone; // cone 메타데이터
  props: EntityProp[];
  indexes: EntityIndex[];
  subsets: {
    [subset: string]: SubsetDef;
  };
  enums: {
    [enumId: string]: EnumDef;
  };
};
export type EntitySubsetRow = {
  field: string;
  has: {
    [key: string]: boolean;
  };
  isInternal: {
    [key: string]: boolean;
  };
  children: EntitySubsetRow[];
  prefixes: string[];
  relationEntity?: string;
  isOpen?: boolean;
};
export type FlattenSubsetRow = Omit<EntitySubsetRow, "children">;

/*
  PropNode
*/

/**
 * 엔티티의 필드 구조를 트리 형태로 표현하는 중간 노드입니다.
 *
 * **목적**: Entity의 subset 필드 표현식(예: "id", "user.name", "tags[]")을
 * 재귀적인 트리 구조로 파싱하여 Zod 스키마 생성의 중간 단계로 사용합니다.
 *
 * **변환 흐름**:
 * Entity subset → EntityPropNode (트리 구조) → Zod 스키마 → RenderingNode (UI용)
 *
 * **nodeType**:
 * - "plain": 단일 필드 (예: "id", "name")
 * - "object": 중첩 객체 (예: "user.name" → user 객체)
 * - "array": 배열 (예: "tags[]" → tags 배열)
 *
 * **사용 위치**: entity-converter.ts의 propNodeToZodType()
 */
export type EntityPropNode =
  | {
      nodeType: "plain";
      prop: EntityProp;
    }
  | {
      nodeType: "object" | "array";
      prop?: EntityProp;
      children: EntityPropNode[];
    };

/*
  Prop Type Guards
*/
export function isIntegerSingleProp(p: unknown): p is IntegerProp {
  return (p as IntegerProp)?.type === "integer";
}
export function isIntegerArrayProp(p: unknown): p is IntegerArrayProp {
  return (p as IntegerArrayProp)?.type === "integer[]";
}
export function isIntegerProp(p: unknown): p is IntegerProp | IntegerArrayProp {
  return isIntegerSingleProp(p) || isIntegerArrayProp(p);
}
export function isBigIntegerSingleProp(p: unknown): p is BigIntegerProp {
  return (p as BigIntegerProp)?.type === "bigInteger";
}
export function isBigIntegerArrayProp(p: unknown): p is BigIntegerArrayProp {
  return (p as BigIntegerArrayProp)?.type === "bigInteger[]";
}
export function isBigIntegerProp(p: unknown): p is BigIntegerProp | BigIntegerArrayProp {
  return isBigIntegerSingleProp(p) || isBigIntegerArrayProp(p);
}
export function isStringSingleProp(p: unknown): p is StringProp {
  return (p as StringProp)?.type === "string";
}
export function isStringArrayProp(p: unknown): p is StringArrayProp {
  return (p as StringArrayProp)?.type === "string[]";
}
export function isStringProp(p: unknown): p is StringProp | StringArrayProp {
  return isStringSingleProp(p) || isStringArrayProp(p);
}
export function isEnumSingleProp(p: unknown): p is EnumProp {
  return (p as EnumProp)?.type === "enum";
}
export function isEnumArrayProp(p: unknown): p is EnumArrayProp {
  return (p as EnumArrayProp)?.type === "enum[]";
}
export function isEnumProp(p: unknown): p is EnumProp | EnumArrayProp {
  return isEnumSingleProp(p) || isEnumArrayProp(p);
}
export function isNumberSingleProp(p: unknown): p is NumberProp {
  return (p as NumberProp)?.type === "number";
}
export function isNumberArrayProp(p: unknown): p is NumberArrayProp {
  return (p as NumberArrayProp)?.type === "number[]";
}
export function isNumberProp(p: unknown): p is NumberProp | NumberArrayProp {
  return isNumberSingleProp(p) || isNumberArrayProp(p);
}
export function isNumericSingleProp(p: unknown): p is NumericProp {
  return (p as NumericProp)?.type === "numeric";
}
export function isNumericArrayProp(p: unknown): p is NumericArrayProp {
  return (p as NumericArrayProp)?.type === "numeric[]";
}
export function isNumericProp(p: unknown): p is NumericProp | NumericArrayProp {
  return isNumericSingleProp(p) || isNumericArrayProp(p);
}
export function isBooleanSingleProp(p: unknown): p is BooleanProp {
  return (p as BooleanProp)?.type === "boolean";
}
export function isBooleanArrayProp(p: unknown): p is BooleanArrayProp {
  return (p as BooleanArrayProp)?.type === "boolean[]";
}
export function isBooleanProp(p: unknown): p is BooleanProp | BooleanArrayProp {
  return isBooleanSingleProp(p) || isBooleanArrayProp(p);
}
export function isDateSingleProp(p: unknown): p is DateProp {
  return (p as DateProp)?.type === "date";
}
export function isDateArrayProp(p: unknown): p is DateArrayProp {
  return (p as DateArrayProp)?.type === "date[]";
}
export function isDateProp(p: unknown): p is DateProp | DateArrayProp {
  return isDateSingleProp(p) || isDateArrayProp(p);
}
export function isUuidSingleProp(p: unknown): p is UuidProp {
  return (p as UuidProp)?.type === "uuid";
}
export function isUuidArrayProp(p: unknown): p is UuidArrayProp {
  return (p as UuidArrayProp)?.type === "uuid[]";
}
export function isUuidProp(p: unknown): p is UuidProp | UuidArrayProp {
  return isUuidSingleProp(p) || isUuidArrayProp(p);
}
export function isJsonProp(p: unknown): p is JsonProp {
  return (p as JsonProp)?.type === "json";
}
export function isSearchTextProp(p: unknown): p is SearchTextProp {
  return (p as SearchTextProp)?.type === "searchText";
}
export function isVirtualProp(p: unknown): p is VirtualProp {
  return (p as VirtualProp)?.type === "virtual";
}
export function isVirtualCodeProp(p: unknown): p is VirtualProp {
  if (!isVirtualProp(p)) return false;
  return p.virtualType !== "query"; // undefined도 "code"로 취급
}
export function isVirtualQueryProp(p: unknown): p is VirtualProp {
  if (!isVirtualProp(p)) return false;
  return p.virtualType === "query";
}
export function isVectorSingleProp(p: unknown): p is VectorProp {
  return (p as VectorProp)?.type === "vector";
}
export function isVectorArrayProp(p: unknown): p is VectorArrayProp {
  return (p as VectorArrayProp)?.type === "vector[]";
}
export function isVectorProp(p: unknown): p is VectorProp | VectorArrayProp {
  return isVectorSingleProp(p) || isVectorArrayProp(p);
}
export function isTsVectorProp(p: unknown): p is TsVectorProp {
  return (p as TsVectorProp)?.type === "tsvector";
}
export function isRelationProp(p: unknown): p is RelationProp {
  return (p as RelationProp)?.type === "relation";
}
export function isOneToOneRelationProp(p: unknown): p is OneToOneRelationProp {
  return (p as OneToOneRelationProp)?.relationType === "OneToOne";
}
export function isBelongsToOneRelationProp(p: unknown): p is BelongsToOneRelationProp {
  return (p as BelongsToOneRelationProp)?.relationType === "BelongsToOne";
}
export function isHasManyRelationProp(p: unknown): p is HasManyRelationProp {
  return (p as HasManyRelationProp)?.relationType === "HasMany";
}
export function isManyToManyRelationProp(p: unknown): p is ManyToManyRelationProp {
  return (p as ManyToManyRelationProp)?.relationType === "ManyToMany";
}

type JoinClause =
  | {
      from: string;
      to: string;
    }
  | {
      custom: string;
    };
export function isCustomJoinClause(p: unknown): p is { custom: string } {
  return !!(p as { custom: string })?.custom;
}

type SubsetLoader = {
  as: string;
  table: string;
  manyJoin: {
    fromTable: string;
    fromCol: string;
    idField: string;
    toTable: string;
    toCol: string;
    through?: {
      table: string;
      fromCol: string;
      toCol: string;
    };
  };
  oneJoins: ({
    as: string;
    join: "inner" | "outer";
    table: string;
  } & JoinClause)[];
  select: string[];
  loaders?: SubsetLoader[];
};

export type SubsetQuery = {
  select: string[];
  virtual: string[];
  joins: ({
    as: string;
    join: "inner" | "outer";
    table: string;
  } & JoinClause)[];
  loaders: SubsetLoader[];
};

/* BaseModel */
export const SonamuQueryMode = z.enum(["both", "list", "count"]);
export type SonamuQueryMode = z.infer<typeof SonamuQueryMode>;

/* Semantic Query */
export const SonamuSemanticParams = z.object({
  semanticQuery: z.object({
    embedding: z.array(z.number()).min(1024).max(1024),
    threshold: z.number().optional(),
    method: z.enum(["cosine", "l2", "inner_product"]).optional(),
  }),
});
export type SonamuSemanticParams = z.infer<typeof SonamuSemanticParams>;

/* Knex Migration */
export type KnexError = {
  code: string;
  errno: number;
  sql: string;
  sqlMessage: string;
  sqlState: string;
};
export function isKnexError(e: unknown): e is KnexError {
  return !!(e as KnexError)?.code && !!(e as KnexError)?.sqlMessage && !!(e as KnexError)?.sqlState;
}

export type KnexColumnType =
  | "string"
  | "text"
  | "smalltext"
  | "mediumtext"
  | "longtext"
  | "integer"
  | "bigInteger"
  | "decimal"
  | "timestamp"
  | "boolean"
  | "foreign"
  | "uuid"
  | "json"
  | "float"
  | "date"
  | "time"
  | "datetime";
export type MigrationColumnType =
  | "string"
  | "string[]"
  | "integer"
  | "integer[]"
  | "bigInteger"
  | "bigInteger[]"
  | "numberOrNumeric"
  | "numberOrNumeric[]"
  | "boolean"
  | "boolean[]"
  | "date"
  | "date[]"
  | "uuid"
  | "uuid[]"
  | "json"
  | "vector"
  | "vector[]"
  | "tsvector";
export type MigrationColumn = {
  name: string;
  type: MigrationColumnType;
  nullable: boolean;
  numberType?: "real" | "double precision" | "numeric";
  length?: number;
  defaultTo?: string;
  precision?: number;
  scale?: number;
  dimensions?: number;
  generated?: GeneratedColumn;
};
export type MigrationIndex = {
  type: "unique" | "index" | "hnsw" | "ivfflat";
  columns: EntityIndexColumn[];
  name: string;
  using?: "btree" | "hash" | "gin" | "gist" | "pgroonga";
  nullsNotDistinct?: boolean;
  /** PostgreSQL partial index predicate. Raw SQL WHERE expression without the WHERE keyword. */
  where?: string;
  /** HNSW (Hierarchical Navigable Small World): 각 노드의 최대 연결 수 */
  m?: number;
  /** HNSW (Hierarchical Navigable Small World): 구성 시 탐색 범위 */
  efConstruction?: number;
  /** IVFFlat (Inverted File with Flat Compression): 클러스터링 리스트 수 */
  lists?: number;
};
export type MigrationForeign = {
  columns: string[];
  to: string;
  onUpdate: RelationOn;
  onDelete: RelationOn;
};
export type MigrationJoinTable = {
  table: string;
  indexes: MigrationIndex[];
  columns: MigrationColumn[];
  foreigns: MigrationForeign[];
};
export type MigrationSet = {
  table: string;
  columns: MigrationColumn[];
  indexes: MigrationIndex[];
  foreigns: MigrationForeign[];
};
export type MigrationSetAndJoinTable = MigrationSet & {
  joinTables: MigrationJoinTable[];
};
export type GenMigrationCode = {
  title: string;
  table: string;
  type: "normal" | "foreign";
  formatted: string | null;
};

/* Api */
export type ApiParam = {
  name: string;
  type: ApiParamType;
  optional: boolean;
  defaultDef?: string;
};
export namespace ApiParamType {
  export type Function = {
    t: "function";
    parameters: ApiParam[];
    returnType: ApiParamType;
  };
  export type Object = {
    t: "object";
    props: ApiParam[];
  };
  export type Union = {
    t: "union";
    types: ApiParamType[];
  };
  export type Intersection = {
    t: "intersection";
    types: ApiParamType[];
  };
  export type StringLiteral = {
    t: "string-literal";
    value: string;
  };
  export type NumericLiteral = {
    t: "numeric-literal";
    value: number;
  };
  export type Array = {
    t: "array";
    elementsType: ApiParamType;
  };
  export type Ref = {
    t: "ref";
    id: string;
    args?: ApiParamType[];
  };
  export type IndexedAccess = {
    t: "indexed-access";
    object: ApiParamType;
    index: ApiParamType;
  };
  export type TupleType = {
    t: "tuple-type";
    elements: ApiParamType[];
  };
  export type Pick = Ref & {
    t: "ref";
    id: "Pick";
  };
  export type Omit = Ref & {
    t: "ref";
    id: "Omit";
  };
  export type Partial = Ref & {
    t: "ref";
    id: "Partial";
  };
  export type Promise = Ref & {
    t: "ref";
    id: "Promise";
  };
  export type Context = Ref & {
    t: "ref";
    id: "Context";
  };
  export type TypeParam = {
    t: "type-param";
    id: string;
    constraint?: ApiParamType;
  };

  export function isObject(v: unknown): v is ApiParamType.Object {
    return (v as ApiParamType.Object)?.t === "object";
  }
  export function isUnion(v: unknown): v is ApiParamType.Union {
    return (v as ApiParamType.Union)?.t === "union";
  }
  export function isIntersection(v: unknown): v is ApiParamType.Intersection {
    return (v as ApiParamType.Intersection)?.t === "intersection";
  }
  export function isStringLiteral(v: unknown): v is ApiParamType.StringLiteral {
    return (v as ApiParamType.StringLiteral)?.t === "string-literal";
  }
  export function isNumericLiteral(v: unknown): v is ApiParamType.NumericLiteral {
    return (v as ApiParamType.NumericLiteral)?.t === "numeric-literal";
  }
  export function isArray(v: unknown): v is ApiParamType.Array {
    return (v as ApiParamType.Array)?.t === "array";
  }
  export function isRef(v: unknown): v is ApiParamType.Ref {
    return typeof v === "object" && v !== null && (v as { t?: unknown }).t === "ref";
  }
  export function isIndexedAccess(v: unknown): v is ApiParamType.IndexedAccess {
    return typeof v === "object" && v !== null && (v as { t?: unknown }).t === "indexed-access";
  }
  export function isTupleType(v: unknown): v is ApiParamType.TupleType {
    return typeof v === "object" && v !== null && (v as { t?: unknown }).t === "tuple-type";
  }
  export function isPick(v: unknown): v is ApiParamType.Pick {
    return (
      typeof v === "object" &&
      v !== null &&
      (v as { t?: unknown }).t === "ref" &&
      (v as { id?: unknown }).id === "Pick"
    );
  }
  export function isOmit(v: unknown): v is ApiParamType.Omit {
    return (
      typeof v === "object" &&
      v !== null &&
      (v as { t?: unknown }).t === "ref" &&
      (v as { id?: unknown }).id === "Omit"
    );
  }
  export function isPartial(v: unknown): v is ApiParamType.Partial {
    return (
      typeof v === "object" &&
      v !== null &&
      (v as { t?: unknown }).t === "ref" &&
      (v as { id?: unknown }).id === "Partial"
    );
  }
  export function isPromise(v: unknown): v is ApiParamType.Promise {
    return (
      typeof v === "object" &&
      v !== null &&
      (v as { t?: unknown }).t === "ref" &&
      (v as { id?: unknown }).id === "Promise"
    );
  }
  export function isContext(v: unknown): v is ApiParamType.Context {
    return (
      typeof v === "object" &&
      v !== null &&
      (v as { t?: unknown }).t === "ref" &&
      ((v as { id?: unknown }).id === "Context" ||
        (v as { id?: unknown }).id === "WebSocketContext")
    );
  }
  export function isRefKnex(v: unknown): v is ApiParamType.Ref {
    return (
      typeof v === "object" &&
      v !== null &&
      (v as { t?: unknown }).t === "ref" &&
      (v as { id?: unknown }).id === "Knex"
    );
  }
  export function isTypeParam(v: unknown): v is ApiParamType.TypeParam {
    return typeof v === "object" && v !== null && (v as { t?: unknown }).t === "type-param";
  }
}
export type ApiParamType =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "undefined"
  | "void"
  | "any"
  | "unknown"
  | "true"
  | "false"
  | ApiParamType.StringLiteral
  | ApiParamType.NumericLiteral
  | ApiParamType.Object
  | ApiParamType.Union
  | ApiParamType.Intersection
  | ApiParamType.Array
  | ApiParamType.Ref
  | ApiParamType.IndexedAccess
  | ApiParamType.TypeParam
  | ApiParamType.TupleType
  | ApiParamType.Function;

/* Template */
/**
 * UI 컴포넌트 렌더링을 위한 메타데이터 노드입니다.
 *
 * **목적**: Zod 스키마로부터 프론트엔드 UI 컴포넌트를 자동 생성하기 위한
 * 렌더링 정보를 담은 트리 구조입니다. 각 필드가 어떤 UI 컴포넌트로
 * 표현되어야 하는지(텍스트, 이미지, 날짜, Enum 선택 등)를 명시합니다.
 *
 * **변환 흐름**:
 * Entity subset → EntityPropNode → Zod 스키마 → RenderingNode (UI용) → React 컴포넌트 코드 생성
 *
 * **주요 필드**:
 * - `renderType`: UI 컴포넌트 유형 (string-plain, number-fk_id, enums, array 등)
 * - `zodType`: 원본 Zod 스키마 (validation 용)
 * - `children`: 중첩된 객체 필드들 (object일 때)
 * - `element`: 배열 요소 타입 (array일 때)
 *
 * **사용 위치**:
 * - zod-converter.ts의 zodTypeToRenderingNode()에서 생성
 * - view_form.template.ts, view_list.template.ts 등에서 React 컴포넌트 코드 생성에 사용
 */
// 셀프 참조 타입이므로 Zod 생략하고 직접 정의
export const RenderingNode = z.any();
export type RenderingNode = {
  name: string;
  label: string;
  renderType:
    | "string-plain"
    | "string-image"
    | "string-datetime"
    | "string-date"
    | "string-id"
    | "string-fk_id"
    | "datetime"
    | "number-plain"
    | "number-id"
    | "number-fk_id"
    | "boolean"
    | "enums"
    | "array"
    | "array-images"
    | "json-sonamufile"
    | "json-sonamufile-array"
    | "object"
    | "object-pick"
    | "record"
    | "vector";
  zodType: z.ZodTypeAny;
  element?: RenderingNode;
  children?: RenderingNode[];
  config?: {
    picked: string;
  };
  optional?: boolean;
  nullable?: boolean;
};

const GeneratedColumnSchema = z.object({
  type: z.enum(["STORED", "VIRTUAL"]),
  expression: z.string(),
});

const FixtureCompanionSchema = z.object({
  entity: z.string(),
  overrides: z.record(z.string(), z.unknown()).optional(),
  count: z.number().int().positive().optional(),
});

/**
 * Cone 스키마 검증
 *
 * cone 메타데이터의 유효성을 검증합니다.
 */
const ConeSchema = z
  .object({
    note: z.string().optional(),
    tags: z.array(z.string()).optional(),
    fixtureGenerator: z.string().optional(),
    fixtureDefault: z.unknown().optional(),
    fixtureStrategy: z.literal("sequence").optional(),
    fixtureCompanions: z.array(FixtureCompanionSchema).optional(),
    fixtureParentOverrides: z.record(z.string(), z.unknown()).optional(),
    dataSource: z
      .object({
        strategy: z.enum(["sample", "ids", "query", "file", "recent", "random"]),
        config: z.unknown().optional(),
      })
      .optional(),
  })
  .catchall(z.unknown()); // 사용자 정의 메타데이터 허용

const BasePropFields = {
  name: z.string(),
  desc: z.string().optional(),
  nullable: z.boolean().optional(),
  toFilter: z.boolean().default(false).optional(),
  dbDefault: z.union([z.string(), z.number(), z.boolean()]).optional(),
  generated: GeneratedColumnSchema.optional(),
  cone: ConeSchema.optional(),
};

// 부가 필드가 필요없는 prop
const BasePropFieldsWithoutAdditional = z
  .object({
    ...BasePropFields,
    type: z.union([
      z.literal("integer"),
      z.literal("integer[]"),
      z.literal("bigInteger"),
      z.literal("bigInteger[]"),
      z.literal("boolean"),
      z.literal("boolean[]"),
      z.literal("uuid"),
      z.literal("uuid[]"),
      z.literal("tsvector"),
    ]),
  })
  .strict();

// precision/scale 필드
const PrecisionScaleFields = {
  precision: z.number().optional(),
  scale: z.number().optional(),
};

// 각 타입별 스키마 정의

const StringPropSchema = z
  .object({
    ...BasePropFields,
    type: z.literal("string"),
    length: z.number().optional(),
    zodFormat: ZodStringFormat.optional(),
  })
  .strict();
const StringArrayPropSchema = z
  .object({
    ...BasePropFields,
    type: z.literal("string[]"),
    length: z.number().optional(),
    zodFormat: ZodStringFormat.optional(),
  })
  .strict();

const EnumPropSchema = z
  .object({
    ...BasePropFields,
    type: z.literal("enum"),
    id: z.string(),
    length: z.number().optional(),
  })
  .strict();
const EnumArrayPropSchema = z
  .object({
    ...BasePropFields,
    type: z.literal("enum[]"),
    id: z.string(),
  })
  .strict();

const NumberPropSchema = z
  .object({
    ...BasePropFields,
    type: z.literal("number"),
    ...PrecisionScaleFields,
    numberType: z.enum(["real", "double precision", "numeric"]).optional(),
  })
  .strict();
const NumberArrayPropSchema = z
  .object({
    ...BasePropFields,
    type: z.literal("number[]"),
    ...PrecisionScaleFields,
    numberType: z.enum(["real", "double precision", "numeric"]).optional(),
  })
  .strict();

const DatePropSchema = z
  .object({
    ...BasePropFields,
    type: z.literal("date"),
    precision: z.number().optional(),
  })
  .strict();
const DateArrayPropSchema = z
  .object({
    ...BasePropFields,
    type: z.literal("date[]"),
    precision: z.number().optional(),
  })
  .strict();

const NumericPropSchema = z
  .object({
    ...BasePropFields,
    type: z.literal("numeric"),
    ...PrecisionScaleFields,
  })
  .strict();
const NumericArrayPropSchema = z
  .object({
    ...BasePropFields,
    type: z.literal("numeric[]"),
    ...PrecisionScaleFields,
  })
  .strict();

const JsonPropSchema = z
  .object({
    ...BasePropFields,
    type: z.literal("json"),
    id: z.string(),
  })
  .strict();

const SearchTextSourceColumnSchema = z
  .object({
    name: z.string(),
    caseInsensitive: z.boolean().optional(),
  })
  .strict();

const SearchTextPropSchema = z
  .object({
    ...BasePropFields,
    type: z.literal("searchText"),
    sourceColumns: z.array(SearchTextSourceColumnSchema).min(1),
  })
  .strict();

const VirtualPropSchema = z
  .object({
    ...BasePropFields,
    type: z.literal("virtual"),
    id: z.string(),
    virtualType: z.enum(["query", "code"]).optional(),
  })
  .strict();

const VectorPropSchema = z
  .object({
    ...BasePropFields,
    type: z.literal("vector"),
    dimensions: z.number(),
  })
  .strict();
const VectorArrayPropSchema = z
  .object({
    ...BasePropFields,
    type: z.literal("vector[]"),
    dimensions: z.number(),
  })
  .strict();

// Relation 타입은 relationType에 따라 세분화
const BaseRelationFields = {
  ...BasePropFields,
  type: z.literal("relation"),
  with: z.string(),
};

// RelationOn 타입
const RelationOnSchema = z.enum(["CASCADE", "SET NULL", "NO ACTION", "SET DEFAULT", "RESTRICT"]);

const BelongsToOneRelationPropSchema = z
  .object({
    ...BaseRelationFields,
    relationType: z.literal("BelongsToOne"),
    customJoinClause: z.string().optional(),
    useConstraint: z.boolean().optional(),
    onUpdate: RelationOnSchema.optional(),
    onDelete: RelationOnSchema.optional(),
  })
  .strict();

const HasManyRelationPropSchema = z
  .object({
    ...BaseRelationFields,
    relationType: z.literal("HasMany"),
    joinColumn: z.string(),
    fromColumn: z.string().optional(),
  })
  .strict();

const ManyToManyRelationPropSchema = z
  .object({
    ...BaseRelationFields,
    relationType: z.literal("ManyToMany"),
    joinTable: z.string(),
    onUpdate: RelationOnSchema,
    onDelete: RelationOnSchema,
  })
  .strict();

const OneToOneRelationPropSchema = z
  .object({
    ...BaseRelationFields,
    relationType: z.literal("OneToOne"),
    customJoinClause: z.string().optional(),
    hasJoinColumn: z.boolean().optional(),
    useConstraint: z.boolean().optional(),
    onUpdate: RelationOnSchema.optional(),
    onDelete: RelationOnSchema.optional(),
  })
  .strict();

const RelationTypes = ["BelongsToOne", "HasMany", "ManyToMany", "OneToOne"] as const;
export const RelationPropSchema = z.discriminatedUnion(
  "relationType",
  [
    BelongsToOneRelationPropSchema,
    HasManyRelationPropSchema,
    ManyToManyRelationPropSchema,
    OneToOneRelationPropSchema,
  ],
  {
    error: (iss) =>
      `relationType은 ${RelationTypes.map((t) => `'${t}'`).join(", ")} 중 하나여야 합니다. 입력값: "${(iss.input as Record<string, unknown>)?.relationType}"`,
  },
);

const NormalPropTypes = [
  "integer",
  "integer[]",
  "bigInteger",
  "bigInteger[]",
  "string",
  "string[]",
  "enum",
  "enum[]",
  "number",
  "number[]",
  "numeric",
  "numeric[]",
  "boolean",
  "boolean[]",
  "date",
  "date[]",
  "uuid",
  "uuid[]",
  "json",
  "searchText",
  "virtual",
  "vector",
  "vector[]",
  "tsvector",
] as const;

// VIRTUAL Generated Column에서 사용 불가능한 타입들
const VirtualGeneratedDisallowedTypes = [
  "json",
  "vector",
  "vector[]",
  "string[]",
  "integer[]",
  "bigInteger[]",
  "boolean[]",
  "date[]",
  "uuid[]",
  "number[]",
  "numeric[]",
  "enum[]",
] as const;

export const NormalPropSchema = z
  .discriminatedUnion(
    "type",
    [
      BasePropFieldsWithoutAdditional,
      StringPropSchema,
      StringArrayPropSchema,
      EnumPropSchema,
      EnumArrayPropSchema,
      NumberPropSchema,
      NumberArrayPropSchema,
      DatePropSchema,
      DateArrayPropSchema,
      NumericPropSchema,
      NumericArrayPropSchema,
      JsonPropSchema,
      SearchTextPropSchema,
      VirtualPropSchema,
      VectorPropSchema,
      VectorArrayPropSchema,
    ],
    {
      error: (iss) =>
        `type은 ${NormalPropTypes.map((t) => `'${t}'`).join(", ")} 중 하나여야 합니다. 입력값: "${(iss.input as Record<string, unknown>)?.type}"`,
    },
  )
  .superRefine((data, ctx) => {
    if (!data.generated) {
      return;
    }

    // dbDefault와 generated 동시 사용 불가
    if (data.dbDefault !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "dbDefault와 generated는 함께 사용할 수 없습니다",
        path: ["generated"],
      });
    }

    // virtual 타입은 generated 불가
    if (data.type === "virtual") {
      ctx.addIssue({
        code: "custom",
        message: "virtual 타입은 generated column을 지원하지 않습니다",
        path: ["generated"],
      });
    }

    // VIRTUAL Generated Column 타입 제한 검증
    if (data.generated.type === "VIRTUAL") {
      if ((VirtualGeneratedDisallowedTypes as readonly string[]).includes(data.type)) {
        ctx.addIssue({
          code: "custom",
          message: `VIRTUAL generated column은 ${data.type} 타입을 지원하지 않습니다. STORED를 사용하세요.`,
          path: ["generated", "type"],
          fatal: true,
        });
      }
    }
  });

const AllPropTypes = [...NormalPropTypes, "relation"] as const;
const EntityPropSchema = z.discriminatedUnion("type", [NormalPropSchema, RelationPropSchema], {
  error: (iss) =>
    `type은 ${AllPropTypes.map((t) => `'${t}'`).join(", ")} 중 하나여야 합니다. 입력값: "${(iss.input as Record<string, unknown>)?.type}"`,
});

const EntityIndexColumnSchema = z.object({
  name: z.string(),
  nullsFirst: z.boolean().optional(),
  sortOrder: z.enum(["ASC", "DESC"]).optional(),
  vectorOps: z.enum(["vector_cosine_ops", "vector_ip_ops", "vector_l2_ops"]).optional(),
  opclass: z.union([z.enum(KnownOpclassValues), z.string().min(1)]).optional(),
});

// EntityIndex 스키마 정의
const EntityIndexSchema = z
  .object({
    type: z.enum(["index", "unique", "hnsw", "ivfflat"]),
    columns: z.array(EntityIndexColumnSchema),
    name: z.string().min(1).max(63),
    using: z.enum(["btree", "hash", "gin", "gist", "pgroonga"]).optional(),
    nullsNotDistinct: z.boolean().optional(),
    where: z.string().trim().min(1).optional(),
    m: z.number().optional(),
    efConstruction: z.number().optional(),
    lists: z.number().optional(),
  })
  .strict();

/**
 * SubsetDef 스키마
 *
 * 하위 호환성을 위해 배열 형태와 객체 형태 둘 다 지원합니다.
 */
const SubsetDefSchema = z.union([
  // 기존 배열 형태
  z.array(z.union([z.string(), z.object({ field: z.string(), internal: z.boolean().optional() })])),
  // 새로운 객체 형태
  z.object({
    fields: z.array(
      z.union([z.string(), z.object({ field: z.string(), internal: z.boolean().optional() })]),
    ),
    cone: ConeSchema.optional(),
  }),
]);

/**
 * EnumDef 스키마
 *
 * 하위 호환성을 위해 Record 형태와 객체 형태 둘 다 지원합니다.
 */
const EnumDefSchema = z.union([
  // 기존 Record 형태
  z.record(z.string(), z.string()),
  // 새로운 객체 형태
  z.object({
    values: z.record(z.string(), z.string()),
    cone: ConeSchema.optional(),
  }),
]);

function unwrapSearchTextJsonSourceType(zodType: z.ZodTypeAny): z.ZodTypeAny {
  let current = zodType;

  while (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
    current = current.unwrap() as z.ZodTypeAny;
  }

  return current;
}

export function isSearchTextJsonSourceZodType(zodType: z.ZodTypeAny): boolean {
  const baseType = unwrapSearchTextJsonSourceType(zodType);
  if (!(baseType instanceof z.ZodArray)) {
    return false;
  }

  const elementType = baseType.def.element;
  return elementType instanceof z.ZodString;
}

function validateSearchTextSources(
  props: readonly z.infer<typeof EntityPropSchema>[],
  ctx: z.RefinementCtx,
  propsPath: (string | number)[] = ["props"],
): void {
  const propsByName = new Map(
    props.map((prop) => {
      return [prop.name, prop];
    }),
  );

  props.forEach((prop, propIndex) => {
    if (prop.type !== "searchText") {
      return;
    }

    prop.sourceColumns.forEach((source, sourceIndex) => {
      const sourceProp = propsByName.get(source.name);
      const sourcePath = [...propsPath, propIndex, "sourceColumns", sourceIndex, "name"];

      if (!sourceProp) {
        ctx.addIssue({
          code: "custom",
          message: `searchText source column "${source.name}"을(를) 찾을 수 없습니다.`,
          path: sourcePath,
        });
        return;
      }

      if (sourceProp.type === "string" || sourceProp.type === "string[]") {
        return;
      }

      if (sourceProp.type === "json") {
        // json source의 최종 타입 유효성은 EntityManager.register() 단계에서
        // 실제 Zod 타입을 해석하여 구조적으로 검증합니다.
        return;
      }

      ctx.addIssue({
        code: "custom",
        message: `searchText source column "${source.name}"의 타입 "${sourceProp.type}"은(는) 지원되지 않습니다.`,
        path: sourcePath,
      });
    });
  });
}

const EntityJsonBaseSchema = z
  .object({
    id: z.string().describe("PascalCase로 된 Entity ID"),
    title: z.string().describe("Entity 이름"),
    table: z.string().describe("snake_case로 된 테이블명"),
    parentId: z.string().optional().describe("부모 Entity ID"),
    cone: ConeSchema.optional(),
    props: z.array(EntityPropSchema),
    indexes: z.array(EntityIndexSchema),
    subsets: z.record(z.string(), SubsetDefSchema),
    enums: z.record(z.string(), EnumDefSchema),
  })
  .strict();

export const EntityJsonSchema = EntityJsonBaseSchema.superRefine((entity, ctx) => {
  validateSearchTextSources(entity.props, ctx);
});

const TemplateEntitySchema = EntityJsonBaseSchema.omit({ id: true })
  .extend({
    entityId: z.string(),
  })
  .partial({
    table: true,
    props: true,
    indexes: true,
    subsets: true,
    enums: true,
  })
  .superRefine((entity, ctx) => {
    if (!entity.props) {
      return;
    }

    validateSearchTextSources(entity.props, ctx);
  });

export const TemplateOptions = z.object({
  entity: TemplateEntitySchema,
  init_types: z.object({
    entityId: z.string(),
  }),
  generated: z.object({}),
  generated_sso: z.object({}),
  generated_http: z.object({
    entityId: z.string(),
  }),
  http_validators: z.object({}),
  model: z.object({
    entityId: z.string(),
    defaultSearchField: z.string().optional(),
    defaultOrderBy: z.string().optional(),
  }),
  model_test: z.object({
    entityId: z.string(),
  }),
  bridge: z.object({
    entityId: z.string(),
  }),
  services: z.object({}),
  view_list: z.object({
    entityId: z.string(),
    extra: z.unknown(),
  }),
  view_list_columns: z.object({
    entityId: z.string(),
    columns: z
      .object({
        name: z.string(),
        label: z.string(),
        tc: z.string(),
      })
      .array(),
    columnImports: z.string(),
  }),
  view_search_input: z.object({
    entityId: z.string(),
  }),
  view_form: z.object({
    entityId: z.string(),
  }),
  view_id_all_select: z.object({
    entityId: z.string(),
  }),
  view_enums_buttonset: z.object({
    entityId: z.string(),
    enumId: z.string(),
  }),
  queries: z.object({}),
  entry_server: z.object({}),
  sd: z.object({
    target: z.enum(["api", "web", "app"]),
  }),
});
export type TemplateOptions = z.infer<typeof TemplateOptions>;

export const TemplateKey = z.enum([
  "entity",
  "init_types",
  "generated",
  "generated_sso",
  "generated_http",
  "http_validators",
  "model",
  "model_test",
  "bridge",
  "services",
  "view_list",
  "view_list_columns",
  "view_search_input",
  "view_form",
  "view_id_all_select",
  "view_enums_buttonset",
  "queries",
  "entry_server",
  "sd",
]);
export type TemplateKey = z.infer<typeof TemplateKey>;

export const GenerateOptions = z.object({
  overwrite: z.boolean().optional(),
});
export type GenerateOptions = z.infer<typeof GenerateOptions>;

export const PathAndCode = z.object({
  path: z.string(),
  code: z.string(),
});
export type PathAndCode = z.infer<typeof PathAndCode>;

export type FixtureSearchOptions = {
  entityId: string;
  field: string;
  value: string;
  searchType: "equals" | "like";
};

type ColumnValue = string | number | boolean | Date | null;
export type FixtureRecord = {
  fixtureId: string;
  entityId: string;
  id: number | string;
  columns: {
    [key: string]: {
      prop: EntityProp;
      value: ColumnValue | ColumnValue[];
    };
  };
  fetchedRecords: string[];
  belongsRecords: string[];
  target?: FixtureRecord; // Import 대상 DB 레코드(id가 같은)
  unique?: FixtureRecord; // Import 대상 DB 레코드(unique key가 같은)
  override?: boolean;
};

export type FixtureImportResult = {
  entityId: string;
  data: {
    [key: string]: ColumnValue;
  };
};

export type RelationNode = {
  fixtureId: string;
  entityId: string;
  related: Set<string>;
};

// oxlint-disable-next-line @typescript-eslint/no-empty-interface -- sonamu.generated.sso 에서 확장을 위해 준비된 빈 인터페이스
export interface DatabaseSchemaExtend {}
// oxlint-disable-next-line @typescript-eslint/no-empty-interface -- sonamu.generated.sso 에서 확장을 위해 준비된 빈 인터페이스
export interface DatabaseForeignKeys {}
export type ManyToManyBaseSchema<
  FromIdKey extends string,
  ToIdKey extends string,
  FromPkType = number,
  ToPkType = number,
> = {
  id: number;
} & {
  [K in `${FromIdKey}_id`]: FromPkType;
} & {
  [K in `${ToIdKey}_id`]: ToPkType;
};

// 객체, 함수, 비동기 함수를 모두 포괄하는 타입
export type Executable<T> = T | Promise<T> | (() => T) | (() => Promise<T>);

export type SonamuFastifyConfig = {
  contextProvider: (
    defaultContext: Pick<
      Context,
      | "transport"
      | "request"
      | "reply"
      | "headers"
      | "createSSE"
      | "naiteStore"
      | "locale"
      | "user"
      | "session"
    >,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Context | Promise<Context>;
  websocketContextProvider?: (
    defaultContext: Pick<
      import("../api/context").WebSocketContext,
      "transport" | "request" | "headers" | "ws" | "naiteStore" | "locale" | "user" | "session"
    >,
    request: FastifyRequest,
  ) =>
    | import("../api/context").WebSocketContext
    | Promise<import("../api/context").WebSocketContext>;
  guardHandler: (
    guard: GuardKey,
    request: FastifyRequest,
    api: {
      typeParameters: ApiParamType.TypeParam[];
      parameters: ApiParam[];
      returnType: ApiParamType;
      modelName: string;
      methodName: string;
      path: string;
      options: ApiDecoratorOptions;
    },
  ) => void;
  /**
   * 전역 Cache-Control 핸들러입니다.
   * 요청 타입(api, assets, ssr, csr)에 따라 Cache-Control 설정을 반환합니다.
   * undefined를 반환하면 타입별 기본값이 적용됩니다.
   */
  cacheControlHandler?: CacheControlHandler;
};
