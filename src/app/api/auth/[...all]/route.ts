import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// Better-Auth-Catch-all-Handler (sign-up/sign-in/sign-out/verify-email/session).
// KEINE eigene UI -- nur der serverseitige API-Handler. Die fachlichen Pfade
// stehen in docs/specs/api-contract.md § 1.
export const { GET, POST } = toNextJsHandler(auth);
