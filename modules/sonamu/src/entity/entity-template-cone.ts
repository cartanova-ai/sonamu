import { type FakerMappingConfig, fakerMappings } from "../testing/faker-mappings";
import type { Cone, EntityJson, EntityProp, OneToOneRelationProp, SubsetDef } from "../types/types";
import {
  isBelongsToOneRelationProp,
  isEnumDefWithCone,
  isOneToOneRelationProp,
  isRelationProp,
  isSubsetDefWithCone,
} from "../types/types";

/**
 * Entity의 템플릿 cone을 생성합니다.
 *
 * LLM을 사용하지 않고 faker-mappings.ts를 활용하여 기본 cone을 생성합니다.
 * stub entity 생성 시 자동으로 호출되어 최소한의 cone 메타데이터를 제공합니다.
 */
export function generateTemplateCones(
  entity: EntityJson,
  locale: "ko" | "en" | "ja" = "ko",
): {
  entityCone?: Cone;
  propCones: Record<string, Cone>;
  subsetCones: Record<string, Cone>;
  enumCones: Record<string, Cone>;
} {
  const mapping = fakerMappings[locale];

  if (!mapping) {
    throw new Error(`Unsupported locale: ${locale}`);
  }

  // 1. Entity cone
  const entityCone: Cone = {
    desc: getEntityDesc(entity, locale),
    fixtureHint: getEntityFixtureHint(entity, locale),
  };

  // 2. Prop cones
  const propCones: Record<string, Cone> = {};
  for (const prop of entity.props) {
    const fakerConfig = findFakerMapping(prop, mapping);

    propCones[prop.name] = {
      desc: fakerConfig?.comment || getDefaultDesc(prop, locale),
      fixtureGenerator: fakerConfig?.faker,
      fixtureHint: getFixtureHint(prop, fakerConfig, locale),
      dataSource: shouldHaveDataSource(prop)
        ? { strategy: "recent", config: { limit: 5 } }
        : undefined,
    };
  }

  // 3. Subset cones
  const subsetCones: Record<string, Cone> = {};
  for (const [key, subset] of Object.entries(entity.subsets || {})) {
    subsetCones[key] = {
      desc: getSubsetDesc(key, subset, locale),
      note: getSubsetNote(key, subset, locale),
    };
  }

  // 4. Enum cones
  const enumCones: Record<string, Cone> = {};
  for (const [enumId, enumDef] of Object.entries(entity.enums || {})) {
    const values = isEnumDefWithCone(enumDef) ? enumDef.values : enumDef;

    enumCones[enumId] = {
      desc: getEnumDesc(enumId, locale),
      note: getEnumNote(enumId, values, locale),
      values: Object.keys(values).reduce(
        (acc, key) => {
          acc[key] = {
            desc: getEnumValueDesc(values[key] || key, locale),
          };
          return acc;
        },
        {} as Record<string, { desc: string }>,
      ),
    };
  }

  return { entityCone, propCones, subsetCones, enumCones };
}

/**
 * Prop에 맞는 faker mapping을 찾습니다.
 *
 * 우선순위:
 * 1. field_patterns에서 prop name 매칭 (정확한 이름 매칭)
 * 2. field_patterns에서 부분 매칭 (name 필드가 user_name이면 name 매칭)
 * 3. type_defaults에서 prop type 매칭
 */
function findFakerMapping(
  prop: EntityProp,
  mapping: {
    field_patterns: Record<string, FakerMappingConfig>;
    type_defaults: Record<string, FakerMappingConfig>;
  },
): FakerMappingConfig | undefined {
  if (isRelationProp(prop)) {
    return undefined;
  }

  const propName = prop.name.toLowerCase();

  // 1. 정확한 필드명 매칭
  if (mapping.field_patterns[propName]) {
    return mapping.field_patterns[propName];
  }

  // 2. 부분 매칭 (user_name → name, email_address → email)
  for (const [pattern, config] of Object.entries(mapping.field_patterns)) {
    if (propName.includes(pattern) || propName.endsWith(`_${pattern}`)) {
      return config;
    }
  }

  // 3. 타입 기본값 매칭
  const typeKey = prop.type;
  if (mapping.type_defaults[typeKey]) {
    return mapping.type_defaults[typeKey];
  }

  return undefined;
}

/**
 * Entity 설명을 생성합니다.
 */
function getEntityDesc(entity: EntityJson, locale: "ko" | "en" | "ja"): string {
  const title = entity.title || entity.id;

  const templates = {
    ko: `${title} 엔티티`,
    en: `${title} entity`,
    ja: `${title}エンティティ`,
  };

  return templates[locale];
}

