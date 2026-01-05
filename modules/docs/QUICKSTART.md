# Sonamu 문서 - Mintlify로 재작성

Astro Starlight에서 Mintlify로 완전히 재작성된 Sonamu 프레임워크 문서입니다.

## 빠른 시작

### 1. Mintlify CLI 설치

```bash
npm i -g mint
```

### 2. 기존 문서 마이그레이션

```bash
cd /Users/noa/Development/sonamu/modules/docs
node migrate-docs.js
```

이 스크립트는:
- `../docs_backup/src/content/docs`의 모든 문서를 복사
- Astro frontmatter → Mintlify frontmatter 변환
- 이미지 경로를 `/images/` 디렉토리로 통일
- `.md` → `.mdx` 확장자 변경

### 3. 로고 및 파비콘 추가

```bash
# 기존 파비콘 복사
cp ../docs_backup/public/favicon.svg ./favicon.svg

# 로고 디렉토리 생성 및 복사 (임시로 favicon 사용)
mkdir -p logo
cp ../docs_backup/public/favicon.svg ./logo/light.svg
cp ../docs_backup/public/favicon.svg ./logo/dark.svg
```

### 4. 로컬 미리보기

```bash
cd /Users/noa/Development/sonamu/modules/docs
mint dev
```

브라우저에서 `http://localhost:3000` 접속

## 생성된 파일들

```
/Users/noa/Development/sonamu/modules/docs/
├── docs.json              ✅ Mintlify 설정 (네비게이션, 색상, 로고)
├── introduction.mdx       ✅ 홈페이지 (카드, 아코디언 포함)
├── package.json           ✅ 
├── migrate-docs.js        ✅ 마이그레이션 스크립트
├── .gitignore            ✅
│
├── introduction/          (마이그레이션 후 생성)
├── tutorial/              (마이그레이션 후 생성)
├── guide/                 (마이그레이션 후 생성)
├── reference/             (마이그레이션 후 생성)
├── images/                (마이그레이션 후 생성)
└── logo/                  (수동 추가 필요)
```

## docs.json 설정

현재 설정:
- **색상 테마**: Emerald 계열 (#10b981)
- **네비게이션**: 4개 섹션 (Introduction, Tutorial, Guide, Reference)
- **GitHub 링크**: topbar에 표시
- **CTA 버튼**: "시작하기" → `/introduction`

원하는 색상으로 변경하려면 `docs.json`의 `colors` 섹션을 수정하세요.

## 마이그레이션 체크리스트

### 필수 단계
- [ ] `node migrate-docs.js` 실행
- [ ] 로고 파일 추가 (logo/light.svg, logo/dark.svg)
- [ ] favicon.svg 추가
- [ ] `mint dev`로 로컬 확인
- [ ] 모든 이미지가 제대로 표시되는지 확인
- [ ] 내부 링크가 작동하는지 확인

### 선택 개선
- [ ] Mintlify 컴포넌트로 문서 개선 (Note, Warning, Tabs 등)
- [ ] 코드 블록에 파일명 추가
- [ ] 색상 테마 커스터마이징
- [ ] 추가 메타데이터 설정 (SEO)

## Mintlify 주요 컴포넌트

마이그레이션 후 문서를 개선할 때 사용:

### Callout
```mdx
<Note>
  중요한 정보
</Note>

<Warning>
  주의가 필요한 내용
</Warning>

<Tip>
  유용한 팁
</Tip>
```

### Tabs
```mdx
<Tabs>
  <Tab title="npm">
    \`\`\`bash
    npm install sonamu
    \`\`\`
  </Tab>
  <Tab title="yarn">
    \`\`\`bash
    yarn add sonamu
    \`\`\`
  </Tab>
</Tabs>
```

### Steps
```mdx
<Steps>
  <Step title="설치">
    Sonamu를 설치합니다
  </Step>
  <Step title="설정">
    설정 파일을 생성합니다
  </Step>
</Steps>
```

### CardGroup
```mdx
<CardGroup cols={2}>
  <Card title="시작하기" icon="rocket" href="/tutorial/getting-started">
    튜토리얼을 시작하세요
  </Card>
  <Card title="레퍼런스" icon="book" href="/reference/api-decorator">
    API 문서를 확인하세요
  </Card>
</CardGroup>
```

## 배포

### GitHub에 푸시

```bash
cd /Users/noa/Development/sonamu/modules/docs
git add .
git commit -m "feat: Mintlify 문서로 전환"
git push
```

### Mintlify 연동

1. https://mintlify.com 접속
2. GitHub 계정으로 로그인
3. "New Documentation" 클릭
4. Repository 선택
5. Base path: `/modules/docs` 설정
6. 자동 배포 완료!

## 문제 해결

### 이미지가 안 보일 때
- 이미지 파일이 `/images/` 디렉토리에 있는지 확인
- 파일명 대소문자 확인

### 링크가 깨질 때
- 내부 링크는 `/tutorial/entity` 형태 사용
- 확장자 제거 (.md, .mdx 없이)

### 문서가 표시 안 될 때
- `docs.json`의 `navigation`에 경로 추가 확인
- 파일 경로 정확도 확인

## 기존 Astro 문서 정리

Mintlify 전환 후:
- `modules/docs_backup`은 보관용으로 유지
- 필요시 나중에 삭제

## 다음 단계

1. 마이그레이션 실행
2. 로컬 테스트
3. 문서 내용 검토
4. GitHub 푸시
5. Mintlify 배포
6. 팀 공유
