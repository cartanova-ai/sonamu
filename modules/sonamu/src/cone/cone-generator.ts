import * as fs from "node:fs";
import * as path from "node:path";

import { type LanguageModel } from "ai";

import { type Cone, type EntityJson } from "../types/types";
import { isObjectValue } from "../utils/runtime-value";

/**
 * Cone 생성 컨텍스트
 *
 * Entity 정보와 생성 옵션을 담고 있습니다.
 */
export type ConeGenerationContext = {
  entity: EntityJson;
  locale?: "ko" | "en" | "ja";
  existingCones?: Record<string, Cone>;
  /** true인 경우 note가 없는 cone만 생성 */
  onlyEmpty?: boolean;
};

/**
 * Cone 생성 결과
 *
 * Entity, Props, Subsets, Enums의 cone 메타데이터를 담고 있습니다.
 */
export type ConeGenerationResult = {
  entityCone?: Cone;
  propCones: Record<string, Cone>;
  subsetCones: Record<string, Cone>;
  enumCones: Record<string, Cone>;
  tokensUsed: number;
};

export type ConeTextGenerator = (request: {
  model: LanguageModel;
  prompt: string;
}) => Promise<{ text: string; usage?: { totalTokens?: number } }>;

export type ConeGeneratorDependencies = {
  generateText?: ConeTextGenerator;
};

/**
 * LLM을 사용하여 Entity의 cone 메타데이터를 생성합니다.
 *
 * @param context - Entity 정보와 생성 옵션
 * @returns 생성된 cone 메타데이터
 */
export async function generateCones(
  context: ConeGenerationContext,
  dependencies: ConeGeneratorDependencies = {},
): Promise<ConeGenerationResult> {
  const apiKey = getApiKey();
  const prompt = buildPrompt(context);
  const { text: responseText, tokensUsed } = await callAnthropicAPI(
    prompt,
    apiKey,
    dependencies.generateText,
  );
  const result = parseConeResponse(responseText);
  result.tokensUsed = tokensUsed;

  if (context.existingCones) {
    if (context.onlyEmpty) {
      return mergeOnlyEmpty(result, context.existingCones);
    }
    return mergeWithExisting(result, context.existingCones);
  }

  return result;
}

/**
 * API 키를 가져옵니다.
 *
 * Sonamu.secret 또는 환경변수에서 가져옵니다.
 */
function getApiKey(): string {
  // Sonamu.secret은 런타임에 로드되므로 동적으로 import
  let apiKey: string | undefined;

  try {
    // Sonamu가 초기화되어 있는 경우
    const { Sonamu } = require("../api");
    apiKey = Sonamu.secrets?.anthropic_api_key;
  } catch {
    // Sonamu가 초기화되지 않은 경우 (테스트 등)
    apiKey = undefined;
  }

  if (!apiKey) {
    apiKey = process.env.ANTHROPIC_API_KEY;
  }

  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY not found. " +
        "Set ANTHROPIC_API_KEY environment variable or add it to sonamu.secret.ts",
    );
  }

  return apiKey;
}

/**
 * 도메인별 {domain}.contract.md를 읽어 컨텍스트로 반환합니다.
 *
 * - contract/{domain}/{domain}.contract.md: 도메인 규칙과 결정 근거
 *
 * cone 생성 시 LLM에게 전달하여 도메인 맥락에 맞는 메타데이터를 생성하도록 합니다.
 */
