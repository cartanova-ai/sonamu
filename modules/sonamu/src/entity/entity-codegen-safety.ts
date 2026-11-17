import { z } from "zod";

import { type LocalizedString } from "../dict/types";
import { BadRequestException } from "../exceptions/so-exceptions";
import { ZodStringFormat } from "../types/types";

/**
 * 생성 TS에 따옴표 없이 식별자로 들어가는 값의 형식입니다.
 * (entity id, prop 이름, enumId, 테이블명 등)
 *
 * JS가 허용하는 비ASCII 식별자(예: 한글 prop 이름)도 거부하므로, 그런 이름을 쓰던
 * entity.json은 고쳐야 합니다.
 */
export const CODE_IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** prop.id(타입 참조): 식별자 또는 `SonamuFile[]` 같은 배열 표기 */
export const TYPE_REFERENCE_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*(\[\])?$/;

/** subset 키: `${Entity}Subset${key}`처럼 식별자 뒤에 붙으므로 숫자로 시작해도 됩니다. */
export const SUBSET_KEY_PATTERN = /^[A-Za-z0-9_$]+$/;

/** subset 필드: prop 이름을 .으로 이은 경로 */
export const SUBSET_FIELD_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;

function patterned(pattern: RegExp, label: string) {
  return z.string().regex(pattern, {
    error: (iss) =>
      `${label}에는 영문자, 숫자, _, $만 쓸 수 있습니다. 입력값: ${JSON.stringify(iss.input)}`,
  });
}

const identifier = (label: string) => patterned(CODE_IDENTIFIER_PATTERN, label);
const finiteNumber = z.number().finite();

const SubsetFieldSchema = z.union([
  patterned(SUBSET_FIELD_PATTERN, "subset 필드"),
  z.looseObject({ field: patterned(SUBSET_FIELD_PATTERN, "subset 필드") }),
]);

const EnumValuesSchema = z.record(z.string(), z.string());

const CodegenSafePropSchema = z.looseObject({
  name: identifier("prop 이름"),
  type: z.string(),
  desc: z.string().optional(),
  id: patterned(TYPE_REFERENCE_PATTERN, "prop id").optional(),
  with: identifier("relation 대상 entity id").optional(),
  relationType: identifier("relationType").optional(),
  joinTable: identifier("joinTable").optional(),
  joinColumn: identifier("joinColumn").optional(),
  fromColumn: identifier("fromColumn").optional(),
  customJoinClause: z.string().optional(),
  zodFormat: ZodStringFormat.optional(),
  length: finiteNumber.optional(),
  precision: finiteNumber.optional(),
  scale: finiteNumber.optional(),
  dimensions: finiteNumber.optional(),
  sourceColumns: z.array(z.looseObject({ name: identifier("searchText source 컬럼") })).optional(),
});

/**
 * entity.json 중 생성 코드(TS)에 들어가는 필드만 검사하는 스키마입니다.
 *
 * 전체 EntityJsonSchema는 하위 호환을 위해 로드 시 경고만 하므로, 코드 주입에 쓰일 수 있는
 * 필드는 이 스키마로 따로 강제합니다. 자유 문자열(title, desc, enum 키·라벨, customJoinClause)은
 * 형식을 제한하지 않고 템플릿에서 JSON.stringify로 출력합니다.
 * 인덱스·dbDefault·generated.expression은 마이그레이션 코드 생성 쪽에서 다룹니다.
 */
export const EntityCodegenSafetySchema = z.looseObject({
  id: identifier("entity id"),
  parentId: identifier("parentId").optional(),
  title: z.string().optional(),
  table: identifier("table"),
  props: z.array(CodegenSafePropSchema).optional(),
  subsets: z
    .record(
      patterned(SUBSET_KEY_PATTERN, "subset 키"),
      z.union([z.array(SubsetFieldSchema), z.looseObject({ fields: z.array(SubsetFieldSchema) })]),
    )
    .optional(),
  enums: z
    .record(
      identifier("enumId"),
      z.union([EnumValuesSchema, z.looseObject({ values: EnumValuesSchema })]),
    )
    .optional(),
});

/**
 * assertEntityJsonCodegenSafe가 받는 값의 모양입니다.
 *
 * 파일에서 읽은 EntityJson뿐 아니라 TemplateOptions(Zod 스키마)로 만든 새 entity.json도
 * 받아야 하므로, 이 검사가 실제로 읽는 필드의 구조만 요구합니다.
 */
export type EntityCodegenSafetyInput = z.input<typeof EntityCodegenSafetySchema>;

/**
 * entity.json이 생성 코드에 안전하게 들어갈 수 있는지 검사하고, 아니면 400 예외를 던집니다.
 *
 * 정적 타입은 구조만 보장하고 UI API·파일에서 온 값의 형식은 실제로 검증되지 않았으므로 런타임에 다시 검사합니다.
 *
 * @param json 검사할 entity.json 값
 * @param source 오류 메시지에 붙일 출처(파일 경로 등)
 */
export function assertEntityJsonCodegenSafe(json: EntityCodegenSafetyInput, source?: string): void {
  const result = EntityCodegenSafetySchema.safeParse(json);
  if (result.success) {
    return;
  }

  const details = result.error.issues
    .map((issue) => {
      // record 키 오류는 "Invalid key in record"만 남으므로 키 패턴의 실제 메시지를 꺼내 보여줍니다.
      const message =
        issue.code === "invalid_key"
          ? issue.issues.map((keyIssue) => keyIssue.message).join(", ")
          : issue.message;
      return `  - ${issue.path.join(".") || "(root)"}: ${message}`;
    })
    .join("\n");
  const message = `entity.json(${source ?? JSON.stringify(json.id)})에 생성 코드에 쓸 수 없는 값이 있습니다.\n${details}`;
  throw new BadRequestException(
    /* SAFETY: Zod 검증 오류를 사람이 읽을 메시지로 그대로 전달한다(sonamu.ts의 API 검증 오류와 같은 방식). */ message as LocalizedString,
    { zodError: result.error },
  );
}
