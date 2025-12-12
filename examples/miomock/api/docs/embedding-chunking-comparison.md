# Embedding 모델 & Chunking 전략 비교 가이드

> 작성일: 2024-12-08  
> 목적: RAG 시스템 구축을 위한 Embedding 모델과 Chunking 전략 선택 가이드  
> 코드 예시: TypeScript/Node.js 기반

---

## ⚠️ 중요 정정 사항

### Claude Embedding 모델에 대해

**Anthropic(Claude)은 자체 Embedding 모델을 제공하지 않습니다.**

> "Anthropic does not offer its own embedding model."  
> — [Claude 공식 문서](https://docs.anthropic.com/claude/docs/embeddings)

Anthropic은 **Voyage AI**를 공식 파트너로 추천합니다.  
따라서 `claude-3-haiku-embedding` 같은 모델명은 존재하지 않습니다.

---

## 📊 Part 1: Embedding 모델 비교

### 1.1 주요 Embedding 모델 개요

| Provider | 모델명 | 차원 | Context 길이 | 특징 |
|----------|-------|-----|-------------|------|
| **OpenAI** | text-embedding-3-large | 3,072 | 8,192 | 가장 널리 사용됨 |
| **OpenAI** | text-embedding-3-small | 1,536 | 8,192 | 비용 효율적 |
| **Voyage AI** | voyage-3-large | 1,024~2,048 | 32,000 | SOTA 성능 |
| **Voyage AI** | voyage-3 | 1,024 | 32,000 | 균형 잡힌 성능 |
| **Voyage AI** | voyage-3-lite | 512 | 32,000 | 저비용/저지연 |
| **Nomic** | nomic-embed-text-v1.5 | 768 | 8,192 | 오픈소스 |
| **Google** | gemini-embedding-001 | 768 | - | 무료 |

---

### 1.2 성능 벤치마크 비교 (정확성)

#### MTEB/NDCG@10 기준 (높을수록 좋음)

| 모델 | 평균 성능 | OpenAI v3-large 대비 |
|-----|---------|---------------------|
| **voyage-3-large** | 🥇 최고 | +10.58% |
| **voyage-3** | 🥈 | +7.55% |
| **voyage-3-lite** | 🥉 | +3.82% |
| **text-embedding-3-large** | 기준선 | 0% |
| **text-embedding-3-small** | - | -7.58% (voyage-3-lite 대비) |
| **nomic-embed-text-v1** | - | ada-002, 3-small 능가 |

#### 도메인별 성능 (Voyage AI 우위 영역)

```
┌─────────────────────────────────────────────────────────────┐
│  Code        ████████████████████████████  voyage-code-3    │
│  Law         █████████████████████████     voyage-law-2     │
│  Finance     ████████████████████████      voyage-finance-2 │
│  Multilingual████████████████████         voyage-multilingual-2│
│  Long Context████████████████████████████  voyage-3 (32K)   │
└─────────────────────────────────────────────────────────────┘
```

**핵심 인사이트:**
- **Voyage AI**가 대부분의 벤치마크에서 OpenAI를 능가
- **도메인 특화 모델**(법률, 금융, 코드)이 범용 모델보다 해당 도메인에서 훨씬 우수
- **nomic-embed**는 오픈소스 중 최고 성능

---

### 1.3 속도/지연시간 비교 (성능)

| 모델 | Latency (ms) | 상대 속도 |
|-----|-------------|----------|
| **voyage-3-large** | ~89ms | 🥇 가장 빠름 (3.5x faster than OpenAI) |
| **voyage-3** | ~62.5ms | 🥇 매우 빠름 |
| **gemini-embedding-001** | ~196ms | 중간 |
| **text-embedding-3-large** | ~312ms | 느림 |
| **nomic-embed-text** | ~100ms+ | 중간 (로컬 실행 시 변동) |

**처리량 (Throughput):**
- voyage-3: 40M tokens/hour
- voyage-2: 36M tokens/hour

**지연시간에 영향을 미치는 요소:**
1. **차원 수**: 낮을수록 빠름 (voyage: 1024 vs OpenAI: 3072)
2. **네트워크**: API 호출 위치
3. **배치 크기**: 대량 처리 시 최적화 가능

---

### 1.4 비용 비교 ($/1M tokens)

| 모델 | 가격 | 상대 비용 | 무료 티어 |
|-----|-----|---------|----------|
| **voyage-3-lite** | $0.02 | 🥇 최저가 (API) | 200M tokens |
| **text-embedding-3-small** | $0.02 | 🥇 최저가 (API) | - |
| **voyage-3** | $0.06 | 저렴 | 200M tokens |
| **voyage-3-large** | $0.18 | 중간 | 200M tokens |
| **text-embedding-3-large** | $0.13 | 중간 | - |
| **nomic-embed-text** | **무료** | 🏆 오픈소스 | 무제한 (셀프호스팅) |
| **gemini-embedding-001** | **무료** | 🏆 | 관대한 한도 |

**VectorDB 스토리지 비용까지 고려하면:**

| 모델 | 차원 | 상대 스토리지 비용 |
|-----|-----|-----------------|
| voyage-3-lite | 512 | 1x (기준) |
| voyage-3 | 1,024 | 2x |
| text-embedding-3-large | 3,072 | 6x |

> 💡 **Voyage AI**는 차원이 작아서 VectorDB 비용도 3~6배 절감

---

### 1.5 종합 비교 매트릭스

| 기준 | OpenAI 3-large | Voyage 3-large | Voyage 3-lite | Nomic v1.5 | Gemini |
|-----|---------------|----------------|---------------|------------|--------|
| **정확성** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **속도** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **비용** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Context 길이** | ⭐⭐⭐ (8K) | ⭐⭐⭐⭐⭐ (32K) | ⭐⭐⭐⭐⭐ (32K) | ⭐⭐⭐ (8K) | ⭐⭐⭐ |
| **다국어** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **오픈소스** | ❌ | ❌ | ❌ | ✅ | ❌ |

---

### 1.6 추천 사용 케이스

#### 🎯 정확성이 최우선일 때
```
추천: voyage-3-large
이유: SOTA 성능, 모든 벤치마크 1위
비용: $0.18/1M tokens
```

#### 💰 비용 효율성이 중요할 때
```
추천: voyage-3-lite 또는 text-embedding-3-small
이유: 동일 가격($0.02)에서 voyage-3-lite가 7.58% 더 정확
무료 옵션: nomic-embed (셀프호스팅), gemini-embedding-001
```

#### ⚡ 속도가 중요할 때
```
추천: voyage-3-lite (512 dims) 또는 voyage-3
이유: 가장 낮은 지연시간, 높은 처리량
```

#### 📚 긴 문서를 다룰 때
```
추천: Voyage AI 모델 (32K context)
이유: OpenAI(8K)의 4배 긴 컨텍스트
```

#### 🔒 프라이버시/오프라인이 필요할 때
```
추천: nomic-embed-text (Ollama로 로컬 실행)
이유: 완전 오픈소스, 로컬 실행 가능, 무료
```

#### 🏛️ 특정 도메인에 특화
```
법률: voyage-law-2
금융: voyage-finance-2
코드: voyage-code-3
다국어: voyage-multilingual-2
```

---

## 📊 Part 2: Chunking 전략 비교

### 2.1 Chunking 전략 개요

```
┌─────────────────────────────────────────────────────────────────┐
│                     Chunking 전략 스펙트럼                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  간단/빠름 ◀────────────────────────────────────▶ 복잡/정확     │
│                                                                 │
│  Fixed-Size    Recursive    Sentence    Semantic    Agentic    │
│     │             │            │            │           │       │
│     ▼             ▼            ▼            ▼           ▼       │
│  문자 수로     계층적으로    문장 단위    의미 기반    AI가      │
│  단순 분할    점진적 분할    자연스러운   유사도로    동적 결정  │
│                             경계         분할                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 2.2 각 전략별 상세 비교

#### 1️⃣ Fixed-Size Chunking (고정 크기)

```typescript
/**
 * 고정 크기 청킹
 * 가장 단순한 방식 - 문자 수 기준으로 분할
 */
function fixedSizeChunk(
  text: string,
  chunkSize: number = 500,
  overlap: number = 50
): string[] {
  const chunks: string[] = [];
  const step = chunkSize - overlap;

  for (let i = 0; i < text.length; i += step) {
    chunks.push(text.slice(i, i + chunkSize));
  }

  return chunks;
}

// 사용 예시
const text = "긴 문서 내용...";
const chunks = fixedSizeChunk(text, 500, 50);
```

| 항목 | 평가 |
|-----|-----|
| **정확성** | ⭐⭐ (문맥 무시, 단어 중간에서 잘릴 수 있음) |
| **속도** | ⭐⭐⭐⭐⭐ (가장 빠름) |
| **비용** | ⭐⭐⭐⭐⭐ (추가 비용 없음) |
| **구현 난이도** | ⭐ (가장 쉬움) |

**장점:**
- 구현이 매우 간단
- 예측 가능한 청크 크기
- 빠른 프로토타이핑에 적합

**단점:**
- 의미 단위 무시
- 문장 중간에서 잘림
- 검색 정확도 낮음

**사용 시기:**
- 빠른 프로토타이핑
- 균일한 형식의 문서 (뉴스, 블로그)

---

#### 2️⃣ Recursive Character Chunking (재귀적 문자)

```typescript
/**
 * 재귀적 문자 청킹
 * 구분자 우선순위에 따라 점진적으로 분할
 */
interface RecursiveChunkOptions {
  chunkSize: number;
  chunkOverlap: number;
  separators: string[];
}

function recursiveCharacterChunk(
  text: string,
  options: RecursiveChunkOptions = {
    chunkSize: 500,
    chunkOverlap: 50,
    separators: ["\n\n", "\n", ". ", " ", ""],
  }
): string[] {
  const { chunkSize, chunkOverlap, separators } = options;

  function splitText(text: string, separatorIndex: number): string[] {
    // 텍스트가 충분히 작으면 그대로 반환
    if (text.length <= chunkSize) {
      return text.trim() ? [text.trim()] : [];
    }

    // 모든 구분자를 시도했으면 강제 분할
    if (separatorIndex >= separators.length) {
      const chunks: string[] = [];
      for (let i = 0; i < text.length; i += chunkSize - chunkOverlap) {
        const chunk = text.slice(i, i + chunkSize).trim();
        if (chunk) chunks.push(chunk);
      }
      return chunks;
    }

    const separator = separators[separatorIndex];
    const splits = text.split(separator);

    const chunks: string[] = [];
    let currentChunk = "";

    for (const split of splits) {
      const potentialChunk = currentChunk
        ? currentChunk + separator + split
        : split;

      if (potentialChunk.length <= chunkSize) {
        currentChunk = potentialChunk;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        // 현재 split이 여전히 크면 다음 구분자로 재귀 분할
        if (split.length > chunkSize) {
          chunks.push(...splitText(split, separatorIndex + 1));
          currentChunk = "";
        } else {
          currentChunk = split;
        }
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  return splitText(text, 0);
}

// 사용 예시
const document = `
첫 번째 문단입니다. 여러 문장이 있습니다.

두 번째 문단입니다. 이것도 여러 문장으로 구성됩니다.
줄바꿈이 있는 내용입니다.
`;

const chunks = recursiveCharacterChunk(document, {
  chunkSize: 100,
  chunkOverlap: 20,
  separators: ["\n\n", "\n", ". ", " ", ""],
});
```

| 항목 | 평가 |
|-----|-----|
| **정확성** | ⭐⭐⭐⭐ (85-90% recall @ 400 tokens) |
| **속도** | ⭐⭐⭐⭐ (빠름) |
| **비용** | ⭐⭐⭐⭐⭐ (추가 비용 없음) |
| **구현 난이도** | ⭐⭐ (쉬움) |

**NVIDIA 2024 벤치마크 결과:**
- 400 tokens에서 88.1-89.5% recall 달성
- 대부분의 케이스에서 권장 기본값

**장점:**
- 자연스러운 경계(문단, 문장) 존중
- Fixed-Size보다 의미 보존 우수
- 추가 ML 모델 불필요

**단점:**
- 여전히 의미 기반은 아님
- 복잡한 문서에서 한계

**사용 시기:**
- ✅ **대부분의 RAG 프로젝트에서 기본값으로 추천**
- 일반적인 문서 (보고서, 기사, 매뉴얼)

---

#### 3️⃣ Sentence-Based Chunking (문장 기반)

```typescript
/**
 * 문장 기반 청킹
 * 문장 단위로 분할하여 N개씩 그룹화
 */

// 간단한 문장 분리 함수 (정규식 기반)
function splitIntoSentences(text: string): string[] {
  // 마침표, 물음표, 느낌표 뒤에서 분리 (약어 등 예외 처리 필요 시 확장)
  return text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

interface SentenceChunkOptions {
  sentencesPerChunk: number;
  overlap: number; // 겹치는 문장 수
}

function sentenceBasedChunk(
  text: string,
  options: SentenceChunkOptions = {
    sentencesPerChunk: 5,
    overlap: 1,
  }
): string[] {
  const { sentencesPerChunk, overlap } = options;
  const sentences = splitIntoSentences(text);
  const chunks: string[] = [];
  const step = sentencesPerChunk - overlap;

  for (let i = 0; i < sentences.length; i += step) {
    const chunkSentences = sentences.slice(i, i + sentencesPerChunk);
    if (chunkSentences.length > 0) {
      chunks.push(chunkSentences.join(" "));
    }
  }

  return chunks;
}

// 사용 예시
const article = `
인공지능이 빠르게 발전하고 있습니다. 특히 자연어 처리 분야에서 놀라운 성과를 보이고 있습니다.
GPT와 같은 대규모 언어 모델이 등장했습니다. 이 모델들은 다양한 작업을 수행할 수 있습니다.
RAG는 검색과 생성을 결합한 기술입니다. 이를 통해 더 정확한 답변을 제공할 수 있습니다.
`;

const chunks = sentenceBasedChunk(article, {
  sentencesPerChunk: 3,
  overlap: 1,
});
```

| 항목 | 평가 |
|-----|-----|
| **정확성** | ⭐⭐⭐⭐ |
| **속도** | ⭐⭐⭐⭐ |
| **비용** | ⭐⭐⭐⭐⭐ (토크나이저만 필요) |
| **구현 난이도** | ⭐⭐ |

**장점:**
- 완전한 문장 보장
- 가독성 유지
- 번역, 감성분석에 적합

**단점:**
- 문장 길이 불균일 → 청크 크기 변동
- 깊은 의미 관계는 포착 못함

**사용 시기:**
- 번역 시스템
- 감성 분석
- Q&A 시스템

---

#### 4️⃣ Semantic Chunking (의미 기반)

```typescript
/**
 * 의미 기반 청킹
 * 임베딩 유사도를 기반으로 의미 변화 지점에서 분할
 */

// 코사인 유사도 계산
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

interface SemanticChunkOptions {
  threshold: number; // 유사도 임계값 (이하면 분할)
  embedFn: (text: string) => Promise<number[]>; // 임베딩 함수
}

async function semanticChunk(
  text: string,
  options: SemanticChunkOptions
): Promise<string[]> {
  const { threshold, embedFn } = options;

  // 문장 단위로 분리
  const sentences = text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length === 0) return [];
  if (sentences.length === 1) return [sentences[0]];

  // 각 문장의 임베딩 생성
  const embeddings = await Promise.all(sentences.map((s) => embedFn(s)));

  const chunks: string[] = [];
  let currentChunk: string[] = [sentences[0]];

  for (let i = 1; i < sentences.length; i++) {
    const similarity = cosineSimilarity(embeddings[i - 1], embeddings[i]);

    if (similarity < threshold) {
      // 의미 변화 감지 → 새 청크 시작
      chunks.push(currentChunk.join(" "));
      currentChunk = [];
    }

    currentChunk.push(sentences[i]);
  }

  // 마지막 청크 추가
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(" "));
  }

  return chunks;
}

// 사용 예시 (Voyage AI 사용)
async function embedWithVoyage(text: string): Promise<number[]> {
  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: [text],
      model: "voyage-3-lite",
    }),
  });

  const data = await response.json();
  return data.data[0].embedding;
}

