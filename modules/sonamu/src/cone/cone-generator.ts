import type { Cone, EntityJson } from "../types/types";

/**
 * Cone 생성 컨텍스트
 *
 * Entity 정보와 생성 옵션을 담고 있습니다.
 */
export type ConeGenerationContext = {
  entity: EntityJson;
  locale?: "ko" | "en" | "ja";
  existingCones?: Record<string, Cone>;
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

/**
 * LLM을 사용하여 Entity의 cone 메타데이터를 생성합니다.
 *
 * @param context - Entity 정보와 생성 옵션
 * @returns 생성된 cone 메타데이터
 */
export async function generateCones(context: ConeGenerationContext): Promise<ConeGenerationResult> {
  const apiKey = getApiKey();
  const prompt = buildPrompt(context);
  const { text: responseText, tokensUsed } = await callAnthropicAPI(prompt, apiKey);
  const result = parseConeResponse(responseText);
  result.tokensUsed = tokensUsed;

  if (context.existingCones) {
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
    apiKey = Sonamu.secret?.anthropic_api_key;
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

  return `You are a Sonamu framework expert. Generate cone metadata for database entity fixture generation.

ENTITY STRUCTURE:
${JSON.stringify(context.entity, null, 2)}

LOCALE: ${locale} (${localeDesc})

INSTRUCTIONS:
1. For each prop, generate appropriate cone metadata:
   - desc: Short description in ${localeDesc}
   - fixtureHint: Detailed guidance for realistic test data generation
   - fixtureGenerator: faker.js expression when applicable

2. Field type → faker.js mapping:
   - email → faker.internet.email()
   - phone → faker.phone.number()
   - name/username → faker.person.fullName() (with locale)
   - birth_date → faker.date.birthdate({ min: 18, max: 65, mode: 'age' })
   - salary → faker.number.int({ min: 30_000_000, max: 150_000_000 }) for ko locale
   - company_name → faker.company.name()
   - address → faker.location.streetAddress()

3. Relation fields (BelongsToOne, OneToOne with hasJoinColumn):
   - Always add dataSource: { strategy: "recent", config: { limit: 3-5 } }
   - fixtureHint: Explain that it references existing data

4. Korean field names (locale=ko):
   - Infer meaning and generate appropriate faker
   - "이름" → faker.person.fullName()
   - "생년월일" → faker.date.birthdate()
   - "주소" → faker.location.streetAddress()

5. Locale-specific values:
   - ko: Korean names, addresses, phone numbers (010-XXXX-XXXX format)
   - en: English names, US addresses
   - ja: Japanese names, addresses

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
    "desc": "${localeDesc} description of the entity",
    "note": "Optional detailed notes",
    "tags": ["optional", "tags"]
  },
  "propCones": {
    "prop_name": {
      "desc": "${localeDesc} description",
      "fixtureHint": "Detailed generation guidance",
      "fixtureGenerator": "faker.xxx.yyy()"
    }
  },
  "subsetCones": {},
  "enumCones": {}
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
): Promise<{ text: string; tokensUsed: number }> {
  try {
    // @ai-sdk/anthropic과 ai 패키지는 optional dependency이므로 동적 import
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    const { generateText } = await import("ai");

    const anthropic = createAnthropic({
      apiKey,
    });

    const { text, usage } = await generateText({
      model: anthropic("claude-sonnet-4-5"),
      prompt,
    });

    const tokensUsed = usage?.totalTokens || 0;
    if (usage) {
      console.log(`[Cone Generator] Tokens used: ${tokensUsed}`);
    }

    return { text, tokensUsed };
  } catch (error: unknown) {
    if (error && typeof error === "object" && "statusCode" in error) {
      const statusCode = (error as { statusCode: number }).statusCode;
      if (statusCode === 429) {
        throw new Error("Rate limit exceeded. Please try again later.");
      }
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`LLM API failed: ${message}`);
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

    if (!parsed.propCones || typeof parsed.propCones !== "object") {
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
