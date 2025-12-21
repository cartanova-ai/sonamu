import type {
  DatabaseSchemaExtend,
  ManyToManyBaseSchema,
  PuriLoaderQueries,
  PuriWrapper,
} from "sonamu";
import type {
  CompanyBaseSchema,
  CompanySubsetKey,
  DepartmentBaseSchema,
  DepartmentSubsetKey,
  DocumentBaseSchema,
  DocumentSubsetKey,
  EmployeeBaseSchema,
  EmployeeSubsetKey,
  FileBaseSchema,
  FileSubsetKey,
  ProjectBaseSchema,
  ProjectSubsetKey,
  SyncFixtureBaseSchema,
  SyncFixtureSubsetKey,
  TagBaseSchema,
  TagSubsetKey,
  UserBaseSchema,
  UserSubsetKey,
} from "./sonamu.generated";

// SubsetQuery: Company
export const companySubsetQueries = {
  A: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
    return qbWrapper.from("companies").select({
      id: "companies.id",
      created_at: "companies.created_at",
      name: "companies.name",
    });
  },
};

// LoaderQuery: Company
export const companyLoaderQueries = {
  A: [],
} as const satisfies PuriLoaderQueries<CompanySubsetKey>;

// SubsetQuery: Department
export const departmentSubsetQueries = {
  A: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
    return qbWrapper
      .from("departments")
      .join({ company: "companies" }, "departments.company_id", "company.id")
      .leftJoin({ parent: "departments" }, "departments.parent_id", "parent.id")
      .select({
        id: "departments.id",
        created_at: "departments.created_at",
        name: "departments.name",
        company: {
          id: "company.id",
          name: "company.name",
        },
        parent: {
          id: "parent.id",
          name: "parent.name",
        },
      });
  },
  P: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
    return qbWrapper
      .from("departments")
      .join({ company: "companies" }, "departments.company_id", "company.id")
      .leftJoin({ parent: "departments" }, "departments.parent_id", "parent.id")
      .select({
        id: "departments.id",
        created_at: "departments.created_at",
        name: "departments.name",
        company: {
          id: "company.id",
          name: "company.name",
        },
        parent: {
          id: "parent.id",
          name: "parent.name",
        },
      });
  },
  P2: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
    return qbWrapper
      .from("departments")
      .join({ company: "companies" }, "departments.company_id", "company.id")
      .select({
        id: "departments.id",
        created_at: "departments.created_at",
        name: "departments.name",
        company: {
          id: "company.id",
          name: "company.name",
        },
      });
  },
};

// LoaderQuery: Department
export const departmentLoaderQueries = {
  A: [
    {
      as: "employees",
      refId: "id",
      qb: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>, fromIds: number[]) => {
        return qbWrapper
          .from("employees")
          .join({ user: "users" }, "employees.user_id", "user.id")
          .whereIn("employees.department_id", fromIds)
          .select({
            id: "employees.id",
            employee_number: "employees.employee_number",
            salary: "employees.salary",
            user: {
              id: "user.id",
              email: "user.email",
            },
            refId: "employees.department_id",
          });
      },
    },
  ],
  P: [],
  P2: [],
} as const satisfies PuriLoaderQueries<DepartmentSubsetKey>;

// SubsetQuery: Document
export const documentSubsetQueries = {
  A: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
    return qbWrapper.from("documents").select({
      id: "documents.id",
      created_at: "documents.created_at",
      title: "documents.title",
      content: "documents.content",
      status: "documents.status",
    });
  },
};

// LoaderQuery: Document
export const documentLoaderQueries = {
  A: [],
} as const satisfies PuriLoaderQueries<DocumentSubsetKey>;

// SubsetQuery: Employee
export const employeeSubsetQueries = {
  A: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
    return qbWrapper
      .from("employees")
      .join({ user: "users" }, "employees.user_id", "user.id")
      .leftJoin({ department: "departments" }, "employees.department_id", "department.id")
      .leftJoin(
        { department__company: "companies" },
        "department.company_id",
        "department__company.id",
      )
      .select({
        id: "employees.id",
        created_at: "employees.created_at",
        employee_number: "employees.employee_number",
        salary: "employees.salary",
        hire_date: "employees.hire_date",
        notes: "employees.notes",
        user: {
          id: "user.id",
          username: "user.username",
        },
        department: {
          id: "department.id",
          name: "department.name",
          company: {
            name: "department__company.name",
          },
        },
      });
  },
  P: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
    return qbWrapper
      .from("employees")
      .join({ user: "users" }, "employees.user_id", "user.id")
      .leftJoin({ user__employee: "employees" }, "user.id", "user__employee.user_id")
      .leftJoin(
        { user__employee__department: "departments" },
        "user__employee.department_id",
        "user__employee__department.id",
      )
      .leftJoin({ department: "departments" }, "employees.department_id", "department.id")
      .select({
        id: "employees.id",
        created_at: "employees.created_at",
        user: {
          id: "user.id",
          username: "user.username",
          employee: {
            department: {
              id: "user__employee__department.id",
            },
            employee_number: "user__employee.employee_number",
            salary: "user__employee.salary",
          },
        },
        department: {
          id: "department.id",
        },
      });
  },
};