// 실행
const document = `
기계학습은 인공지능의 한 분야입니다. 데이터에서 패턴을 학습합니다.
오늘 날씨가 매우 좋습니다. 산책하기 좋은 날입니다.
딥러닝은 신경망을 사용합니다. 이미지 인식에 뛰어난 성능을 보입니다.
`;

const semanticChunks = await semanticChunk(document, {
  threshold: 0.5,
  embedFn: embedWithVoyage,
});
```

| 항목 | 평가 |
|-----|-----|
| **정확성** | ⭐⭐⭐⭐⭐ (최대 9% recall 향상) |
| **속도** | ⭐⭐ (느림 - 임베딩 생성 필요) |
| **비용** | ⭐⭐ (임베딩 API 비용 발생) |
| **구현 난이도** | ⭐⭐⭐⭐ (복잡) |

**Chroma Research 결과:**
- LLMSemanticChunker: 91.9% recall
- ClusterSemanticChunker: 91.3% recall

**변형 방식:**
| 방식 | 설명 |
|-----|-----|
| Percentile-based | 유사도가 특정 백분위 이하면 분할 |
| Standard Deviation | 유사도가 표준편차 이상 벗어나면 분할 |
| Interquartile | IQR 기반 분할 |

**장점:**
- 의미적으로 coherent한 청크 생성
- 주제 변화를 정확히 감지
- 검색 정확도 최고

**단점:**
- 임베딩 생성 비용
- 처리 시간 증가
- 구현 복잡

**사용 시기:**
- 고정확도가 필요한 RAG
- 법률, 의료, 연구 문서
- 예산 여유가 있는 프로젝트

---

#### 5️⃣ Page-Level Chunking (페이지 기반)

```typescript
/**
 * 페이지 기반 청킹
 * PDF 등 페이지 구조가 있는 문서용
 */
