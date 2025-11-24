import {
  SubsetQuery,
  PuriWrapper,
  DatabaseSchemaExtend,
  PuriLoaderQueries,
  ManyToManyBaseSchema,
} from "sonamu";
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

// SubsetQuery: Company
export const companySubsetQueries: { [key in CompanySubsetKey]: SubsetQuery } = {
  A: {
    select: ["companies.id", "companies.created_at", "companies.name"],
    virtual: [],
    joins: [],
    loaders: [],
  },
};

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

// SubsetQuery: Department
export const departmentSubsetQueries: { [key in DepartmentSubsetKey]: SubsetQuery } = {
  A: {
    select: [
      "departments.id",
      "departments.created_at",
      "departments.name",
      "company.id as company__id",
      "company.name as company__name",
      "parent.id as parent__id",
      "parent.name as parent__name",
    ],
    virtual: ["employee_count"],
    joins: [
      {
        as: "company",
        join: "inner",
        table: "companies",
        from: "departments.company_id",
        to: "company.id",
      },
      {
        as: "parent",
        join: "outer",
        table: "departments",
        from: "departments.parent_id",
        to: "parent.id",
      },
    ],
    loaders: [
      {
        as: "employees",
        table: "employees",
        manyJoin: {
          fromTable: "departments",
          fromCol: "id",
          idField: "id",
          toTable: "employees",
          toCol: "department_id",
        },
        oneJoins: [
          { as: "user", join: "inner", table: "users", from: "employees.user_id", to: "user.id" },
        ],
        select: [
          "employees.id",
          "employees.employee_number",
          "employees.salary",
          "user.id as user__id",
          "user.email as user__email",
        ],
        loaders: [],
      },
    ],
  },
  P: {
    select: [
      "departments.id",
      "departments.created_at",
      "departments.name",
      "company.id as company__id",
      "company.name as company__name",
      "parent.id as parent__id",
      "parent.name as parent__name",
    ],
    virtual: ["employee_count"],
    joins: [
      {
        as: "company",
        join: "inner",
        table: "companies",
        from: "departments.company_id",
        to: "company.id",
      },
      {
        as: "parent",
        join: "outer",
        table: "departments",
        from: "departments.parent_id",
        to: "parent.id",
      },
    ],
    loaders: [],
  },
  P2: {
    select: [
      "departments.id",
      "departments.created_at",
      "departments.name",
      "company.id as company__id",
      "company.name as company__name",
    ],
    virtual: [],
    joins: [
      {
        as: "company",
        join: "inner",
        table: "companies",
        from: "departments.company_id",
        to: "company.id",
      },
    ],
    loaders: [],
  },
};

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

// SubsetQuery: Employee
export const employeeSubsetQueries: { [key in EmployeeSubsetKey]: SubsetQuery } = {
  A: {
    select: [
      "employees.id",
      "employees.created_at",
      "employees.employee_number",
      "employees.salary",
      "user.id as user__id",
      "user.username as user__username",
      "department.id as department__id",
      "department.name as department__name",
      "department__company.name as department__company__name",
    ],
    virtual: [],
    joins: [
      { as: "user", join: "inner", table: "users", from: "employees.user_id", to: "user.id" },
      {
        as: "department",
        join: "outer",
        table: "departments",
        from: "employees.department_id",
        to: "department.id",
      },
      {
        as: "department__company",
        join: "outer",
        table: "companies",
        from: "department.company_id",
        to: "department__company.id",
      },
    ],
    loaders: [],
  },
  P: {
    select: [
      "employees.id",
      "employees.created_at",
      "user.id as user__id",
      "user.username as user__username",
      "user__employee__department.id as user__employee__department__id",
      "user__employee.employee_number as user__employee__employee_number",
      "user__employee.salary as user__employee__salary",
      "department.id as department__id",
    ],
    virtual: [],
    joins: [
      { as: "user", join: "inner", table: "users", from: "employees.user_id", to: "user.id" },
      {
        as: "user__employee",
        join: "outer",
        table: "employees",
        from: "user.id",
        to: "user__employee.user_id",
      },
      {
        as: "user__employee__department",
        join: "outer",
        table: "departments",
        from: "user__employee.department_id",
        to: "user__employee__department.id",
      },
      {
        as: "department",
        join: "outer",
        table: "departments",
        from: "employees.department_id",
        to: "department.id",
      },
    ],
    loaders: [
      {
        as: "department__employees",
        table: "employees",
        manyJoin: {
          fromTable: "departments",
          fromCol: "id",
          idField: "department__id",
          toTable: "employees",
          toCol: "department_id",
        },
        oneJoins: [],
        select: ["employees.id", "employees.salary"],
        loaders: [],
      },
    ],
  },
};

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
    },
  ],
} as const satisfies PuriLoaderQueries<EmployeeSubsetKey>;

