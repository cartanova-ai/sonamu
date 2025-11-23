/** biome-ignore-all lint: generated는 무시 */
/** biome-ignore-all assist: generated는 무시 */
/** biome-ignore-all style: generated는 무시 */

import { SonamuQueryMode, zArrayable } from "sonamu";
import { z } from "zod";

// CustomScalar: NumberType
const NumberType = z.number();
type NumberType = z.infer<typeof NumberType>;

// CustomScalar: StringArray
const StringArray = z.array(z.string());
type StringArray = z.infer<typeof StringArray>;

// Enums: Company
export const CompanyOrderBy = z.enum(["id-desc"]).describe("CompanyOrderBy");
export type CompanyOrderBy = z.infer<typeof CompanyOrderBy>;
export const CompanyOrderByLabel = { "id-desc": "ID최신순" };
export const CompanySearchField = z.enum(["id"]).describe("CompanySearchField");
export type CompanySearchField = z.infer<typeof CompanySearchField>;
export const CompanySearchFieldLabel = { id: "ID" };

// Enums: Department
export const DepartmentOrderBy = z.enum(["id-desc", "name-asc"]).describe("DepartmentOrderBy");
export type DepartmentOrderBy = z.infer<typeof DepartmentOrderBy>;
export const DepartmentOrderByLabel = { "id-desc": "ID최신순", "name-asc": "부서명오름차순" };
export const DepartmentSearchField = z.enum(["id"]).describe("DepartmentSearchField");
export type DepartmentSearchField = z.infer<typeof DepartmentSearchField>;
export const DepartmentSearchFieldLabel = { id: "ID" };

// Enums: Employee
export const EmployeeOrderBy = z.enum(["id-desc"]).describe("EmployeeOrderBy");
export type EmployeeOrderBy = z.infer<typeof EmployeeOrderBy>;
export const EmployeeOrderByLabel = { "id-desc": "ID최신순" };
export const EmployeeSearchField = z.enum(["id"]).describe("EmployeeSearchField");
export type EmployeeSearchField = z.infer<typeof EmployeeSearchField>;
export const EmployeeSearchFieldLabel = { id: "ID" };

// Enums: File
export const FileOrderBy = z.enum(["id-desc"]).describe("FileOrderBy");
export type FileOrderBy = z.infer<typeof FileOrderBy>;
export const FileOrderByLabel = { "id-desc": "ID최신순" };
export const FileSearchField = z.enum(["id"]).describe("FileSearchField");
export type FileSearchField = z.infer<typeof FileSearchField>;
export const FileSearchFieldLabel = { id: "ID" };

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

// Enums: Tag
export const TagOrderBy = z.enum(["id-desc"]).describe("TagOrderBy");
export type TagOrderBy = z.infer<typeof TagOrderBy>;
export const TagOrderByLabel = { "id-desc": "ID최신순" };
export const TagSearchField = z.enum(["id"]).describe("TagSearchField");
export type TagSearchField = z.infer<typeof TagSearchField>;
export const TagSearchFieldLabel = { id: "ID" };

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

// BaseSchema: Company
export const CompanyBaseSchema = z.object({
  id: z.int().nonnegative(),
  created_at: z.date(),
  name: z.string().max(255),
});
export type CompanyBaseSchema = z.infer<typeof CompanyBaseSchema>;

// BaseSchema: Department
export const DepartmentBaseSchema = z.object({
  id: z.int().nonnegative(),
  created_at: z.date(),
  name: z.string().max(128),
  company_id: z.int(),
  parent_id: z.int().nullable(),
  // employees: HasMany Employee
  employee_count: NumberType,
});
export type DepartmentBaseSchema = z.infer<typeof DepartmentBaseSchema> & {
  readonly __virtual__: readonly ["employee_count"];
};

// BaseSchema: Employee
export const EmployeeBaseSchema = z.object({
  id: z.int().nonnegative(),
  created_at: z.date(),
  user_id: z.int(),
  department_id: z.int().nullable(),
  employee_number: z.string().max(32),
  salary: z.string().nullable(),
});
export type EmployeeBaseSchema = z.infer<typeof EmployeeBaseSchema>;

// BaseSchema: File
export const FileBaseSchema = z.object({
  id: z.int().nonnegative(),
  created_at: z.date(),
  mime_type: z.string().max(128),
  name: z.string().max(128),
  url: z.string().max(255),
});
export type FileBaseSchema = z.infer<typeof FileBaseSchema>;

// BaseSchema: Project
export const ProjectBaseSchema = z.object({
  id: z.int().nonnegative(),
  created_at: z.date(),
  // employee: ManyToMany Employee
  name: z.string().max(255),
  status: ProjectStatus,
  description: z.string().max(4294967295).nullable(),
  // tags: ManyToMany Tag
  image_urls: StringArray.nullable(),
  virtual_test: NumberType.nullable(),
});
export type ProjectBaseSchema = z.infer<typeof ProjectBaseSchema> & {
  readonly __virtual__: readonly ["virtual_test"];
};

// BaseSchema: Tag
export const TagBaseSchema = z.object({
  id: z.int().nonnegative(),
  created_at: z.date(),
  name: z.string().max(30),
});
export type TagBaseSchema = z.infer<typeof TagBaseSchema>;

