/**
 * @generated
 * 직접 수정하지 마세요.
 */
/** biome-ignore-all lint: generated는 무시 */
/** biome-ignore-all assist: generated는 무시 */

import  { type SSRQuery } from "sonamu/ssr";

// SSRQuery 헬퍼 함수
function createSSRQuery(
  modelName: string,
  methodName: string,
  params: any[],
  serviceKey: [string, string],
): SSRQuery {
  return { modelName, methodName, params, serviceKey, __brand: "SSRQuery" } as SSRQuery;
}

import { type AuditLogListParams } from "./audit-log/audit-log.types";
import { type CompanyListParams } from "./company/company.types";
import { type ActivityPeriod } from "./dashboard/dashboard.types";
import { type DepartmentListParams } from "./department/department.types";
import { type DocumentListParams, type DocumentSemanticParams } from "./document/document.types";
import { type EmployeeListParams } from "./employee/employee.types";
import { type FileListParams } from "./file/file.types";
import { type MilestoneListParams } from "./milestone/milestone.types";
import { type ProjectListParams } from "./project/project.types";
import {
  type AuditLogSubsetKey,
  type CompanySubsetKey,
  type DepartmentSubsetKey,
  type DocumentSubsetKey,
  type EmployeeSubsetKey,
  type FileSubsetKey,
  type MilestoneSubsetKey,
  type ProjectSubsetKey,
  type SyncFixtureSubsetKey,
  type TagSubsetKey,
  type UserSubsetKey,
} from "./sonamu.generated";
import { type SyncFixtureListParams } from "./sync-fixture/sync-fixture.types";
import { type TagListParams } from "./tag/tag.types";
import { type UserListParams } from "./user/user.types";

export namespace UserService {
  export const getUser = <T extends UserSubsetKey>(subset: T, id: string): SSRQuery =>
    createSSRQuery("UserModel", "findById", [subset, id], ["User", "getUser"]);

  export const getUsers = <T extends UserSubsetKey, LP extends UserListParams>(
    subset: T,
    rawParams?: LP,
  ): SSRQuery => createSSRQuery("UserModel", "findMany", [subset, rawParams], ["User", "getUsers"]);

  export const getMyIP = (): SSRQuery =>
    createSSRQuery("UserModel", "getMyIP", [], ["User", "getMyIP"]);

  export const trxTest = (): SSRQuery =>
    createSSRQuery("UserModel", "trxTest", [], ["User", "trxTest"]);
}

export namespace TagService {
  export const getTag = <T extends TagSubsetKey>(subset: T, id: number): SSRQuery =>
    createSSRQuery("TagModel", "findById", [subset, id], ["Tag", "getTag"]);

  export const getTags = <T extends TagSubsetKey, LP extends TagListParams>(
    subset: T,
    rawParams?: LP,
  ): SSRQuery => createSSRQuery("TagModel", "findMany", [subset, rawParams], ["Tag", "getTags"]);
}

export namespace SyncFixtureService {
  export const getSyncFixture = <T extends SyncFixtureSubsetKey>(subset: T, id: number): SSRQuery =>
    createSSRQuery("SyncFixtureModel", "findById", [subset, id], ["SyncFixture", "getSyncFixture"]);

  export const getSyncFixtures = <T extends SyncFixtureSubsetKey, LP extends SyncFixtureListParams>(
    subset: T,
    rawParams?: LP,
  ): SSRQuery =>
    createSSRQuery(
      "SyncFixtureModel",
      "findMany",
      [subset, rawParams],
      ["SyncFixture", "getSyncFixtures"],
    );
}

export namespace ProjectService {
  export const getProject = <T extends ProjectSubsetKey>(subset: T, id: number): SSRQuery =>
    createSSRQuery("ProjectModel", "findById", [subset, id], ["Project", "getProject"]);

  export const getProjects = <T extends ProjectSubsetKey, LP extends ProjectListParams>(
    subset: T,
    rawParams?: LP,
  ): SSRQuery =>
    createSSRQuery("ProjectModel", "findMany", [subset, rawParams], ["Project", "getProjects"]);
}

export namespace MilestoneService {
  export const getMilestone = <T extends MilestoneSubsetKey>(subset: T, id: number): SSRQuery =>
    createSSRQuery("MilestoneModel", "findById", [subset, id], ["Milestone", "getMilestone"]);

