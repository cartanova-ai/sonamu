/**
 * @generated
 * API에서 동기화된 파일입니다. 직접 수정하지 마세요.
 */

/* oxlint-disable */

import type { SSRQuery } from "sonamu/ssr";

// SSRQuery 헬퍼 함수
function createSSRQuery(
  modelName: string,
  methodName: string,
  params: any[],
  serviceKey: [string, string],
): SSRQuery {
  return { modelName, methodName, params, serviceKey, __brand: "SSRQuery" } as SSRQuery;
}

import { AuditEventListParams } from "./audit-event/audit-event.types";
import { AuditLogListParams } from "./audit-log/audit-log.types";
import { CompanyListParams } from "./company/company.types";
import { ActivityPeriod } from "./dashboard/dashboard.types";
import { DepartmentListParams } from "./department/department.types";
import { DocumentListParams, DocumentSemanticParams } from "./document/document.types";
import { EmployeeListParams } from "./employee/employee.types";
import { FileListParams } from "./file/file.types";
import { MilestoneListParams } from "./milestone/milestone.types";
import { ProjectListParams } from "./project/project.types";
import {
  UserSubsetKey,
  TagSubsetKey,
  SyncFixtureSubsetKey,
  ProjectSubsetKey,
  MilestoneSubsetKey,
  FileSubsetKey,
  EmployeeSubsetKey,
  DocumentSubsetKey,
  DepartmentSubsetKey,
  CompanySubsetKey,
  AuditLogSubsetKey,
  AuditEventSubsetKey,
} from "./sonamu.generated";
import { SyncFixtureListParams } from "./sync-fixture/sync-fixture.types";
import { TagListParams } from "./tag/tag.types";
import { UserListParams } from "./user/user.types";

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

export namespace SyncFixtureSubService {
  export const getSyncFixtureSub = <T extends SyncFixtureSubsetKey>(
    subset: T,
    id: number,
  ): SSRQuery =>
    createSSRQuery(
      "SyncFixtureSubModel",
      "findById",
      [subset, id],
      ["SyncFixtureSub", "getSyncFixtureSub"],
    );
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

export namespace AuditEventService {
  export const getAuditEvent = <T extends AuditEventSubsetKey>(subset: T, id: number): SSRQuery =>
    createSSRQuery("AuditEventModel", "findById", [subset, id], ["AuditEvent", "getAuditEvent"]);

  export const getAuditEvents = <T extends AuditEventSubsetKey, LP extends AuditEventListParams>(
    subset: T,
    rawParams?: LP,
  ): SSRQuery =>
    createSSRQuery(
      "AuditEventModel",
      "findMany",
      [subset, rawParams],
      ["AuditEvent", "getAuditEvents"],
    );
}
