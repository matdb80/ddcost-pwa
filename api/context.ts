import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "@db/schema";
import { authenticateRequest } from "./ms-auth";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User & {commercialOnly?:boolean};
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders };
  try {
    ctx.user = await authenticateRequest(opts.req.headers);
  } catch {
    // Authentication is optional at context creation;
    // protected routes use authedQuery middleware.
  }
  return ctx;
}
