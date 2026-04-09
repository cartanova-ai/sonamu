/**
 * @generated
 * 직접 수정하지 마세요.
 */
/* oxlint-disable */

import { zArrayable, SonamuQueryMode, ApplySonamuFilter, SonamuFileArraySchema } from "sonamu";
import { z } from "zod";

// CustomScalar: AuditEventPayload
const AuditEventPayload = z.record(z.string(), z.unknown());
type AuditEventPayload = z.infer<typeof AuditEventPayload>;

// CustomScalar: AuditLogValue
const AuditLogValue = z.record(z.string(), z.unknown());
type AuditLogValue = z.infer<typeof AuditLogValue>;

// CustomScalar: NumberType
const NumberType = z.number();
type NumberType = z.infer<typeof NumberType>;

// CustomScalar: StringArray
const StringArray = z.array(z.string());
type StringArray = z.infer<typeof StringArray>;

// CustomScalar: StringType
const StringType = z.string();
type StringType = z.infer<typeof StringType>;

// Enums: Account
export const AccountOrderBy = z.enum(["id-desc"]).describe("AccountOrderBy");
export type AccountOrderBy = z.infer<typeof AccountOrderBy>;
export const AccountOrderByLabel = { "id-desc": "ID최신순" };
export const AccountSearchField = z.enum(["id"]).describe("AccountSearchField");
export type AccountSearchField = z.infer<typeof AccountSearchField>;
export const AccountSearchFieldLabel = { id: "ID" };

// Enums: AuditEvent
export const AuditEventOrderBy = z.enum(["id-desc"]).describe("AuditEventOrderBy");
export type AuditEventOrderBy = z.infer<typeof AuditEventOrderBy>;
export const AuditEventOrderByLabel = { "id-desc": "ID최신순" };
export const AuditEventSearchField = z.enum(["id"]).describe("AuditEventSearchField");
export type AuditEventSearchField = z.infer<typeof AuditEventSearchField>;
export const AuditEventSearchFieldLabel = { id: "ID" };
export const AuditEventCategory = z
  .enum(["user", "session", "account", "verification", "organization", "security"])
  .describe("AuditEventCategory");
export type AuditEventCategory = z.infer<typeof AuditEventCategory>;
export const AuditEventCategoryLabel = {
  user: "사용자",
  session: "세션",
  account: "계정",
  verification: "인증",
  organization: "조직",
  security: "보안",
};

// Enums: AuditLog
export const AuditLogOrderBy = z.enum(["id-desc"]).describe("AuditLogOrderBy");
export type AuditLogOrderBy = z.infer<typeof AuditLogOrderBy>;
export const AuditLogOrderByLabel = { "id-desc": "ID최신순" };
export const AuditLogSearchField = z.enum(["id"]).describe("AuditLogSearchField");
export type AuditLogSearchField = z.infer<typeof AuditLogSearchField>;
export const AuditLogSearchFieldLabel = { id: "ID" };
export const AuditLogAction = z.enum(["create", "update", "delete"]).describe("AuditLogAction");
export type AuditLogAction = z.infer<typeof AuditLogAction>;
export const AuditLogActionLabel = { create: "생성", update: "수정", delete: "삭제" };

// Enums: Company
export const CompanyOrderBy = z.enum(["id-desc"]).describe("CompanyOrderBy");
export type CompanyOrderBy = z.infer<typeof CompanyOrderBy>;
export const CompanyOrderByLabel = { "id-desc": "ID최신순" };
export const CompanySearchField = z.enum(["id", "name"]).describe("CompanySearchField");
export type CompanySearchField = z.infer<typeof CompanySearchField>;
export const CompanySearchFieldLabel = { id: "ID", name: "회사명" };

// Enums: Department
export const DepartmentOrderBy = z.enum(["id-desc", "name-asc"]).describe("DepartmentOrderBy");
export type DepartmentOrderBy = z.infer<typeof DepartmentOrderBy>;
export const DepartmentOrderByLabel = { "id-desc": "ID최신순", "name-asc": "부서명오름차순" };
export const DepartmentSearchField = z.enum(["id", "name"]).describe("DepartmentSearchField");
export type DepartmentSearchField = z.infer<typeof DepartmentSearchField>;
export const DepartmentSearchFieldLabel = { id: "ID", name: "부서명" };

// Enums: Document
export const DocumentOrderBy = z.enum(["id-desc"]).describe("DocumentOrderBy");
export type DocumentOrderBy = z.infer<typeof DocumentOrderBy>;
export const DocumentOrderByLabel = { "id-desc": "ID최신순" };
export const DocumentSearchField = z.enum(["id"]).describe("DocumentSearchField");
export type DocumentSearchField = z.infer<typeof DocumentSearchField>;
export const DocumentSearchFieldLabel = { id: "ID" };
export const DocumentStatus = z.enum(["draft", "published", "archived"]).describe("DocumentStatus");
export type DocumentStatus = z.infer<typeof DocumentStatus>;
export const DocumentStatusLabel = { draft: "초안", published: "게시됨", archived: "보관됨" };

// Enums: Employee
export const EmployeeOrderBy = z.enum(["id-desc"]).describe("EmployeeOrderBy");
export type EmployeeOrderBy = z.infer<typeof EmployeeOrderBy>;
export const EmployeeOrderByLabel = { "id-desc": "ID최신순" };
export const EmployeeSearchField = z
  .enum(["id", "employee_number"])
  .describe("EmployeeSearchField");
export type EmployeeSearchField = z.infer<typeof EmployeeSearchField>;
export const EmployeeSearchFieldLabel = { id: "ID", employee_number: "사번" };

// Enums: File
export const FileOrderBy = z.enum(["id-desc"]).describe("FileOrderBy");
export type FileOrderBy = z.infer<typeof FileOrderBy>;
export const FileOrderByLabel = { "id-desc": "ID최신순" };
export const FileSearchField = z.enum(["id"]).describe("FileSearchField");
export type FileSearchField = z.infer<typeof FileSearchField>;
export const FileSearchFieldLabel = { id: "ID" };

