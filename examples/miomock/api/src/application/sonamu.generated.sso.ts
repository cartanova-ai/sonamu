import { SubsetQuery } from "sonamu";
import {
  CompanySubsetKey,
  DepartmentSubsetKey,
  EmployeeSubsetKey,
  ProjectSubsetKey,
  TestSubsetKey,
  UserSubsetKey,
} from "./sonamu.generated";

// SubsetQuery: Company
export const companySubsetQueries: { [key in CompanySubsetKey]: SubsetQuery } =
  {
    A: {
      select: ["companies.id", "companies.created_at", "companies.name"],
      virtual: [],
      joins: [],
      loaders: [],
    },
  };

// SubsetQuery: Department
export const departmentSubsetQueries: {
  [key in DepartmentSubsetKey]: SubsetQuery;
} = {
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
    loaders: [],
  },
};

// SubsetQuery: Employee
export const employeeSubsetQueries: {
  [key in EmployeeSubsetKey]: SubsetQuery;
} = {
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
      {
        as: "user",
        join: "inner",
        table: "users",
        from: "employees.user_id",
        to: "user.id",
      },
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
};

// SubsetQuery: Project
export const projectSubsetQueries: { [key in ProjectSubsetKey]: SubsetQuery } =
  {
    A: {
      select: [
        "projects.id",
        "projects.created_at",
        "projects.name",
        "projects.status",
        "projects.description",
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
            through: {
              table: "projects__employees",
              fromCol: "project_id",
              toCol: "employee_id",
            },
            toTable: "employees",
            toCol: "id",
          },
          oneJoins: [
            {
              as: "user",
              join: "inner",
              table: "users",
              from: "employees.user_id",
              to: "user.id",
            },
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
            "user.email as user__email",
            "user.username as user__username",
            "department.name as department__name",
          ],
          loaders: [],
        },
      ],
    },
  };

// SubsetQuery: Test
export const testSubsetQueries: { [key in TestSubsetKey]: SubsetQuery } = {
  A: {
    select: ["tests.id", "tests.created_at"],
    virtual: [],
    joins: [],
    loaders: [],
  },
};

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
};
