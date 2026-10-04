import real from "#real/app-router-entry";
import { withPrismaScope } from "./prisma";

type Entry = {
  fetch(request: Request, env?: unknown, ctx?: unknown): Promise<Response>;
} & Record<string, unknown>;

const entry = real as unknown as Entry;

export default {
  ...entry,
  fetch(request: Request, env?: unknown, ctx?: unknown): Promise<Response> {
    return withPrismaScope(() => entry.fetch(request, env, ctx));
  },
};