// Enums: Milestone
export const MilestoneOrderBy = z.enum(["id-desc", "due_date-asc"]).describe("MilestoneOrderBy");
export type MilestoneOrderBy = z.infer<typeof MilestoneOrderBy>;
export const MilestoneOrderByLabel = { "id-desc": "ID최신순", "due_date-asc": "마감일순" };
export const MilestoneSearchField = z.enum(["id"]).describe("MilestoneSearchField");
export type MilestoneSearchField = z.infer<typeof MilestoneSearchField>;
export const MilestoneSearchFieldLabel = { id: "ID" };

// Enums: Passkey
export const PasskeyOrderBy = z.enum(["id-desc", "created_at-desc"]).describe("PasskeyOrderBy");
export type PasskeyOrderBy = z.infer<typeof PasskeyOrderBy>;
export const PasskeyOrderByLabel = { "id-desc": "ID최신순", "created_at-desc": "생성일최신순" };
export const PasskeySearchField = z.enum(["id", "name"]).describe("PasskeySearchField");
export type PasskeySearchField = z.infer<typeof PasskeySearchField>;
export const PasskeySearchFieldLabel = { id: "ID", name: "이름" };

// Enums: Project
export const ProjectOrderBy = z.enum(["id-desc", "deadline-asc"]).describe("ProjectOrderBy");
export type ProjectOrderBy = z.infer<typeof ProjectOrderBy>;
export const ProjectOrderByLabel = { "id-desc": "ID최신순", "deadline-asc": "마감일최신순" };
export const ProjectSearchField = z.enum(["id"]).describe("ProjectSearchField");
export type ProjectSearchField = z.infer<typeof ProjectSearchField>;
export const ProjectSearchFieldLabel = { id: "ID" };
export const ProjectStatus = z
  .enum(["planning", "in_progress", "completed", "cancelled"])
  .describe("ProjectStatus");
export type ProjectStatus = z.infer<typeof ProjectStatus>;
export const ProjectStatusLabel = {
  planning: "계획",
  in_progress: "진행중",
  completed: "완료",
  cancelled: "취소",
};

// Enums: Session
export const SessionOrderBy = z.enum(["id-desc"]).describe("SessionOrderBy");
export type SessionOrderBy = z.infer<typeof SessionOrderBy>;
export const SessionOrderByLabel = { "id-desc": "ID최신순" };
export const SessionSearchField = z.enum(["id"]).describe("SessionSearchField");
export type SessionSearchField = z.infer<typeof SessionSearchField>;
export const SessionSearchFieldLabel = { id: "ID" };

// Enums: SyncFixture
export const SyncFixtureStatus = z
  .enum(["draft", "pending", "active", "completed", "archived"])
  .describe("SyncFixtureStatus");
export type SyncFixtureStatus = z.infer<typeof SyncFixtureStatus>;
export const SyncFixtureStatusLabel = {
  draft: "초안",
  pending: "대기중",
  active: "활성",
  completed: "완료",
  archived: "보관",
};
export const SyncFixtureOrderBy = z
  .enum(["id-desc", "id-asc", "name-asc", "priority-desc", "created_at-desc"])
  .describe("SyncFixtureOrderBy");
export type SyncFixtureOrderBy = z.infer<typeof SyncFixtureOrderBy>;
export const SyncFixtureOrderByLabel = {
  "id-desc": "ID최신순",
  "id-asc": "ID오래된순",
  "name-asc": "이름오름차순",
  "priority-desc": "우선순위높은순",
  "created_at-desc": "등록일최신순",
};
export const SyncFixtureSearchField = z
  .enum(["id", "name", "code"])
  .describe("SyncFixtureSearchField");
export type SyncFixtureSearchField = z.infer<typeof SyncFixtureSearchField>;
export const SyncFixtureSearchFieldLabel = { id: "ID", name: "이름", code: "코드" };

// Enums: Tag
export const TagOrderBy = z.enum(["id-desc"]).describe("TagOrderBy");
export type TagOrderBy = z.infer<typeof TagOrderBy>;
export const TagOrderByLabel = { "id-desc": "ID최신순" };
export const TagSearchField = z.enum(["id"]).describe("TagSearchField");
export type TagSearchField = z.infer<typeof TagSearchField>;
export const TagSearchFieldLabel = { id: "ID" };

// Enums: TwoFactor
export const TwoFactorOrderBy = z.enum(["id-desc"]).describe("TwoFactorOrderBy");
export type TwoFactorOrderBy = z.infer<typeof TwoFactorOrderBy>;
export const TwoFactorOrderByLabel = { "id-desc": "ID최신순" };
export const TwoFactorSearchField = z.enum(["id"]).describe("TwoFactorSearchField");
export type TwoFactorSearchField = z.infer<typeof TwoFactorSearchField>;
export const TwoFactorSearchFieldLabel = { id: "ID" };

// Enums: User
export const UserOrderBy = z.enum(["id-desc"]).describe("UserOrderBy");
export type UserOrderBy = z.infer<typeof UserOrderBy>;
export const UserOrderByLabel = { "id-desc": "ID최신순" };
export const UserSearchField = z.enum(["id"]).describe("UserSearchField");
export type UserSearchField = z.infer<typeof UserSearchField>;
export const UserSearchFieldLabel = { id: "ID" };
export const UserRole = z.enum(["normal", "admin"]).describe("UserRole");
export type UserRole = z.infer<typeof UserRole>;
export const UserRoleLabel = { normal: "노멀", admin: "관리자" };

