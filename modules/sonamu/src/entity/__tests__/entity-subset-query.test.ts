import { afterEach, describe, expect, it, vi } from "vitest";

import { type EntityJson } from "../../types/types";
import { Entity } from "../entity";
import { EntityManager } from "../entity-manager";

const chatRoomJson: EntityJson = {
  id: "ChatRoom",
  table: "chat_rooms",
  props: [
    { name: "id", type: "integer", desc: "ID" },
    { name: "name", type: "string", desc: "이름" },
    { name: "case", type: "relation", relationType: "BelongsToOne", with: "Case", desc: "케이스" },
  ],
  indexes: [],
  subsets: {},
  enums: {},
};

const caseJson: EntityJson = {
  id: "Case",
  table: "cases",
  props: [
    { name: "id", type: "integer", desc: "ID" },
    {
      name: "chat_room",
      type: "relation",
      relationType: "OneToOne",
      with: "ChatRoom",
      hasJoinColumn: false,
      nullable: true,
      desc: "채팅방",
    },
    {
      name: "owner",
      type: "relation",
      relationType: "BelongsToOne",
      with: "ChatRoom",
      desc: "소유 채팅방",
    },
  ],
  indexes: [],
  subsets: {},
  enums: {},
};

describe("Entity.resolveSubsetQuery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setup() {
    const chatRoom = new Entity(chatRoomJson);
    const caseEntity = new Entity(caseJson);
    vi.spyOn(EntityManager, "get").mockImplementation((id: string) =>
      id === "ChatRoom" ? chatRoom : caseEntity,
    );
    return caseEntity;
  }

  it("조인 컬럼 없는 역방향 OneToOne의 id 단독 조회는 존재하지 않는 FK 컬럼 대신 JOIN으로 id를 선택한다", () => {
    const result = setup().resolveSubsetQuery("", ["chat_room.id"]);

    expect(result.select).toEqual(["chat_room.id as chat_room__id"]);
    expect(result.select.join(" ")).not.toContain("cases.chat_room_id");
    expect(result.joins).toEqual([
      {
        as: "chat_room",
        join: "outer",
        table: "chat_rooms",
        from: "cases.id",
        to: "chat_room.case_id",
      },
    ]);
  });

  it("BelongsToOne의 id 단독 조회는 기존처럼 FK 컬럼만 선택한다", () => {
    const result = setup().resolveSubsetQuery("", ["owner.id"]);

    expect(result.select).toEqual(["cases.owner_id"]);
    expect(result.joins).toEqual([]);
  });
});
