import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { authSecret } from "./secrets";

/** Signing key, resolved lazily on first use (never at import/build time). */
function signingKey(): Uint8Array {
  return new TextEncoder().encode(authSecret());
}

const SESSION_COOKIE = "rsajt_session";
const SESSION_EXPIRY_HOURS = 8;

export interface SessionPayload {
  userId: string;
  sessionId: string;
}

export async function createSession(userId: string): Promise<string> {
  // Create DB session record
  const expiresAt = new Date(
    Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000
  );

  const session = await prisma.session.create({
    data: {
      userId,
      token: crypto.randomUUID(),
      expiresAt,
    },
  });

  // Sign JWT
  const token = await new SignJWT({ userId, sessionId: session.id })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${SESSION_EXPIRY_HOURS}h`)
    .setIssuedAt()
    .sign(signingKey());

  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_EXPIRY_HOURS * 60 * 60,
    path: "/",
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, signingKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;

  // Verify session exists in DB and not expired
  const dbSession = await prisma.session.findUnique({
    where: { id: session.sessionId },
    include: {
      user: {
        include: {
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: {
                    include: { permission: true },
                  },
                },
              },
            },
          },
          staff: true,
        },
      },
    },
  });

  if (!dbSession || dbSession.expiresAt < new Date()) return null;
  if (!dbSession.user.isActive) return null;

  const permissions = new Set<string>();
  for (const ur of dbSession.user.userRoles) {
    for (const rp of ur.role.rolePermissions) {
      permissions.add(rp.permission.code);
    }
  }

  const roles = dbSession.user.userRoles.map((ur) => ur.role.name);

  return {
    ...dbSession.user,
    roles,
    permissions,
    hasRole: (role: string) => roles.includes(role),
    hasPermission: (perm: string) => permissions.has(perm),
    isSuperAdmin: () => roles.includes("SUPER_ADMIN"),
  };
}

export async function deleteSession(): Promise<void> {
  const session = await getSession();
  if (session) {
    await prisma.session.deleteMany({
      where: { id: session.sessionId },
    });
  }
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