// LoaderQuery: Employee
export const employeeLoaderQueries = {
  A: [],
  P: [
    {
      as: "department__employees",
      refId: "department__id",
      qb: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>, fromIds: number[]) => {
        return qbWrapper.from("employees").whereIn("employees.department_id", fromIds).select({
          id: "employees.id",
          salary: "employees.salary",
          refId: "employees.department_id",
        });
      },
      loaders: [
        {
          as: "projs",
          refId: "id",
          qb: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>, fromIds: number[]) => {
            return qbWrapper
              .from("projects__employees")
              .join("projects", "projects__employees.project_id", "projects.id")
              .whereIn("projects__employees.employee_id", fromIds)
              .select({
                id: "projects.id",
                name: "projects.name",
                status: "projects.status",
                refId: "projects__employees.employee_id",
              });
          },
        },
      ],
    },
    {
      as: "projs",
      refId: "id",
      qb: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>, fromIds: number[]) => {
        return qbWrapper
          .from("projects__employees")
          .join("projects", "projects__employees.project_id", "projects.id")
          .whereIn("projects__employees.employee_id", fromIds)
          .select({
            id: "projects.id",
            name: "projects.name",
            status: "projects.status",
            description: "projects.description",
            refId: "projects__employees.employee_id",
          });
      },
    },
  ],
} as const satisfies PuriLoaderQueries<EmployeeSubsetKey>;

// SubsetQuery: File
export const fileSubsetQueries = {
  A: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
    return qbWrapper.from("files").select({
      id: "files.id",
      created_at: "files.created_at",
      mime_type: "files.mime_type",
      name: "files.name",
      url: "files.url",
    });
  },
};

// LoaderQuery: File
export const fileLoaderQueries = {
  A: [],
} as const satisfies PuriLoaderQueries<FileSubsetKey>;

// SubsetQuery: Project
export const projectSubsetQueries = {
  A: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
    return qbWrapper.from("projects").select({
      id: "projects.id",
      created_at: "projects.created_at",
      name: "projects.name",
      status: "projects.status",
      description: "projects.description",
      budget: "projects.budget",
      deadline: "projects.deadline",
      image_urls: "projects.image_urls",
    });
  },
  P: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
    return qbWrapper.from("projects").select({
      id: "projects.id",
      created_at: "projects.created_at",
      name: "projects.name",
      status: "projects.status",
      description: "projects.description",
      budget: "projects.budget",
      deadline: "projects.deadline",
      image_urls: "projects.image_urls",
    });
  },
};

// LoaderQuery: Project
export const projectLoaderQueries = {
  A: [
    {
      as: "employee",
      refId: "id",
      qb: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>, fromIds: number[]) => {
        return qbWrapper
          .from("projects__employees")
          .join("employees", "projects__employees.employee_id", "employees.id")
          .join({ user: "users" }, "employees.user_id", "user.id")
          .leftJoin({ department: "departments" }, "employees.department_id", "department.id")
          .whereIn("projects__employees.project_id", fromIds)
          .select({
            id: "employees.id",
            employee_number: "employees.employee_number",
            salary: "employees.salary",
            user: {
              email: "user.email",
              username: "user.username",
            },
            department: {
              name: "department.name",
            },
            refId: "projects__employees.project_id",
          });
      },
    },
    {
      as: "tags",
      refId: "id",
      qb: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>, fromIds: number[]) => {
        return qbWrapper
          .from("project_tags")
          .join("tags", "project_tags.tag_id", "tags.id")
          .whereIn("project_tags.project_id", fromIds)
          .select({
            id: "tags.id",
            name: "tags.name",
            refId: "project_tags.project_id",
          });
      },
    },
  ],
  P: [
    {
      as: "employee",
      refId: "id",
      qb: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>, fromIds: number[]) => {
        return qbWrapper
          .from("projects__employees")
          .join("employees", "projects__employees.employee_id", "employees.id")
          .join({ user: "users" }, "employees.user_id", "user.id")
          .leftJoin({ department: "departments" }, "employees.department_id", "department.id")
          .whereIn("projects__employees.project_id", fromIds)
          .select({
            id: "employees.id",
            employee_number: "employees.employee_number",
            user: {
              email: "user.email",
              username: "user.username",
            },
            department: {
              name: "department.name",
            },
            refId: "projects__employees.project_id",
          });
      },
    },
    {
      as: "tags",
      refId: "id",
      qb: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>, fromIds: number[]) => {
        return qbWrapper
          .from("project_tags")
          .join("tags", "project_tags.tag_id", "tags.id")
          .whereIn("project_tags.project_id", fromIds)
          .select({
            id: "tags.id",
            name: "tags.name",
            refId: "project_tags.project_id",
          });
      },
    },
  ],
} as const satisfies PuriLoaderQueries<ProjectSubsetKey>;

