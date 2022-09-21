export {};
// import { z } from "zod";
// import { ApiParam, ApiParamType, SMDProp, TemplateKey } from "sonamu";

// // Zod 미지원 타입이 포함되어 있어 타입만 별도 정의
// export const SMDSpec = z.any();
// export type SMDSpec = {
//   mdId: string;
//   title: string;
//   props: SMDProp[];
//   subsets: { [key: string]: string[] };
//   types: {
//     [name: string]: SerializedZodType;
//   };
//   enums: {
//     [name: string]: SerializedZodType_Enum;
//   };
//   apis: {
//     typeParameters: ApiParamType.TypeParam[];
//     parameters: ApiParam[];
//     returnType: ApiParamType;
//     modelName: string;
//     methodName: string;
//     path: string;
//   }[];
//   exists: Partial<Record<`${TemplateKey}${string}`, boolean>>;
// };

// export const PathAndCode = z.object({
//   path: z.string(),
//   code: z.string(),
// });
// export type PathAndCode = z.infer<typeof PathAndCode>;

// export type SerializedZodType_Enum = {
//   type: "enum";
//   values: (string | number)[];
//   nullable?: true;
//   optional?: true;
// };
// export type SerializedZodType =
//   | {
//       type: "object";
//       shape: {
//         [key: string]: SerializedZodType;
//       };
//       nullable?: true;
//       optional?: true;
//     }
//   | {
//       type: "array";
//       element: SerializedZodType;
//       nullable?: true;
//       optional?: true;
//     }
//   | {
//       type: "string";
//       checks: z.ZodStringDef["checks"];
//       nullable?: true;
//       optional?: true;
//     }
//   | {
//       type: "number";
//       checks: z.ZodNumberDef["checks"];
//       nullable?: true;
//       optional?: true;
//     }
//   | {
//       type: "boolean";
//       nullable?: true;
//       optional?: true;
//     }
//   | SerializedZodType_Enum;

// export const GenerateOptions = z.object({
//   overwrite: z.boolean().optional(),
// });
// export type GenerateOptions = z.infer<typeof GenerateOptions>;
