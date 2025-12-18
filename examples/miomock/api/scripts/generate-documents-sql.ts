/**
 * Documents 테이블용 테스트 데이터 SQL 생성 스크립트
 * 실행: npx tsx scripts/generate-documents-sql.ts > scripts/documents-insert.sql
 */

// 기술 문서 카테고리 및 주제
const categories = [
  {
    name: "프로그래밍 언어",
    keywords: [
      "TypeScript",
      "JavaScript",
      "Python",
      "Go",
      "Rust",
      "Java",
      "C++",
      "PHP",
      "Ruby",
      "Swift",
    ],
  },
  {
    name: "프레임워크",
    keywords: [
      "React",
      "Vue",
      "Angular",
      "Next.js",
      "Nuxt",
      "Express",
      "NestJS",
      "FastAPI",
      "Django",
      "Spring",
    ],
  },
  {
    name: "데이터베이스",
    keywords: [
      "PostgreSQL",
      "MySQL",
      "MongoDB",
      "Redis",
      "Elasticsearch",
      "SQLite",
      "DynamoDB",
      "Cassandra",
      "Neo4j",
      "InfluxDB",
    ],
  },
  {
    name: "인프라",
    keywords: [
      "Docker",
      "Kubernetes",
      "AWS",
      "GCP",
      "Azure",
      "Terraform",
      "Ansible",
      "Jenkins",
      "GitHub Actions",
      "ArgoCD",
    ],
  },
  {
    name: "보안",
    keywords: [
      "OAuth",
      "JWT",
      "HTTPS",
      "XSS",
      "CSRF",
      "SQL Injection",
      "암호화",
      "인증",
      "권한관리",
      "보안감사",
    ],
  },
  {
    name: "아키텍처",
    keywords: [
      "마이크로서비스",
      "모놀리식",
      "서버리스",
      "이벤트 드리븐",
      "CQRS",
      "헥사고날",
      "클린 아키텍처",
      "DDD",
      "MSA",
      "API Gateway",
    ],
  },
  {
    name: "테스팅",
    keywords: [
      "유닛 테스트",
      "통합 테스트",
      "E2E 테스트",
      "TDD",
      "BDD",
      "Jest",
      "Vitest",
      "Cypress",
      "Playwright",
      "성능 테스트",
    ],
  },
  {
    name: "DevOps",
    keywords: [
      "CI/CD",
      "모니터링",
      "로깅",
      "알림",
      "배포",
      "롤백",
      "블루그린",
      "카나리",
      "A/B 테스트",
      "피처 플래그",
    ],
  },
  {
    name: "성능 최적화",
    keywords: [
      "캐싱",
      "인덱싱",
      "쿼리 최적화",
      "메모이제이션",
      "레이지 로딩",
      "코드 스플리팅",
      "CDN",
      "압축",
      "프로파일링",
      "벤치마킹",
    ],
  },
  {
    name: "AI/ML",
    keywords: [
      "머신러닝",
      "딥러닝",
      "자연어처리",
      "컴퓨터비전",
      "임베딩",
      "벡터 검색",
      "RAG",
      "LLM",
      "프롬프트 엔지니어링",
      "파인튜닝",
    ],
  },
];

const documentTypes = [
  "가이드",
  "튜토리얼",
  "레퍼런스",
  "API 문서",
  "설정 가이드",
  "트러블슈팅",
  "베스트 프랙티스",
  "마이그레이션 가이드",
  "성능 분석",
  "보안 점검",
  "아키텍처 설계",
  "코드 리뷰",
  "기술 블로그",
  "발표 자료",
  "FAQ",
];

const actionVerbs = [
  "구현하기",
  "설정하기",
  "최적화하기",
  "디버깅하기",
  "배포하기",
  "테스트하기",
  "마이그레이션하기",
  "통합하기",
  "분석하기",
  "모니터링하기",
];

const statuses = ["draft", "published", "archived"];

