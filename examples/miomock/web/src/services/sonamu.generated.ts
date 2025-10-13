import { z } from "zod";
import { zArrayable, SonamuQueryMode } from "src/services/sonamu.shared";

// CustomScalar: Number
const Number = z.number();
type Number = z.infer<typeof Number>;

// Enums: Company
export const CompanyOrderBy = z.enum(["id-desc"]).describe("CompanyOrderBy");
export type CompanyOrderBy = z.infer<typeof CompanyOrderBy>;
export const CompanyOrderByLabel = { "id-desc": "ID최신순" };
export const CompanySearchField = z.enum(["id"]).describe("CompanySearchField");
export type CompanySearchField = z.infer<typeof CompanySearchField>;
export const CompanySearchFieldLabel = { id: "ID" };

// Enums: Department
export const DepartmentOrderBy = z
  .enum(["id-desc"])
  .describe("DepartmentOrderBy");
export type DepartmentOrderBy = z.infer<typeof DepartmentOrderBy>;
export const DepartmentOrderByLabel = { "id-desc": "ID최신순" };
export const DepartmentSearchField = z
  .enum(["id"])
  .describe("DepartmentSearchField");
export type DepartmentSearchField = z.infer<typeof DepartmentSearchField>;
export const DepartmentSearchFieldLabel = { id: "ID" };

// Enums: Employee
export const EmployeeOrderBy = z.enum(["id-desc"]).describe("EmployeeOrderBy");
export type EmployeeOrderBy = z.infer<typeof EmployeeOrderBy>;
export const EmployeeOrderByLabel = { "id-desc": "ID최신순" };
export const EmployeeSearchField = z
  .enum(["id"])
  .describe("EmployeeSearchField");
export type EmployeeSearchField = z.infer<typeof EmployeeSearchField>;
export const EmployeeSearchFieldLabel = { id: "ID" };

// Enums: Project
export const ProjectOrderBy = z.enum(["id-desc"]).describe("ProjectOrderBy");
export type ProjectOrderBy = z.infer<typeof ProjectOrderBy>;
export const ProjectOrderByLabel = { "id-desc": "ID최신순" };
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

// Enums: User
export const UserOrderBy = z.enum(["id-desc"]).describe("UserOrderBy");
export type UserOrderBy = z.infer<typeof UserOrderBy>;
export const UserOrderByLabel = { "id-desc": "ID최신순" };
export const UserSearchField = z.enum(["id"]).describe("UserSearchField");
export type UserSearchField = z.infer<typeof UserSearchField>;
export const UserSearchFieldLabel = { id: "ID" };
export const UserRole = z.enum(["normal"]).describe("UserRole");
export type UserRole = z.infer<typeof UserRole>;
export const UserRoleLabel = { normal: "노멀" };

// BaseSchema: Company
export const CompanyBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  created_at: z.date(),
  name: z.string().max(255),
});
export type CompanyBaseSchema = z.infer<typeof CompanyBaseSchema>;

// BaseSchema: Department
export const DepartmentBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  created_at: z.date(),
  name: z.string().max(128),
  company_id: z.number().int(),
  parent_id: z.number().int().nullable(),
  // employees: HasMany Employee
  employee_count: Number,
});
export type DepartmentBaseSchema = z.infer<typeof DepartmentBaseSchema>;

// BaseSchema: Employee
export const EmployeeBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  created_at: z.date(),
  user_id: z.number().int(),
  department_id: z.number().int().nullable(),
  employee_number: z.string().max(32),
  salary: z.string().nullable(),
});
export type EmployeeBaseSchema = z.infer<typeof EmployeeBaseSchema>;

// BaseSchema: Project
export const ProjectBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  created_at: z.date(),
  // employee: ManyToMany Employee
  name: z.string().max(255),
  status: ProjectStatus,
  description: z.string().max(4294967295).nullable(),
});
export type ProjectBaseSchema = z.infer<typeof ProjectBaseSchema>;

// BaseSchema: User
export const UserBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  created_at: z.date(),
  email: z.string().max(255),
  username: z.string().max(255),
  birth_date: z.string().length(10).nullable(),
  role: UserRole,
  last_login_at: z.date().nullable(),
  bio: z.string().max(65535).nullable(),
  is_verified: z.boolean(),
  // employee: OneToOne Employee
});
export type UserBaseSchema = z.infer<typeof UserBaseSchema>;

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
  })
  .partial();
