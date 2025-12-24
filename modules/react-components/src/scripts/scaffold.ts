/**
 * Sonamu Entity JSON → shadcn-ui View 생성 스크립트
 *
 * 사용법:
 * npx tsx src/scripts/scaffold.ts <entity.json 경로>
 * npx tsx src/scripts/scaffold.ts <sonamu api 디렉토리>
 *
 * 예시:
 * npx tsx src/scripts/scaffold.ts ../../../api/src/application/post/post.entity.json
 * npx tsx src/scripts/scaffold.ts ../../../api/src/application
 *
 * 기존 sonamu 프로젝트의 Entity JSON을 읽어와서
 * shadcn-ui 버전의 view_list, view_form 페이지를 생성합니다.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { type Entity, EntityManager } from "../entity/entity-manager";
import { Template__view_enums_dropdown } from "../templates/view_enums_dropdown.template";
import { Template__view_enums_select } from "../templates/view_enums_select.template";
import { Template__view_form } from "../templates/view_form.template";
import { Template__view_id_async_select } from "../templates/view_id_async_select.template";
import { Template__view_list } from "../templates/view_list.template";
import { Template__view_search_input } from "../templates/view_search_input.template";
import type { EntityJson, RenderingNode } from "../types/types";

// ===== 재귀적으로 파일 찾기 =====
function findFiles(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];

  function walk(directory: string) {
    const files = fs.readdirSync(directory);
    for (const file of files) {
      const filePath = path.join(directory, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        walk(filePath);
      } else if (pattern.test(file)) {
        results.push(filePath);
      }
    }
  }

  walk(dir);
  return results;
}

// ===== Subset 필드에서 RenderingNode 생성 =====
function createColumnFromSubsetField(
  fieldExpr: string,
  entityJson: EntityJson,
  _allEntityJsons: Map<string, EntityJson>,
): RenderingNode | null {
  const parts = fieldExpr.split(".");

  // 첫 번째 필드가 현재 entity의 prop인지 확인
  const rootProp = entityJson.props.find((p) => p.name === parts[0]);
  if (!rootProp) return null;

  // 단일 필드 (예: "id", "title", "action")
  if (parts.length === 1) {
    const prop = rootProp;
    let renderType: RenderingNode["renderType"] = "string-plain";

    if (prop.name === "id") {
      renderType = "number-id";
    } else if (prop.name.endsWith("_id")) {
      renderType = "number-fk_id";
    } else if (prop.type === "integer" || prop.type === "bigInteger") {
      renderType = "number-plain";
    } else if (prop.type === "boolean") {
      renderType = "boolean";
    } else if (prop.type === "virtual") {
      const virtualProp = prop as { id?: string };
      if (virtualProp.id === "Boolean") {
        renderType = "boolean";
      } else {
        // 복잡한 virtual 객체는 object로 처리
        renderType = "object";
      }
    } else if (prop.type === "enum") {
      renderType = "enums";
    } else if (prop.type === "datetime" || prop.type === "timestamp") {
      renderType = "string-datetime";
    } else if (prop.type === "date") {
      renderType = "string-datetime";
    } else if (prop.type === "json") {
      // json 타입은 배열이나 객체이므로 object로 처리
      renderType = "object";
    } else if (prop.type === "relation") {
      // relation 필드가 단독으로 subset에 포함된 경우 object로 처리
      renderType = "object";
    }

    return {
      name: prop.name,
      label: prop.desc ?? prop.name,
      renderType,
      zodType: z.any(),
      nullable: prop.nullable,
    };
  }

  // 중첩 필드 (예: "user.name", "user.facility.name_en")
  // relation 필드인 경우
  if (rootProp.type === "relation") {
    const relProp = rootProp as {
      with?: string;
      name: string;
      nullable?: boolean;
      desc?: string;
      relationType?: string;
    };
    const relatedEntityId = relProp.with;

    if (!relatedEntityId) return null;

    // HasMany/ManyToMany relation의 하위 필드는 건너뛰기 (배열이므로 직접 접근 불가)
    // 대신 relation 필드 자체를 object로 렌더링 (중복 방지는 호출부에서 처리)
    if (relProp.relationType === "HasMany" || relProp.relationType === "ManyToMany") {
      // 중첩 필드가 있는 경우 (예: diagnoses.name_en) → 건너뛰기
      // 단독 필드인 경우는 이미 위에서 object로 처리됨
      return null;
    }

    // BelongsToOne, OneToOne의 경우만 중첩 필드 허용
    const fullPath = parts.join(".");
    const leafField = parts[parts.length - 1];

    // 마지막 필드가 id면 건너뛰기 (보통 FK 참조용)
    if (leafField === "id" && parts.length > 1) {
      return null;
    }

    // 날짜 필드 감지
    let renderType: RenderingNode["renderType"] = "string-plain";
    if (
      leafField === "created_at" ||
      leafField === "updated_at" ||
      leafField.endsWith("_at") ||
      leafField.endsWith("_date")
    ) {
      renderType = "string-datetime";
    }

    return {
      name: fullPath,
      label: `${relProp.desc ?? relProp.name} / ${leafField}`,
      renderType,
      zodType: z.any(),
      nullable: true, // 중첩 필드는 항상 nullable로 처리
    };
  }

  return null;
}

// ===== RenderingNode 생성 헬퍼 =====
function createRenderingNode(
  entity: Entity,
  entityJson: EntityJson,
): {
  columnsNode: RenderingNode;
  listParamsNode: RenderingNode;
  saveParamsNode: RenderingNode;
} {
  // Subset A 기반으로 컬럼 생성
  const subsetA = entityJson.subsets?.A ?? [];
  const allEntityJsons = new Map<string, EntityJson>();

  // HasMany/ManyToMany relation 필드 수집 (중복 방지용)
  const hasManyRelationNames = new Set<string>();
  for (const fieldExpr of subsetA) {
    const parts = fieldExpr.split(".");
    if (parts.length > 1) {
      const rootProp = entityJson.props.find((p) => p.name === parts[0]);
      if (rootProp?.type === "relation") {
        const relProp = rootProp as { relationType?: string };
        if (relProp.relationType === "HasMany" || relProp.relationType === "ManyToMany") {
          hasManyRelationNames.add(parts[0]);
        }
      }
    }
  }

  // 컬럼 노드 생성 (subset 기반)
  const columns = subsetA
    .map((fieldExpr) => createColumnFromSubsetField(fieldExpr, entityJson, allEntityJsons))
    .filter((node): node is RenderingNode => node !== null);

  // HasMany relation 필드들을 object로 추가 (중복 방지)
  const existingNames = new Set(columns.map((c) => c.name));
  for (const relName of hasManyRelationNames) {
    if (!existingNames.has(relName)) {
      const relProp = entityJson.props.find((p) => p.name === relName);
      if (relProp) {
        columns.push({
          name: relName,
          label: relProp.desc ?? relName,
          renderType: "object",
          zodType: z.any(),
          nullable: true,
        });
      }
    }
  }

  const columnsNode: RenderingNode = {
    name: "root",
    label: "Root",
    renderType: "object",
    zodType: z.any(),
    children: columns,
  };

  // ListParams 노드 생성
  // entity.json의 enums에서 {EntityName}OrderBy, {EntityName}SearchField 패턴 확인
  const hasOrderBy = `${entityJson.id}OrderBy` in entityJson.enums;
  const hasSearch = `${entityJson.id}SearchField` in entityJson.enums;

  const listParamsChildren: RenderingNode[] = [
    {
      name: "num",
      label: "Num",
      renderType: "number-plain",
      zodType: z.number(),
      optional: true,
    },
    {
      name: "page",
      label: "Page",
      renderType: "number-plain",
      zodType: z.number(),
      optional: true,
    },
    {
      name: "keyword",
      label: "Keyword",
      renderType: "string-plain",
      zodType: z.string(),
      optional: true,
    },
  ];

  if (hasSearch) {
    listParamsChildren.push({
      name: "search",
      label: "Search",
      renderType: "enums",
      zodType: z.any(),
      optional: true,
    });
  }
  if (hasOrderBy) {
    listParamsChildren.push({
      name: "orderBy",
      label: "OrderBy",
      renderType: "enums",
      zodType: z.any(),
      optional: true,
    });
  }

  // toFilter: true인 필드들을 추가
  entityJson.props.forEach((prop) => {
    const filterProp = prop as {
      toFilter?: boolean;
      name: string;
      desc?: string;
      with?: string;
      id?: string;
    };

    if (!filterProp.toFilter) return;

    if (prop.type === "relation" && filterProp.with) {
      // relation 필드 → FK 필드로 추가
      listParamsChildren.push({
        name: `${filterProp.name}_id`,
        label: filterProp.desc ?? filterProp.name,
        renderType: "number-fk_id",
        zodType: z.number(),
        optional: true,
      });
    } else if (prop.type === "enum" && filterProp.id) {
      // enum 필드 추가
      listParamsChildren.push({
        name: filterProp.name,
        label: filterProp.desc ?? filterProp.name,
        renderType: "enums",
        zodType: z.any(),
        optional: true,
        config: { enumId: filterProp.id },
      });
    }
  });

  const listParamsNode: RenderingNode = {
    name: "listParams",
    label: "ListParams",
    renderType: "object",
    zodType: z.any(),
    children: listParamsChildren,
  };

  // SaveParams 노드 생성
  // BelongsToOne relation은 FK 필드(_id)로 변환
  // virtual 타입은 제외 (is_bookmarked, feedbacks 등)
  const saveParamsProps = entity.props
    .flatMap((prop) => {
      // virtual 타입 제외
      if (prop.type === "virtual") {
        return [];
      }
      if (prop.type === "relation") {
        const relProp = prop as {
          relationType?: string;
          name: string;
          nullable?: boolean;
          desc?: string;
        };
        if (relProp.relationType === "BelongsToOne" || relProp.relationType === "OneToOne") {
          // FK 필드로 변환
          return [
            {
              ...prop,
              name: `${relProp.name}_id`,
              type: "integer" as const,
              desc: relProp.desc,
              nullable: relProp.nullable,
            },
          ];
        }
        return []; // HasMany, ManyToMany는 제외
      }
      return [prop];
    })
    .filter((prop) => prop.name !== "created_at");

  const saveParamsNode: RenderingNode = {
    name: "saveParams",
    label: "SaveParams",
    renderType: "object",
    zodType: z.any(),
    children: saveParamsProps.map((prop) => {
      let renderType: RenderingNode["renderType"] = "string-plain";
      let zodType: z.ZodTypeAny = z.string();

      if (prop.name === "id") {
        renderType = "number-id";
        zodType = z.number();
      } else if (prop.name.endsWith("_id")) {
        renderType = "number-fk_id";
        zodType = z.number();
      } else if (prop.type === "integer" || prop.type === "bigInteger") {
        renderType = "number-plain";
        zodType = z.number();
      } else if (prop.type === "boolean") {
        renderType = "boolean";
        zodType = z.boolean();
      } else if (prop.type === "enum") {
        renderType = "enums";
        // entity.json의 enums에서 실제 값 가져오기
        const enumProp = prop as { id: string };
        const enumValues = entityJson.enums[enumProp.id];
        if (enumValues) {
          const keys = Object.keys(enumValues) as [string, ...string[]];
          zodType = z.enum(keys);
        } else {
          zodType = z.string();
        }
      } else if (prop.type === "datetime" || prop.type === "timestamp") {
        renderType = "string-datetime";
        zodType = z.string();
      } else if (prop.type === "date") {
        renderType = "string-date";
        zodType = z.string();
      } else if (prop.type === "text") {
        renderType = "string-plain";
        zodType = z.string();
      }

      return {
        name: prop.name,
        label: prop.desc ?? prop.name,
        renderType,
        zodType,
        nullable: prop.nullable,
        optional: prop.name === "id",
      } as RenderingNode;
    }),
  };

  return { columnsNode, listParamsNode, saveParamsNode };
}

// ===== 메인 스캐폴딩 함수 =====
async function scaffold(entityJson: EntityJson, outputDir: string) {
  console.log(`\n🚀 스캐폴딩 시작: ${entityJson.id}\n`);

  // Entity 등록
  await EntityManager.register(entityJson);
  const entity = EntityManager.get(entityJson.id);
  const names = entity.names;

  // RenderingNode 생성
  const { columnsNode, listParamsNode, saveParamsNode } = createRenderingNode(entity, entityJson);

  // 출력 디렉토리 생성 (web 프로젝트 구조에 맞게 -test 접미사 추가)
  const pagesDir = path.join(outputDir, "pages", "admin", `${names.fsPlural}-test`);
  const componentsDir = path.join(outputDir, "components", `${names.fs}-test`);

  fs.mkdirSync(pagesDir, { recursive: true });
  fs.mkdirSync(componentsDir, { recursive: true });

  // 1. view_list 생성
  console.log("📄 view_list 생성 중...");
  const listTemplate = new Template__view_list();
  const listResult = listTemplate.render(
    { entityId: entityJson.id, extra: undefined },
    columnsNode,
    listParamsNode,
  );
  const listPath = path.join(pagesDir, "index.tsx");
  fs.writeFileSync(listPath, listResult.body);
  console.log(`   ✅ ${listPath}`);

  // 2. view_form 생성
  console.log("📄 view_form 생성 중...");
  const formTemplate = new Template__view_form();
  const formResult = formTemplate.render({ entityId: entityJson.id }, saveParamsNode);
  const formPath = path.join(pagesDir, "form.tsx");
  fs.writeFileSync(formPath, formResult.body);
  console.log(`   ✅ ${formPath}`);

  // 3. 컴포넌트들 생성
  console.log("📄 컴포넌트 생성 중...");

  // SearchInput
  const searchInputTemplate = new Template__view_search_input();
  const searchInputResult = searchInputTemplate.render({
    entityId: entityJson.id,
  });
  const searchInputPath = path.join(componentsDir, `${names.capital}SearchInput.tsx`);
  fs.writeFileSync(searchInputPath, searchInputResult.body);
  console.log(`   ✅ ${searchInputPath}`);

  // SearchField Dropdown
  const searchFieldDropdownTemplate = new Template__view_enums_dropdown();
  const searchFieldDropdownResult = searchFieldDropdownTemplate.render({
    entityId: entityJson.id,
    enumId: `${names.capital}SearchField`,
  });
  const searchFieldDropdownPath = path.join(
    componentsDir,
    `${names.capital}SearchFieldDropdown.tsx`,
  );
  fs.writeFileSync(searchFieldDropdownPath, searchFieldDropdownResult.body);
  console.log(`   ✅ ${searchFieldDropdownPath}`);

  // OrderBy Select
  const orderBySelectTemplate = new Template__view_enums_select();
  const orderBySelectResult = orderBySelectTemplate.render({
    entityId: entityJson.id,
    enumId: `${names.capital}OrderBy`,
  });
  const orderBySelectPath = path.join(componentsDir, `${names.capital}OrderBySelect.tsx`);
  fs.writeFileSync(orderBySelectPath, orderBySelectResult.body);
  console.log(`   ✅ ${orderBySelectPath}`);

  // Enum Selects
  for (const enumId of Object.keys(entityJson.enums)) {
    const enumSelectTemplate = new Template__view_enums_select();
    const enumSelectResult = enumSelectTemplate.render({
      entityId: entityJson.id,
      enumId,
    });
    const enumSelectPath = path.join(componentsDir, `${enumId}Select.tsx`);
    fs.writeFileSync(enumSelectPath, enumSelectResult.body);
    console.log(`   ✅ ${enumSelectPath}`);
  }

  // FK 필드에 대한 IdAsyncSelect 컴포넌트 생성
  const fkFields = entity.props.filter((prop) => prop.type === "relation");
  for (const fkProp of fkFields) {
    const relProp = fkProp as { with?: string; relationType?: string };
    if (
      relProp.with &&
      (relProp.relationType === "BelongsToOne" || relProp.relationType === "OneToOne")
    ) {
      try {
        // 관련 entity가 등록되어 있는지 확인
        const relatedEntity = EntityManager.get(relProp.with);
        const relatedNames = relatedEntity.names;

        const asyncSelectTemplate = new Template__view_id_async_select();
        const asyncSelectResult = asyncSelectTemplate.render({
          entityId: relProp.with,
          textField: undefined, // 자동 감지
        });

        // 관련 entity의 컴포넌트 폴더에 생성
        const relatedComponentsDir = path.join(outputDir, "components", `${relatedNames.fs}-test`);
        fs.mkdirSync(relatedComponentsDir, { recursive: true });

        const asyncSelectPath = path.join(relatedComponentsDir, `${relProp.with}IdAsyncSelect.tsx`);
        fs.writeFileSync(asyncSelectPath, asyncSelectResult.body);
        console.log(`   ✅ ${asyncSelectPath}`);
      } catch (e) {
        // 관련 entity가 등록되지 않은 경우 건너뛰기
        console.log(`   ⚠️ ${relProp.with}IdAsyncSelect 생성 실패: 관련 entity 미등록`);
      }
    }
  }

  console.log(`\n✨ 스캐폴딩 완료! 생성된 파일들은 ${outputDir}에 있습니다.\n`);
}

// ===== Entity JSON 파일 로드 =====
function loadEntityJsons(inputPath: string): EntityJson[] {
  const stat = fs.statSync(inputPath);

  if (stat.isFile() && inputPath.endsWith(".entity.json")) {
    // 단일 파일
    const content = fs.readFileSync(inputPath, "utf-8");
    return [JSON.parse(content)];
  } else if (stat.isDirectory()) {
    // 디렉토리 - 모든 entity.json 파일 찾기
    const files = findFiles(inputPath, /\.entity\.json$/);
    return files.map((file) => {
      const content = fs.readFileSync(file, "utf-8");
      return JSON.parse(content);
    });
  } else {
    throw new Error(`Invalid input path: ${inputPath}`);
  }
}

// ===== CLI 실행 =====
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
사용법:
  npx tsx src/scripts/scaffold.ts <entity.json 경로>
  npx tsx src/scripts/scaffold.ts <sonamu api 디렉토리>

예시:
  npx tsx src/scripts/scaffold.ts ../api/src/application/post/post.entity.json
  npx tsx src/scripts/scaffold.ts ../api/src/application

옵션:
  --output <디렉토리>  출력 디렉토리 (기본: ./scaffold-output)
`);
    process.exit(0);
  }

  const inputPath = path.resolve(args[0]);
  const outputIndex = args.indexOf("--output");
  const outputDir =
    outputIndex !== -1
      ? path.resolve(args[outputIndex + 1])
      : path.resolve(process.cwd(), "../web/src"); // 기본: web 프로젝트의 src 폴더

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ 경로를 찾을 수 없습니다: ${inputPath}`);
    process.exit(1);
  }

  console.log(`\n📂 입력 경로: ${inputPath}`);
  console.log(`📂 출력 경로: ${outputDir}\n`);

  try {
    // 먼저 application 디렉토리의 모든 entity를 등록 (관련 entity 참조를 위해)
    // inputPath가 파일이면 두 단계 상위 (entity.json -> entity폴더 -> application)
    // inputPath가 디렉토리면 그 자체가 application
    const stat = fs.statSync(inputPath);
    const applicationDir = stat.isFile()
      ? path.resolve(inputPath, "../..") // entity.json 파일 -> application 폴더
      : inputPath;
    if (fs.existsSync(applicationDir)) {
      const allEntityFiles = findFiles(applicationDir, /\.entity\.json$/);
      console.log(`📦 ${allEntityFiles.length}개 Entity 사전 등록 중...`);
      for (const file of allEntityFiles) {
        try {
          const content = fs.readFileSync(file, "utf-8");
          const json = JSON.parse(content);
          await EntityManager.register(json);
        } catch (e) {
          // 개별 entity 등록 실패 무시
        }
      }
      console.log(`   ✅ 사전 등록 완료\n`);
    }

    const entityJsons = loadEntityJsons(inputPath);
    console.log(`📋 발견된 Entity: ${entityJsons.map((e) => e.id).join(", ")}\n`);

    for (const entityJson of entityJsons) {
      await scaffold(entityJson, outputDir);
    }

    console.log("\n🎉 모든 스캐폴딩 완료!");
  } catch (error) {
    console.error("❌ 에러 발생:", error);
    process.exit(1);
  }
}

main();
