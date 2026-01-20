import { plural } from "sonamu/dict";

/**
 * Project EN Dictionary
 */
export default {
  "common.all": "All",
  "common.backToList": "Back to List",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.confirm": "Confirm",
  "common.create": "Create",
  "common.createdAt": "Created At",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.login": "Login",
  "common.logout": "Logout",
  "common.manage": "Manage",
  "common.results": (count: number) =>
    plural(count, { one: `${count} result`, other: `${count} results` }),
  "common.save": "Save",
  "common.search": "Search",
  "common.searchPlaceholder": "Search...",
  "common.searchType": "Search Type",
  "common.sort": "Sort",
  "confirm.delete": "Are you sure you want to delete?",
  "confirm.save": "Do you want to save?",
  "dashboard.adminMenu": "Admin Menu",
  "dashboard.createdAt": "Joined",
  "dashboard.email": "Email",
  "dashboard.loginRequired": "Please login to continue.",
  "dashboard.name": "Name",
  "dashboard.role": "Role",
  "dashboard.title": "Admin Dashboard",
  "dashboard.welcome": "Welcome!",
  "delete.confirm.description":
    "This action cannot be undone. This will permanently delete this item.",
  "delete.confirm.title": "Are you sure?",
  "entity.create": (name: string) => `Create ${name}`,
  "entity.edit": (name: string, id: number) => `Edit ${name} (#${id})`,
  "entity.list": (name: string) => `${name} List`,
  "entity.listManage": (name: string) => `Manage ${name} List`,
  "error.alreadyProcessed": "Already processed",
  "error.badRequest": "Bad request",
  "error.duplicateRow": "Duplicate data",
  "error.forbidden": "Forbidden",
  "error.internalServerError": "Internal server error",
  "error.notFound": "Not found",
  "error.serviceUnavailable": "Service unavailable",
  "error.unauthorized": "Unauthorized",
  notFound: (name: string, id: number) => `${name} ID ${id} not found`,
  "validation.email": "Invalid email format",
  "validation.maxLength": (field: string, max: number) =>
    `${field} must be at most ${max} characters`,
  "validation.minLength": (field: string, min: number) =>
    `${field} must be at least ${min} characters`,
  "validation.required": (field: string) => `${field} is required`,
  "validation.url": "Invalid URL format",
};