// Enums: Verification
export const VerificationOrderBy = z.enum(["id-desc"]).describe("VerificationOrderBy");
export type VerificationOrderBy = z.infer<typeof VerificationOrderBy>;
export const VerificationOrderByLabel = { "id-desc": "ID최신순" };
export const VerificationSearchField = z.enum(["id"]).describe("VerificationSearchField");
export type VerificationSearchField = z.infer<typeof VerificationSearchField>;
export const VerificationSearchFieldLabel = { id: "ID" };

// BaseSchema: Account
export const AccountBaseSchema = z.object({
  id: z.string(),
  account_id: z.string(),
  provider_id: z.string(),
  user_id: z.string(),
  access_token: z.string().nullable(),
  refresh_token: z.string().nullable(),
  id_token: z.string().nullable(),
  access_token_expires_at: z.date().nullable(),
  refresh_token_expires_at: z.date().nullable(),
  scope: z.string().nullable(),
  password: z.string().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type AccountBaseSchema = z.infer<typeof AccountBaseSchema> & {
  readonly __hasDefault__: readonly [
    "access_token",
    "refresh_token",
    "id_token",
    "access_token_expires_at",
    "refresh_token_expires_at",
    "scope",
    "password",
    "created_at",
    "id",
  ];
};

// BaseSchema: AuditEvent
export const AuditEventBaseSchema = z.object({
  id: z.int(),
  source: z.string().max(32),
  source_version: z.string().max(96).nullable(),
  category: AuditEventCategory,
  event_type: z.string().max(64),
  event_key: z.string().max(191),
  dedupe_key: z.string().max(64),
  actor_user_id: z.string().max(191).nullable(),
  subject_user_id: z.string().max(191).nullable(),
  organization_id: z.string().max(191).nullable(),
  team_id: z.string().max(191).nullable(),
  session_id: z.string().max(191).nullable(),
  provider_id: z.string().max(64).nullable(),
  login_method: z.string().max(64).nullable(),
  identifier: z.string().max(255).nullable(),
  visitor_id: z.string().max(191).nullable(),
  reason: z.string().max(128).nullable(),
  action: z.string().max(64).nullable(),
  trigger_context: z.string().max(64).nullable(),
  ip_address: z.string().max(45).nullable(),
  country_code: z.string().max(8).nullable(),
  country: z.string().max(100).nullable(),
  city: z.string().max(100).nullable(),
  user_agent: z.string().nullable(),
  payload_json: AuditEventPayload,
  occurred_at: z.date(),
  ingested_at: z.date(),
});
export type AuditEventBaseSchema = z.infer<typeof AuditEventBaseSchema> & {
  readonly __hasDefault__: readonly [
    "source_version",
    "actor_user_id",
    "subject_user_id",
    "organization_id",
    "team_id",
    "session_id",
    "provider_id",
    "login_method",
    "identifier",
    "visitor_id",
    "reason",
    "action",
    "trigger_context",
    "ip_address",
    "country_code",
    "country",
    "city",
    "user_agent",
    "ingested_at",
    "id",
  ];
};

// BaseSchema: AuditLog
export const AuditLogBaseSchema = z.object({
  id: z.int(),
  created_at: z.date(),
  actor_id: z.string().max(255).nullable(),
  action: AuditLogAction,
  entity_type: z.string().max(100),
  entity_id: z.int(),
  old_value: AuditLogValue.nullable(),
  new_value: AuditLogValue.nullable(),
});
export type AuditLogBaseSchema = z.infer<typeof AuditLogBaseSchema> & {
  readonly __hasDefault__: readonly ["created_at", "actor_id", "old_value", "new_value", "id"];
};

// BaseSchema: Company
export const CompanyBaseSchema = z.object({
  id: z.int(),
  created_at: z.date(),
  name: z.string(),
});
export type CompanyBaseSchema = z.infer<typeof CompanyBaseSchema> & {
  readonly __hasDefault__: readonly ["created_at", "id"];
};

// BaseSchema: Department
export const DepartmentBaseSchema = z.object({
  id: z.int(),
  created_at: z.date(),
  name: z.string().max(128),
  company_id: z.int(),
  parent_id: z.int().nullable(),
  // employees: HasMany Employee
  code: z.string().max(10),
  employee_count: NumberType,
});
export type DepartmentBaseSchema = z.infer<typeof DepartmentBaseSchema> & {
  readonly __virtual__: readonly ["employee_count"];
  readonly __hasDefault__: readonly ["created_at", "parent_id", "id"];
  readonly __generated__: readonly ["code"];
};

// BaseSchema: Document
export const DocumentBaseSchema = z.object({
  id: z.int(),
  created_at: z.date(),
  title: z.string().max(255),
  content: z.string().nullable(),
  status: DocumentStatus,
  title_content_embedding: z.array(z.number()).nullable(),
});
export type DocumentBaseSchema = z.infer<typeof DocumentBaseSchema> & {
  readonly __hasDefault__: readonly ["created_at", "content", "title_content_embedding", "id"];
  readonly __vector__: readonly ["title_content_embedding"];
};

// BaseSchema: Employee
export const EmployeeBaseSchema = z.object({
  id: z.int(),
  created_at: z.date(),
  user_id: z.string(),
  department_id: z.int().nullable(),
  employee_number: z.string().max(32),
  salary: z.string().nullable().meta({ SonamuPropType: "numeric" }),
  hire_date: z.date().nullable(),
  notes: z.string().nullable(),
  // projs: ManyToMany Project
});
export type EmployeeBaseSchema = z.infer<typeof EmployeeBaseSchema> & {
  readonly __hasDefault__: readonly [
    "created_at",
    "department_id",
    "salary",
    "hire_date",
    "notes",
    "projs_id",
    "id",
  ];
};

// BaseSchema: File
export const FileBaseSchema = z.object({
  id: z.int(),
  created_at: z.date(),
  mime_type: z.string().max(128),
  name: z.string().max(128),
  url: z.string().max(255),
});
export type FileBaseSchema = z.infer<typeof FileBaseSchema> & {
  readonly __hasDefault__: readonly ["created_at", "id"];
};

// BaseSchema: Milestone
export const MilestoneBaseSchema = z.object({
  id: z.int(),
  created_at: z.date(),
  project_id: z.int(),
  name: z.string().max(255),
  description: z.string().nullable(),
  due_date: z.date(),
  completed_at: z.date().nullable(),
});
export type MilestoneBaseSchema = z.infer<typeof MilestoneBaseSchema> & {
  readonly __hasDefault__: readonly ["created_at", "description", "completed_at", "id"];
};

// BaseSchema: Passkey
export const PasskeyBaseSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  public_key: z.string(),
  credential_id: z.string(),
  counter: z.int(),
  device_type: z.string(),
  backed_up: z.boolean(),
  transports: z.string().nullable(),
  aaguid: z.string().nullable(),
  created_at: z.date(),
  user_id: z.string(),
});
export type PasskeyBaseSchema = z.infer<typeof PasskeyBaseSchema> & {
  readonly __hasDefault__: readonly ["name", "transports", "aaguid", "created_at", "id"];
};