// SubsetQuery: File
export const fileSubsetQueries: { [key in FileSubsetKey]: SubsetQuery } = {
  A: {
    select: ["files.id", "files.created_at", "files.mime_type", "files.name", "files.url"],
    virtual: [],
    joins: [],
    loaders: [],
  },
};

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

// SubsetQuery: Project
export const projectSubsetQueries: { [key in ProjectSubsetKey]: SubsetQuery } = {
  A: {
    select: [
      "projects.id",
      "projects.created_at",
      "projects.name",
      "projects.status",
      "projects.description",
      "projects.image_urls",
    ],
    virtual: ["virtual_test"],
    joins: [],
    loaders: [
      {
        as: "employee",
        table: "employees",
        manyJoin: {
          fromTable: "projects",
          fromCol: "id",
          idField: "id",
          through: { table: "projects__employees", fromCol: "project_id", toCol: "employee_id" },
          toTable: "employees",
          toCol: "id",
        },
        oneJoins: [
          { as: "user", join: "inner", table: "users", from: "employees.user_id", to: "user.id" },
          {
            as: "department",
            join: "outer",
            table: "departments",
            from: "employees.department_id",
            to: "department.id",
          },
        ],
        select: [
          "employees.id",
          "employees.employee_number",
          "employees.salary",
          "user.email as user__email",
          "user.username as user__username",
          "department.name as department__name",
        ],
        loaders: [],
      },
      {
        as: "tags",
        table: "tags",
        manyJoin: {
          fromTable: "projects",
          fromCol: "id",
          idField: "id",
          through: { table: "project_tags", fromCol: "project_id", toCol: "tag_id" },
          toTable: "tags",
          toCol: "id",
        },
        oneJoins: [],
        select: ["tags.id", "tags.name"],
        loaders: [],
      },
    ],
  },
  P: {
    select: [
      "projects.id",
      "projects.created_at",
      "projects.name",
      "projects.status",
      "projects.description",
      "projects.image_urls",
    ],
    virtual: [],
    joins: [],
    loaders: [
      {
        as: "employee",
        table: "employees",
        manyJoin: {
          fromTable: "projects",
          fromCol: "id",
          idField: "id",
          through: { table: "projects__employees", fromCol: "project_id", toCol: "employee_id" },
          toTable: "employees",
          toCol: "id",
        },
        oneJoins: [
          { as: "user", join: "inner", table: "users", from: "employees.user_id", to: "user.id" },
          {
            as: "department",
            join: "outer",
            table: "departments",
            from: "employees.department_id",
            to: "department.id",
          },
        ],
        select: [
          "employees.id",
          "employees.employee_number",
          "user.email as user__email",
          "user.username as user__username",
          "department.name as department__name",
        ],
        loaders: [],
      },
      {
        as: "tags",
        table: "tags",
        manyJoin: {
          fromTable: "projects",
          fromCol: "id",
          idField: "id",
          through: { table: "project_tags", fromCol: "project_id", toCol: "tag_id" },
          toTable: "tags",
          toCol: "id",
        },
        oneJoins: [],
        select: ["tags.id", "tags.name"],
        loaders: [],
      },
    ],
  },
};

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

// SubsetQuery: Tag
export const tagSubsetQueries: { [key in TagSubsetKey]: SubsetQuery } = {
  A: { select: ["tags.id", "tags.created_at", "tags.name"], virtual: [], joins: [], loaders: [] },
};

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

// SubsetQuery: User
export const userSubsetQueries: { [key in UserSubsetKey]: SubsetQuery } = {
  A: {
    select: [
      "users.id",
      "users.created_at",
      "users.email",
      "users.username",
      "users.birth_date",
      "users.role",
      "users.last_login_at",
      "users.bio",
      "users.is_verified",
    ],
    virtual: [],
    joins: [],
    loaders: [],
  },
  P: {
    select: [
      "users.id",
      "users.email",
      "users.username",
      "users.role",
      "users.bio",
      "users.is_verified",
      "employee__department.name as employee__department__name",
      "employee.salary as employee__salary",
    ],
    virtual: [],
    joins: [
      {
        as: "employee",
        join: "outer",
        table: "employees",
        from: "users.id",
        to: "employee.user_id",
      },
      {
        as: "employee__department",
        join: "outer",
        table: "departments",
        from: "employee.department_id",
        to: "employee__department.id",
      },
    ],
    loaders: [],
  },
  SS: {
    select: [
      "users.id",
      "users.created_at",
      "users.email",
      "users.username",
      "users.role",
      "users.last_login_at",
      "users.bio",
      "users.is_verified",
    ],
    virtual: [],
    joins: [],
    loaders: [],
  },
};

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
    projects__employees: ManyToManyBaseSchema<"project", "employee">;
    project_tags: ManyToManyBaseSchema<"project", "tag">;
  }
}
