/**
 * SWC 빌드 명령어
 */
export const SWC_BUILD_COMMAND =
  "swc src -d dist --strip-leading-paths --source-maps -C module.type=commonjs -C jsc.parser.syntax=typescript -C jsc.parser.decorators=true -C jsc.target=es5";