// BaseSchema: Project
export const ProjectBaseSchema = z.object({
  id: z.int(),
  created_at: z.date(),
  // employee: ManyToMany Employee
  name: z.string().max(255),
  status: ProjectStatus,
  description: z.string().nullable(),
  budget: z.string().nullable().meta({ SonamuPropType: "numeric" }),
  deadline: z.date().nullable(),
  // tags: ManyToMany Tag
  image_urls: SonamuFileArraySchema.nullable(),
  virtual_test: NumberType.nullable(),
  virtual_query_test: StringType.nullable(),
  textsearchable_index_col: z.string(),
});
export type ProjectBaseSchema = z.infer<typeof ProjectBaseSchema> & {
  readonly __virtual__: readonly ["virtual_test"];
  readonly __virtual_query__: readonly ["virtual_query_test"];
  readonly __hasDefault__: readonly [
    "created_at",
    "description",
    "budget",
    "deadline",
    "tags_id",
    "image_urls",
    "virtual_test",
    "virtual_query_test",
    "id",
  ];
  readonly __generated__: readonly ["textsearchable_index_col"];
};

// BaseSchema: Session
export const SessionBaseSchema = z.object({
  id: z.string(),
  expires_at: z.date(),
  token: z.string(),
  created_at: z.date(),
  updated_at: z.date(),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  user_id: z.string(),
});
export type SessionBaseSchema = z.infer<typeof SessionBaseSchema> & {
  readonly __hasDefault__: readonly ["created_at", "ip_address", "user_agent", "id"];
};

// BaseSchema: SyncFixture
export const SyncFixtureBaseSchema = z.object({
  id: z.int(),
  created_at: z.date(),
  updated_at: z.date().nullable(),
  name: z.string().max(128),
  code: z.string().max(32).nullable(),
  status: SyncFixtureStatus,
  priority: z.int().nullable(),
  is_active: z.boolean(),
  description: z.string().nullable(),
  tags: StringArray.nullable(),
});
export type SyncFixtureBaseSchema = z.infer<typeof SyncFixtureBaseSchema> & {
  readonly __hasDefault__: readonly [
    "created_at",
    "updated_at",
    "code",
    "priority",
    "is_active",
    "description",
    "tags",
    "id",
  ];
};

// BaseSchema: Tag
export const TagBaseSchema = z.object({
  id: z.int(),
  created_at: z.date(),
  name: z.string(),
  name_ko: z.string().max(30).nullable(),
  name_en: z.string().max(30).nullable(),
});
export type TagBaseSchema = z.infer<typeof TagBaseSchema> & {
  readonly __hasDefault__: readonly ["created_at", "name_ko", "name_en", "id"];
};

// BaseSchema: TwoFactor
export const TwoFactorBaseSchema = z.object({
  id: z.string(),
  secret: z.string(),
  backup_codes: z.string(),
  created_at: z.date(),
  updated_at: z.date(),
  user_id: z.string(),
});
export type TwoFactorBaseSchema = z.infer<typeof TwoFactorBaseSchema> & {
  readonly __hasDefault__: readonly ["created_at", "updated_at", "id"];
};

// BaseSchema: User
export const UserBaseSchema = z.object({
  id: z.string(),
  created_at: z.date(),
  email: z.string().max(255),
  username: z.string().max(255),
  password: z.string().max(255).nullable(),
  birth_date: z.date().nullable(),
  role: UserRole,
  last_login_at: z.date().nullable(),
  bio: z.string().nullable(),
  is_verified: z.boolean(),
  deleted_at: z.date().nullable(),
  // employee: OneToOne Employee
  image: z.string().nullable(),
  updated_at: z.date(),
  two_factor_enabled: z.boolean().nullable(),
});
export type UserBaseSchema = z.infer<typeof UserBaseSchema> & {
  readonly __hasDefault__: readonly [
    "created_at",
    "password",
    "birth_date",
    "last_login_at",
    "bio",
    "is_verified",
    "deleted_at",
    "employee_id",
    "image",
    "updated_at",
    "two_factor_enabled",
    "id",
  ];
};

// BaseSchema: Verification
export const VerificationBaseSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  value: z.string(),
  expires_at: z.date(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type VerificationBaseSchema = z.infer<typeof VerificationBaseSchema> & {
  readonly __hasDefault__: readonly ["created_at", "updated_at", "id"];
};

// BaseListParams: Account
export const AccountBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: AccountSearchField,
    keyword: z.string(),
    orderBy: AccountOrderBy,
    queryMode: SonamuQueryMode,
    id: zArrayable(z.string()),
    sonamuFilter: z.custom<ApplySonamuFilter<AccountBaseSchema, never, never>>(),
  })
  .partial();
export type AccountBaseListParams = z.infer<typeof AccountBaseListParams>;

