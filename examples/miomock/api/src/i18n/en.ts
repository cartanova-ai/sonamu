import { defineLocale } from "./sd.generated";

/**
 * Miomock English Dictionary
 */
export default defineLocale({
  // ===== Common =====
  "common.logout": "Logout",
  "common.login": "Login",
  "common.create": "Create",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.backToList": "Back to List",
  "common.search": "Search",
  "common.searchType": "Search Type",
  "common.sort": "Sort",
  "common.results": (count: number) => `${count} results`,
  "common.edit": "Edit",
  "common.createdAt": "Created At",
  "common.manage": "Manage",

  // ===== Menu =====
  "menu.home": "Home",
  "menu.company": "Companies",
  "menu.user": "Users",
  "menu.department": "Departments",
  "menu.employee": "Employees",
  "menu.project": "Projects",
  "menu.tag": "Tags",
  "menu.file": "Files",

  // ===== Dashboard =====
  "dashboard.title": "Admin Dashboard",
  "dashboard.welcome": "Welcome!",
  "dashboard.adminMenu": "Admin Menu",
  "dashboard.name": "Name",
  "dashboard.email": "Email",
  "dashboard.role": "Role",
  "dashboard.createdAt": "Joined",
  "dashboard.loginRequired": "Please login to continue.",

  // ===== Delete Confirmation Dialog =====
  "delete.confirm.title": "Are you sure?",
  "delete.confirm.description":
    "This action cannot be undone. This will permanently delete this item.",

  // ===== Form Common =====
  "form.createdAt": "Created At",

  // ===== Entity: Company =====
  "entity.Company": "Company",
  "entity.Company.list": "Company List",
  "entity.Company.create": "Create Company",
  "entity.Company.edit": (id: number) => `Edit Company #${id}`,
  "entity.Company.name": "Company Name",

  // ===== Entity: User =====
  "entity.User": "User",
  "entity.User.list": "User List",
  "entity.User.create": "Create User",
  "entity.User.edit": (id: number) => `Edit User #${id}`,
  "entity.User.email": "Email",
  "entity.User.username": "Name",
  "entity.User.password": "Password",
  "entity.User.birth_date": "Birth Date",
  "entity.User.role": "Role",
  "entity.User.last_login_at": "Last Login",
  "entity.User.bio": "Bio",
  "entity.User.is_verified": "Verified",
  "entity.User.deleted_at": "Deleted At",

  // ===== Entity: Department =====
  "entity.Department": "Department",
  "entity.Department.list": "Department List",
  "entity.Department.create": "Create Department",
  "entity.Department.edit": (id: number) => `Edit Department #${id}`,
  "entity.Department.name": "Department Name",
  "entity.Department.company": "Company",
  "entity.Department.parent": "Parent Department",
  "entity.Department.employee_count": "Employee Count",

  // ===== Entity: Employee =====
  "entity.Employee": "Employee",
  "entity.Employee.list": "Employee List",
  "entity.Employee.create": "Create Employee",
  "entity.Employee.edit": (id: number) => `Edit Employee #${id}`,
  "entity.Employee.salary": "Salary",
  "entity.Employee.employee_number": "Employee Number",
  "entity.Employee.hire_date": "Hire Date",
  "entity.Employee.notes": "Notes",
  "entity.Employee.user": "User",

  // ===== Entity: Project =====
  "entity.Project": "Project",
  "entity.Project.list": "Project List",
  "entity.Project.create": "Create Project",
  "entity.Project.edit": (id: number) => `Edit Project #${id}`,
  "entity.Project.name": "Project Name",
  "entity.Project.description": "Description",
  "entity.Project.status": "Status",
  "entity.Project.budget": "Budget",

  // ===== Entity: Tag =====
  "entity.Tag": "Tag",
  "entity.Tag.list": "Tag List",
  "entity.Tag.create": "Create Tag",
  "entity.Tag.edit": (id: number) => `Edit Tag #${id}`,
  "entity.Tag.name": "Tag Name",
  "entity.Tag.name_ko": "Tag Name (KO)",
  "entity.Tag.name_en": "Tag Name (EN)",

  // ===== Entity: File =====
  "entity.File": "File",
  "entity.File.list": "File List",
  "entity.File.create": "Upload File",
  "entity.File.edit": (id: number) => `Edit File #${id}`,
  "entity.File.name": "Filename",
  "entity.File.mime_type": "MIME Type",
  "entity.File.url": "URL",

  // ===== API Error Messages =====
  "user.login.failed": "Email or password does not match",
  "user.email.duplicate": "Email is already in use",
  "user.notFound": (id: number) => `User ID ${id} not found`,
  "employee.notFound": (id: number) => `Employee ID ${id} not found`,
  "company.notFound": (id: number) => `Company ID ${id} not found`,
  "department.notFound": (id: number) => `Department ID ${id} not found`,
  "project.notFound": (id: number) => `Project ID ${id} not found`,
  "tag.notFound": (id: number) => `Tag ID ${id} not found`,
  "file.notFound": (id: number) => `File ID ${id} not found`,
  "file.uploadFailed": "File upload failed",
  "document.notFound": (id: number) => `Document ID ${id} not found`,
  "syncFixture.notFound": (id: number) => `SyncFixture ID ${id} not found`,
  "search.invalidField": (field: string) => `Invalid search field: ${field}`,

  // ===== Login Page =====
  "login.title": "Welcome Back",
  "login.subtitle": "Sign in to your account",
  "login.email": "Email",
  "login.password": "Password",
  "login.submit": "Login",
  "login.continueAs": (username: string) => `Continue as ${username}`,
});
