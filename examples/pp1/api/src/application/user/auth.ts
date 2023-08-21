import { FastifyInstance } from "fastify";
import fastifyPassport from "@fastify/passport";
import fastifySecureSession from "@fastify/secure-session";
import { UserSubsetSS } from "./user.generated";

export function setupAuth(server: FastifyInstance) {
  server.register(fastifySecureSession, {
    secret: "sonamumakesusgreat-sonamumakesusgreat",
    salt: "mq9hDxBCDbspDR6n",
    cookie: {
      domain: ".sonamu.dev",
      path: "/",
      maxAge: 60 * 60 * 24 * 100,
    },
  });
  server.register(fastifyPassport.initialize());
  server.register(fastifyPassport.secureSession());

  fastifyPassport.registerUserSerializer<UserSubsetSS, UserSubsetSS>(
    async (user, _request) => Promise.resolve(user)
  );
  fastifyPassport.registerUserDeserializer<UserSubsetSS, UserSubsetSS>(
    async (serialized, _request) => serialized
  );
}