// BaseSchema: User
export const UserBaseSchema = z.object({
  id: z.int().nonnegative(),
  created_at: z.date(),
  email: z.string().max(255),
  username: z.string().max(255),
  password: z.string().max(255),
  birth_date: z.string().length(10).nullable(),
  role: UserRole,
  last_login_at: z.date().nullable(),
  bio: z.string().max(65535).nullable(),
  is_verified: z.boolean(),
  // employee: OneToOne Employee
});
export type UserBaseSchema = z.infer<typeof UserBaseSchema> & {
  readonly __fulltext__: readonly ["bio"];
};

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
  })
  .partial();
export type FileBaseListParams = z.infer<typeof FileBaseListParams>;

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
  })
  .partial();
export type TagBaseListParams = z.infer<typeof TagBaseListParams>;

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
  id: z.int().nonnegative(),
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
  id: z.int().nonnegative(),
  created_at: z.date(),
  name: z.string().max(128),
  employee_count: NumberType,
  company: z.object({
    id: z.int().nonnegative(),
    name: z.string().max(255),
  }),
  parent: z
    .object({
      id: z.int().nonnegative(),
      name: z.string().max(128),
    })
    .nullable(),
  employees: z.array(
    z.object({
      id: z.int().nonnegative(),
      employee_number: z.string().max(32),
      salary: z.string().nullable(),
      user: z.object({
        id: z.int().nonnegative(),
        email: z.string().max(255),
      }),
    }),
  ),
});
export type DepartmentSubsetA = z.infer<typeof DepartmentSubsetA>;
export const DepartmentSubsetP = z.object({
  id: z.int().nonnegative(),
  created_at: z.date(),
  name: z.string().max(128),
  employee_count: NumberType,
  company: z.object({
    id: z.int().nonnegative(),
    name: z.string().max(255),
  }),
  parent: z
    .object({
      id: z.int().nonnegative(),
      name: z.string().max(128),
    })
    .nullable(),
});
export type DepartmentSubsetP = z.infer<typeof DepartmentSubsetP>;
export const DepartmentSubsetP2 = z.object({
  id: z.int().nonnegative(),
  created_at: z.date(),
  name: z.string().max(128),
  company: z.object({
    id: z.int().nonnegative(),
    name: z.string().max(255),
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

// Subsets: Employee
export const EmployeeSubsetA = z.object({
  id: z.int().nonnegative(),
  created_at: z.date(),
  employee_number: z.string().max(32),
  salary: z.string().nullable(),
  user: z.object({
    id: z.int().nonnegative(),
    username: z.string().max(255),
  }),
  department: z
    .object({
      id: z.int().nonnegative(),
      name: z.string().max(128),
      employee_count: NumberType,
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

// Subsets: File
export const FileSubsetA = z.object({
  id: z.int().nonnegative(),
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

// Subsets: Project
export const ProjectSubsetA = z.object({
  id: z.int().nonnegative(),
  created_at: z.date(),
  name: z.string().max(255),
  status: ProjectStatus,
  description: z.string().max(4294967295).nullable(),
  image_urls: StringArray.nullable(),
  virtual_test: NumberType.nullable(),
  employee: z.array(
    z.object({
      id: z.int().nonnegative(),
      employee_number: z.string().max(32),
      salary: z.string().nullable(),
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
      id: z.int().nonnegative(),
      name: z.string().max(30),
    }),
  ),
});
export type ProjectSubsetA = z.infer<typeof ProjectSubsetA>;
export const ProjectSubsetP = z.object({
  id: z.int().nonnegative(),
  created_at: z.date(),
  name: z.string().max(255),
  status: ProjectStatus,
  description: z.string().max(4294967295).nullable(),
  image_urls: StringArray.nullable(),
  employee: z.array(
    z.object({
      id: z.int().nonnegative(),
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
      id: z.int().nonnegative(),
      name: z.string().max(30),
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

// Subsets: Tag
export const TagSubsetA = z.object({
  id: z.int().nonnegative(),
  created_at: z.date(),
  name: z.string().max(30),
});
export type TagSubsetA = z.infer<typeof TagSubsetA>;
export type TagSubsetMapping = {
  A: TagSubsetA;
};
export const TagSubsetKey = z.enum(["A"]);
export type TagSubsetKey = z.infer<typeof TagSubsetKey>;

// Subsets: User
export const UserSubsetA = z.object({
  id: z.int().nonnegative(),
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
export const UserSubsetP = z.object({
  id: z.int().nonnegative(),
  email: z.string().max(255),
  username: z.string().max(255),
  role: UserRole,
  bio: z.string().max(65535).nullable(),
  is_verified: z.boolean(),
  employee: z
    .object({
      department: z
        .object({
          name: z.string().max(128),
        })
        .nullable(),
      salary: z.string().nullable(),
    })
    .nullable(),
});
export type UserSubsetP = z.infer<typeof UserSubsetP>;
export const UserSubsetSS = z.object({
  id: z.int().nonnegative(),
  created_at: z.date(),
  email: z.string().max(255),
  username: z.string().max(255),
  role: UserRole,
  last_login_at: z.date().nullable(),
  bio: z.string().max(65535).nullable(),
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