// SubsetQuery: SyncFixture
export const syncFixtureSubsetQueries = {
  A: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
    return qbWrapper.from("sync_fixtures").select({
      id: "sync_fixtures.id",
      created_at: "sync_fixtures.created_at",
      updated_at: "sync_fixtures.updated_at",
      name: "sync_fixtures.name",
      code: "sync_fixtures.code",
      status: "sync_fixtures.status",
      priority: "sync_fixtures.priority",
      is_active: "sync_fixtures.is_active",
      description: "sync_fixtures.description",
      tags: "sync_fixtures.tags",
    });
  },
};

// LoaderQuery: SyncFixture
export const syncFixtureLoaderQueries = {
  A: [],
} as const satisfies PuriLoaderQueries<SyncFixtureSubsetKey>;

// SubsetQuery: Tag
export const tagSubsetQueries = {
  A: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
    return qbWrapper.from("tags").select({
      id: "tags.id",
      created_at: "tags.created_at",
      name: "tags.name",
    });
  },
};

// LoaderQuery: Tag
export const tagLoaderQueries = {
  A: [],
} as const satisfies PuriLoaderQueries<TagSubsetKey>;

// SubsetQuery: User
export const userSubsetQueries = {
  A: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
    return qbWrapper.from("users").select({
      id: "users.id",
      created_at: "users.created_at",
      email: "users.email",
      username: "users.username",
      birth_date: "users.birth_date",
      role: "users.role",
      last_login_at: "users.last_login_at",
      bio: "users.bio",
      is_verified: "users.is_verified",
      deleted_at: "users.deleted_at",
    });
  },
  P: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
    return qbWrapper
      .from("users")
      .leftJoin({ employee: "employees" }, "users.id", "employee.user_id")
      .leftJoin(
        { employee__department: "departments" },
        "employee.department_id",
        "employee__department.id",
      )
      .select({
        id: "users.id",
        email: "users.email",
        username: "users.username",
        role: "users.role",
        bio: "users.bio",
        is_verified: "users.is_verified",
        employee: {
          department: {
            name: "employee__department.name",
          },
          salary: "employee.salary",
        },
      });
  },
  SS: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
    return qbWrapper.from("users").select({
      id: "users.id",
      created_at: "users.created_at",
      email: "users.email",
      username: "users.username",
      role: "users.role",
      last_login_at: "users.last_login_at",
      bio: "users.bio",
      is_verified: "users.is_verified",
    });
  },
};

// LoaderQuery: User
export const userLoaderQueries = {
  A: [],
  P: [],
  SS: [],
} as const satisfies PuriLoaderQueries<UserSubsetKey>;

// ForeignKey Types
export type DepartmentForeignKeys = "company_id" | "parent_id";
export type EmployeeForeignKeys = "user_id" | "department_id";

// DatabaseSchema
declare module "sonamu" {
  export interface DatabaseSchemaExtend {
    companies: CompanyBaseSchema;
    departments: DepartmentBaseSchema;
    documents: DocumentBaseSchema;
    employees: EmployeeBaseSchema;
    files: FileBaseSchema;
    projects: ProjectBaseSchema;
    sync_fixtures: SyncFixtureBaseSchema;
    tags: TagBaseSchema;
    users: UserBaseSchema;
    projects__employees: ManyToManyBaseSchema<"employee", "project">;
    project_tags: ManyToManyBaseSchema<"project", "tag">;
  }

  export interface DatabaseForeignKeys {
    departments: DepartmentForeignKeys;
    employees: EmployeeForeignKeys;
  }
}
