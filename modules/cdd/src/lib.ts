export { findContractDir, loadProject } from "./core/loader.js";
export {
  addToField,
  getField,
  getFieldMeta,
  listFieldNames,
  removeFromField,
  setField,
} from "./core/spec-field-ops.js";
export type {
  CddProject,
  ContractDocument,
  ContractNode,
  IssueSeverity,
  SpecDocument,
  SpecNode,
  SpecStatus,
  ValidationIssue,
} from "./core/types.js";
export {
  CONTRACT_REQUIRED_FIELDS,
  SPEC_REQUIRED_FIELDS,
} from "./core/types.js";
export { validateProject } from "./core/validator.js";
export type { OutputResult } from "./utils/output.js";
export { getOutputMode, printOutput } from "./utils/output.js";
export type { ResolvedFile } from "./utils/resolve.js";
export { resolveContract, resolveFile, resolveSpec } from "./utils/resolve.js";
