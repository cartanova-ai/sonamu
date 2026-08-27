import { createAuthClient } from "better-auth/react";

type AuthClient = ReturnType<typeof createAuthClient>;

const authClient: AuthClient = createAuthClient();

export const signIn: AuthClient["signIn"] = authClient.signIn;
export const signUp: AuthClient["signUp"] = authClient.signUp;
export const useSession: AuthClient["useSession"] = authClient.useSession;
export const signOut: AuthClient["signOut"] = authClient.signOut;
