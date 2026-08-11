/**
 * @generated
 * 직접 수정하지 마세요.
 */

/* oxlint-disable */

import { fastifyCaster, getZodObjectFromApi } from "sonamu";
import { compile } from "zod-compiler";

import { AuditEventListParams, AuditEventSaveParams } from "./audit-event/audit-event.types";
import { AuditLogListParams } from "./audit-log/audit-log.types";
import { CompanyListParams, CompanySaveParams } from "./company/company.types";
import { ActivityPeriod } from "./dashboard/dashboard.types";
import { DepartmentListParams, DepartmentSaveParams } from "./department/department.types";
import {
  DocumentListParams,
  DocumentSaveParams,
  DocumentSemanticParams,
} from "./document/document.types";
import { EmployeeListParams, EmployeeSaveParams } from "./employee/employee.types";
import { FileListParams, FileSaveParams } from "./file/file.types";
import { MilestoneListParams, MilestoneSaveParams } from "./milestone/milestone.types";
import { ProjectListParams, ProjectSaveParams } from "./project/project.types";
import {
  AuditEventSubsetKey,
  AuditLogSubsetKey,
  CompanySubsetKey,
  DepartmentSubsetKey,
  DocumentSubsetKey,
  EmployeeSubsetKey,
  FileSubsetKey,
  MilestoneSubsetKey,
  ProjectSubsetKey,
  SyncFixtureSubsetKey,
  TagSubsetKey,
  UserSubsetKey,
} from "./sonamu.generated";
import { SyncFixtureListParams, SyncFixtureSaveParams } from "./sync-fixture/sync-fixture.types";
import { TagListParams, TagSaveParams } from "./tag/tag.types";
import { TelemetryQueryParams } from "./telemetry/telemetry.types";
import { UserListParams, UserSaveParams } from "./user/user.types";

