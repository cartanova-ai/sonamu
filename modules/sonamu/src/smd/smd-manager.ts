import chalk from "chalk";
import { glob } from "glob";
import { dasherize, underscore, pluralize, camelize } from "inflection";
import _ from "lodash";
import path from "path";
import { SMD } from "./smd";
import { SMDInput } from "../types/types";
import { Sonamu } from "../api/sonamu";

export type SMDNamesRecord = Record<
  | "fs"
  | "fsPlural"
  | "camel"
  | "camelPlural"
  | "capital"
  | "capitalPlural"
  | "upper"
  | "constant",
  string
>;
type TableSpec = {
  name: string;
  uniqueColumns: string[];
};
class SMDManagerClass {
  private SMDs: Map<string, SMD> = new Map();
  private modulePaths: Map<string, string> = new Map();
  private tableSpecs: Map<string, TableSpec> = new Map();
  public isAutoloaded: boolean = false;

  // 경로 전달받아 모든 SMD 파일 로드
  async autoload(doSilent: boolean = false) {
    if (this.isAutoloaded) {
      return;
    }
    const pathPattern = path.join(
      Sonamu.apiRootPath,
      "/dist/application/**/*.smd.js"
    );
    !doSilent && console.log(chalk.yellow(`autoload ${pathPattern}`));

    return new Promise((resolve) => {
      glob(path.resolve(pathPattern!), (_err, files) => {
        const importPaths = files.map((filePath) =>
          path.relative(__dirname, filePath)
        );
        Promise.all(
          importPaths.map(async (importPath) => {
            const imported = await import(importPath);
            Object.values(imported).map((smdInput) =>
              this.register(smdInput as SMDInput<string>)
            );
            return imported;
          })
        ).then(() => {
          resolve("ok");
          this.isAutoloaded = true;
        });
      });
    });
  }

  register(smdInput: SMDInput<string>): void {
    const smd = new SMD(smdInput);
    this.SMDs.set(smdInput.id, smd);
  }

  get(smdId: string): SMD {
    const smd = this.SMDs.get(smdId);
    if (smd === undefined) {
      throw new Error(`존재하지 않는 SMD 요청 ${smdId}`);
    }

    return smd;
  }

  exists(smdId: string): boolean {
    const smd = this.SMDs.get(smdId);
    return smd !== undefined;
  }

  getAllIds(): string[] {
    return Array.from(SMDManager.SMDs.keys());
  }

  getAllParentIds(): string[] {
    return this.getAllIds().filter((smdId) => {
      const smd = this.get(smdId);
      return smd.parentId === undefined;
    });
  }

  getChildrenIds(parentId: string): string[] {
    return this.getAllIds().filter((smdId) => {
      const smd = this.get(smdId);
      return smd.parentId === parentId;
    });
  }

  setModulePath(key: string, modulePath: string): void {
    // console.debug(chalk.cyan(`setModulePath :: ${key} :: ${modulePath}`));
    this.modulePaths.set(key, modulePath);
  }

  getModulePath(key: string): string {
    const modulePath = this.modulePaths.get(key);
    if (modulePath === undefined) {
      throw new Error(`존재하지 않는 모듈 패스 요청 ${key}`);
    }

    return modulePath;
  }

  setTableSpec(tableSpec: TableSpec) {
    this.tableSpecs.set(tableSpec.name, tableSpec);
  }

  getTableSpec(key: string): TableSpec {
    const tableSpec = this.tableSpecs.get(key);
    if (tableSpec === undefined) {
      throw new Error(`존재하지 않는 테이블 스펙 요청 ${key}`);
    }

    return tableSpec;
  }

  getNamesFromId(smdId: string): SMDNamesRecord {
    // smdId가 단복수 동형 단어인 경우 List 붙여서 생성
    const pluralized =
      pluralize(smdId) === smdId ? `${smdId}List` : pluralize(smdId);

    return {
      fs: dasherize(underscore(smdId)).toLowerCase(),
      fsPlural: dasherize(underscore(pluralized)).toLowerCase(),
      camel: camelize(smdId, true),
      camelPlural: camelize(pluralized, true),
      capital: smdId,
      capitalPlural: pluralized,
      upper: smdId.toUpperCase(),
      constant: underscore(smdId).toUpperCase(),
    };
  }
}

export const SMDManager = new SMDManagerClass();
