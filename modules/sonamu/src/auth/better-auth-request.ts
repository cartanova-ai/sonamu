import { type FastifyRequest } from "fastify";

import { convertFastifyHeadersToStandard } from "../utils/utils";
import { replaceClientIpHeaders } from "./audit-log/client-ip";

export function createBetterAuthRequest(
  request: FastifyRequest,
  ipAddressHeaders?: readonly string[],
): Request {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const headers = convertFastifyHeadersToStandard(request.headers);

  replaceClientIpHeaders(headers, request.ip, ipAddressHeaders);

  return new Request(url.toString(), {
    method: request.method,
    headers,
    ...(request.body ? { body: JSON.stringify(request.body) } : {}),
  });
}
