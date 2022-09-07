// import chalk from "chalk";
// import path from "path";
// import { exec, execSync } from "child_process";
// import {
//   PathAndCode,
//   SMDManager,
//   Syncer,
//   TemplateKey,
//   TemplateOptions,
// } from "@sonamu/core";
// import { api } from "@sonamu/core";
// import { GenerateOptions, SMDSpec } from "./typeframe.types";
// import { serializeZodType } from "@sonamu/core";
// import { Context } from "@sonamu/core";
// import { BadRequestException, ServiceUnavailableException } from "@sonamu/core";

// export class TypeframeModelClass {
//   @api({ httpMethod: "GET", clients: ["swr"], resourceName: "MDSpecs" })
//   async getSMDSpecs(): Promise<SMDSpec[]> {
//     const smdIds = SMDManager.getAllParentIds().sort();
//     const specs = await Promise.all(
//       smdIds.map(async (mdId) => this.getSMDSpec(mdId))
//     );

//     return specs;
//   }

//   @api({ httpMethod: "GET", clients: ["swr"], resourceName: "SimpleMDSpecs" })
//   async getSimpleSMDSpecs(): Promise<
//     {
//       mdId: string;
//       title: string;
//     }[]
//   > {
//     const mdIds = SMDManager.getAllParentIds().sort();
//     const simpleSpecs = await Promise.all(
//       mdIds.map(async (mdId) => {
//         const md = SMDManager.get(mdId);
//         return {
//           mdId,
//           title: md.title,
//         };
//       })
//     );
//     return simpleSpecs;
//   }

//   @api({ httpMethod: "GET", clients: ["swr"], resourceName: "MDSpec" })
//   async getSMDSpec(mdId: string): Promise<SMDSpec> {
//     const smd = SMDManager.get(mdId);
//     const modelName = `${mdId}Model`;
//     const currentApis = Syncer.getInstance().apis.filter(
//       (api) => api.modelName === modelName
//     );

//     const syncer = Syncer.getInstance();

//     return {
//       mdId,
//       title: smd.title,
//       props: smd.props,
//       subsets: smd.subsets,
//       types: Object.keys(smd.types).reduce((result, name) => {
//         return smd.types[name]._def
//           ? {
//               ...result,
//               [name]: serializeZodType(smd.types[name]),
//             }
//           : result;
//       }, {}),
//       enums: Object.keys(smd.enums).reduce((result, name) => {
//         return smd.enums[name]._def
//           ? {
//               ...result,
//               [name]: serializeZodType(smd.enums[name]),
//             }
//           : result;
//       }, {}),
//       apis: currentApis,
//       exists: syncer.checkExists(mdId, smd.enums),
//     };
//   }

//   @api({ httpMethod: "POST" })
//   async renderTemplate(
//     key: TemplateKey,
//     options: TemplateOptions[TemplateKey]
//   ): Promise<PathAndCode> {
//     const syncer = Syncer.getInstance();
//     const [rawResult] = await syncer.renderTemplate(key, options);

//     return rawResult;
//   }

//   @api({ httpMethod: "POST" })
//   async generateTemplate(
//     key: TemplateKey,
//     templateOptions: TemplateOptions[TemplateKey],
//     generateOptions?: GenerateOptions
//   ): Promise<void> {
//     const syncer = Syncer.getInstance();
//     await syncer.generateTemplate(key, templateOptions, generateOptions);
//   }

//   @api({ httpMethod: "GET", clients: ["window-fetch"] })
//   async runShellCommand(
//     { reply }: Context,
//     cmd: string,
//     debug?: boolean
//   ): Promise<void> {
//     reply.header("Content-type", "text/plain");
//     reply.header("Transfer-Encoding", "chunked");
//     reply.header("X-Content-Type-Options", "nosniff");

//     const child = exec(cmd, { env: { ...process.env, FORCE_COLOR: "true" } });
//     if (child.stdout && child.stderr) {
//       child.stdout.on("data", function (data) {
//         debug && process.stdout.write(data.toString());
//         reply.raw.write(data);
//       });
//       child.stderr.on("data", function (data) {
//         debug && process.stdout.write(chalk.red(data));
//         reply.raw.write(chalk.red(data));
//       });
//     }
//     child.on("close", function () {
//       reply.raw.end();
//     });
//   }

//   @api({ httpMethod: "POST" })
//   async openVscodeFor(
//     key: TemplateKey,
//     smdId: string,
//     target?: string
//   ): Promise<{ ok: true }> {
//     const syncer = Syncer.getInstance();
//     const [{ path: tplPath }] = await syncer.renderTemplate(key, { smdId });
//     if (tplPath.includes(":target/") && target === undefined) {
//       throw new BadRequestException(`타겟 지정이 필요한 key [${key}]`);
//     }

//     const codePath = path
//       .resolve(syncer.config.appRootPath, tplPath)
//       .replace("/:target/", `/${target}/`);
//     const cmd = `code ${codePath}`;
//     try {
//       execSync(cmd);
//     } catch (e) {
//       throw new ServiceUnavailableException(
//         "VSCode가 설치된 로컬 환경에서만 사용 가능합니다."
//       );
//     }

//     return {
//       ok: true,
//     };
//   }
// }
// export const TypeframeModel = new TypeframeModelClass();