/**
 * Entity fixture hint를 생성합니다.
 */
function getEntityFixtureHint(entity: EntityJson, locale: "ko" | "en" | "ja"): string {
  const title = entity.title || entity.id;

  const templates = {
    ko: `${title} 테스트 데이터를 생성합니다. 각 필드는 실제 데이터와 유사한 형식으로 생성됩니다.`,
    en: `Generates ${title} test data. Each field is generated in a format similar to real data.`,
    ja: `${title}のテストデータを生成します。各フィールドは実際のデータに似た形式で生成されます。`,
  };

  return templates[locale];
}

/**
 * Prop 기본 설명을 생성합니다 (faker mapping이 없는 경우).
 */
function getDefaultDesc(prop: EntityProp, locale: "ko" | "en" | "ja"): string {
  if (isRelationProp(prop)) {
    const templates = {
      ko: `${prop.with} 참조`,
      en: `Reference to ${prop.with}`,
      ja: `${prop.with}への参照`,
    };
    return templates[locale];
  }

  const templates = {
    ko: prop.name,
    en: prop.name,
    ja: prop.name,
  };

  return templates[locale];
}

/**
 * Prop fixture hint를 생성합니다.
 */
function getFixtureHint(
  prop: EntityProp,
  fakerConfig: FakerMappingConfig | undefined,
  locale: "ko" | "en" | "ja",
): string | undefined {
  if (isRelationProp(prop)) {
    const templates = {
      ko: `기존 ${prop.with} 데이터를 참조합니다`,
      en: `References existing ${prop.with} data`,
      ja: `既存の${prop.with}データを参照します`,
    };
    return templates[locale];
  }

  if (fakerConfig?.comment) {
    const templates = {
      ko: `${fakerConfig.comment} 형식으로 생성됩니다`,
      en: `Generated as ${fakerConfig.comment}`,
      ja: `${fakerConfig.comment}形式で生成されます`,
    };
    return templates[locale];
  }

  return undefined;
}

/**
 * Prop이 dataSource를 가져야 하는지 판단합니다.
 *
 * BelongsToOne 또는 OneToOne (hasJoinColumn: true)인 경우 dataSource가 필요합니다.
 */
function shouldHaveDataSource(prop: EntityProp): boolean {
  if (!isRelationProp(prop)) {
    return false;
  }

  // BelongsToOne은 항상 dataSource 필요
  if (isBelongsToOneRelationProp(prop)) {
    return true;
  }

  // OneToOne은 hasJoinColumn: true인 경우에만 dataSource 필요
  if (isOneToOneRelationProp(prop)) {
    return (prop as OneToOneRelationProp).hasJoinColumn === true;
  }

  return false;
}

/**
 * Subset 설명을 생성합니다.
 */
function getSubsetDesc(key: string, _subset: SubsetDef, locale: "ko" | "en" | "ja"): string {
  const templates = {
    ko: `${key} 서브셋`,
    en: `${key} subset`,
    ja: `${key}サブセット`,
  };

  return templates[locale];
}

/**
 * Subset note를 생성합니다.
 */
function getSubsetNote(_key: string, subset: SubsetDef, locale: "ko" | "en" | "ja"): string {
  const fields = isSubsetDefWithCone(subset) ? subset.fields : subset;
  const fieldNames = fields.map((f) => (typeof f === "string" ? f : f.field)).join(", ");

  const templates = {
    ko: `포함된 필드: ${fieldNames}`,
    en: `Included fields: ${fieldNames}`,
    ja: `含まれるフィールド: ${fieldNames}`,
  };

  return templates[locale];
}

/**
 * Enum 설명을 생성합니다.
 */
function getEnumDesc(_enumId: string, locale: "ko" | "en" | "ja"): string {
  const templates = {
    ko: `열거형`,
    en: `enum`,
    ja: `列挙型`,
  };

  return templates[locale];
}

/**
 * Enum note를 생성합니다.
 */
function getEnumNote(
  _enumId: string,
  values: Record<string, string>,
  locale: "ko" | "en" | "ja",
): string {
  const valueList = Object.keys(values).join(", ");

  const templates = {
    ko: `가능한 값: ${valueList}`,
    en: `Possible values: ${valueList}`,
    ja: `可能な値: ${valueList}`,
  };

  return templates[locale];
}

/**
 * Enum value 설명을 생성합니다.
 */
function getEnumValueDesc(label: string, _locale: "ko" | "en" | "ja"): string {
  // label을 그대로 사용
  return label;
}