// BaseListParams: AuditEvent
export const AuditEventBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: AuditEventSearchField,
    keyword: z.string(),
    orderBy: AuditEventOrderBy,
    queryMode: SonamuQueryMode,
    id: zArrayable(z.number().int().positive()),
    sonamuFilter: z.custom<ApplySonamuFilter<AuditEventBaseSchema, never, never>>(),
  })
  .partial();
export type AuditEventBaseListParams = z.infer<typeof AuditEventBaseListParams>;

// BaseListParams: AuditLog
export const AuditLogBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: AuditLogSearchField,
    keyword: z.string(),
    orderBy: AuditLogOrderBy,
    queryMode: SonamuQueryMode,
    id: zArrayable(z.number().int().positive()),
    sonamuFilter: z.custom<ApplySonamuFilter<AuditLogBaseSchema, never, never>>(),
  })
  .partial();
export type AuditLogBaseListParams = z.infer<typeof AuditLogBaseListParams>;

// BaseListParams: Company
export const CompanyBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: CompanySearchField,
    keyword: z.string(),
    orderBy: CompanyOrderBy,
    queryMode: SonamuQueryMode,
    id: zArrayable(z.number().int().positive()),
    sonamuFilter: z.custom<ApplySonamuFilter<CompanyBaseSchema, never, never>>(),
  })
  .partial();
export type CompanyBaseListParams = z.infer<typeof CompanyBaseListParams>;

// BaseListParams: Department
export const DepartmentBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: DepartmentSearchField,
    keyword: z.string(),
    orderBy: DepartmentOrderBy,
    queryMode: SonamuQueryMode,
    id: zArrayable(z.number().int().positive()),
    sonamuFilter: z.custom<ApplySonamuFilter<DepartmentBaseSchema, "employee_count", never>>(),
  })
  .partial();
export type DepartmentBaseListParams = z.infer<typeof DepartmentBaseListParams>;

// BaseListParams: Document
export const DocumentBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: DocumentSearchField,
    keyword: z.string(),
    orderBy: DocumentOrderBy,
    queryMode: SonamuQueryMode,
    id: zArrayable(z.number().int().positive()),
    sonamuFilter: z.custom<ApplySonamuFilter<DocumentBaseSchema, never, never>>(),
  })
  .partial();
export type DocumentBaseListParams = z.infer<typeof DocumentBaseListParams>;

// BaseListParams: Employee
export const EmployeeBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: EmployeeSearchField,
    keyword: z.string(),
    orderBy: EmployeeOrderBy,
    queryMode: SonamuQueryMode,
    id: zArrayable(z.number().int().positive()),
    sonamuFilter: z.custom<ApplySonamuFilter<EmployeeBaseSchema, never, "salary">>(),
  })
  .partial();
export type EmployeeBaseListParams = z.infer<typeof EmployeeBaseListParams>;

// BaseListParams: File
export const FileBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: FileSearchField,
    keyword: z.string(),
    orderBy: FileOrderBy,
    queryMode: SonamuQueryMode,
    id: zArrayable(z.number().int().positive()),
    sonamuFilter: z.custom<ApplySonamuFilter<FileBaseSchema, never, never>>(),
  })
  .partial();
export type FileBaseListParams = z.infer<typeof FileBaseListParams>;

// BaseListParams: Milestone
export const MilestoneBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: MilestoneSearchField,
    keyword: z.string(),
    orderBy: MilestoneOrderBy,
    queryMode: SonamuQueryMode,
    id: zArrayable(z.number().int().positive()),
    sonamuFilter: z.custom<ApplySonamuFilter<MilestoneBaseSchema, never, never>>(),
  })
  .partial();
export type MilestoneBaseListParams = z.infer<typeof MilestoneBaseListParams>;

// BaseListParams: Passkey
export const PasskeyBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: PasskeySearchField,
    keyword: z.string(),
    orderBy: PasskeyOrderBy,
    queryMode: SonamuQueryMode,
    id: zArrayable(z.string()),
    sonamuFilter: z.custom<ApplySonamuFilter<PasskeyBaseSchema, never, never>>(),
  })
  .partial();
export type PasskeyBaseListParams = z.infer<typeof PasskeyBaseListParams>;

// BaseListParams: Project
export const ProjectBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: ProjectSearchField,
    keyword: z.string(),
    orderBy: ProjectOrderBy,
    queryMode: SonamuQueryMode,
    id: zArrayable(z.number().int().positive()),
    sonamuFilter:
      z.custom<
        ApplySonamuFilter<ProjectBaseSchema, "virtual_test" | "virtual_query_test", "budget">
      >(),
  })
  .partial();
export type ProjectBaseListParams = z.infer<typeof ProjectBaseListParams>;

// BaseListParams: Session
export const SessionBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: SessionSearchField,
    keyword: z.string(),
    orderBy: SessionOrderBy,
    queryMode: SonamuQueryMode,
    id: zArrayable(z.string()),
    sonamuFilter: z.custom<ApplySonamuFilter<SessionBaseSchema, never, never>>(),
  })
  .partial();
export type SessionBaseListParams = z.infer<typeof SessionBaseListParams>;

// BaseListParams: SyncFixture
export const SyncFixtureBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: SyncFixtureSearchField,
    keyword: z.string(),
    orderBy: SyncFixtureOrderBy,
    queryMode: SonamuQueryMode,
    id: zArrayable(z.number().int().positive()),
    sonamuFilter: z.custom<ApplySonamuFilter<SyncFixtureBaseSchema, never, never>>(),
  })
  .partial();
export type SyncFixtureBaseListParams = z.infer<typeof SyncFixtureBaseListParams>;

// BaseListParams: Tag
export const TagBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: TagSearchField,
    keyword: z.string(),
    orderBy: TagOrderBy,
    queryMode: SonamuQueryMode,
    id: zArrayable(z.number().int().positive()),
    sonamuFilter: z.custom<ApplySonamuFilter<TagBaseSchema, never, never>>(),
  })
  .partial();
export type TagBaseListParams = z.infer<typeof TagBaseListParams>;

