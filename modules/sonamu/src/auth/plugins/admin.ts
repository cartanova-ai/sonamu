import type { BetterAuthPlugin, PluginSchema } from "./types";

/**
 * Admin 플러그인 스키마
 *
 * better-auth admin 플러그인 호출 시 전달합니다:
 * ```typescript
 * admin({ schema: ADMIN_SCHEMA })
 * ```
 */
export const ADMIN_SCHEMA: PluginSchema = {
  user: {
    fields: {
      // role: "role",
      // banned: "banned",
      banReason: "ban_reason",
      banExpires: "ban_expires",
    },
  },
  session: {
    fields: {
      impersonatedBy: "impersonated_by",
    },
  },
};

/**
 * better-auth admin 플러그인
 * https://www.better-auth.com/docs/plugins/admin
 *
 * 관리자 기능을 위한 필드를 추가합니다:
 *
 * User 테이블:
 * - role: 사용자 역할 (기본값: "user")
 * - banned: 차단 여부
 * - ban_reason: 차단 사유
 * - ban_expires: 차단 만료 시간 (Unix timestamp)
 *
 * Session 테이블:
 * - impersonated_by: 대리 로그인한 관리자 ID
 */
export const adminPlugin: BetterAuthPlugin = {
  id: "admin",
  name: "Admin",
  entities: [],
  additionalProps: {
    User: [
      {
        name: "role",
        type: "string",
        nullable: true,
        dbDefault: '"user"',
        desc: "사용자 역할",
      },
      {
        name: "banned",
        type: "boolean",
        nullable: true,
        dbDefault: "false",
        desc: "차단 여부",
      },
      {
        name: "ban_reason",
        type: "string",
        nullable: true,
        desc: "차단 사유",
      },
      {
        name: "ban_expires",
        type: "bigInteger",
        nullable: true,
        desc: "차단 만료 (Unix timestamp)",
      },
    ],
    Session: [
      {
        name: "impersonated_by",
        type: "string",
        nullable: true,
        desc: "대리 로그인한 관리자 ID",
      },
    ],
  },
  schema: ADMIN_SCHEMA,
};
