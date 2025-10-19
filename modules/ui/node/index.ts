import { createServer } from "./api";

const HOST = "0.0.0.0";

export type StartServersOptions = {
  projectName: string;
  apiRootPath: string;
  port: number;
};
export async function startServers(options: StartServersOptions) {
  const { apiRootPath, projectName, port } = options;
  await createServer({
    projectName,
    listen: { port: port, host: HOST },
    apiRootPath,
    watch: true,
  });
}

/*
if (process.argv[2] === "run") {
  const apiRootPath = process.argv[3] ?? path.resolve("../../../bysuco/api");

  async function bootstrap() {
    await Sonamu.init(true, false, apiRootPath);
    await startServers(apiRootPath);
  }
  bootstrap().then(() => {
    console.log("bootstrap finished");
  });
}
DEV NOTE: This is a temporary solution to run sonamu-ui in dev mode.
*/
