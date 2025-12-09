import { EntityManager } from "sonamu";
import { describe, expect, it, vi } from "vitest";
import { bootstrap } from "../testing/bootstrap";

bootstrap(vi);

describe("entityManager", () => {
  describe("schemaValidate", () => {
    // 유효한 기본 EntityJson
    const validBaseEntity = {
      id: "Test",
      title: "테스트",
      table: "tests",
      props: [],
      indexes: [],
      subsets: {},
      enums: {},
    };

    describe("정상 케이스", () => {
      it("모든 필드가 있는 정상적인 entity", () => {
        const errors = EntityManager.schemaValidate(validBaseEntity);
        expect(errors).toBeNull();
      });

      it("string prop", () => {
        const json = {
          ...validBaseEntity,
          props: [{ type: "string", name: "username", length: 100 }],
        };
        const errors = EntityManager.schemaValidate(json);
        expect(errors).toBeNull();
      });

      it("integer prop", () => {
        const json = {
          ...validBaseEntity,
          props: [{ type: "integer", name: "count" }],
        };
        const errors = EntityManager.schemaValidate(json);
        expect(errors).toBeNull();
      });

      it("boolean prop", () => {
        const json = {
          ...validBaseEntity,
          props: [{ type: "boolean", name: "isActive" }],
        };
        const errors = EntityManager.schemaValidate(json);
        expect(errors).toBeNull();
      });

      it("enum prop", () => {
        const json = {
          ...validBaseEntity,
          props: [{ type: "enum", name: "status", id: "TestStatus" }],
        };
        const errors = EntityManager.schemaValidate(json);
        expect(errors).toBeNull();
      });

      it("BelongsToOne relation", () => {
        const json = {
          ...validBaseEntity,
          props: [
            {
              type: "relation",
              name: "user",
              with: "User",
              relationType: "BelongsToOne",
            },
          ],
        };
        const errors = EntityManager.schemaValidate(json);
        expect(errors).toBeNull();
      });

      it("HasMany relation", () => {
        const json = {
          ...validBaseEntity,
          props: [
            {
              type: "relation",
              name: "posts",
              with: "Post",
              relationType: "HasMany",
              joinColumn: "user_id",
            },
          ],
        };
        const errors = EntityManager.schemaValidate(json);
        expect(errors).toBeNull();
      });

      it("ManyToMany relation", () => {
        const json = {
          ...validBaseEntity,
          props: [
            {
              type: "relation",
              name: "tags",
              with: "Tag",
              relationType: "ManyToMany",
              joinTable: "post__tag",
              onUpdate: "CASCADE",
              onDelete: "CASCADE",
            },
          ],
        };
        const errors = EntityManager.schemaValidate(json);
        expect(errors).toBeNull();
      });

      it("OneToOne relation", () => {
        const json = {
          ...validBaseEntity,
          props: [
            {
              type: "relation",
              name: "profile",
              with: "Profile",
              relationType: "OneToOne",
              hasJoinColumn: true,
            },
          ],
        };
        const errors = EntityManager.schemaValidate(json);
        expect(errors).toBeNull();
      });
    });

    describe("최상위 필드 에러", () => {
      it("id 누락", () => {
        const json = {
          ...validBaseEntity,
          id: undefined,
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain(
          "Invalid input: expected string, received undefined",
        );
        expect(errors?.issues[0]?.path).toContain("id");
      });

      it("title 누락", () => {
        const json = {
          ...validBaseEntity,
          title: undefined,
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain(
          "Invalid input: expected string, received undefined",
        );
        expect(errors?.issues[0]?.path).toContain("title");
      });

      it("table 누락", () => {
        const json = {
          ...validBaseEntity,
          table: undefined,
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain(
          "Invalid input: expected string, received undefined",
        );
        expect(errors?.issues[0]?.path).toContain("table");
      });

      it("props 누락", () => {
        const json = {
          ...validBaseEntity,
          props: undefined,
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain(
          "Invalid input: expected array, received undefined",
        );
        expect(errors?.issues[0]?.path).toContain("props");
      });

      it("indexes 누락", () => {
        const json = {
          ...validBaseEntity,
          indexes: undefined,
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain(
          "Invalid input: expected array, received undefined",
        );
        expect(errors?.issues[0]?.path).toContain("indexes");
      });

      it("subsets 누락", () => {
        const json = {
          ...validBaseEntity,
          subsets: undefined,
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain(
          "Invalid input: expected record, received undefined",
        );
        expect(errors?.issues[0]?.path).toContain("subsets");
      });

      it("enums 누락", () => {
        const json = {
          ...validBaseEntity,
          enums: undefined,
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain(
          "Invalid input: expected record, received undefined",
        );
        expect(errors?.issues[0]?.path).toContain("enums");
      });

      it("정의되지 않은 최상위 필드", () => {
        const json = {
          ...validBaseEntity,
          unknownField: "이건 없는 필드",
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain('Unrecognized key: "unknownField"');
        expect(errors?.issues[0]?.path).toHaveLength(0);
      });
    });

    describe("type 에러", () => {
      it("type이 잘못된 값인 경우", () => {
        const json = {
          ...validBaseEntity,
          props: [{ type: "invalidType", name: "test" }],
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain(` 중 하나여야 합니다. 입력값: "invalidType"`);
        expect(errors?.issues[0]?.path).toEqual(["props", 0, "type"]);
      });

      it("type이 누락된 경우", () => {
        const json = {
          ...validBaseEntity,
          props: [{ name: "test" }],
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain(`중 하나여야 합니다. 입력값: "undefined"`);
        expect(errors?.issues[0]?.path).toEqual(["props", 0, "type"]);
      });
    });

    describe("prop 필수 필드 에러", () => {
      it("enum prop에서 id 누락", () => {
        const json = {
          ...validBaseEntity,
          props: [{ type: "enum", name: "status" }],
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain(
          "Invalid input: expected string, received undefined",
        );
        expect(errors?.issues[0]?.path).toEqual(["props", 0, "id"]);
      });
    });

    describe("prop 추가 필드 에러 (strict)", () => {
      it("string prop에 정의되지 않은 필드", () => {
        const json = {
          ...validBaseEntity,
          props: [{ type: "string", name: "username", length: 100, unknownField: "test" }],
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain('Unrecognized key: "unknownField"');
        expect(errors?.issues[0]?.path).toEqual(["props", 0]);
      });

      it("integer prop에 정의되지 않은 필드", () => {
        const json = {
          ...validBaseEntity,
          props: [{ type: "integer", name: "count", extraField: 123 }],
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain('Unrecognized key: "extraField"');
        expect(errors?.issues[0]?.path).toEqual(["props", 0]);
      });
    });

    describe("relation type 에러", () => {
      it("relationType이 잘못된 값인 경우", () => {
        const json = {
          ...validBaseEntity,
          props: [
            {
              type: "relation",
              name: "user",
              with: "User",
              relationType: "InvalidRelation",
            },
          ],
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain(
          "relationType은 'BelongsToOne', 'HasMany', 'ManyToMany', 'OneToOne' 중 하나여야 합니다. 입력값: \"InvalidRelation\"",
        );
        expect(errors?.issues[0]?.path).toEqual(["props", 0, "relationType"]);
      });

      it("relationType이 누락된 경우", () => {
        const json = {
          ...validBaseEntity,
          props: [
            {
              type: "relation",
              name: "user",
              with: "User",
            },
          ],
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain(
          "relationType은 'BelongsToOne', 'HasMany', 'ManyToMany', 'OneToOne' 중 하나여야 합니다. 입력값: \"undefined\"",
        );
        expect(errors?.issues[0]?.path).toEqual(["props", 0, "relationType"]);
      });
    });

    describe("relation 필수 필드 에러", () => {
      it("HasMany에서 joinColumn 누락", () => {
        const json = {
          ...validBaseEntity,
          props: [
            {
              type: "relation",
              name: "posts",
              with: "Post",
              relationType: "HasMany",
            },
          ],
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain(
          "Invalid input: expected string, received undefined",
        );
        expect(errors?.issues[0]?.path).toEqual(["props", 0, "joinColumn"]);
      });

      it("ManyToMany에서 joinTable 누락", () => {
        const json = {
          ...validBaseEntity,
          props: [
            {
              type: "relation",
              name: "tags",
              with: "Tag",
              relationType: "ManyToMany",
              onUpdate: "CASCADE",
              onDelete: "CASCADE",
            },
          ],
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain(
          "Invalid input: expected string, received undefined",
        );
        expect(errors?.issues[0]?.path).toEqual(["props", 0, "joinTable"]);
      });

      it("ManyToMany에서 onUpdate 누락", () => {
        const json = {
          ...validBaseEntity,
          props: [
            {
              type: "relation",
              name: "tags",
              with: "Tag",
              relationType: "ManyToMany",
              joinTable: "post__tag",
              onDelete: "CASCADE",
            },
          ],
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain(
          `Invalid option: expected one of "CASCADE"|"SET NULL"|"NO ACTION"|"SET DEFAULT"|"RESTRICT"`,
        );
        expect(errors?.issues[0]?.path).toEqual(["props", 0, "onUpdate"]);
      });

      it("ManyToMany에서 onDelete 누락", () => {
        const json = {
          ...validBaseEntity,
          props: [
            {
              type: "relation",
              name: "tags",
              with: "Tag",
              relationType: "ManyToMany",
              joinTable: "post__tag",
              onUpdate: "CASCADE",
            },
          ],
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain(
          `Invalid option: expected one of "CASCADE"|"SET NULL"|"NO ACTION"|"SET DEFAULT"|"RESTRICT"`,
        );
        expect(errors?.issues[0]?.path).toEqual(["props", 0, "onDelete"]);
      });

      it("relation에서 with 누락", () => {
        const json = {
          ...validBaseEntity,
          props: [
            {
              type: "relation",
              name: "user",
              relationType: "BelongsToOne",
            },
          ],
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain(
          "Invalid input: expected string, received undefined",
        );
        expect(errors?.issues[0]?.path).toEqual(["props", 0, "with"]);
      });
    });

    describe("relation 추가 필드 에러 (strict)", () => {
      it("BelongsToOne에 정의되지 않은 필드", () => {
        const json = {
          ...validBaseEntity,
          props: [
            {
              type: "relation",
              name: "user",
              with: "User",
              relationType: "BelongsToOne",
              unknownField: "test",
            },
          ],
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain('Unrecognized key: "unknownField"');
        expect(errors?.issues[0]?.path).toEqual(["props", 0]);
      });

      it("HasMany에 정의되지 않은 필드", () => {
        const json = {
          ...validBaseEntity,
          props: [
            {
              type: "relation",
              name: "posts",
              with: "Post",
              relationType: "HasMany",
              joinColumn: "user_id",
              extraField: "test",
            },
          ],
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain('Unrecognized key: "extraField"');
        expect(errors?.issues[0]?.path).toEqual(["props", 0]);
      });
    });

    describe("index 에러", () => {
      it("정상적인 index", () => {
        const json = {
          ...validBaseEntity,
          indexes: [{ type: "index", name: "companies_name_index", columns: [{ name: "name" }] }],
        };
        const errors = EntityManager.schemaValidate(json);
        expect(errors).toBeNull();
      });

      it("index type이 잘못된 경우", () => {
        const json = {
          ...validBaseEntity,
          indexes: [
            { type: "invalidType", name: "companies_name_index", columns: [{ name: "name" }] },
          ],
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain(
          `Invalid option: expected one of "index"|"unique"|"fulltext"`,
        );
        expect(errors?.issues[0]?.path).toEqual(["indexes", 0, "type"]);
      });

      it("index columns 누락", () => {
        const json = {
          ...validBaseEntity,
          indexes: [{ type: "index", name: "companies_name_index" }],
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain(
          "Invalid input: expected array, received undefined",
        );
        expect(errors?.issues[0]?.path).toEqual(["indexes", 0, "columns"]);
      });

      it("index name 누락", () => {
        const json = {
          ...validBaseEntity,
          indexes: [{ type: "index", columns: [{ name: "name" }] }],
        };
        const errors = EntityManager.schemaValidate(json);
        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain(
          "Invalid input: expected string, received undefined",
        );
        expect(errors?.issues[0]?.path).toEqual(["indexes", 0, "name"]);
      });

      it("index에 정의되지 않은 필드", () => {
        const json = {
          ...validBaseEntity,
          indexes: [
            {
              type: "index",
              name: "companies_name_index",
              columns: [{ name: "name" }],
              unknownField: "test",
            },
          ],
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(1);
        expect(errors?.issues[0]?.message).toContain('Unrecognized key: "unknownField"');
        expect(errors?.issues[0]?.path).toEqual(["indexes", 0]);
      });
    });

    describe.skip("복합 에러", () => {
      it("여러 prop에서 동시에 에러 발생", () => {
        const json = {
          ...validBaseEntity,
          props: [
            { type: "text", name: "field1" },
            { type: "invalidType", name: "field2" }, // 잘못된 type
          ],
        };
        const errors = EntityManager.schemaValidate(json);

        expect(errors?.issues).toHaveLength(2);
        expect(errors?.issues[0]?.message).toContain(
          'Invalid option: expected one of "text"|"mediumtext"|"longtext"',
        );
        expect(errors?.issues[0]?.path).toEqual(["props", 0, "textType"]);
        expect(errors?.issues[1]?.message).toContain(
          `type은 'boolean', 'date', 'datetime', 'time', 'timestamp', 'uuid', 'integer', 'bigInteger', 'string', 'text', 'enum', 'float', 'double', 'decimal', 'number', 'numeric', 'json', 'virtual', 'relation' 중 하나여야 합니다. 입력값: "invalidType"`,
        );
        expect(errors?.issues[1]?.path).toEqual(["props", 1, "type"]);
      });
    });
  });
});