interface Page {
  pageNumber: number;
  content: string;
}

interface PageChunk {
  content: string;
  pageNumbers: number[];
}

interface PageChunkOptions {
  maxPagesPerChunk: number;
  overlap: number; // 겹치는 페이지 수
}

function pageLevelChunk(
  pages: Page[],
  options: PageChunkOptions = {
    maxPagesPerChunk: 1,
    overlap: 0,
  }
): PageChunk[] {
  const { maxPagesPerChunk, overlap } = options;
  const chunks: PageChunk[] = [];
  const step = maxPagesPerChunk - overlap;

  for (let i = 0; i < pages.length; i += step) {
    const pageSlice = pages.slice(i, i + maxPagesPerChunk);
    chunks.push({
      content: pageSlice.map((p) => p.content).join("\n\n"),
      pageNumbers: pageSlice.map((p) => p.pageNumber),
    });
  }

  return chunks;
}

// 사용 예시 (pdf-parse 라이브러리와 함께)
import pdf from "pdf-parse";
import fs from "fs";

async function chunkPDF(filePath: string): Promise<PageChunk[]> {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdf(dataBuffer);

  // 페이지별로 분리 (pdf-parse는 기본적으로 전체 텍스트 반환)
  // 실제로는 더 정교한 페이지 분리 로직 필요
  const pages: Page[] = data.text.split("\f").map((content, index) => ({
    pageNumber: index + 1,
    content: content.trim(),
  }));

  return pageLevelChunk(pages, {
    maxPagesPerChunk: 1,
    overlap: 0,
  });
}
```

| 항목 | 평가 |
|-----|-----|
| **정확성** | ⭐⭐⭐⭐⭐ (NVIDIA 벤치마크 1위: 0.648 accuracy) |
| **속도** | ⭐⭐⭐⭐⭐ (매우 빠름) |
| **비용** | ⭐⭐⭐⭐⭐ |
| **구현 난이도** | ⭐⭐ |

**NVIDIA 2024 벤치마크 결과:**
- 0.648 accuracy, 0.107 표준편차 (가장 안정적)
- 특히 구조화된 문서(재무보고서, 법률문서)에서 우수

**장점:**
- 문서의 원래 구조 존중
- 일관된 성능
- 메타데이터(페이지 번호) 보존 용이

**단점:**
- PDF에서 임의로 페이지가 나뉜 경우 비효율적
- 페이지 개념이 없는 문서에는 부적합

**사용 시기:**
- PDF 문서 (보고서, 매뉴얼, 논문)
- 페이지 단위로 구조화된 문서

---

#### 6️⃣ Agentic Chunking (AI 에이전트 기반)

```typescript
/**
 * AI 에이전트 기반 청킹
 * LLM을 사용해 동적으로 최적의 분할점 결정
 */
