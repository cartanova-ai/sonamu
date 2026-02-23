import type { BetterAuthOptions } from "better-auth";
import type { EntityJson } from "../types/types";

/**
 * better-auth v1 엔티티 정의
 * https://www.better-auth.com/
 *
 * Sonamu 규칙:
 * - 테이블명: 복수형 (users, sessions, accounts, verifications)
 * - 컬럼명: snake_case (email_verified, created_at, user_id 등)
 */
export const betterAuthV1: EntityJson[] = [
  // User 엔티티
  {
    id: "User",
    table: "users",
    title: "사용자",
    props: [
      { name: "id", type: "string", desc: "ID", cone: { fixtureStrategy: "sequence" } },
      { name: "name", type: "string", desc: "이름" },
      { name: "email", type: "string", desc: "이메일" },
      { name: "email_verified", type: "boolean", desc: "이메일 인증 여부" },
      { name: "image", type: "string", nullable: true, desc: "프로필 이미지" },
      { name: "created_at", type: "date", dbDefault: "CURRENT_TIMESTAMP", desc: "생성일시" },
      { name: "updated_at", type: "date", dbDefault: "CURRENT_TIMESTAMP", desc: "수정일시" },
    ],
    indexes: [{ type: "unique", name: "users_email_unique", columns: [{ name: "email" }] }],
    subsets: {
      A: ["id", "name", "email", "email_verified", "image", "created_at", "updated_at"],
    },
    enums: { UserOrderBy: { "id-desc": "ID최신순" }, UserSearchField: { id: "ID" } },
  },

  // Session 엔티티
  {
    id: "Session",
    table: "sessions",
    title: "세션",
    props: [
      { name: "id", type: "string", desc: "ID" },
      { name: "expires_at", type: "date", desc: "만료일시" },
      { name: "token", type: "string", desc: "토큰" },
      { name: "created_at", type: "date", dbDefault: "CURRENT_TIMESTAMP", desc: "생성일시" },
      { name: "updated_at", type: "date", desc: "수정일시" },
      { name: "ip_address", type: "string", nullable: true, desc: "IP 주소" },
      { name: "user_agent", type: "string", nullable: true, desc: "User Agent" },
      {
        type: "relation",
        name: "user",
        with: "User",
        relationType: "BelongsToOne",
        onDelete: "CASCADE",
        desc: "사용자",
      },
    ],
    indexes: [
      { type: "unique", name: "sessions_token_unique", columns: [{ name: "token" }] },
      { type: "index", name: "sessions_user_id_idx", columns: [{ name: "user_id" }] },
    ],
    subsets: {
      A: [
        "id",
        "expires_at",
        "token",
        "created_at",
        "updated_at",
        "ip_address",
        "user_agent",
        "user.id",
      ],
    },
    enums: { SessionOrderBy: { "id-desc": "ID최신순" }, SessionSearchField: { id: "ID" } },
  },

  // Account 엔티티
  {
    id: "Account",
    table: "accounts",
    title: "계정",
    props: [
      { name: "id", type: "string", desc: "ID" },
      { name: "account_id", type: "string", desc: "계정 ID" },
      { name: "provider_id", type: "string", desc: "제공자 ID" },
      {
        type: "relation",
        name: "user",
        with: "User",
        relationType: "BelongsToOne",
        onDelete: "CASCADE",
        desc: "사용자",
      },
      { name: "access_token", type: "string", nullable: true, desc: "액세스 토큰" },
      { name: "refresh_token", type: "string", nullable: true, desc: "리프레시 토큰" },
      { name: "id_token", type: "string", nullable: true, desc: "ID 토큰" },
      {
        name: "access_token_expires_at",
        type: "date",
        nullable: true,
        desc: "액세스 토큰 만료일시",
      },
      {
        name: "refresh_token_expires_at",
        type: "date",
        nullable: true,
        desc: "리프레시 토큰 만료일시",
      },
      { name: "scope", type: "string", nullable: true, desc: "스코프" },
      { name: "password", type: "string", nullable: true, desc: "비밀번호" },
      { name: "created_at", type: "date", dbDefault: "CURRENT_TIMESTAMP", desc: "생성일시" },
      { name: "updated_at", type: "date", desc: "수정일시" },
    ],
    indexes: [{ type: "index", name: "accounts_user_id_idx", columns: [{ name: "user_id" }] }],
    subsets: {
      A: [
        "id",
        "account_id",
        "provider_id",
        "user.id",
        "access_token",
        "refresh_token",
        "id_token",
        "access_token_expires_at",
        "refresh_token_expires_at",
        "scope",
        "password",
        "created_at",
        "updated_at",
      ],
    },
    enums: { AccountOrderBy: { "id-desc": "ID최신순" }, AccountSearchField: { id: "ID" } },
  },

  // Verification 엔티티
  {
    id: "Verification",
    table: "verifications",
    title: "인증",
    props: [
      { name: "id", type: "string", desc: "ID" },
      { name: "identifier", type: "string", desc: "식별자" },
      { name: "value", type: "string", desc: "값" },
      { name: "expires_at", type: "date", desc: "만료일시" },
      { name: "created_at", type: "date", dbDefault: "CURRENT_TIMESTAMP", desc: "생성일시" },
      { name: "updated_at", type: "date", dbDefault: "CURRENT_TIMESTAMP", desc: "수정일시" },
    ],
    indexes: [
      { type: "index", name: "verifications_identifier_idx", columns: [{ name: "identifier" }] },
    ],
    subsets: {
      A: ["id", "identifier", "value", "expires_at", "created_at", "updated_at"],
    },
    enums: {
      VerificationOrderBy: { "id-desc": "ID최신순" },
      VerificationSearchField: { id: "ID" },
    },
  },
];

/**
 * better-auth 기본 필드 매핑 (camelCase → snake_case)
 * 기본 4개 엔티티(User, Session, Account, Verification)의 필드 매핑입니다.
 */
export const BASE_FIELD_MAPPINGS: BetterAuthOptions = {
  user: {
    modelName: "users",
    fields: {
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  session: {
    modelName: "sessions",
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      userId: "user_id",
    },
  },
  account: {
    modelName: "accounts",
    fields: {
      accountId: "account_id",
      providerId: "provider_id",
      userId: "user_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  verification: {
    modelName: "verifications",
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
};
