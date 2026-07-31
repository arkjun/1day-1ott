import { passkeyClient } from "@better-auth/passkey/client";
import {
  emailOTPClient,
  inferAdditionalFields,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// 같은 origin(/api/auth) 으로 호출 → vite 프록시가 워커로 전달.
export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [
    passkeyClient(),
    emailOTPClient(),
    inferAdditionalFields({
      user: {
        lang: { type: "string", required: false, input: true },
      },
    }),
  ],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  sendVerificationEmail,
} = authClient;
