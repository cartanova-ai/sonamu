import { passkeyClient } from "@better-auth/passkey/client";
import { inferAdditionalFields, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const { signIn, signUp, useSession, signOut, twoFactor, passkey } = createAuthClient({
  plugins: [
    inferAdditionalFields({
      user: {
        role: { type: "string" },
        created_at: { type: "date" },
        twoFactorEnabled: { type: "boolean", nullable: true, required: false },
      },
    }),
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = "/admin/2fa-verify";
      },
    }),
    passkeyClient(),
  ],
});
