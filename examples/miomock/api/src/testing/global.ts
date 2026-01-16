import dotenv from "dotenv";

dotenv.config();

// sonamu.config.ts의 test 설정을 기반으로 병렬 테스트 환경을 구성합니다.
export { setup } from "sonamu/test";
