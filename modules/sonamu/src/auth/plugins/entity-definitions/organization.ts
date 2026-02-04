import type { BetterAuthEntityDef } from "./types";

/**
 * better-auth Organization 플러그인 엔티티 정의
 * https://www.better-auth.com/docs/plugins/organization
 *
 * 조직, 멤버, 초대, 팀 관리를 지원합니다.
 */
export const organizationEntityDef: BetterAuthEntityDef = {
  id: "organization",
  name: "Organization",
  entities: [
    {
      id: "Organization",
      table: "organizations",
      title: "조직",
      props: [
        { name: "id", type: "string", desc: "ID" },
        { name: "name", type: "string", desc: "조직명" },
        { name: "slug", type: "string", desc: "슬러그" },
        { name: "logo", type: "string", nullable: true, desc: "로고 URL" },
        { name: "metadata", type: "string", nullable: true, desc: "메타데이터 (JSON)" },
        { name: "created_at", type: "date", dbDefault: "CURRENT_TIMESTAMP", desc: "생성일시" },
      ],
      indexes: [{ type: "unique", name: "organizations_slug_unique", columns: [{ name: "slug" }] }],
      subsets: {
        A: ["id", "name", "slug", "logo", "metadata", "created_at"],
      },
      enums: {
        OrganizationOrderBy: { "id-desc": "ID최신순", "created_at-desc": "생성일최신순" },
        OrganizationSearchField: { id: "ID", name: "조직명", slug: "슬러그" },
      },
    },
    {
      id: "Member",
      table: "members",
      title: "멤버",
      props: [
        { name: "id", type: "string", desc: "ID" },
        { name: "role", type: "string", desc: "역할" },
        { name: "created_at", type: "date", dbDefault: "CURRENT_TIMESTAMP", desc: "생성일시" },
        {
          type: "relation",
          name: "user",
          with: "User",
          relationType: "BelongsToOne",
          onDelete: "CASCADE",
          desc: "사용자",
        },
        {
          type: "relation",
          name: "organization",
          with: "Organization",
          relationType: "BelongsToOne",
          onDelete: "CASCADE",
          desc: "조직",
        },
      ],
      indexes: [
        { type: "index", name: "members_user_id_idx", columns: [{ name: "user_id" }] },
        {
          type: "index",
          name: "members_organization_id_idx",
          columns: [{ name: "organization_id" }],
        },
      ],
      subsets: {
        A: ["id", "role", "created_at", "user.id", "organization.id"],
      },
      enums: {
        MemberOrderBy: { "id-desc": "ID최신순", "created_at-desc": "생성일최신순" },
        MemberSearchField: { id: "ID", role: "역할" },
      },
    },
    {
      id: "Invitation",
      table: "invitations",
      title: "초대",
      props: [
        { name: "id", type: "string", desc: "ID" },
        { name: "email", type: "string", desc: "이메일" },
        { name: "role", type: "string", desc: "역할" },
        { name: "status", type: "string", desc: "상태" },
        { name: "expires_at", type: "date", desc: "만료일시" },
        { name: "created_at", type: "date", dbDefault: "CURRENT_TIMESTAMP", desc: "생성일시" },
        {
          type: "relation",
          name: "inviter",
          with: "User",
          relationType: "BelongsToOne",
          onDelete: "CASCADE",
          desc: "초대자",
        },
        {
          type: "relation",
          name: "organization",
          with: "Organization",
          relationType: "BelongsToOne",
          onDelete: "CASCADE",
          desc: "조직",
        },
        {
          type: "relation",
          name: "team",
          with: "Team",
          relationType: "BelongsToOne",
          onDelete: "SET NULL",
          nullable: true,
          desc: "팀",
        },
      ],
      indexes: [
        { type: "index", name: "invitations_email_idx", columns: [{ name: "email" }] },
        {
          type: "index",
          name: "invitations_organization_id_idx",
          columns: [{ name: "organization_id" }],
        },
      ],
      subsets: {
        A: [
          "id",
          "email",
          "role",
          "status",
          "expires_at",
          "created_at",
          "inviter.id",
          "organization.id",
          "team.id",
        ],
      },
      enums: {
        InvitationOrderBy: { "id-desc": "ID최신순", "created_at-desc": "생성일최신순" },
        InvitationSearchField: { id: "ID", email: "이메일" },
      },
    },
    {
      id: "Team",
      table: "teams",
      title: "팀",
      props: [
        { name: "id", type: "string", desc: "ID" },
        { name: "name", type: "string", desc: "팀명" },
        { name: "created_at", type: "date", dbDefault: "CURRENT_TIMESTAMP", desc: "생성일시" },
        { name: "updated_at", type: "date", nullable: true, desc: "수정일시" },
        {
          type: "relation",
          name: "organization",
          with: "Organization",
          relationType: "BelongsToOne",
          onDelete: "CASCADE",
          desc: "조직",
        },
      ],
      indexes: [
        {
          type: "index",
          name: "teams_organization_id_idx",
          columns: [{ name: "organization_id" }],
        },
      ],
      subsets: {
        A: ["id", "name", "created_at", "updated_at", "organization.id"],
      },
      enums: {
        TeamOrderBy: { "id-desc": "ID최신순", "created_at-desc": "생성일최신순" },
        TeamSearchField: { id: "ID", name: "팀명" },
      },
    },
    {
      id: "TeamMember",
      table: "team_members",
      title: "팀멤버",
      props: [
        { name: "id", type: "string", desc: "ID" },
        { name: "created_at", type: "date", dbDefault: "CURRENT_TIMESTAMP", desc: "생성일시" },
        {
          type: "relation",
          name: "team",
          with: "Team",
          relationType: "BelongsToOne",
          onDelete: "CASCADE",
          desc: "팀",
        },
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
        { type: "index", name: "team_members_team_id_idx", columns: [{ name: "team_id" }] },
        { type: "index", name: "team_members_user_id_idx", columns: [{ name: "user_id" }] },
      ],
      subsets: {
        A: ["id", "created_at", "team.id", "user.id"],
      },
      enums: {
        TeamMemberOrderBy: { "id-desc": "ID최신순", "created_at-desc": "생성일최신순" },
        TeamMemberSearchField: { id: "ID" },
      },
    },
  ],
  additionalProps: {
    Session: [
      { name: "active_organization_id", type: "string", nullable: true, desc: "활성 조직 ID" },
      { name: "active_team_id", type: "string", nullable: true, desc: "활성 팀 ID" },
    ],
  },
};