function readProjectSkills(): string {
  try {
    const { Sonamu } = require("../api");
    const projectRoot = Sonamu.appRootPath;
    const contents: string[] = [];

    // contract/**/*.contract.md 수집
    const contractDir = path.join(projectRoot, "contract");
    if (fs.existsSync(contractDir)) {
      const domains = fs
        .readdirSync(contractDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      for (const domain of domains) {
        const domainDir = path.join(contractDir, domain);
        const contractFiles = fs
          .readdirSync(domainDir)
          .filter((f: string) => f.endsWith(".contract.md"));

        for (const file of contractFiles) {
          const filePath = path.join(domainDir, file);
          const content = fs.readFileSync(filePath, "utf-8").trim();
          if (content) {
            contents.push(`--- contract/${domain}/${file} ---\n${content}`);
          }
        }
      }
    }

    return contents.join("\n\n");
  } catch {
    // Sonamu 미초기화 또는 파일 접근 오류 시 빈 문자열 반환
    return "";
  }
}

/**
 * LLM 프롬프트를 생성합니다.
 *
 * ai-client.ts 패턴을 참고하여 명확한 지시사항과 출력 형식을 제공합니다.
 */
function buildPrompt(context: ConeGenerationContext): string {
  const locale = context.locale || "ko";
  const localeDesc = {
    ko: "Korean",
    en: "English",
    ja: "Japanese",
  }[locale];

  const projectContext = readProjectSkills();
  const projectSection = projectContext
    ? `\nPROJECT CONTEXT (business requirements and domain knowledge):\n${projectContext}\n\nUse the above project context to understand the business domain, entity purposes, field meanings, and relationships. Generate cone metadata that reflects this project's actual requirements, not generic assumptions.\n`
    : "";

  return `You are a Sonamu framework expert. Generate cone metadata for database entity fixture generation.

CRITICAL PRIORITY RULE:
The "note" field is the PRIMARY source for fixture data generation. When --use-llm is enabled, the fixture generator reads cone.note and asks LLM to generate contextually appropriate data BEFORE falling back to fixtureGenerator.
Therefore, cone.note must always contain rich, domain-specific descriptions with concrete examples and value ranges.
fixtureGenerator is only a FALLBACK for when LLM is unavailable (no API key). Write it as a best-effort approximation, but never rely on it as the primary generation method.
${projectSection}
ENTITY STRUCTURE:
${JSON.stringify(context.entity, null, 2)}

LOCALE: ${locale} (${localeDesc})

INSTRUCTIONS:
1. Entity cone metadata:
   - note: Describe what this entity represents, its purpose, relationships, business context, and overall guidance for generating test data. Combine all relevant information into one coherent description.
   - tags: Relevant categorization tags

2. For each prop, generate appropriate cone metadata:
   - note (MOST IMPORTANT): Describe what this field represents in business terms, and provide detailed guidance for realistic test data generation. Include concrete examples, value ranges, formatting rules, and domain constraints. This is the primary input LLM uses to generate fixture data.
   - fixtureGenerator: faker.js expression as FALLBACK only (see rule 9 for exceptions). For free-text fields where faker cannot produce domain-appropriate content (description, summary, note, reason, title, etc.), prefer using faker.helpers.arrayElement([...]) with 5-10 domain-specific example values rather than faker.lorem.*.

3. Field type → faker.js mapping:
   - email → faker.internet.email()
   - phone → faker.phone.number()
   - name/username → faker.person.fullName() (with locale)
   - birth_date → faker.date.birthdate({ min: 18, max: 65, mode: 'age' })
   - salary → faker.number.int({ min: 30_000_000, max: 150_000_000 }) for ko locale
   - company_name → faker.company.name()
   - address → faker.location.streetAddress()

4. Relation fields (BelongsToOne, OneToOne with hasJoinColumn):
   - Always add dataSource: { strategy: "recent", config: { limit: 3-5 } }
   - note: Explain what this relation represents and that it references existing data

5. Subsets cone metadata (IMPORTANT - generate for ALL subsets):
   - note: Describe what this subset represents, what fields it includes, and when to use it

6. Enums cone metadata (IMPORTANT - generate for ALL enums):
   - note: Describe what this enum represents. If any prop uses this enum type, include the same guidance from that prop's note.
   - For each enum value, provide note explaining what that specific value means

7. Korean field names (locale=ko):
   - Infer meaning and generate appropriate faker
   - "이름" → faker.person.fullName()
   - "생년월일" → faker.date.birthdate()
   - "주소" → faker.location.streetAddress()

8. Locale-specific values:
   - ko: Korean names, addresses, phone numbers (010-XXXX-XXXX format)
   - en: English names, US addresses
   - ja: Japanese names, addresses

9. Correlated fields (IMPORTANT - do NOT use fixtureGenerator for these):
   If multiple props are semantically related and must be consistent with each other (e.g. name + name_en, name + name_ja, title + title_en), do NOT set fixtureGenerator on any of them.
   Instead, set only note with a clear description that explains the relationship.
   Example: if name is a Korean full name like "김민수", then name_en must be its romanized form "Kim Minsu".
   The fixture generator will pass all such props together to LLM in a single call to ensure consistency.
   Detection rule: if a prop name matches another prop name with a locale suffix (_en, _ko, _ja, _cn) or vice versa, treat them as correlated.

10. String PK id:
   - Never set fixtureStrategy: "sequence" on an id prop with type "string".
   - Do not set fixtureGenerator either — fixture-generator automatically generates alphanumeric(32).
   - In note, describe how the id is generated (e.g. random string generated by better-auth).

11. fixtureCompanions (IMPORTANT - never generate or modify):
   - fixtureCompanions is user-declared metadata that triggers automatic companion fixture creation when a parent fixture is generated.
   - Do NOT generate or suggest fixtureCompanions for any prop. Only users declare this intentionally.
   - If a prop's existing cone already contains fixtureCompanions, preserve it exactly as-is in the propCones output. Do not remove, alter, or omit it.
   - Example: if User entity's "id" prop cone has fixtureCompanions, include it unchanged in propCones["id"].

${
  context.existingCones
    ? `
EXISTING CONES (preserve these if present):
${JSON.stringify(context.existingCones, null, 2)}
`
    : ""
}

OUTPUT FORMAT:
Return ONLY valid JSON (no markdown, no code blocks). Use this exact structure:
{
  "entityCone": {
    "note": "Description of the entity, its purpose, and guidance for fixture generation",
    "tags": ["optional", "tags"]
  },
  "propCones": {
    "prop_name": {
      "note": "Description of this field and guidance for realistic test data generation",
      "fixtureGenerator": "faker.xxx.yyy()",
      "dataSource": { "strategy": "recent", "config": { "limit": 5 } }
    }
  },
  "subsetCones": {
    "A": {
      "note": "Description of subset A, what fields it includes, and when to use it"
    }
  },
  "enumCones": {
    "EnumName": {
      "note": "Description of the enum and guidance for generating values",
      "values": {
        "VALUE_KEY": {
          "note": "${localeDesc} description of this enum value"
        }
      }
    }
  }
}

IMPORTANT: Return pure JSON only. Do NOT wrap in markdown code blocks.`;
}

/**
 * Anthropic API를 호출하여 LLM 응답을 받습니다.
 *
 * @param prompt - 생성할 프롬프트
 * @param apiKey - Anthropic API 키
 * @returns LLM 응답 텍스트 및 토큰 사용량
 */
async function callAnthropicAPI(
  prompt: string,
  apiKey: string,
  injectedGenerateText?: ConeTextGenerator,
): Promise<{ text: string; tokensUsed: number }> {
  try {
    // @ai-sdk/anthropic과 ai 패키지는 optional dependency이므로 동적 import
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    const generateText: ConeTextGenerator =
      injectedGenerateText ??
      (async (request) => {
        const ai = await import("ai");
        return ai.generateText(request);
      });

    const anthropic = createAnthropic({
      apiKey,
    });

    const { text, usage } = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      prompt,
    });

    const tokensUsed = usage?.totalTokens || 0;
    if (usage) {
      console.log(`[Cone Generator] Tokens used: ${tokensUsed}`);
    }

    return { text, tokensUsed };
  } catch (error: unknown) {
    if (error && isObjectValue(error) && "statusCode" in error) {
      const statusCode =
        /* SAFETY: 호출 경계의 선행 검증과 소유 타입 계약이 이 값의 타입을 보장한다. */ (
          error as { statusCode: number }
        ).statusCode;
      if (statusCode === 429) {
        throw new Error("Rate limit exceeded. Please try again later.", { cause: error });
      }
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`LLM API failed: ${message}`, { cause: error });
  }
}