// BaseListParams: TwoFactor
export const TwoFactorBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: TwoFactorSearchField,
    keyword: z.string(),
    orderBy: TwoFactorOrderBy,
    queryMode: SonamuQueryMode,
    id: zArrayable(z.string()),
    sonamuFilter: z.custom<ApplySonamuFilter<TwoFactorBaseSchema, never, never>>(),
  })
  .partial();
export type TwoFactorBaseListParams = z.infer<typeof TwoFactorBaseListParams>;

// BaseListParams: User
export const UserBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: UserSearchField,
    keyword: z.string(),
    orderBy: UserOrderBy,
    queryMode: SonamuQueryMode,
    id: zArrayable(z.string()),
    sonamuFilter: z.custom<ApplySonamuFilter<UserBaseSchema, never, never>>(),
  })
  .partial();
export type UserBaseListParams = z.infer<typeof UserBaseListParams>;

// BaseListParams: Verification
export const VerificationBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: VerificationSearchField,
    keyword: z.string(),
    orderBy: VerificationOrderBy,
    queryMode: SonamuQueryMode,
    id: zArrayable(z.string()),
    sonamuFilter: z.custom<ApplySonamuFilter<VerificationBaseSchema, never, never>>(),
  })
  .partial();
export type VerificationBaseListParams = z.infer<typeof VerificationBaseListParams>;

// Subsets: Account
export const AccountSubsetA = z.object({
  id: z.string(),
  account_id: z.string(),
  provider_id: z.string(),
  access_token: z.string().nullable(),
  refresh_token: z.string().nullable(),
  id_token: z.string().nullable(),
  access_token_expires_at: z.date().nullable(),
  refresh_token_expires_at: z.date().nullable(),
  scope: z.string().nullable(),
  password: z.string().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
  user_id: z.string(),
});
export type AccountSubsetA = z.infer<typeof AccountSubsetA>;
export type AccountSubsetMapping = {
  A: AccountSubsetA;
};
export const AccountSubsetKey = z.enum(["A"]);
export type AccountSubsetKey = z.infer<typeof AccountSubsetKey>;

// Subsets: AuditEvent
export const AuditEventSubsetA = z.object({
  id: z.int(),
  source: z.string().max(32),
  source_version: z.string().max(96).nullable(),
  category: AuditEventCategory,
  event_type: z.string().max(64),
  event_key: z.string().max(191),
  dedupe_key: z.string().max(64),
  actor_user_id: z.string().max(191).nullable(),
  subject_user_id: z.string().max(191).nullable(),
  organization_id: z.string().max(191).nullable(),
  team_id: z.string().max(191).nullable(),
  session_id: z.string().max(191).nullable(),
  provider_id: z.string().max(64).nullable(),
  login_method: z.string().max(64).nullable(),
  identifier: z.string().max(255).nullable(),
  visitor_id: z.string().max(191).nullable(),
  reason: z.string().max(128).nullable(),
  action: z.string().max(64).nullable(),
  trigger_context: z.string().max(64).nullable(),
  ip_address: z.string().max(45).nullable(),
  country_code: z.string().max(8).nullable(),
  country: z.string().max(100).nullable(),
  city: z.string().max(100).nullable(),
  user_agent: z.string().nullable(),
  payload_json: AuditEventPayload,
  occurred_at: z.date(),
  ingested_at: z.date(),
});
export type AuditEventSubsetA = z.infer<typeof AuditEventSubsetA>;
export type AuditEventSubsetMapping = {
  A: AuditEventSubsetA;
};
export const AuditEventSubsetKey = z.enum(["A"]);
export type AuditEventSubsetKey = z.infer<typeof AuditEventSubsetKey>;

// Subsets: AuditLog
export const AuditLogSubsetA = z.object({
  id: z.int(),
  created_at: z.date(),
  actor_id: z.string().max(255).nullable(),
  action: AuditLogAction,
  entity_type: z.string().max(100),
  entity_id: z.int(),
  old_value: AuditLogValue.nullable(),
  new_value: AuditLogValue.nullable(),
});
export type AuditLogSubsetA = z.infer<typeof AuditLogSubsetA>;
export type AuditLogSubsetMapping = {
  A: AuditLogSubsetA;
};
export const AuditLogSubsetKey = z.enum(["A"]);
export type AuditLogSubsetKey = z.infer<typeof AuditLogSubsetKey>;

// Subsets: Company
export const CompanySubsetA = z.object({
  id: z.int(),
  created_at: z.date(),
  name: z.string(),
});
export type CompanySubsetA = z.infer<typeof CompanySubsetA>;
export type CompanySubsetMapping = {
  A: CompanySubsetA;
};
export const CompanySubsetKey = z.enum(["A"]);
export type CompanySubsetKey = z.infer<typeof CompanySubsetKey>;

// Subsets: Department
export const DepartmentSubsetA = z.object({
  id: z.int(),
  created_at: z.date(),
  name: z.string().max(128),
  employee_count: NumberType,
  company: z.object({
    id: z.int(),
    name: z.string(),
  }),
  parent: z
    .object({
      id: z.int(),
      name: z.string().max(128),
    })
    .nullable(),
  employees: z.array(
    z.object({
      id: z.int(),
      employee_number: z.string().max(32),
      salary: z.string().nullable().meta({ SonamuPropType: "numeric" }),
      user: z.object({
        id: z.string(),
        email: z.string().max(255),
      }),
    }),
  ),
});
export type DepartmentSubsetA = z.infer<typeof DepartmentSubsetA>;
export const DepartmentSubsetP = z.object({
  id: z.int(),
  created_at: z.date(),
  name: z.string().max(128),
  employee_count: NumberType,
  company: z.object({
    id: z.int(),
    name: z.string(),
  }),
  parent: z
    .object({
      id: z.int(),
      name: z.string().max(128),
    })
    .nullable(),
});
export type DepartmentSubsetP = z.infer<typeof DepartmentSubsetP>;
export const DepartmentSubsetP2 = z.object({
  id: z.int(),
  created_at: z.date(),
  name: z.string().max(128),
  company: z.object({
    id: z.int(),
    name: z.string(),
  }),
});
export type DepartmentSubsetP2 = z.infer<typeof DepartmentSubsetP2>;
export type DepartmentSubsetMapping = {
  A: DepartmentSubsetA;
  P: DepartmentSubsetP;
  P2: DepartmentSubsetP2;
};
export const DepartmentSubsetKey = z.enum(["A", "P", "P2"]);
export type DepartmentSubsetKey = z.infer<typeof DepartmentSubsetKey>;

