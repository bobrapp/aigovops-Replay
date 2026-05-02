import type { z } from "zod";
import { GetCurrentAuthUserResponse } from "./generated/api";

type AuthUserEnvelopeUser = z.infer<typeof GetCurrentAuthUserResponse>["user"];
export type AuthUser = Exclude<AuthUserEnvelopeUser, null>;