/**
 * LLM 응답을 파싱하여 ConeGenerationResult로 변환합니다.
 *
 * Markdown 코드 블록이 포함되어 있으면 제거합니다.
 */
function parseConeResponse(text: string): ConeGenerationResult {
  let jsonText = text.trim();
  jsonText = jsonText.replace(/^```json\s*/i, "");
  jsonText = jsonText.replace(/```\s*$/, "");
  jsonText = jsonText.trim();

  try {
    const parsed = JSON.parse(jsonText);

    if (!parsed.propCones || !isObjectValue(parsed.propCones)) {
      throw new Error("Invalid response: propCones is required and must be an object");
    }

    return {
      entityCone: parsed.entityCone,
      propCones: parsed.propCones,
      subsetCones: parsed.subsetCones || {},
      enumCones: parsed.enumCones || {},
      tokensUsed: 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(
      `Failed to parse LLM response: ${message}\n\n` +
        `Original response:\n${text}\n\n` +
        `Cleaned JSON:\n${jsonText}`,
      { cause: error },
    );
  }
}

/**
 * 생성된 cone을 기존 cone과 병합합니다.
 *
 * 기존 cone이 있으면 보존하고, 없는 경우에만 생성된 cone을 사용합니다.
 */
function mergeWithExisting(
  generated: ConeGenerationResult,
  existing: Record<string, Cone>,
): ConeGenerationResult {
  const result = { ...generated };

  const entityKey = `entity:${generated.entityCone ? "present" : "missing"}`;
  if (existing[entityKey]) {
    result.entityCone = existing[entityKey];
  }

  for (const propName of Object.keys(generated.propCones)) {
    const key = `prop:${propName}`;
    if (existing[key]) {
      result.propCones[propName] = existing[key];
    }
  }

  for (const enumId of Object.keys(generated.enumCones)) {
    const key = `enum:${enumId}`;
    if (existing[key]) {
      result.enumCones[enumId] = existing[key];
    }
  }

  for (const subsetKey of Object.keys(generated.subsetCones)) {
    const key = `subset:${subsetKey}`;
    if (existing[key]) {
      result.subsetCones[subsetKey] = existing[key];
    }
  }

  return result;
}

/**
 * note가 없는 cone만 생성하고 나머지는 보존합니다.
 *
 * 기존 cone에 note가 있으면 보존하고, 없으면 새로 생성된 cone을 사용합니다.
 */
function mergeOnlyEmpty(
  generated: ConeGenerationResult,
  existing: Record<string, Cone>,
): ConeGenerationResult {
  const result = { ...generated };

  // Entity cone: scale이 있으면 보존
  const entityKey = `entity:${generated.entityCone ? "present" : "missing"}`;
  if (existing[entityKey]?.note) {
    result.entityCone = existing[entityKey];
  }

  // Prop cones: scale이 있으면 보존
  for (const propName of Object.keys(generated.propCones)) {
    const key = `prop:${propName}`;
    if (existing[key]?.note) {
      result.propCones[propName] = existing[key];
    }
  }

  // Enum cones: scale이 있으면 보존
  for (const enumId of Object.keys(generated.enumCones)) {
    const key = `enum:${enumId}`;
    if (existing[key]?.note) {
      result.enumCones[enumId] = existing[key];
    }
  }

  // Subset cones: scale이 있으면 보존
  for (const subsetKey of Object.keys(generated.subsetCones)) {
    const key = `subset:${subsetKey}`;
    if (existing[key]?.note) {
      result.subsetCones[subsetKey] = existing[key];
    }
  }

  return result;
}
