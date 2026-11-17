import { mkdtemp, readFile, rm, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import ts from "@typescript/typescript6";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { Sonamu } from "../../api";
import { renderTemplate } from "../../syncer/code-generator";
import { Template__entity } from "../../template/implementations/entity.template";
import { Template__generated } from "../../template/implementations/generated.template";
import { Template__sd } from "../../template/implementations/sd.template";
import { type EntityJson } from "../../types/types";
import { type AbsolutePath } from "../../utils/path-utils";
import { Entity } from "../entity";
import { assertEntityJsonCodegenSafe } from "../entity-codegen-safety";
import { EntityManager } from "../entity-manager";

// 감사 PoC(GEN-04)에서 쓰인 형태의 페이로드. 실행되지 않고 문자열로만 다룬다.
const PROP_NAME_PAYLOAD =
  "zz: z.string().nullable(), yy: (process.getBuiltinModule('node:child_process').execSync('id'), z.string().nullable()), xx";
const ENUM_ID_PAYLOAD = "TagZ = process.getBuiltinModule('node:child_process').execSync('id'); /*";
const FREE_TEXT_PAYLOAD = 'a"]);import("node:child_process");`${process.exit()}`\r\u2028*/ //';

function baseEntity(id = "SafetyTag"): EntityJson {
  return {
    id,
    title: "태그",
    table: "safety_tags",
    props: [
      { name: "id", type: "integer", desc: "ID" },
      { name: "name", type: "string", desc: "이름", length: 100 },
      { name: "kind", type: "enum", id: "SafetyTagKind", desc: "종류" },
      { name: "files", type: "json", id: "SonamuFile[]", desc: "파일" },
    ],
    indexes: [],
    subsets: { A: ["id", "name", "kind"] },
    enums: {
      SafetyTagKind: { a: "에이", "id-desc": "ID최신순" },
      SafetyTagOrderBy: { "id-desc": "ID최신순" },
    },
  };
}

/** 생성 코드를 TypeScript로 파싱해 문법 오류가 없는지 확인하고 문장 목록을 돌려준다. */
function parseGenerated(code: string): ts.NodeArray<ts.Statement> {
  const { diagnostics = [] } = ts.transpileModule(code, { reportDiagnostics: true });
  expect(diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))).toEqual([]);
  return ts.createSourceFile("generated.ts", code, ts.ScriptTarget.Latest, true).statements;
}

/** 문자열 리터럴 노드의 값을 꺼낸다. 다른 노드면 테스트를 실패시킨다. */
function stringLiteralText(node: ts.Node | undefined): string {
  assert(node !== undefined && ts.isStringLiteral(node));
  return node.text;
}

function expectRejected(json: EntityJson, pathFragment: string) {
  expect(() => assertEntityJsonCodegenSafe(json)).toThrow(pathFragment);
}

/** 경로가 `/`로 시작하는 절대 경로인지 확인해 `AbsolutePath`로 좁힌다. */
function isAbsolutePath(value: string): value is AbsolutePath {
  return value.startsWith("/");
}

