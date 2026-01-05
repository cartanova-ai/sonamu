#!/usr/bin/env node

/**
 * Astro Starlight 문서를 Mintlify 형식으로 마이그레이션
 * 
 * 실행: node migrate-docs.js
 */

const fs = require('fs');
const path = require('path');

const SOURCE_DIR = path.join(__dirname, '../docs_backup/src/content/docs');
const TARGET_DIR = __dirname;

// 파일 매핑 (source -> target)
const FILE_MAPPING = {
  // Introduction
  'intro/index.md': 'introduction/index.mdx',
  'intro/dependency.md': 'introduction/dependency.mdx',
  
  // Tutorial
  'tutorial/index.md': 'tutorial/getting-started.mdx',
  'tutorial/entity.md': 'tutorial/entity.mdx',
  'tutorial/scaffolding.md': 'tutorial/scaffolding.mdx',
  'tutorial/api.md': 'tutorial/api.mdx',
  'tutorial/relation.md': 'tutorial/relation.mdx',
  'tutorial/front-end.md': 'tutorial/front-end.mdx',
  
  // Guide
  'guide/auth.md': 'guide/auth.mdx',
  'guide/entity.md': 'guide/entity.mdx',
  'guide/upsert-builder.md': 'guide/upsert-builder.mdx',
  'guide/subset.md': 'guide/subset.mdx',
  'guide/test.md': 'guide/test.mdx',
  'guide/tsconfig.md': 'guide/tsconfig.mdx',
  
  // Reference
  'reference/file-sync.md': 'reference/file-sync.mdx',
  'reference/entity.md': 'reference/entity.mdx',
  'reference/migration.md': 'reference/migration.mdx',
  'reference/api-decorator.md': 'reference/api-decorator.mdx',
  'reference/scaffolding.md': 'reference/scaffolding.mdx',
  'reference/model.md': 'reference/model.mdx',
  'reference/fixture.md': 'reference/fixture.mdx',
  'reference/cli.md': 'reference/cli.mdx',
  'reference/sonamu-kit.md': 'reference/sonamu-kit.mdx',
  'reference/error.md': 'reference/error.mdx',
};

/**
 * Astro frontmatter를 Mintlify 형식으로 변환
 */
function convertFrontmatter(content) {
  // frontmatter 추출
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontmatterMatch) {
    return content;
  }

  const frontmatter = frontmatterMatch[1];
  const body = content.slice(frontmatterMatch[0].length);

  // title과 description만 추출
  const titleMatch = frontmatter.match(/title:\s*(.+)/);
  const descMatch = frontmatter.match(/description:\s*(.+)/);

  const newFrontmatter = [
    '---',
    titleMatch ? `title: ${titleMatch[1]}` : 'title: "문서"',
    descMatch ? `description: ${descMatch[1]}` : '',
    '---',
    ''
  ].filter(Boolean).join('\n');

  return newFrontmatter + body;
}

/**
 * 이미지 경로를 Mintlify 형식으로 변환
 */
function convertImagePaths(content) {
  // Astro 이미지 import 제거
  content = content.replace(/import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"]/g, '');
  content = content.replace(/import\s+\w+\s+from\s+['"]\.\.\/[^'"]+['"]/g, '');
  
  // 상대 경로를 절대 경로로 변환
  content = content.replace(/!\[([^\]]*)\]\(\.\.\/[^)]+\/([^)]+)\)/g, '![$1](/images/$2)');
  content = content.replace(/!\[([^\]]*)\]\(\.\/image\/[^)]+\/([^)]+)\)/g, '![$1](/images/$2)');
  
  // Astro Image 컴포넌트 제거
  content = content.replace(/<Image[^>]*\/>/g, '');
  
  return content;
}

/**
 * 파일 복사 및 변환
 */
function migrateFile(sourcePath, targetPath) {
  const fullSourcePath = path.join(SOURCE_DIR, sourcePath);
  const fullTargetPath = path.join(TARGET_DIR, targetPath);

  if (!fs.existsSync(fullSourcePath)) {
    console.log(`⏭️  건너뜀: ${sourcePath} (파일 없음)`);
    return;
  }

  // 디렉토리 생성
  const targetDir = path.dirname(fullTargetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 파일 읽기
  let content = fs.readFileSync(fullSourcePath, 'utf-8');

  // 변환
  content = convertFrontmatter(content);
  content = convertImagePaths(content);

  // 파일 쓰기
  fs.writeFileSync(fullTargetPath, content);
  console.log(`✅ 변환 완료: ${sourcePath} → ${targetPath}`);
}

/**
 * 이미지 파일 복사
 */
function copyImages() {
  const imageSourceDirs = [
    path.join(SOURCE_DIR, 'guide/image'),
    path.join(SOURCE_DIR, 'tutorial/image'),
    path.join(SOURCE_DIR, 'reference'),
  ];

  const targetImageDir = path.join(TARGET_DIR, 'images');
  if (!fs.existsSync(targetImageDir)) {
    fs.mkdirSync(targetImageDir, { recursive: true });
  }

  // 재귀적으로 이미지 파일 찾기
  function findImages(dir) {
    if (!fs.existsSync(dir)) return;
    
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        findImages(fullPath);
      } else if (/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(file)) {
        const targetPath = path.join(targetImageDir, file);
        fs.copyFileSync(fullPath, targetPath);
        console.log(`📷 이미지 복사: ${file}`);
      }
    });
  }

  imageSourceDirs.forEach(sourceDir => {
    findImages(sourceDir);
  });
}

/**
 * 메인 실행
 */
function main() {
  console.log('🚀 Astro → Mintlify 마이그레이션 시작\n');

  // 문서 파일 마이그레이션
  console.log('📄 문서 파일 변환 중...\n');
  Object.entries(FILE_MAPPING).forEach(([source, target]) => {
    migrateFile(source, target);
  });

  // 이미지 파일 복사
  console.log('\n📷 이미지 파일 복사 중...\n');
  copyImages();

  console.log('\n✨ 마이그레이션 완료!');
  console.log('\n다음 단계:');
  console.log('1. mint dev 실행하여 로컬 확인');
  console.log('2. 로고 파일 추가 (logo/light.svg, logo/dark.svg)');
  console.log('3. favicon.svg 추가');
  console.log('4. 각 문서 내용 검토 및 수정');
}

main();