import Anthropic from "@anthropic-ai/sdk";

interface AgenticChunkOptions {
  model?: string;
  maxChunks?: number;
}

async function agenticChunk(
  document: string,
  options: AgenticChunkOptions = {}
): Promise<string[]> {
  const { model = "claude-3-haiku-20240307", maxChunks = 10 } = options;

  const client = new Anthropic();

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `다음 문서를 의미있는 청크로 분할해주세요.

요구사항:
1. 각 청크는 하나의 완전한 개념이나 주제를 담아야 합니다.
2. 청크 수는 최대 ${maxChunks}개로 제한합니다.
3. 각 청크는 독립적으로 이해 가능해야 합니다.
4. JSON 배열 형식으로 반환해주세요.

문서:
${document}

응답 형식:
["청크1 내용", "청크2 내용", ...]`,
      },
    ],
  });

  // 응답에서 JSON 배열 추출
  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type");
  }

  try {
    const chunks = JSON.parse(content.text);
    if (Array.isArray(chunks)) {
      return chunks;
    }
    throw new Error("Response is not an array");
  } catch {
    // JSON 파싱 실패 시 텍스트 그대로 반환
    return [content.text];
  }
}

// 사용 예시
const complexDocument = `
[복잡한 문서 내용...]
`;

const chunks = await agenticChunk(complexDocument, {
  model: "claude-3-haiku-20240307",
  maxChunks: 5,
});
```

| 항목 | 평가 |
|-----|-----|
| **정확성** | ⭐⭐⭐⭐⭐ (최고) |
| **속도** | ⭐ (가장 느림) |
| **비용** | ⭐ (LLM API 비용 발생) |
| **구현 난이도** | ⭐⭐⭐⭐⭐ (가장 복잡) |

**장점:**
- 문서 유형에 따라 동적으로 전략 선택
- 가장 정확한 의미 단위 분할
- 복잡한 문서에도 대응 가능

**단점:**
- 매우 높은 비용
- 긴 처리 시간
- 결과 재현성 이슈

**사용 시기:**
- 극도로 중요한 문서
- 복잡하고 비정형적인 콘텐츠
- 비용이 문제되지 않는 경우

---

### 2.3 Chunking 성능 벤치마크 요약

#### Recall 성능 비교 (Chroma Research 2024)

| 전략 | Recall | 비고 |
|-----|--------|-----|
| LLM Semantic Chunker | 91.9% | 최고 정확도, 높은 비용 |
| Cluster Semantic Chunker | 91.3% | |
| Recursive (400 tokens) | 88.1-89.5% | ✅ **권장 기본값** |
| Recursive (512 tokens) | 85.4-87.2% | |
| Fixed-Size | ~80% | 빠르지만 정확도 낮음 |

#### 쿼리 유형별 최적 청크 크기 (NVIDIA 2024)

| 쿼리 유형 | 최적 청크 크기 | 설명 |
|----------|--------------|------|
| **Factoid (사실 기반)** | 256-512 tokens | "서울의 인구는?" |
| **Analytical (분석적)** | 1024+ tokens | "기후변화의 원인을 설명해줘" |
| **Multi-concept** | 가변적 | 여러 개념을 연결하는 질문 |

---

### 2.4 Chunking 추천 가이드

```
┌──────────────────────────────────────────────────────────────────┐
│                    Chunking 전략 선택 플로우                       │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   문서 유형은?   │
                    └─────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
    ┌─────────┐         ┌─────────┐         ┌─────────┐
    │   PDF   │         │ 일반 텍스트│         │  코드   │
    │ (보고서) │         │ (블로그 등)│         │ (소스)  │
    └─────────┘         └─────────┘         └─────────┘
         │                    │                    │
         ▼                    ▼                    ▼
    Page-Level          Recursive            Language-
    Chunking            Character            Specific
                        (400-512)
                              │
                              ▼
                    ┌─────────────────┐
                    │ 정확도 요구사항? │
                    └─────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
         ┌─────────┐    ┌─────────┐    ┌─────────┐
         │  높음   │    │  중간   │    │  낮음   │
         │(법률,의료)│    │(일반 RAG)│    │(프로토타입)│
         └─────────┘    └─────────┘    └─────────┘
              │               │               │
              ▼               ▼               ▼
         Semantic        Recursive        Fixed-Size
         Chunking       (with overlap)