export const fingerprint = "e966fe0b7dcecdecf3f6fd9c99219beaee0f07f41087ed0416e519c0bb9e9345";
export const routeIds = {
  '["AuditEventModel","del","POST","/auditEvent/del"]':
    "167a3b99f09bee1d82f7dff5188522d7d10cc77f541484728120dd644a884e6f",
  '["AuditEventModel","findById","GET","/auditEvent/findById"]':
    "4dc7e31b5673abab878ded5d811747377b4bf4e82bd03349e8ae43bc3071fb59",
  '["AuditEventModel","findMany","GET","/auditEvent/findMany"]':
    "2ef4cf5b7b7995caec6e9387a1216dc2fa306c6ab1c586c79017237bb19641ef",
  '["AuditEventModel","save","POST","/auditEvent/save"]':
    "62dcd1005d1a77f6c5b9ab692bd84493cf17bd9cf29cfa3326de1eeeb9898555",
  '["AuditLogModel","findById","GET","/auditLog/findById"]':
    "30ceb797e488937e3187a37ea2c67e7a5669fa0d60834ec7fc7bef70f02ad9b2",
  '["AuditLogModel","findMany","GET","/auditLog/findMany"]':
    "8d9def3b24278bbc04a675227df8c75fe2e3214d7314a3ab2409aea06f0b3a26",
  '["CompanyModel","del","POST","/company/del"]':
    "8740c2d14bcb3bd4a0d56e7fb1a8b586edf30b725f648183fe87c3c5f3494952",
  '["CompanyModel","findById","GET","/company/findById"]':
    "c7853b58dbe9c2cff6bc67a7854942fd886c8d20095f637ac8e5dc29860fbea9",
  '["CompanyModel","findMany","GET","/company/findMany"]':
    "a95c9563ed739d0d0374d44eea4ccae517943f6f5f15eb3b00e975185a74af2e",
  '["CompanyModel","save","POST","/company/save"]':
    "75628277854620350e209becf9ae245fb3e4c77044e20f2c1908d33fe5fb3a2d",
  '["DashboardFrame","getRecentActivity","GET","/dashboard/getRecentActivity"]':
    "53c5538937e866b0be17ccc45569d52b6dfbd9a3d3cd1324a493b4e6f78d1d68",
  '["DashboardFrame","getStats","GET","/dashboard/getStats"]':
    "91c6d0189895efff8df0e5aad7834f4d4a91f54c28be2ee3d70e8702c7a4ea64",
  '["DepartmentModel","del","POST","/department/del"]':
    "ddf7c151caeacf4725b6798a66ce79336ddcf53f77d6191e36cd53d97d89f047",
  '["DepartmentModel","findById","GET","/department/findById"]':
    "d4affc8adec9120043ec1478ddb7fc91dc0fa80aff11bca1ea1b54486ec915d8",
  '["DepartmentModel","findMany","GET","/department/findMany"]':
    "98374409464803da5a3670859d5875d1765920dbbeea3bc22dfc10740ea3dcf0",
  '["DepartmentModel","save","POST","/department/save"]':
    "27b42af2b3ae4aa12a8c53cd7df156c40203452547e2f0c522b3bdfeb728793c",
  '["DocumentModel","del","POST","/document/del"]':
    "c1918247b59551f2c48735d133c8acecb502cbcdd611e45cdb9295c6be12d404",
  '["DocumentModel","embedQuery","GET","/document/embedQuery"]':
    "c20108e0f71ac1eda24e725a86a726358a330ddc78eddbe021e2109ba9f5726c",
  '["DocumentModel","findById","GET","/document/findById"]':
    "0bb1138b2d652b761b4e80e67dc3a596a64afb978c5e166b0ae80209589e5319",
  '["DocumentModel","findMany","GET","/document/findMany"]':
    "a2a632abcf08bf03960c3eb64581a081c4b265ff229ffde23e140d693748bac0",
  '["DocumentModel","findManySemanticByVector","POST","/document/findManySemanticByVector"]':
    "27d0983d864c4a32331d1628255e0750f3994a20734bb6807b7dc2d37323d31e",
  '["DocumentModel","save","POST","/document/save"]':
    "0a209dbad34248388f5559f354e0e4677efe074c515a195165ec2a13ef3b203d",
  '["EmployeeModel","del","POST","/employee/del"]':
    "5c32f187399fda641cb3483d6112a4135a984b6af4cce099ab9896e34dde7efc",
  '["EmployeeModel","findById","GET","/employee/findById"]':
    "34cc8666412154ad9e9359cde590015609a5b5ae0ab770a0cafd3a19228bcfa6",
  '["EmployeeModel","findMany","GET","/employee/findMany"]':
    "79e0d586a7d856a88f115288e6c99098e5bc0335f47a3d935336d7325d92aa68",
  '["EmployeeModel","save","POST","/employee/save"]':
    "17d227a9343f1c5647c749fd3b4ae9dbe380d0e7e57ffea0c9969a7b723ba551",
  '["FileModel","del","POST","/file/del"]':
    "af47a8302df8a99240372ea3a546a01413909b0b4e27d96a33aa4c383d0dd78b",
  '["FileModel","findById","GET","/file/findById"]':
    "6ed6527d98a5ed0c422b00e78c92243acde8fcc7e68bc08c1cf6dd44e9ea7b12",
  '["FileModel","findMany","GET","/file/findMany"]':
    "6e58649ac140c3f53f09d6da6a65d0de7d4aea2a5743e3aa383f6f024a29bbcc",
  '["FileModel","inlineUpload","POST","/file/inlineUpload"]':
    "371aaa1abe5ac19b58748aeec97c32d1465a95fa73c955c4e410589439501997",
  '["FileModel","inlineUploadFlat","POST","/file/inlineUploadFlat"]':
    "403c50374f4ac845b442346510e9d1a7cb4ffcffd3b1c14d30b41cf01dc541c8",
  '["FileModel","save","POST","/file/save"]':
    "69e7352e794763142502350349c0a741f9caa0497b81fb879e58573a836b29a1",
  '["FileModel","testBufferUpload","POST","/file/testBufferUpload"]':
    "675a0e49cbe4847e6ab8b000fc5204e46eefe5d7a66145a797fdf02e2a4cf75b",
  '["FileModel","testStreamUpload","POST","/file/testStreamUpload"]':
    "d74432dc5f16244648418b7d9c4d88064868c74083e024f0c38784f3fa12b9a5",
  '["FileModel","upload","POST","/file/upload"]':
    "0a2299ec6127c55a6b2b26d8ddee2814920923f05616862f3d75a17edde973e3",
  '["MilestoneModel","complete","POST","/milestone/complete"]':
    "b6699f08e7a728edbeaaab02be3e3fff03a996b7f183534e00afbf1aa4af5701",
  '["MilestoneModel","del","POST","/milestone/del"]':
    "93d8443d3a508f190d45917f7c4a3fb1dc94062b2df722d955b041e9bcad38f1",
  '["MilestoneModel","findById","GET","/milestone/findById"]':
    "0f27b410ce2c0935cd1695a973cacaf5f01fedf8ae97da48985e2b09696ad52d",
  '["MilestoneModel","findMany","GET","/milestone/findMany"]':
    "0bca11f94cae8aa2f19603a0a78b9c34c097179e0a1a8292e54e440e12dbc832",
  '["MilestoneModel","save","POST","/milestone/save"]':
    "31371e7ebf8118041d7728c935aac3830ca283e2655aba1ebcdae350850a9247",
  '["MilestoneModel","uncomplete","POST","/milestone/uncomplete"]':
    "704f003e3e0a652718a51ab9ef1267369aef6301ed58f0c9109c651aaa410f7e",
  '["ProjectModel","ask","GET","/project/ask"]':
    "796074ae58e29bc79b88c28b6b577cc7705567b49669f908430cbc4741d2db1b",
  '["ProjectModel","del","POST","/project/del"]':
    "b8b8c02e0dd78cfcf37b1b7dc2b0d974eedb4e2169185373f4650abfdc04e53b",
  '["ProjectModel","findById","GET","/project/findById"]':
    "1f9325369f38a096dcebac112c33d05326f5846b1bbba423ebd3d2f35fc8e832",
  '["ProjectModel","findMany","GET","/project/findMany"]':
    "dee376cf0d0499498b49f336220bff87b94548cd0febe5845f917ffb7deeb01f",
  '["ProjectModel","save","POST","/project/save"]':
    "e70999e7a8fb7d17917270ecef0cef0a020797a365f24add9f04e6da399b8c38",
  '["ProjectModel","search","GET","/project/search"]':
    "a929095ffe17327fccbf125512124089dfcb8ca95e05002e2ca24a00f6ce9329",
  '["SyncFixtureModel","del","POST","/syncFixture/del"]':
    "d5a0cef9611490d5f2477a75c2a53e70810c5fab21e4d33c59a307c96fb4b87d",
  '["SyncFixtureModel","findById","GET","/syncFixture/findById"]':
    "548a4dbf6f3f5f8718070a081e41d86eaa21e7d3e74b9a5c96d433953d676334",
  '["SyncFixtureModel","findMany","GET","/syncFixture/findMany"]':
    "96ea78e785c20e98626ad4f604fda53b36e39962396211864ee76864302df871",
  '["SyncFixtureModel","save","POST","/syncFixture/save"]':
    "a373e54843aca1620451139d6a53f107c7bc64bfbb6c06e0d2bda796bdb7811e",
  '["SyncFixtureSubModel","findById","GET","/syncFixtureSub/findById"]':
    "50c73a183353cb126f5f1a2d67ba7a89399318f96486a8ce9ae8aa0a1243a182",
  '["TagModel","cached","GET","/tag/cached"]':
    "78cd8cd76e84104c2a55ff16fec9171e01f3ac4135855f1921da9b78f6036711",
  '["TagModel","del","POST","/tag/del"]':
    "ce528840ee746f05602b0b2063bf65c4e301e0f9f9a4beea72296284830c0515",
  '["TagModel","deleteCached","GET","/tag/deleteCached"]':
    "b90575d979f5451db19af6034513b9fa1df5cf58a12481cca63e4205ee928d3b",
  '["TagModel","findById","GET","/tag/findById"]':
    "5f0ea045f1204ded14d9fe917f1ebfbcc0e2bb2a1f4bc0cba2fbf31d4c311c8c",
  '["TagModel","findMany","GET","/tag/findMany"]':
    "3ab81e94719adb6eee665ff27265c584360371d18bd25294c9b56ff6c7b40abb",
  '["TagModel","runWorkflow","POST","/tag/runWorkflow"]':
    "45526a22b484fa4d4c9353f226c99ebde47f381998c031950c0ce379dbc69957",
  '["TagModel","save","POST","/tag/save"]':
    "13f5251ef10b1812e13298ce82446e8685b3c3d9d4ed32db4663c8a7374b26d3",
  '["TelemetryFrame","getSnapshot","GET","/telemetry/getSnapshot"]':
    "b2c2b9110f91b40eb964084979958c6c643c7e8fdf7a485061041406f4c59459",
  '["UserModel","del","POST","/user/del"]':
    "be9ced6b92d7fb3bc3d21ecbe27d31c8b8a792d06c0aa87ccd8624d37d6566a4",
  '["UserModel","findById","GET","/user/findById"]':
    "1db9bb97601d63a1cdf9010f6ea65dd06ccfe7bc0273f3691a117ea0308d0584",
  '["UserModel","findMany","GET","/user/findMany"]':
    "775bdca0344972ecb640bec2196ad46c001e118e5124a2ca96d21b142d989301",
  '["UserModel","getMyIP","GET","/user/getMyIP"]':
    "15a76b55788cd9f11a82a07977d11749ccdc9cb2ed458b68e170e2a06d2426d2",
  '["UserModel","save","POST","/user/save"]':
    "c0c4552a6bc25e7454959dc996c81d836e88aeb3cb4263bbfde044d4812d131d",
  '["UserModel","trxTest","GET","/user/trxTest"]':
    "f107363c011e4a1f2084e1a5763fa96ef063849eef982abc609082b687eec8a9",
};
const types = {
  ActivityPeriod,
  AuditEventListParams,
  AuditEventSaveParams,
  AuditEventSubsetKey,
  AuditLogListParams,
  AuditLogSubsetKey,
  CompanyListParams,
  CompanySaveParams,
  CompanySubsetKey,
  DepartmentListParams,
  DepartmentSaveParams,
  DepartmentSubsetKey,
  DocumentListParams,
  DocumentSaveParams,
  DocumentSemanticParams,
  DocumentSubsetKey,
  EmployeeListParams,
  EmployeeSaveParams,
  EmployeeSubsetKey,
  FileListParams,
  FileSaveParams,
  FileSubsetKey,
  MilestoneListParams,
  MilestoneSaveParams,
  MilestoneSubsetKey,
  ProjectListParams,
  ProjectSaveParams,
  ProjectSubsetKey,
  SyncFixtureListParams,
  SyncFixtureSaveParams,
  SyncFixtureSubsetKey,
  TagListParams,
  TagSaveParams,
  TagSubsetKey,
  TelemetryQueryParams,
  UserListParams,
  UserSaveParams,
  UserSubsetKey,
};
export const validator_167a3b99f09bee1d82f7dff5188522d7d10cc77f541484728120dd644a884e6f = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "AuditEventModel",
        methodName: "del",
        path: "/auditEvent/del",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          { name: "ids", type: { t: "array", elementsType: "number" }, optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_4dc7e31b5673abab878ded5d811747377b4bf4e82bd03349e8ae43bc3071fb59 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "AuditEventModel",
        methodName: "findById",
        path: "/auditEvent/findById",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "AuditEventSubsetKey" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "id", type: "number", optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_2ef4cf5b7b7995caec6e9387a1216dc2fa306c6ab1c586c79017237bb19641ef = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "AuditEventModel",
        methodName: "findMany",
        path: "/auditEvent/findMany",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "AuditEventSubsetKey" } },
          { t: "type-param", id: "LP", constraint: { t: "ref", id: "AuditEventListParams" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "rawParams", type: { t: "ref", id: "LP" }, optional: true },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_62dcd1005d1a77f6c5b9ab692bd84493cf17bd9cf29cfa3326de1eeeb9898555 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "AuditEventModel",
        methodName: "save",
        path: "/auditEvent/save",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          {
            name: "spa",
            type: { t: "array", elementsType: { t: "ref", id: "AuditEventSaveParams" } },
            optional: false,
          },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_30ceb797e488937e3187a37ea2c67e7a5669fa0d60834ec7fc7bef70f02ad9b2 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "AuditLogModel",
        methodName: "findById",
        path: "/auditLog/findById",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "AuditLogSubsetKey" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "id", type: "number", optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_8d9def3b24278bbc04a675227df8c75fe2e3214d7314a3ab2409aea06f0b3a26 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "AuditLogModel",
        methodName: "findMany",
        path: "/auditLog/findMany",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "AuditLogSubsetKey" } },
          { t: "type-param", id: "LP", constraint: { t: "ref", id: "AuditLogListParams" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "rawParams", type: { t: "ref", id: "LP" }, optional: true },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_8740c2d14bcb3bd4a0d56e7fb1a8b586edf30b725f648183fe87c3c5f3494952 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "CompanyModel",
        methodName: "del",
        path: "/company/del",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          { name: "ids", type: { t: "array", elementsType: "number" }, optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_c7853b58dbe9c2cff6bc67a7854942fd886c8d20095f637ac8e5dc29860fbea9 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "CompanyModel",
        methodName: "findById",
        path: "/company/findById",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "CompanySubsetKey" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "id", type: "number", optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_a95c9563ed739d0d0374d44eea4ccae517943f6f5f15eb3b00e975185a74af2e = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "CompanyModel",
        methodName: "findMany",
        path: "/company/findMany",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "CompanySubsetKey" } },
          { t: "type-param", id: "LP", constraint: { t: "ref", id: "CompanyListParams" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "rawParams", type: { t: "ref", id: "LP" }, optional: true },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_75628277854620350e209becf9ae245fb3e4c77044e20f2c1908d33fe5fb3a2d = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "CompanyModel",
        methodName: "save",
        path: "/company/save",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          {
            name: "spa",
            type: { t: "array", elementsType: { t: "ref", id: "CompanySaveParams" } },
            optional: false,
          },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_53c5538937e866b0be17ccc45569d52b6dfbd9a3d3cd1324a493b4e6f78d1d68 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "DashboardFrame",
        methodName: "getRecentActivity",
        path: "/dashboard/getRecentActivity",
        options: { httpMethod: "GET" },
        typeParameters: [],
        parameters: [
          {
            name: "period",
            type: { t: "ref", id: "ActivityPeriod" },
            optional: true,
            defaultDef: '"7"',
          },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_91c6d0189895efff8df0e5aad7834f4d4a91f54c28be2ee3d70e8702c7a4ea64 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "DashboardFrame",
        methodName: "getStats",
        path: "/dashboard/getStats",
        options: { httpMethod: "GET" },
        typeParameters: [],
        parameters: [],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_ddf7c151caeacf4725b6798a66ce79336ddcf53f77d6191e36cd53d97d89f047 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "DepartmentModel",
        methodName: "del",
        path: "/department/del",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          { name: "ids", type: { t: "array", elementsType: "number" }, optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_d4affc8adec9120043ec1478ddb7fc91dc0fa80aff11bca1ea1b54486ec915d8 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "DepartmentModel",
        methodName: "findById",
        path: "/department/findById",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "DepartmentSubsetKey" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "id", type: "number", optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_98374409464803da5a3670859d5875d1765920dbbeea3bc22dfc10740ea3dcf0 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "DepartmentModel",
        methodName: "findMany",
        path: "/department/findMany",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "DepartmentSubsetKey" } },
          { t: "type-param", id: "LP", constraint: { t: "ref", id: "DepartmentListParams" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "rawParams", type: { t: "ref", id: "LP" }, optional: true },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_27b42af2b3ae4aa12a8c53cd7df156c40203452547e2f0c522b3bdfeb728793c = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "DepartmentModel",
        methodName: "save",
        path: "/department/save",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          {
            name: "spa",
            type: { t: "array", elementsType: { t: "ref", id: "DepartmentSaveParams" } },
            optional: false,
          },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_c1918247b59551f2c48735d133c8acecb502cbcdd611e45cdb9295c6be12d404 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "DocumentModel",
        methodName: "del",
        path: "/document/del",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          { name: "ids", type: { t: "array", elementsType: "number" }, optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_c20108e0f71ac1eda24e725a86a726358a330ddc78eddbe021e2109ba9f5726c = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "DocumentModel",
        methodName: "embedQuery",
        path: "/document/embedQuery",
        options: { httpMethod: "GET" },
        typeParameters: [],
        parameters: [
          { name: "text", type: "string", optional: false },
          {
            name: "model",
            type: {
              t: "union",
              types: [
                { t: "string-literal", value: "voyage" },
                { t: "string-literal", value: "openai" },
              ],
            },
            optional: false,
          },
          {
            name: "inputType",
            type: {
              t: "union",
              types: [
                { t: "string-literal", value: "document" },
                { t: "string-literal", value: "query" },
              ],
            },
            optional: false,
          },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_0bb1138b2d652b761b4e80e67dc3a596a64afb978c5e166b0ae80209589e5319 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "DocumentModel",
        methodName: "findById",
        path: "/document/findById",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "DocumentSubsetKey" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "id", type: "number", optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_a2a632abcf08bf03960c3eb64581a081c4b265ff229ffde23e140d693748bac0 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "DocumentModel",
        methodName: "findMany",
        path: "/document/findMany",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "DocumentSubsetKey" } },
          { t: "type-param", id: "LP", constraint: { t: "ref", id: "DocumentListParams" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "rawParams", type: { t: "ref", id: "LP" }, optional: true },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_27d0983d864c4a32331d1628255e0750f3994a20734bb6807b7dc2d37323d31e = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "DocumentModel",
        methodName: "findManySemanticByVector",
        path: "/document/findManySemanticByVector",
        options: { httpMethod: "POST" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "DocumentSubsetKey" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "params", type: { t: "ref", id: "DocumentSemanticParams" }, optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_0a209dbad34248388f5559f354e0e4677efe074c515a195165ec2a13ef3b203d = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "DocumentModel",
        methodName: "save",
        path: "/document/save",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          {
            name: "spa",
            type: { t: "array", elementsType: { t: "ref", id: "DocumentSaveParams" } },
            optional: false,
          },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_5c32f187399fda641cb3483d6112a4135a984b6af4cce099ab9896e34dde7efc = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "EmployeeModel",
        methodName: "del",
        path: "/employee/del",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          { name: "ids", type: { t: "array", elementsType: "number" }, optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_34cc8666412154ad9e9359cde590015609a5b5ae0ab770a0cafd3a19228bcfa6 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "EmployeeModel",
        methodName: "findById",
        path: "/employee/findById",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "EmployeeSubsetKey" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "id", type: "number", optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_79e0d586a7d856a88f115288e6c99098e5bc0335f47a3d935336d7325d92aa68 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "EmployeeModel",
        methodName: "findMany",
        path: "/employee/findMany",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "EmployeeSubsetKey" } },
          { t: "type-param", id: "LP", constraint: { t: "ref", id: "EmployeeListParams" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "rawParams", type: { t: "ref", id: "LP" }, optional: true },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_17d227a9343f1c5647c749fd3b4ae9dbe380d0e7e57ffea0c9969a7b723ba551 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "EmployeeModel",
        methodName: "save",
        path: "/employee/save",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          {
            name: "spa",
            type: { t: "array", elementsType: { t: "ref", id: "EmployeeSaveParams" } },
            optional: false,
          },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_af47a8302df8a99240372ea3a546a01413909b0b4e27d96a33aa4c383d0dd78b = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "FileModel",
        methodName: "del",
        path: "/file/del",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          { name: "ids", type: { t: "array", elementsType: "number" }, optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_6ed6527d98a5ed0c422b00e78c92243acde8fcc7e68bc08c1cf6dd44e9ea7b12 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "FileModel",
        methodName: "findById",
        path: "/file/findById",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "FileSubsetKey" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "id", type: "number", optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_6e58649ac140c3f53f09d6da6a65d0de7d4aea2a5743e3aa383f6f024a29bbcc = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "FileModel",
        methodName: "findMany",
        path: "/file/findMany",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "FileSubsetKey" } },
          { t: "type-param", id: "LP", constraint: { t: "ref", id: "FileListParams" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "rawParams", type: { t: "ref", id: "LP" }, optional: true },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_371aaa1abe5ac19b58748aeec97c32d1465a95fa73c955c4e410589439501997 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "FileModel",
        methodName: "inlineUpload",
        path: "/file/inlineUpload",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          {
            name: "params",
            type: { t: "object", props: [{ name: "category", type: "string", optional: false }] },
            optional: false,
          },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_403c50374f4ac845b442346510e9d1a7cb4ffcffd3b1c14d30b41cf01dc541c8 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "FileModel",
        methodName: "inlineUploadFlat",
        path: "/file/inlineUploadFlat",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [{ name: "category", type: "string", optional: false }],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_69e7352e794763142502350349c0a741f9caa0497b81fb879e58573a836b29a1 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "FileModel",
        methodName: "save",
        path: "/file/save",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          {
            name: "spa",
            type: { t: "array", elementsType: { t: "ref", id: "FileSaveParams" } },
            optional: false,
          },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_675a0e49cbe4847e6ab8b000fc5204e46eefe5d7a66145a797fdf02e2a4cf75b = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "FileModel",
        methodName: "testBufferUpload",
        path: "/file/testBufferUpload",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          {
            name: "params",
            type: { t: "object", props: [{ name: "name", type: "string", optional: false }] },
            optional: false,
          },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_d74432dc5f16244648418b7d9c4d88064868c74083e024f0c38784f3fa12b9a5 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "FileModel",
        methodName: "testStreamUpload",
        path: "/file/testStreamUpload",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          {
            name: "params",
            type: { t: "object", props: [{ name: "name", type: "string", optional: false }] },
            optional: false,
          },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_0a2299ec6127c55a6b2b26d8ddee2814920923f05616862f3d75a17edde973e3 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "FileModel",
        methodName: "upload",
        path: "/file/upload",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_b6699f08e7a728edbeaaab02be3e3fff03a996b7f183534e00afbf1aa4af5701 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "MilestoneModel",
        methodName: "complete",
        path: "/milestone/complete",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [{ name: "id", type: "number", optional: false }],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_93d8443d3a508f190d45917f7c4a3fb1dc94062b2df722d955b041e9bcad38f1 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "MilestoneModel",
        methodName: "del",
        path: "/milestone/del",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          { name: "ids", type: { t: "array", elementsType: "number" }, optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_0f27b410ce2c0935cd1695a973cacaf5f01fedf8ae97da48985e2b09696ad52d = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "MilestoneModel",
        methodName: "findById",
        path: "/milestone/findById",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "MilestoneSubsetKey" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "id", type: "number", optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_0bca11f94cae8aa2f19603a0a78b9c34c097179e0a1a8292e54e440e12dbc832 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "MilestoneModel",
        methodName: "findMany",
        path: "/milestone/findMany",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "MilestoneSubsetKey" } },
          { t: "type-param", id: "LP", constraint: { t: "ref", id: "MilestoneListParams" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "rawParams", type: { t: "ref", id: "LP" }, optional: true },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_31371e7ebf8118041d7728c935aac3830ca283e2655aba1ebcdae350850a9247 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "MilestoneModel",
        methodName: "save",
        path: "/milestone/save",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          {
            name: "spa",
            type: { t: "array", elementsType: { t: "ref", id: "MilestoneSaveParams" } },
            optional: false,
          },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_704f003e3e0a652718a51ab9ef1267369aef6301ed58f0c9109c651aaa410f7e = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "MilestoneModel",
        methodName: "uncomplete",
        path: "/milestone/uncomplete",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [{ name: "id", type: "number", optional: false }],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_796074ae58e29bc79b88c28b6b577cc7705567b49669f908430cbc4741d2db1b = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "ProjectModel",
        methodName: "ask",
        path: "/project/ask",
        options: { httpMethod: "GET" },
        typeParameters: [],
        parameters: [{ name: "prompt", type: "string", optional: false }],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_b8b8c02e0dd78cfcf37b1b7dc2b0d974eedb4e2169185373f4650abfdc04e53b = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "ProjectModel",
        methodName: "del",
        path: "/project/del",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          { name: "ids", type: { t: "array", elementsType: "number" }, optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_1f9325369f38a096dcebac112c33d05326f5846b1bbba423ebd3d2f35fc8e832 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "ProjectModel",
        methodName: "findById",
        path: "/project/findById",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "ProjectSubsetKey" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "id", type: "number", optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_dee376cf0d0499498b49f336220bff87b94548cd0febe5845f917ffb7deeb01f = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "ProjectModel",
        methodName: "findMany",
        path: "/project/findMany",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "ProjectSubsetKey" } },
          { t: "type-param", id: "LP", constraint: { t: "ref", id: "ProjectListParams" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "rawParams", type: { t: "ref", id: "LP" }, optional: true },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_e70999e7a8fb7d17917270ecef0cef0a020797a365f24add9f04e6da399b8c38 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "ProjectModel",
        methodName: "save",
        path: "/project/save",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          {
            name: "spa",
            type: { t: "array", elementsType: { t: "ref", id: "ProjectSaveParams" } },
            optional: false,
          },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_a929095ffe17327fccbf125512124089dfcb8ca95e05002e2ca24a00f6ce9329 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "ProjectModel",
        methodName: "search",
        path: "/project/search",
        options: { httpMethod: "GET" },
        typeParameters: [],
        parameters: [{ name: "search", type: "string", optional: false }],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_d5a0cef9611490d5f2477a75c2a53e70810c5fab21e4d33c59a307c96fb4b87d = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "SyncFixtureModel",
        methodName: "del",
        path: "/syncFixture/del",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          { name: "ids", type: { t: "array", elementsType: "number" }, optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_548a4dbf6f3f5f8718070a081e41d86eaa21e7d3e74b9a5c96d433953d676334 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "SyncFixtureModel",
        methodName: "findById",
        path: "/syncFixture/findById",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "SyncFixtureSubsetKey" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "id", type: "number", optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_96ea78e785c20e98626ad4f604fda53b36e39962396211864ee76864302df871 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "SyncFixtureModel",
        methodName: "findMany",
        path: "/syncFixture/findMany",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "SyncFixtureSubsetKey" } },
          { t: "type-param", id: "LP", constraint: { t: "ref", id: "SyncFixtureListParams" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "rawParams", type: { t: "ref", id: "LP" }, optional: true },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_a373e54843aca1620451139d6a53f107c7bc64bfbb6c06e0d2bda796bdb7811e = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "SyncFixtureModel",
        methodName: "save",
        path: "/syncFixture/save",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          {
            name: "spa",
            type: { t: "array", elementsType: { t: "ref", id: "SyncFixtureSaveParams" } },
            optional: false,
          },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_50c73a183353cb126f5f1a2d67ba7a89399318f96486a8ce9ae8aa0a1243a182 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "SyncFixtureSubModel",
        methodName: "findById",
        path: "/syncFixtureSub/findById",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "SyncFixtureSubsetKey" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "id", type: "number", optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_78cd8cd76e84104c2a55ff16fec9171e01f3ac4135855f1921da9b78f6036711 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "TagModel",
        methodName: "cached",
        path: "/tag/cached",
        options: { httpMethod: "GET" },
        typeParameters: [],
        parameters: [],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_ce528840ee746f05602b0b2063bf65c4e301e0f9f9a4beea72296284830c0515 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "TagModel",
        methodName: "del",
        path: "/tag/del",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          { name: "ids", type: { t: "array", elementsType: "number" }, optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_b90575d979f5451db19af6034513b9fa1df5cf58a12481cca63e4205ee928d3b = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "TagModel",
        methodName: "deleteCached",
        path: "/tag/deleteCached",
        options: { httpMethod: "GET" },
        typeParameters: [],
        parameters: [],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_5f0ea045f1204ded14d9fe917f1ebfbcc0e2bb2a1f4bc0cba2fbf31d4c311c8c = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "TagModel",
        methodName: "findById",
        path: "/tag/findById",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "TagSubsetKey" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "id", type: "number", optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_3ab81e94719adb6eee665ff27265c584360371d18bd25294c9b56ff6c7b40abb = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "TagModel",
        methodName: "findMany",
        path: "/tag/findMany",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "TagSubsetKey" } },
          { t: "type-param", id: "LP", constraint: { t: "ref", id: "TagListParams" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "rawParams", type: { t: "ref", id: "LP" }, optional: true },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_45526a22b484fa4d4c9353f226c99ebde47f381998c031950c0ce379dbc69957 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "TagModel",
        methodName: "runWorkflow",
        path: "/tag/runWorkflow",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_13f5251ef10b1812e13298ce82446e8685b3c3d9d4ed32db4663c8a7374b26d3 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "TagModel",
        methodName: "save",
        path: "/tag/save",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          {
            name: "spa",
            type: { t: "array", elementsType: { t: "ref", id: "TagSaveParams" } },
            optional: false,
          },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_b2c2b9110f91b40eb964084979958c6c643c7e8fdf7a485061041406f4c59459 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "TelemetryFrame",
        methodName: "getSnapshot",
        path: "/telemetry/getSnapshot",
        options: { httpMethod: "GET" },
        typeParameters: [],
        parameters: [
          { name: "rawParams", type: { t: "ref", id: "TelemetryQueryParams" }, optional: true },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_be9ced6b92d7fb3bc3d21ecbe27d31c8b8a792d06c0aa87ccd8624d37d6566a4 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "UserModel",
        methodName: "del",
        path: "/user/del",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          { name: "ids", type: { t: "array", elementsType: "string" }, optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_1db9bb97601d63a1cdf9010f6ea65dd06ccfe7bc0273f3691a117ea0308d0584 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "UserModel",
        methodName: "findById",
        path: "/user/findById",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "UserSubsetKey" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "id", type: "string", optional: false },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_775bdca0344972ecb640bec2196ad46c001e118e5124a2ca96d21b142d989301 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "UserModel",
        methodName: "findMany",
        path: "/user/findMany",
        options: { httpMethod: "GET" },
        typeParameters: [
          { t: "type-param", id: "T", constraint: { t: "ref", id: "UserSubsetKey" } },
          { t: "type-param", id: "LP", constraint: { t: "ref", id: "UserListParams" } },
        ],
        parameters: [
          { name: "subset", type: { t: "ref", id: "T" }, optional: false },
          { name: "rawParams", type: { t: "ref", id: "LP" }, optional: true },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_15a76b55788cd9f11a82a07977d11749ccdc9cb2ed458b68e170e2a06d2426d2 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "UserModel",
        methodName: "getMyIP",
        path: "/user/getMyIP",
        options: { httpMethod: "GET" },
        typeParameters: [],
        parameters: [],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_c0c4552a6bc25e7454959dc996c81d836e88aeb3cb4263bbfde044d4812d131d = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "UserModel",
        methodName: "save",
        path: "/user/save",
        options: { httpMethod: "POST" },
        typeParameters: [],
        parameters: [
          {
            name: "spa",
            type: { t: "array", elementsType: { t: "ref", id: "UserSaveParams" } },
            optional: false,
          },
        ],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validator_f107363c011e4a1f2084e1a5763fa96ef063849eef982abc609082b687eec8a9 = compile(
  fastifyCaster(
    getZodObjectFromApi(
      {
        modelName: "UserModel",
        methodName: "trxTest",
        path: "/user/trxTest",
        options: { httpMethod: "GET" },
        typeParameters: [],
        parameters: [],
        returnType: "unknown",
      },
      { ...types },
    ),
  ),
);
export const validators = new Map([
  [
    '["AuditEventModel","del","POST","/auditEvent/del"]',
    validator_167a3b99f09bee1d82f7dff5188522d7d10cc77f541484728120dd644a884e6f,
  ],
  [
    '["AuditEventModel","findById","GET","/auditEvent/findById"]',
    validator_4dc7e31b5673abab878ded5d811747377b4bf4e82bd03349e8ae43bc3071fb59,
  ],
  [
    '["AuditEventModel","findMany","GET","/auditEvent/findMany"]',
    validator_2ef4cf5b7b7995caec6e9387a1216dc2fa306c6ab1c586c79017237bb19641ef,
  ],
  [
    '["AuditEventModel","save","POST","/auditEvent/save"]',
    validator_62dcd1005d1a77f6c5b9ab692bd84493cf17bd9cf29cfa3326de1eeeb9898555,
  ],
  [
    '["AuditLogModel","findById","GET","/auditLog/findById"]',
    validator_30ceb797e488937e3187a37ea2c67e7a5669fa0d60834ec7fc7bef70f02ad9b2,
  ],
  [
    '["AuditLogModel","findMany","GET","/auditLog/findMany"]',
    validator_8d9def3b24278bbc04a675227df8c75fe2e3214d7314a3ab2409aea06f0b3a26,
  ],
  [
    '["CompanyModel","del","POST","/company/del"]',
    validator_8740c2d14bcb3bd4a0d56e7fb1a8b586edf30b725f648183fe87c3c5f3494952,
  ],
  [
    '["CompanyModel","findById","GET","/company/findById"]',
    validator_c7853b58dbe9c2cff6bc67a7854942fd886c8d20095f637ac8e5dc29860fbea9,
  ],
  [
    '["CompanyModel","findMany","GET","/company/findMany"]',
    validator_a95c9563ed739d0d0374d44eea4ccae517943f6f5f15eb3b00e975185a74af2e,
  ],
  [
    '["CompanyModel","save","POST","/company/save"]',
    validator_75628277854620350e209becf9ae245fb3e4c77044e20f2c1908d33fe5fb3a2d,
  ],
  [
    '["DashboardFrame","getRecentActivity","GET","/dashboard/getRecentActivity"]',
    validator_53c5538937e866b0be17ccc45569d52b6dfbd9a3d3cd1324a493b4e6f78d1d68,
  ],
  [
    '["DashboardFrame","getStats","GET","/dashboard/getStats"]',
    validator_91c6d0189895efff8df0e5aad7834f4d4a91f54c28be2ee3d70e8702c7a4ea64,
  ],
  [
    '["DepartmentModel","del","POST","/department/del"]',
    validator_ddf7c151caeacf4725b6798a66ce79336ddcf53f77d6191e36cd53d97d89f047,
  ],
  [
    '["DepartmentModel","findById","GET","/department/findById"]',
    validator_d4affc8adec9120043ec1478ddb7fc91dc0fa80aff11bca1ea1b54486ec915d8,
  ],
  [
    '["DepartmentModel","findMany","GET","/department/findMany"]',
    validator_98374409464803da5a3670859d5875d1765920dbbeea3bc22dfc10740ea3dcf0,
  ],
  [
    '["DepartmentModel","save","POST","/department/save"]',
    validator_27b42af2b3ae4aa12a8c53cd7df156c40203452547e2f0c522b3bdfeb728793c,
  ],
  [
    '["DocumentModel","del","POST","/document/del"]',
    validator_c1918247b59551f2c48735d133c8acecb502cbcdd611e45cdb9295c6be12d404,
  ],
  [
    '["DocumentModel","embedQuery","GET","/document/embedQuery"]',
    validator_c20108e0f71ac1eda24e725a86a726358a330ddc78eddbe021e2109ba9f5726c,
  ],
  [
    '["DocumentModel","findById","GET","/document/findById"]',
    validator_0bb1138b2d652b761b4e80e67dc3a596a64afb978c5e166b0ae80209589e5319,
  ],
  [
    '["DocumentModel","findMany","GET","/document/findMany"]',
    validator_a2a632abcf08bf03960c3eb64581a081c4b265ff229ffde23e140d693748bac0,
  ],
  [
    '["DocumentModel","findManySemanticByVector","POST","/document/findManySemanticByVector"]',
    validator_27d0983d864c4a32331d1628255e0750f3994a20734bb6807b7dc2d37323d31e,
  ],
  [
    '["DocumentModel","save","POST","/document/save"]',
    validator_0a209dbad34248388f5559f354e0e4677efe074c515a195165ec2a13ef3b203d,
  ],
  [
    '["EmployeeModel","del","POST","/employee/del"]',
    validator_5c32f187399fda641cb3483d6112a4135a984b6af4cce099ab9896e34dde7efc,
  ],
  [
    '["EmployeeModel","findById","GET","/employee/findById"]',
    validator_34cc8666412154ad9e9359cde590015609a5b5ae0ab770a0cafd3a19228bcfa6,
  ],
  [
    '["EmployeeModel","findMany","GET","/employee/findMany"]',
    validator_79e0d586a7d856a88f115288e6c99098e5bc0335f47a3d935336d7325d92aa68,
  ],
  [
    '["EmployeeModel","save","POST","/employee/save"]',
    validator_17d227a9343f1c5647c749fd3b4ae9dbe380d0e7e57ffea0c9969a7b723ba551,
  ],
  [
    '["FileModel","del","POST","/file/del"]',
    validator_af47a8302df8a99240372ea3a546a01413909b0b4e27d96a33aa4c383d0dd78b,
  ],
  [
    '["FileModel","findById","GET","/file/findById"]',
    validator_6ed6527d98a5ed0c422b00e78c92243acde8fcc7e68bc08c1cf6dd44e9ea7b12,
  ],
  [
    '["FileModel","findMany","GET","/file/findMany"]',
    validator_6e58649ac140c3f53f09d6da6a65d0de7d4aea2a5743e3aa383f6f024a29bbcc,
  ],
  [
    '["FileModel","inlineUpload","POST","/file/inlineUpload"]',
    validator_371aaa1abe5ac19b58748aeec97c32d1465a95fa73c955c4e410589439501997,
  ],
  [
    '["FileModel","inlineUploadFlat","POST","/file/inlineUploadFlat"]',
    validator_403c50374f4ac845b442346510e9d1a7cb4ffcffd3b1c14d30b41cf01dc541c8,
  ],
  [
    '["FileModel","save","POST","/file/save"]',
    validator_69e7352e794763142502350349c0a741f9caa0497b81fb879e58573a836b29a1,
  ],
  [
    '["FileModel","testBufferUpload","POST","/file/testBufferUpload"]',
    validator_675a0e49cbe4847e6ab8b000fc5204e46eefe5d7a66145a797fdf02e2a4cf75b,
  ],
  [
    '["FileModel","testStreamUpload","POST","/file/testStreamUpload"]',
    validator_d74432dc5f16244648418b7d9c4d88064868c74083e024f0c38784f3fa12b9a5,
  ],
  [
    '["FileModel","upload","POST","/file/upload"]',
    validator_0a2299ec6127c55a6b2b26d8ddee2814920923f05616862f3d75a17edde973e3,
  ],
  [
    '["MilestoneModel","complete","POST","/milestone/complete"]',
    validator_b6699f08e7a728edbeaaab02be3e3fff03a996b7f183534e00afbf1aa4af5701,
  ],
  [
    '["MilestoneModel","del","POST","/milestone/del"]',
    validator_93d8443d3a508f190d45917f7c4a3fb1dc94062b2df722d955b041e9bcad38f1,
  ],
  [
    '["MilestoneModel","findById","GET","/milestone/findById"]',
    validator_0f27b410ce2c0935cd1695a973cacaf5f01fedf8ae97da48985e2b09696ad52d,
  ],
  [
    '["MilestoneModel","findMany","GET","/milestone/findMany"]',
    validator_0bca11f94cae8aa2f19603a0a78b9c34c097179e0a1a8292e54e440e12dbc832,
  ],
  [
    '["MilestoneModel","save","POST","/milestone/save"]',
    validator_31371e7ebf8118041d7728c935aac3830ca283e2655aba1ebcdae350850a9247,
  ],
  [
    '["MilestoneModel","uncomplete","POST","/milestone/uncomplete"]',
    validator_704f003e3e0a652718a51ab9ef1267369aef6301ed58f0c9109c651aaa410f7e,
  ],
  [
    '["ProjectModel","ask","GET","/project/ask"]',
    validator_796074ae58e29bc79b88c28b6b577cc7705567b49669f908430cbc4741d2db1b,
  ],
  [
    '["ProjectModel","del","POST","/project/del"]',
    validator_b8b8c02e0dd78cfcf37b1b7dc2b0d974eedb4e2169185373f4650abfdc04e53b,
  ],
  [
    '["ProjectModel","findById","GET","/project/findById"]',
    validator_1f9325369f38a096dcebac112c33d05326f5846b1bbba423ebd3d2f35fc8e832,
  ],
  [
    '["ProjectModel","findMany","GET","/project/findMany"]',
    validator_dee376cf0d0499498b49f336220bff87b94548cd0febe5845f917ffb7deeb01f,
  ],
  [
    '["ProjectModel","save","POST","/project/save"]',
    validator_e70999e7a8fb7d17917270ecef0cef0a020797a365f24add9f04e6da399b8c38,
  ],
  [
    '["ProjectModel","search","GET","/project/search"]',
    validator_a929095ffe17327fccbf125512124089dfcb8ca95e05002e2ca24a00f6ce9329,
  ],
  [
    '["SyncFixtureModel","del","POST","/syncFixture/del"]',
    validator_d5a0cef9611490d5f2477a75c2a53e70810c5fab21e4d33c59a307c96fb4b87d,
  ],
  [
    '["SyncFixtureModel","findById","GET","/syncFixture/findById"]',
    validator_548a4dbf6f3f5f8718070a081e41d86eaa21e7d3e74b9a5c96d433953d676334,
  ],
  [
    '["SyncFixtureModel","findMany","GET","/syncFixture/findMany"]',
    validator_96ea78e785c20e98626ad4f604fda53b36e39962396211864ee76864302df871,
  ],
  [
    '["SyncFixtureModel","save","POST","/syncFixture/save"]',
    validator_a373e54843aca1620451139d6a53f107c7bc64bfbb6c06e0d2bda796bdb7811e,
  ],
  [
    '["SyncFixtureSubModel","findById","GET","/syncFixtureSub/findById"]',
    validator_50c73a183353cb126f5f1a2d67ba7a89399318f96486a8ce9ae8aa0a1243a182,
  ],
  [
    '["TagModel","cached","GET","/tag/cached"]',
    validator_78cd8cd76e84104c2a55ff16fec9171e01f3ac4135855f1921da9b78f6036711,
  ],
  [
    '["TagModel","del","POST","/tag/del"]',
    validator_ce528840ee746f05602b0b2063bf65c4e301e0f9f9a4beea72296284830c0515,
  ],
  [
    '["TagModel","deleteCached","GET","/tag/deleteCached"]',
    validator_b90575d979f5451db19af6034513b9fa1df5cf58a12481cca63e4205ee928d3b,
  ],
  [
    '["TagModel","findById","GET","/tag/findById"]',
    validator_5f0ea045f1204ded14d9fe917f1ebfbcc0e2bb2a1f4bc0cba2fbf31d4c311c8c,
  ],
  [
    '["TagModel","findMany","GET","/tag/findMany"]',
    validator_3ab81e94719adb6eee665ff27265c584360371d18bd25294c9b56ff6c7b40abb,
  ],
  [
    '["TagModel","runWorkflow","POST","/tag/runWorkflow"]',
    validator_45526a22b484fa4d4c9353f226c99ebde47f381998c031950c0ce379dbc69957,
  ],
  [
    '["TagModel","save","POST","/tag/save"]',
    validator_13f5251ef10b1812e13298ce82446e8685b3c3d9d4ed32db4663c8a7374b26d3,
  ],
  [
    '["TelemetryFrame","getSnapshot","GET","/telemetry/getSnapshot"]',
    validator_b2c2b9110f91b40eb964084979958c6c643c7e8fdf7a485061041406f4c59459,
  ],
  [
    '["UserModel","del","POST","/user/del"]',
    validator_be9ced6b92d7fb3bc3d21ecbe27d31c8b8a792d06c0aa87ccd8624d37d6566a4,
  ],
  [
    '["UserModel","findById","GET","/user/findById"]',
    validator_1db9bb97601d63a1cdf9010f6ea65dd06ccfe7bc0273f3691a117ea0308d0584,
  ],
  [
    '["UserModel","findMany","GET","/user/findMany"]',
    validator_775bdca0344972ecb640bec2196ad46c001e118e5124a2ca96d21b142d989301,
  ],
  [
    '["UserModel","getMyIP","GET","/user/getMyIP"]',
    validator_15a76b55788cd9f11a82a07977d11749ccdc9cb2ed458b68e170e2a06d2426d2,
  ],
  [
    '["UserModel","save","POST","/user/save"]',
    validator_c0c4552a6bc25e7454959dc996c81d836e88aeb3cb4263bbfde044d4812d131d,
  ],
  [
    '["UserModel","trxTest","GET","/user/trxTest"]',
    validator_f107363c011e4a1f2084e1a5763fa96ef063849eef982abc609082b687eec8a9,
  ],
]);
