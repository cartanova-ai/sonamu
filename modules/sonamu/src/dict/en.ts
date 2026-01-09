/**
 * Sonamu Built-in English Dictionary
 * Project can override these by defining the same keys.
 */
export default {
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
  "common.confirm": "Confirm",
  "common.close": "Close",

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
  "entity.create": (name: string) => `Create ${name}`,
  "entity.edit": (name: string, id: number) => `Edit ${name} (#${id})`,
} as const;
