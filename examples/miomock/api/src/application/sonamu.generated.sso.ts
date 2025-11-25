import { PuriWrapper, DatabaseSchemaExtend, PuriLoaderQueries, ManyToManyBaseSchema } from "sonamu";
import {
  CompanySubsetKey,
  DepartmentSubsetKey,
  EmployeeSubsetKey,
  FileSubsetKey,
  ProjectSubsetKey,
  TagSubsetKey,
  UserSubsetKey,
  CompanyBaseSchema,
  DepartmentBaseSchema,
  EmployeeBaseSchema,
  FileBaseSchema,
  ProjectBaseSchema,
  TagBaseSchema,
  UserBaseSchema,
} from "./sonamu.generated";

// Puri SubsetQuery: Company
export const companyPuriSubsetQueries = {
  A: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
    return qbWrapper.from("companies").select({
      id: "companies.id",
      created_at: "companies.created_at",
      name: "companies.name",
    });
  },
};

// Puri LoaderQuery: Company
export const companyPuriLoaderQueries = {
  A: [],
} as const satisfies PuriLoaderQueries<CompanySubsetKey>;

// Puri SubsetQuery: Department
export const departmentPuriSubsetQueries = {
  A: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
    return qbWrapper
      .from("departments")
      .join({ company: "companies" }, "departments.company_id", "company.id")
      .leftJoin({ parent: "departments" }, "departments.parent_id", "parent.id")
      .select({
        id: "departments.id",
        created_at: "departments.created_at",
        name: "departments.name",
        company__id: "company.id",
        company__name: "company.name",
        parent__id: "parent.id",
        parent__name: "parent.name",
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
        company__id: "company.id",
        company__name: "company.name",
        parent__id: "parent.id",
        parent__name: "parent.name",
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
        company__id: "company.id",
        company__name: "company.name",
      });
  },
};

// Puri LoaderQuery: Department
export const departmentPuriLoaderQueries = {
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
            user__id: "user.id",
            user__email: "user.email",
            refId: "employees.department_id",
          });
      },
    },
  ],
  P: [],
  P2: [],
} as const satisfies PuriLoaderQueries<DepartmentSubsetKey>;

// Puri SubsetQuery: Employee
export const employeePuriSubsetQueries = {
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
        user__id: "user.id",
        user__username: "user.username",
        department__id: "department.id",
        department__name: "department.name",
        department__company__name: "department__company.name",
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
        user__id: "user.id",
        user__username: "user.username",
        user__employee__department__id: "user__employee__department.id",
        user__employee__employee_number: "user__employee.employee_number",
        user__employee__salary: "user__employee.salary",
        department__id: "department.id",
      });
  },
};

// Puri LoaderQuery: Employee
export const employeePuriLoaderQueries = {
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

// Puri SubsetQuery: File
export const filePuriSubsetQueries = {
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

// Puri LoaderQuery: File
export const filePuriLoaderQueries = {
  A: [],
} as const satisfies PuriLoaderQueries<FileSubsetKey>;

// Puri SubsetQuery: Project
export const projectPuriSubsetQueries = {
  A: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
    return qbWrapper.from("projects").select({
      id: "projects.id",
      created_at: "projects.created_at",
      name: "projects.name",
      status: "projects.status",
      description: "projects.description",
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
      image_urls: "projects.image_urls",
    });
  },
};

// Puri LoaderQuery: Project
export const projectPuriLoaderQueries = {
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
            user__email: "user.email",
            user__username: "user.username",
            department__name: "department.name",
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
            user__email: "user.email",
            user__username: "user.username",
            department__name: "department.name",
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

// Puri SubsetQuery: Tag
export const tagPuriSubsetQueries = {
  A: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
    return qbWrapper.from("tags").select({
      id: "tags.id",
      created_at: "tags.created_at",
      name: "tags.name",
    });
  },
};

// Puri LoaderQuery: Tag
export const tagPuriLoaderQueries = {
  A: [],
} as const satisfies PuriLoaderQueries<TagSubsetKey>;

// Puri SubsetQuery: User
export const userPuriSubsetQueries = {
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
        employee__department__name: "employee__department.name",
        employee__salary: "employee.salary",
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

// Puri LoaderQuery: User
export const userPuriLoaderQueries = {
  A: [],
  P: [],
  SS: [],
} as const satisfies PuriLoaderQueries<UserSubsetKey>;

// DatabaseSchema
declare module "sonamu" {
  export interface DatabaseSchemaExtend {
    companies: CompanyBaseSchema;
    departments: DepartmentBaseSchema;
    employees: EmployeeBaseSchema;
    files: FileBaseSchema;
    projects: ProjectBaseSchema;
    tags: TagBaseSchema;
    users: UserBaseSchema;
    projects__employees: ManyToManyBaseSchema<"employee", "project">;
    project_tags: ManyToManyBaseSchema<"project", "tag">;
  }
}