describe("assertEntityJsonCodegenSafe", () => {
  it("정상 엔티티는 통과한다 (enum 키·라벨·제목 같은 자유 문자열 포함)", () => {
    const json = baseEntity();
    json.title = FREE_TEXT_PAYLOAD;
    json.enums.SafetyTagKind = { [FREE_TEXT_PAYLOAD]: FREE_TEXT_PAYLOAD };
    expect(() => assertEntityJsonCodegenSafe(json)).not.toThrow();
  });

  it("prop 이름에 따옴표·괄호가 들어가면 거부한다", () => {
    const json = baseEntity();
    json.props.push({ name: PROP_NAME_PAYLOAD, type: "string", desc: "x", nullable: true });
    expectRejected(json, "props.4.name");
  });

  it("enumId에 코드가 들어가면 거부한다", () => {
    const json = baseEntity();
    json.enums[ENUM_ID_PAYLOAD] = { k: "*/ //" };
    expectRejected(json, "enumId에는 영문자, 숫자, _, $만 쓸 수 있습니다");
  });

  it.each([
    ["entity id", (json: EntityJson) => (json.id = 'Tag"); evil(); ("'), "id"],
    ["parentId", (json: EntityJson) => (json.parentId = "Parent()"), "parentId"],
    ["table", (json: EntityJson) => (json.table = 'tags"; evil(); "'), "table"],
    ["table 경로 이동", (json: EntityJson) => (json.table = "../../etc"), "table"],
    ["subset 키", (json: EntityJson) => (json.subsets["A = evil(); //"] = ["id"]), "subsets"],
    ["subset 필드", (json: EntityJson) => (json.subsets.A = ['id"]); evil(); (["']), "subsets.A.0"],
    [
      "prop id",
      (json: EntityJson) => Object.assign(json.props[2], { id: "Kind; evil()" }),
      "props.2.id",
    ],
    [
      "zodFormat",
      (json: EntityJson) => Object.assign(json.props[1], { zodFormat: "email(); evil" }),
      "props.1.zodFormat",
    ],
    [
      "length",
      (json: EntityJson) => Object.assign(json.props[1], { length: "1); evil(" }),
      "props.1.length",
    ],
    [
      "relation 대상",
      (json: EntityJson) =>
        json.props.push({
          name: "owner",
          type: "relation",
          relationType: "BelongsToOne",
          with: "User\n evil()",
          desc: "소유자",
        }),
      "props.4.with",
    ],
    [
      "relationType 개행",
      (json: EntityJson) =>
        json.props.push({
          name: "members",
          type: "relation",
          relationType: "HasMany",
          with: "User",
          joinColumn: "tag_id",
          desc: "멤버",
        }) && Object.assign(json.props[4], { relationType: "HasMany\nevil()" }),
      "props.4.relationType",
    ],
  ])("%s 위치의 주입 값을 거부한다", (_label, mutate, pathFragment) => {
    const json = baseEntity();
    mutate(json);
    expectRejected(json, pathFragment);
  });
});

