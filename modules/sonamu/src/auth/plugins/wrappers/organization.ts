import { organization as _organization, type OrganizationOptions } from "better-auth/plugins";

import { merge } from "../../../utils/utils";

export type { OrganizationOptions } from "better-auth/plugins";

/**
 * Organization 플러그인 스키마
 *
 * better-auth organization 플러그인 호출 시 전달합니다:
 * ```typescript
 * organization({ schema: ORGANIZATION_SCHEMA })
 * ```
 */
export const ORGANIZATION_SCHEMA: OrganizationOptions["schema"] = {
  organization: {
    modelName: "organizations",
    fields: {
      createdAt: "created_at",
    },
  },
  member: {
    modelName: "members",
    fields: {
      userId: "user_id",
      organizationId: "organization_id",
      createdAt: "created_at",
    },
  },
  invitation: {
    modelName: "invitations",
    fields: {
      inviterId: "inviter_id",
      organizationId: "organization_id",
      teamId: "team_id",
      expiresAt: "expires_at",
      createdAt: "created_at",
    },
  },
  team: {
    modelName: "teams",
    fields: {
      organizationId: "organization_id",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  teamMember: {
    modelName: "team_members",
    fields: {
      teamId: "team_id",
      userId: "user_id",
      createdAt: "created_at",
    },
  },
  session: {
    fields: {
      activeOrganizationId: "active_organization_id",
      activeTeamId: "active_team_id",
    },
  },
};

/**
 * organization 플러그인 래퍼
 *
 * Sonamu의 스키마 매핑을 자동으로 병합합니다.
 */
export const organization = (
  options: OrganizationOptions = {},
): ReturnType<typeof _organization> => {
  options.schema = merge(ORGANIZATION_SCHEMA, options.schema ?? {});
  return _organization(options);
};