```

---

### 2.5 실제 구현 권장사항

#### 기본 설정 (대부분의 프로젝트)

```typescript
// ✅ 권장 기본 설정
const defaultChunkOptions: RecursiveChunkOptions = {
  chunkSize: 400,           // 400-512 tokens 권장
  chunkOverlap: 50,         // 10-20% overlap
  separators: ["\n\n", "\n", ". ", " ", ""],
};

// Sonamu 프레임워크에서 사용 예시
export class ChunkingService {
  private options: RecursiveChunkOptions;

  constructor(options?: Partial<RecursiveChunkOptions>) {
    this.options = {
      ...defaultChunkOptions,
      ...options,
    };
  }

  chunk(text: string): string[] {
    return recursiveCharacterChunk(text, this.options);
  }
}

// 사용
const chunkingService = new ChunkingService();
const chunks = chunkingService.chunk(documentContent);
```

#### Overlap 설정 가이드

| Overlap | 사용 시기 |
|---------|----------|
| 0% | 스토리지 비용 절약 필요 시 |
| 10-20% | ✅ 일반적 권장값 |
| 20-30% | 문맥 손실이 치명적인 경우 |

---

## 📊 Part 3: 종합 권장사항

### 3.1 시나리오별 최적 조합

#### 🚀 빠른 프로토타이핑

| 구성요소 | 선택 | 이유 |
|---------|-----|-----|
| **Embedding** | nomic-embed-text (로컬) 또는 voyage-3-lite | 무료 또는 최저가 |
| **Chunking** | Recursive (500 tokens, 10% overlap) | 빠르고 안정적 |
| **예상 비용** | $0 ~ $0.02/1M tokens | |

#### 💼 프로덕션 RAG (일반)

| 구성요소 | 선택 | 이유 |
|---------|-----|-----|
| **Embedding** | voyage-3 | 성능/비용 균형 |
| **Chunking** | Recursive (400 tokens, 15% overlap) | 검증된 성능 |
| **예상 비용** | $0.06/1M tokens | |

#### 🏆 최고 정확도 RAG

| 구성요소 | 선택 | 이유 |
|---------|-----|-----|
| **Embedding** | voyage-3-large | SOTA 성능 |
| **Chunking** | Semantic Chunking | 91.9% recall |
| **추가 옵션** | Reranker (rerank-2.5) | 추가 67% 오류 감소 |
| **예상 비용** | $0.18+/1M tokens | |

#### 🏛️ 도메인 특화 (법률/금융/코드)

| 도메인 | Embedding | Chunking |
|-------|-----------|----------|
| **법률** | voyage-law-2 | Page-level + Semantic |
| **금융** | voyage-finance-2 | Page-level (보고서) |
| **코드** | voyage-code-3 | Language-specific |

#### 🌍 다국어 지원

| 구성요소 | 선택 | 이유 |
|---------|-----|-----|
| **Embedding** | voyage-multilingual-2 또는 voyage-3 | 26개+ 언어 지원 |
| **Chunking** | Sentence-based | 언어별 문장 구조 존중 |

---

### 3.2 Anthropic Contextual Retrieval 추가 고려사항

Anthropic은 **Contextual Retrieval** 기법을 제안합니다:

```
기존 RAG:  chunk → embed → search
Contextual RAG:  chunk → add context → embed → search
```

**방법:**
1. 각 청크에 문서 전체 맥락 정보를 추가
2. Claude의 Prompt Caching으로 비용 효율적 구현

**결과:**
- 검색 실패율 49% 감소
- Reranker와 결합 시 67% 감소

**비용:** ~$1.02 / 1M document tokens

---

### 3.3 최종 체크리스트

#### Embedding 모델 선택 시

- [ ] 도메인 특화 모델이 필요한가? (법률, 금융, 코드)
- [ ] Context 길이 요구사항? (8K vs 32K)
- [ ] 다국어 지원 필요?
- [ ] 비용 제약?
- [ ] 오픈소스/프라이버시 요구사항?

#### Chunking 전략 선택 시

- [ ] 문서 유형? (PDF, 텍스트, 코드)
- [ ] 쿼리 유형? (사실 기반 vs 분석적)
- [ ] 정확도 vs 비용 트레이드오프?
- [ ] 처리량 요구사항?

---

## 📚 참고 자료

### Embedding 모델
- [Voyage AI Blog: voyage-3-large](https://blog.voyageai.com/2025/01/07/voyage-3-large/)
- [Voyage AI Pricing](https://docs.voyageai.com/docs/pricing)
- [OpenAI Embedding Models](https://platform.openai.com/docs/guides/embeddings)
- [Nomic Embed Technical Report](https://arxiv.org/abs/2402.01613)
- [Claude Embeddings Docs](https://docs.anthropic.com/claude/docs/embeddings)

### Chunking 전략
- [NVIDIA Chunking Benchmark 2024](https://developer.nvidia.com)
- [Chroma Research: Chunking Evaluation](https://www.trychroma.com)
- [Anthropic: Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval)

### 벤치마크
- [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard)
- [AIMultiple Embedding Comparison](https://research.aimultiple.com/embedding-models/)

### TypeScript/Node.js 라이브러리
- [voyageai - npm](https://www.npmjs.com/package/voyageai)
- [openai - npm](https://www.npmjs.com/package/openai)
- [@anthropic-ai/sdk - npm](https://www.npmjs.com/package/@anthropic-ai/sdk)
- [pdf-parse - npm](https://www.npmjs.com/package/pdf-parse)