describe("엔티티 쓰기·로드 경로의 강제 검증", () => {
  let apiRoot: AbsolutePath;
  let jsonPath: string;

  beforeAll(async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sonamu-son622-"));
    // Sonamu.apiRootPath는 절대 경로만 받으므로 임시 디렉터리 경로를 실제로 검사해 좁힌다.
    if (!isAbsolutePath(tempRoot)) {
      throw new Error(`임시 디렉터리가 절대 경로가 아닙니다: ${tempRoot}`);
    }
    apiRoot = tempRoot;
    jsonPath = path.join(apiRoot, "src/application/safety-saved/safety-saved.entity.json");
    await mkdir(path.dirname(jsonPath), { recursive: true });
    Sonamu.apiRootPath = apiRoot;
  });

  afterAll(async () => {
    await rm(apiRoot, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("EntityManager.register는 prop 이름 주입을 거부하고 등록하지 않는다", async () => {
    const json = baseEntity("SafetyRegister");
    json.props.push({ name: PROP_NAME_PAYLOAD, type: "string", desc: "x" });

    await expect(EntityManager.register(json)).rejects.toThrow("props.4.name");
    expect(EntityManager.exists("SafetyRegister")).toBe(false);
  });

  it("Entity.save는 주입 값을 파일에 쓰지 않고 메모리의 엔티티를 디스크 상태로 되돌린다", async () => {
    const original = JSON.stringify(baseEntity("SafetySaved"));
    await writeFile(jsonPath, original);
    await EntityManager.registerFromFile(jsonPath);

    const entity = EntityManager.get("SafetySaved");
    entity.enumLabels[ENUM_ID_PAYLOAD] = { k: "*/ //" };

    await expect(entity.save()).rejects.toThrow("enums");
    expect(await readFile(jsonPath, "utf8")).toBe(original);
    expect(Object.keys(EntityManager.get("SafetySaved").enumLabels)).not.toContain(ENUM_ID_PAYLOAD);
  });

  it("Entity.createProp(UI createProp 경로)도 prop 이름 주입을 거부한다", async () => {
    const original = JSON.stringify(baseEntity("SafetySaved"));
    await writeFile(jsonPath, original);
    await EntityManager.registerFromFile(jsonPath);

    await expect(
      EntityManager.get("SafetySaved").createProp({
        name: PROP_NAME_PAYLOAD,
        type: "string",
        desc: "x",
        nullable: true,
      }),
    ).rejects.toThrow("props.4.name");
    expect(await readFile(jsonPath, "utf8")).toBe(original);
    expect(EntityManager.get("SafetySaved").props.map((p) => p.name)).not.toContain(
      PROP_NAME_PAYLOAD,
    );
  });

  it("메모리에서만 바뀐 주입 값은 코드 생성 직전에 막는다", async () => {
    await writeFile(jsonPath, JSON.stringify(baseEntity("SafetySaved")));
    await EntityManager.registerFromFile(jsonPath);
    const entity = EntityManager.get("SafetySaved");
    entity.table = 'tags"; evil(); "';

    try {
      await expect(renderTemplate("generated", {})).rejects.toThrow("table");
    } finally {
      await EntityManager.registerFromFile(jsonPath);
    }
  });

  it("새 엔티티 템플릿(UI create 경로)도 table 주입을 거부한다", () => {
    const template = new Template__entity();
    expect(() =>
      template.render({ entityId: "SafetyCreated", title: "생성", table: 'x"); evil(); ("' }),
    ).toThrow("table");
  });
});

describe("자유 문자열의 생성 코드 출력", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("enum 키는 z.enum 배열 안의 문자열 리터럴로만 출력된다", () => {
    const json = baseEntity();
    const keys = [FREE_TEXT_PAYLOAD, 'a"b', "c\\"];
    json.enums.SafetyTagKind = Object.fromEntries(keys.map((key) => [key, "라벨"]));
    const sourceCode = new Template__generated().getEnumsSourceCode(new Entity(json));

    const statements = parseGenerated(sourceCode?.lines.join("\n") ?? "");
    // 엔티티의 enum 2개 × (const, type, Label) 외에 주입된 문장이 없어야 한다.
    expect(statements).toHaveLength(6);
    const [enumDecl] = statements;
    assert(ts.isVariableStatement(enumDecl));
    const describeCall = enumDecl.declarationList.declarations[0].initializer;
    assert(describeCall !== undefined && ts.isCallExpression(describeCall));
    assert(ts.isPropertyAccessExpression(describeCall.expression));
    const enumCall = describeCall.expression.expression;
    assert(ts.isCallExpression(enumCall));
    const [array] = enumCall.arguments;
    assert(ts.isArrayLiteralExpression(array));
    expect(array.elements.map((el) => stringLiteralText(el))).toEqual(keys);
  });

  it("sd 라벨의 키와 값은 개행·U+2028이 있어도 문자열 리터럴로만 출력된다", () => {
    const template = new Template__sd();
    const labels = [
      { key: `enum.SafetyTagKind.${FREE_TEXT_PAYLOAD}`, value: FREE_TEXT_PAYLOAD },
      { key: "entity.SafetyTag", value: "줄1\r줄2\u2028줄3\n" },
    ];
    const code = template["generateEntityLabelsCode"](labels);

    const statements = parseGenerated(code);
    expect(statements).toHaveLength(1);
    const [decl] = statements;
    assert(ts.isVariableStatement(decl));
    const asExpr = decl.declarationList.declarations[0].initializer;
    assert(asExpr !== undefined && ts.isAsExpression(asExpr));
    const objectLiteral = asExpr.expression;
    assert(ts.isObjectLiteralExpression(objectLiteral));
    expect(
      objectLiteral.properties.map((property) => {
        assert(ts.isPropertyAssignment(property));
        return {
          key: stringLiteralText(property.name),
          value: stringLiteralText(property.initializer),
        };
      }),
    ).toEqual(labels);
  });

  it("customJoinClause는 knex.raw·Puri.rawString 인자의 문자열 리터럴로만 출력된다", () => {
    const clause = 'owner.id = tags.owner_id ${process.exit()} `"); evil(); ("';
    const ownerJson: EntityJson = {
      id: "SafetyOwner",
      title: "소유자",
      table: "safety_owners",
      props: [
        { name: "id", type: "integer", desc: "ID" },
        { name: "name", type: "string", desc: "이름" },
      ],
      indexes: [],
      subsets: {},
      enums: {},
    };
    const tagJson = baseEntity();
    tagJson.props.push({
      name: "owner",
      type: "relation",
      relationType: "BelongsToOne",
      with: "SafetyOwner",
      customJoinClause: clause,
      desc: "소유자",
    });
    tagJson.subsets = { A: ["id", "owner.name"] };
    const owner = new Entity(ownerJson);
    const tag = new Entity(tagJson);
    vi.spyOn(EntityManager, "get").mockImplementation((id: string) =>
      id === "SafetyOwner" ? owner : tag,
    );

    const code = tag.getPuriSubsetQuery("A");
    const statements = parseGenerated(code);
    expect(statements).toHaveLength(1);
    const rawStrings: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && node.expression.getText().endsWith("knex.raw")) {
        rawStrings.push(stringLiteralText(node.arguments[0]));
      }
      ts.forEachChild(node, visit);
    };
    statements.forEach(visit);
    expect(rawStrings).toEqual([clause]);
  });
});

function assert(condition: boolean): asserts condition {
  expect(condition).toBeTruthy();
}