function escapeSQL(str: string): string {
  return str.replace(/'/g, "''").replace(/\n/g, "\\n").replace(/\r/g, "");
}

function generateTitle(category: (typeof categories)[0], keyword: string): string {
  const docType = documentTypes[Math.floor(Math.random() * documentTypes.length)];
  const action = actionVerbs[Math.floor(Math.random() * actionVerbs.length)];

  const patterns = [
    `${keyword} ${docType}`,
    `${keyword} ${action}`,
    `${keyword}로 ${action}`,
    `${category.name}에서 ${keyword} 활용하기`,
    `${keyword} 완벽 가이드`,
    `${keyword} 시작하기`,
    `${keyword} 심화 과정`,
    `${keyword} 실전 적용`,
    `${keyword} 문제 해결`,
    `${keyword} 핵심 개념`,
  ];

  return patterns[Math.floor(Math.random() * patterns.length)];
}

function generateContent(category: (typeof categories)[0], keyword: string, title: string): string {
  const intro = [
    `이 문서는 ${keyword}에 대한 종합적인 가이드입니다.`,
    `${keyword}는 ${category.name} 분야에서 널리 사용되는 기술입니다.`,
    `${category.name} 환경에서 ${keyword}를 효과적으로 활용하는 방법을 알아봅니다.`,
    `${keyword}의 핵심 개념과 실무 적용 방법을 상세히 설명합니다.`,
  ];

  const features = [
    `주요 기능으로는 고성능 처리, 확장성, 유지보수성 향상이 있습니다.`,
    `${keyword}를 사용하면 개발 생산성을 크게 높일 수 있습니다.`,
    `이 기술은 대규모 시스템에서 검증된 안정성을 제공합니다.`,
    `커뮤니티 지원이 활발하며 풍부한 생태계를 갖추고 있습니다.`,
  ];

  const usecases = [
    `실제 프로덕션 환경에서 수많은 기업들이 ${keyword}를 도입하여 성공적인 결과를 얻었습니다.`,
    `스타트업부터 대기업까지 다양한 규모의 조직에서 활용되고 있습니다.`,
    `${category.name} 프로젝트에서 ${keyword}는 필수적인 도구로 자리잡았습니다.`,
  ];

  const tips = [
    `시작할 때는 공식 문서를 먼저 읽어보시는 것을 권장합니다.`,
    `단계별로 학습하며 직접 실습해보는 것이 가장 효과적입니다.`,
    `커뮤니티 포럼이나 GitHub 이슈를 통해 문제를 해결할 수 있습니다.`,
    `최신 버전의 변경사항을 항상 확인하세요.`,
  ];

  const conclusion = [
    `${keyword}를 마스터하면 ${category.name} 분야에서 경쟁력을 갖출 수 있습니다.`,
    `꾸준한 학습과 실습을 통해 전문성을 키워나가시기 바랍니다.`,
    `질문이나 피드백은 언제든지 환영합니다.`,
  ];

  const relatedKeywords = category.keywords.filter((k) => k !== keyword).slice(0, 3);
  const related = relatedKeywords.length > 0 ? `관련 기술: ${relatedKeywords.join(", ")}` : "";

  return [
    `# ${title}`,
    "",
    intro[Math.floor(Math.random() * intro.length)],
    "",
    "## 개요",
    "",
    features[Math.floor(Math.random() * features.length)],
    features[Math.floor(Math.random() * features.length)],
    "",
    "## 주요 활용 사례",
    "",
    usecases[Math.floor(Math.random() * usecases.length)],
    "",
    "## 학습 팁",
    "",
    tips[Math.floor(Math.random() * tips.length)],
    tips[Math.floor(Math.random() * tips.length)],
    "",
    "## 마무리",
    "",
    conclusion[Math.floor(Math.random() * conclusion.length)],
    "",
    related,
    "",
    `버전: ${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`,
    `최종 수정일: 2025-${String(Math.floor(Math.random() * 12) + 1).padStart(2, "0")}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`,
  ].join("\n");
}

function generateDocuments(count: number): void {
  const timestamp = "2025-12-11 17:00:00.000000+09";

  for (let i = 1; i <= count; i++) {
    const category = categories[Math.floor(Math.random() * categories.length)];
    const keyword = category.keywords[Math.floor(Math.random() * category.keywords.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];

    const title = generateTitle(category, keyword);
    const content = generateContent(category, keyword, title);

    console.log(
      `INSERT INTO public.documents VALUES (${i}, '${timestamp}', E'${escapeSQL(title)}', E'${escapeSQL(content)}', '${status}', NULL, NULL);`,
    );
  }
}

// 10000건 생성
generateDocuments(10000);