  export const getMilestones = <T extends MilestoneSubsetKey, LP extends MilestoneListParams>(
    subset: T,
    rawParams?: LP,
  ): SSRQuery =>
    createSSRQuery(
      "MilestoneModel",
      "findMany",
      [subset, rawParams],
      ["Milestone", "getMilestones"],
    );
}

export namespace FileService {
  export const getFile = <T extends FileSubsetKey>(subset: T, id: number): SSRQuery =>
    createSSRQuery("FileModel", "findById", [subset, id], ["File", "getFile"]);

  export const getFiles = <T extends FileSubsetKey, LP extends FileListParams>(
    subset: T,
    rawParams?: LP,
  ): SSRQuery => createSSRQuery("FileModel", "findMany", [subset, rawParams], ["File", "getFiles"]);
}

export namespace EmployeeService {
  export const getEmployee = <T extends EmployeeSubsetKey>(subset: T, id: number): SSRQuery =>
    createSSRQuery("EmployeeModel", "findById", [subset, id], ["Employee", "getEmployee"]);

  export const getEmployees = <T extends EmployeeSubsetKey, LP extends EmployeeListParams>(
    subset: T,
    rawParams?: LP,
  ): SSRQuery =>
    createSSRQuery("EmployeeModel", "findMany", [subset, rawParams], ["Employee", "getEmployees"]);
}

export namespace DocumentService {
  export const getDocument = <T extends DocumentSubsetKey>(subset: T, id: number): SSRQuery =>
    createSSRQuery("DocumentModel", "findById", [subset, id], ["Document", "getDocument"]);

  export const findMany = <T extends DocumentSubsetKey, LP extends DocumentListParams>(
    subset: T,
    rawParams?: LP,
  ): SSRQuery =>
    createSSRQuery("DocumentModel", "findMany", [subset, rawParams], ["Document", "findMany"]);

  export const getSimilarDocumentsByVector = <T extends DocumentSubsetKey>(
    subset: T,
    params: DocumentSemanticParams,
  ): SSRQuery =>
    createSSRQuery(
      "DocumentModel",
      "findManySemanticByVector",
      [subset, params],
      ["Document", "getSimilarDocumentsByVector"],
    );

  export const embedQuery = (
    text: string,
    model: "voyage" | "openai",
    inputType: "document" | "query",
  ): SSRQuery =>
    createSSRQuery(
      "DocumentModel",
      "embedQuery",
      [text, model, inputType],
      ["Document", "embedQuery"],
    );
}

export namespace DepartmentService {
  export const getDepartment = <T extends DepartmentSubsetKey>(subset: T, id: number): SSRQuery =>
    createSSRQuery("DepartmentModel", "findById", [subset, id], ["Department", "getDepartment"]);

  export const getDepartments = <T extends DepartmentSubsetKey, LP extends DepartmentListParams>(
    subset: T,
    rawParams?: LP,
  ): SSRQuery =>
    createSSRQuery(
      "DepartmentModel",
      "findMany",
      [subset, rawParams],
      ["Department", "getDepartments"],
    );
}

export namespace DashboardService {
  export const getDashboardStats = (): SSRQuery =>
    createSSRQuery("DashboardFrame", "getStats", [], ["Dashboard", "getDashboardStats"]);

  export const getRecentActivity = (period: ActivityPeriod = "7"): SSRQuery =>
    createSSRQuery(
      "DashboardFrame",
      "getRecentActivity",
      [period],
      ["Dashboard", "getRecentActivity"],
    );
}

export namespace CompanyService {
  export const getCompany = <T extends CompanySubsetKey>(subset: T, id: number): SSRQuery =>
    createSSRQuery("CompanyModel", "findById", [subset, id], ["Company", "getCompany"]);

  export const getCompanies = <T extends CompanySubsetKey, LP extends CompanyListParams>(
    subset: T,
    rawParams?: LP,
  ): SSRQuery =>
    createSSRQuery("CompanyModel", "findMany", [subset, rawParams], ["Company", "getCompanies"]);
}

export namespace AuditLogService {
  export const getAuditLog = <T extends AuditLogSubsetKey>(subset: T, id: number): SSRQuery =>
    createSSRQuery("AuditLogModel", "findById", [subset, id], ["AuditLog", "getAuditLog"]);

  export const getAuditLogs = <T extends AuditLogSubsetKey, LP extends AuditLogListParams>(
    subset: T,
    rawParams?: LP,
  ): SSRQuery =>
    createSSRQuery("AuditLogModel", "findMany", [subset, rawParams], ["AuditLog", "getAuditLogs"]);
}
