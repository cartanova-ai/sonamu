import { Sonamu } from "sonamu";

async function bootstrap() {
  await Sonamu.createServer();
}
void bootstrap();