// Subsets: Document
export const DocumentSubsetA = z.object({
  id: z.int(),
  created_at: z.date(),
  title: z.string().max(255),
  content: z.string().nullable(),
  status: DocumentStatus,
});
export type DocumentSubsetA = z.infer<typeof DocumentSubsetA>;
export type DocumentSubsetMapping = {
  A: DocumentSubsetA;
};
export const DocumentSubsetKey = z.enum(["A"]);
export type DocumentSubsetKey = z.infer<typeof DocumentSubsetKey>;

// Subsets: Employee
export const EmployeeSubsetA = z.object({
  id: z.int(),
  created_at: z.date(),
  employee_number: z.string().max(32),
  salary: z.string().nullable().meta({ SonamuPropType: "numeric" }),
  hire_date: z.date().nullable(),
  notes: z.string().nullable(),
  user: z.object({
    id: z.string(),
    username: z.string().max(255),
  }),
  department: z
    .object({
      id: z.int(),
      name: z.string().max(128),
      employee_count: NumberType,
      company: z.object({
        name: z.string(),
      }),
    })
    .nullable(),
});
export type EmployeeSubsetA = z.infer<typeof EmployeeSubsetA>;
export const EmployeeSubsetP = z.object({
  id: z.int(),
  created_at: z.date(),
  user: z.object({
    id: z.string(),
    username: z.string().max(255),
    employee: z
      .object({
        department: z
          .object({
            id: z.int(),
            employee_count: NumberType,
          })
          .nullable(),
        employee_number: z.string().max(32),
        salary: z.string().nullable().meta({ SonamuPropType: "numeric" }),
      })
      .nullable(),
  }),
  department: z
    .object({
      id: z.int(),
      employees: z.array(
        z.object({
          id: z.int(),
          salary: z.string().nullable().meta({ SonamuPropType: "numeric" }),
          projs: z.array(
            z.object({
              id: z.int(),
              name: z.string().max(255),
              status: ProjectStatus,
              virtual_test: NumberType.nullable(),
            }),
          ),
        }),
      ),
    })
    .nullable(),
  projs: z.array(
    z.object({
      id: z.int(),
      name: z.string().max(255),
      status: ProjectStatus,
      description: z.string().nullable(),
    }),
  ),
});
export type EmployeeSubsetP = z.infer<typeof EmployeeSubsetP>;
export type EmployeeSubsetMapping = {
  A: EmployeeSubsetA;
  P: EmployeeSubsetP;
};
export const EmployeeSubsetKey = z.enum(["A", "P"]);
export type EmployeeSubsetKey = z.infer<typeof EmployeeSubsetKey>;

// Subsets: File
export const FileSubsetA = z.object({
  id: z.int(),
  created_at: z.date(),
  mime_type: z.string().max(128),
  name: z.string().max(128),
  url: z.string().max(255),
});
export type FileSubsetA = z.infer<typeof FileSubsetA>;
export type FileSubsetMapping = {
  A: FileSubsetA;
};
export const FileSubsetKey = z.enum(["A"]);
export type FileSubsetKey = z.infer<typeof FileSubsetKey>;

// Subsets: Milestone
export const MilestoneSubsetA = z.object({
  id: z.int(),
  created_at: z.date(),
  name: z.string().max(255),
  description: z.string().nullable(),
  due_date: z.date(),
  completed_at: z.date().nullable(),
  project: z.object({
    id: z.int(),
    name: z.string().max(255),
    status: ProjectStatus,
    deadline: z.date().nullable(),
  }),
});
export type MilestoneSubsetA = z.infer<typeof MilestoneSubsetA>;
export type MilestoneSubsetMapping = {
  A: MilestoneSubsetA;
};
export const MilestoneSubsetKey = z.enum(["A"]);
export type MilestoneSubsetKey = z.infer<typeof MilestoneSubsetKey>;

// Subsets: Passkey
export const PasskeySubsetA = z.object({
  id: z.string(),
  name: z.string().nullable(),
  public_key: z.string(),
  credential_id: z.string(),
  counter: z.int(),
  device_type: z.string(),
  backed_up: z.boolean(),
  transports: z.string().nullable(),
  aaguid: z.string().nullable(),
  created_at: z.date(),
  user_id: z.string(),
});
export type PasskeySubsetA = z.infer<typeof PasskeySubsetA>;
export type PasskeySubsetMapping = {
  A: PasskeySubsetA;
};
export const PasskeySubsetKey = z.enum(["A"]);
export type PasskeySubsetKey = z.infer<typeof PasskeySubsetKey>;

