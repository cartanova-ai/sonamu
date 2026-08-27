import { compile } from "zod-compiler";

import { buildFinalValidator } from "./http-validator-schema";

const aotInput = buildFinalValidator();
export const aotOriginalParse = aotInput.parse;
export const aotValidator = compile(aotInput);