export type DepartmentBaseListParams = z.infer<typeof DepartmentBaseListParams>;

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
  })
  .partial();
export type EmployeeBaseListParams = z.infer<typeof EmployeeBaseListParams>;

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
  })
  .partial();
export type ProjectBaseListParams = z.infer<typeof ProjectBaseListParams>;

// BaseListParams: User
export const UserBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: UserSearchField,
    keyword: z.string(),
    orderBy: UserOrderBy,
    queryMode: SonamuQueryMode,
    id: zArrayable(z.number().int().positive()),
  })
  .partial();
export type UserBaseListParams = z.infer<typeof UserBaseListParams>;

// Subsets: Company
export const CompanySubsetA = z.object({
  id: z.number().int().nonnegative(),
  created_at: z.date(),
  name: z.string().max(255),
});
export type CompanySubsetA = z.infer<typeof CompanySubsetA>;
export type CompanySubsetMapping = {
  A: CompanySubsetA;
};
export const CompanySubsetKey = z.enum(["A"]);
export type CompanySubsetKey = z.infer<typeof CompanySubsetKey>;

// Subsets: Department
export const DepartmentSubsetA = z.object({
  id: z.number().int().nonnegative(),
  created_at: z.date(),
  name: z.string().max(128),
  employee_count: Number,
  company: z.object({
    id: z.number().int().nonnegative(),
    name: z.string().max(255),
  }),
  parent: z
    .object({
      id: z.number().int().nonnegative(),
      name: z.string().max(128),
    })
    .nullable(),
});
export type DepartmentSubsetA = z.infer<typeof DepartmentSubsetA>;
export type DepartmentSubsetMapping = {
  A: DepartmentSubsetA;
};
export const DepartmentSubsetKey = z.enum(["A"]);
export type DepartmentSubsetKey = z.infer<typeof DepartmentSubsetKey>;

// Subsets: Employee
export const EmployeeSubsetA = z.object({
  id: z.number().int().nonnegative(),
  created_at: z.date(),
  employee_number: z.string().max(32),
  salary: z.string().nullable(),
  user: z.object({
    id: z.number().int().nonnegative(),
    username: z.string().max(255),
  }),
  department: z
    .object({
      id: z.number().int().nonnegative(),
      name: z.string().max(128),
      company: z.object({
        name: z.string().max(255),
      }),
    })
    .nullable(),
});
export type EmployeeSubsetA = z.infer<typeof EmployeeSubsetA>;
export type EmployeeSubsetMapping = {
  A: EmployeeSubsetA;
};
export const EmployeeSubsetKey = z.enum(["A"]);
export type EmployeeSubsetKey = z.infer<typeof EmployeeSubsetKey>;

// Subsets: Project
export const ProjectSubsetA = z.object({
  id: z.number().int().nonnegative(),
  created_at: z.date(),
  name: z.string().max(255),
  status: ProjectStatus,
  description: z.string().max(4294967295).nullable(),
  employee: z.array(
    z.object({
      id: z.number().int().nonnegative(),
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
});
export type ProjectSubsetA = z.infer<typeof ProjectSubsetA>;
export type ProjectSubsetMapping = {
  A: ProjectSubsetA;
};
export const ProjectSubsetKey = z.enum(["A"]);
export type ProjectSubsetKey = z.infer<typeof ProjectSubsetKey>;

// Subsets: User
export const UserSubsetA = z.object({
  id: z.number().int().nonnegative(),
  created_at: z.date(),
  email: z.string().max(255),
  username: z.string().max(255),
  birth_date: z.string().length(10).nullable(),
  role: UserRole,
  last_login_at: z.date().nullable(),
  bio: z.string().max(65535).nullable(),
  is_verified: z.boolean(),
});
export type UserSubsetA = z.infer<typeof UserSubsetA>;
export type UserSubsetMapping = {
  A: UserSubsetA;
};
export const UserSubsetKey = z.enum(["A"]);
export type UserSubsetKey = z.infer<typeof UserSubsetKey>;
