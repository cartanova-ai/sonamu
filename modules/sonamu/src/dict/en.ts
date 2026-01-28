import { rcKeysEn } from "./rc-keys";

/**
 * Sonamu Built-in English Dictionary
 * Project can override these by defining the same keys.
 */
export default {
  // react-components i18n keys
  ...rcKeysEn,

  // Error messages
  "error.badRequest": "Bad Request",
  "error.unauthorized": "Authentication required",
  "error.forbidden": "Permission denied",
  "error.notFound": "Not found",
  "error.serviceUnavailable": "Service unavailable",
  "error.internalServerError": "Internal server error",
  "error.alreadyProcessed": "Already processed",
  "error.duplicateRow": "Duplicate data",
  "error.targetNotFound": "Target not found",

  // Common UI
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.create": "Create",
  "common.search": "Search",
  "common.searchPlaceholder": "Search...",
  "common.all": "All",
  "common.confirm": "Confirm",
  "common.close": "Close",
  "common.backToList": "Back To List",

  // Form
  "form.createdAt": "Created At",

  // Confirmation messages
  "confirm.delete": "Are you sure you want to delete?",
  "confirm.save": "Do you want to save?",

  // Validation messages (template functions)
  "validation.required": (field: string) => `${field} is required`,
  "validation.minLength": (field: string, min: number) =>
    `${field} must be at least ${min} characters`,
  "validation.maxLength": (field: string, max: number) =>
    `${field} must be at most ${max} characters`,
  "validation.range": (field: string, min: number, max: number) =>
    `${field} must be between ${min} and ${max}`,
  "validation.email": "Invalid email format",
  "validation.url": "Invalid URL format",

  // Entity pages (template functions)
  "entity.list": (name: string) => `${name} List`,
  "entity.listManage": (name: string) => `${name} List Management`,
  "entity.create": (name: string) => `Create ${name}`,
  "entity.edit": (name: string, id: number) => `Edit ${name} (#${id})`,

  // Error messages (template functions)
  "error.entityNotFound": (name: string, id: number | string) => `${name} ID ${id} not found`,
  "error.unknownSearchField": (field: string) => `Unknown search field: ${field}`,

  // Sonamu internal error messages
  "sonamu.error.entityIdCamelCase": "entityId must be in CamelCase format.",
  "sonamu.error.subsetNotFound": (subset: string) => `Subset ${subset} not found.`,
  "sonamu.error.shadowDbTestFailed": "Error during Shadow DB test",
  "sonamu.error.allFilesExist": "All files already exist at the path.",
  "sonamu.error.allFilesGenerated": "All files have already been generated.",
  "sonamu.error.fixtureRecordRequired": "Fixture record not found. Please fetch fixtures first.",
  "sonamu.error.presetOrAbsPathRequired": "preset or absPath must be provided",
  "sonamu.error.entityIdsRequired": "entityIds must be provided",
  "sonamu.error.templateKeysRequired": "templateKeys must be provided",
  "sonamu.error.enumIdsRequired": "enumIds must be provided",
  "sonamu.error.optionsRequired": "options must be provided",
  "sonamu.error.fileNotUploaded": "File not uploaded",
  "sonamu.error.headerRowNotFound": "Header row not found. The first column must be 'key'.",
  "sonamu.error.keyRequired": "Key is required",
  "sonamu.error.keyAlreadyExists": (key: string) => `Key already exists: ${key}`,
  "sonamu.error.keyNotFound": (key: string) => `Key not found: ${key}`,
  "sonamu.error.migrationRejected": "Migration has been rejected",
  "sonamu.error.slackConfirmNotConfigured": "Slack Confirm is not configured",
} as const;