// Subsets: Project
export const ProjectSubsetA = z.object({
  id: z.int(),
  created_at: z.date(),
  name: z.string().max(255),
  status: ProjectStatus,
  description: z.string().nullable(),
  budget: z.string().nullable().meta({ SonamuPropType: "numeric" }),
  deadline: z.date().nullable(),
  image_urls: SonamuFileArraySchema.nullable(),
  virtual_test: NumberType.nullable(),
  virtual_query_test: StringType.nullable(),
  employee: z.array(
    z.object({
      id: z.int(),
      employee_number: z.string().max(32),
      salary: z.string().nullable().meta({ SonamuPropType: "numeric" }),
      user: z.object({
        email: z.string().max(255),
        username: z.string().max(255),
      }),
      department: z
        .object({
          name: z.string().max(128),
        })
        .nullable(),
    }),
  ),
  tags: z.array(
    z.object({
      id: z.int(),
      name: z.string(),
    }),
  ),
});
export type ProjectSubsetA = z.infer<typeof ProjectSubsetA>;
export const ProjectSubsetP = z.object({
  id: z.int(),
  created_at: z.date(),
  name: z.string().max(255),
  status: ProjectStatus,
  description: z.string().nullable(),
  deadline: z.date().nullable(),
  image_urls: SonamuFileArraySchema.nullable(),
  employee: z.array(
    z.object({
      id: z.int(),
      employee_number: z.string().max(32),
      user: z.object({
        email: z.string().max(255),
        username: z.string().max(255),
      }),
      department: z
        .object({
          name: z.string().max(128),
        })
        .nullable(),
    }),
  ),
  tags: z.array(
    z.object({
      id: z.int(),
      name: z.string(),
    }),
  ),
});
export type ProjectSubsetP = z.infer<typeof ProjectSubsetP>;
export type ProjectSubsetMapping = {
  A: ProjectSubsetA;
  P: ProjectSubsetP;
};
export const ProjectSubsetKey = z.enum(["A", "P"]);
export type ProjectSubsetKey = z.infer<typeof ProjectSubsetKey>;

// Subsets: Session
export const SessionSubsetA = z.object({
  id: z.string(),
  expires_at: z.date(),
  token: z.string(),
  created_at: z.date(),
  updated_at: z.date(),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  user_id: z.string(),
});
export type SessionSubsetA = z.infer<typeof SessionSubsetA>;
export type SessionSubsetMapping = {
  A: SessionSubsetA;
};
export const SessionSubsetKey = z.enum(["A"]);
export type SessionSubsetKey = z.infer<typeof SessionSubsetKey>;

// Subsets: SyncFixture
export const SyncFixtureSubsetA = z.object({
  id: z.int(),
  created_at: z.date(),
  updated_at: z.date().nullable(),
  name: z.string().max(128),
  code: z.string().max(32).nullable(),
  status: SyncFixtureStatus,
  priority: z.int().nullable(),
  is_active: z.boolean(),
  description: z.string().nullable(),
  tags: StringArray.nullable(),
});
export type SyncFixtureSubsetA = z.infer<typeof SyncFixtureSubsetA>;
export type SyncFixtureSubsetMapping = {
  A: SyncFixtureSubsetA;
};
export const SyncFixtureSubsetKey = z.enum(["A"]);
export type SyncFixtureSubsetKey = z.infer<typeof SyncFixtureSubsetKey>;

// Subsets: Tag
export const TagSubsetA = z.object({
  id: z.int(),
  created_at: z.date(),
  name: z.string(),
  name_ko: z.string().max(30).nullable(),
  name_en: z.string().max(30).nullable(),
});
export type TagSubsetA = z.infer<typeof TagSubsetA>;
export type TagSubsetMapping = {
  A: TagSubsetA;
};
export const TagSubsetKey = z.enum(["A"]);
export type TagSubsetKey = z.infer<typeof TagSubsetKey>;

// Subsets: TwoFactor
export const TwoFactorSubsetA = z.object({
  id: z.string(),
  secret: z.string(),
  backup_codes: z.string(),
  created_at: z.date(),
  updated_at: z.date(),
  user_id: z.string(),
});
export type TwoFactorSubsetA = z.infer<typeof TwoFactorSubsetA>;
export type TwoFactorSubsetMapping = {
  A: TwoFactorSubsetA;
};
export const TwoFactorSubsetKey = z.enum(["A"]);
export type TwoFactorSubsetKey = z.infer<typeof TwoFactorSubsetKey>;

// Subsets: User
export const UserSubsetA = z.object({
  id: z.string(),
  created_at: z.date(),
  email: z.string().max(255),
  username: z.string().max(255),
  birth_date: z.date().nullable(),
  role: UserRole,
  last_login_at: z.date().nullable(),
  bio: z.string().nullable(),
  is_verified: z.boolean(),
  deleted_at: z.date().nullable(),
});
export type UserSubsetA = z.infer<typeof UserSubsetA>;
export const UserSubsetP = z.object({
  id: z.string(),
  email: z.string().max(255),
  username: z.string().max(255),
  role: UserRole,
  bio: z.string().nullable(),
  is_verified: z.boolean(),
  employee: z
    .object({
      department: z
        .object({
          name: z.string().max(128),
        })
        .nullable(),
      salary: z.string().nullable().meta({ SonamuPropType: "numeric" }),
    })
    .nullable(),
});
export type UserSubsetP = z.infer<typeof UserSubsetP>;
export const UserSubsetSS = z.object({
  id: z.string(),
  created_at: z.date(),
  email: z.string().max(255),
  username: z.string().max(255),
  role: UserRole,
  last_login_at: z.date().nullable(),
  bio: z.string().nullable(),
  is_verified: z.boolean(),
});
export type UserSubsetSS = z.infer<typeof UserSubsetSS>;
export type UserSubsetMapping = {
  A: UserSubsetA;
  P: UserSubsetP;
  SS: UserSubsetSS;
};
export const UserSubsetKey = z.enum(["A", "P", "SS"]);
export type UserSubsetKey = z.infer<typeof UserSubsetKey>;

// Subsets: Verification
export const VerificationSubsetA = z.object({
  id: z.string(),
  identifier: z.string(),
  value: z.string(),
  expires_at: z.date(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type VerificationSubsetA = z.infer<typeof VerificationSubsetA>;
export type VerificationSubsetMapping = {
  A: VerificationSubsetA;
};
export const VerificationSubsetKey = z.enum(["A"]);
export type VerificationSubsetKey = z.infer<typeof VerificationSubsetKey>;
