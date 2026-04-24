import { PrismaAdapter } from "@auth/prisma-adapter";
import {
  getServerSession,
  type DefaultSession,
  type NextAuthOptions,
} from "next-auth";
import { type Adapter } from "next-auth/adapters";
import GitHubProvider from "next-auth/providers/github";
import EmailProvider from "next-auth/providers/email";
import GoogleProvider from "next-auth/providers/google";
import { Provider } from "next-auth/providers/index";
import { SignJWT, jwtVerify } from "jose";

import { sendSignUpEmail } from "~/server/mailer";
import { env } from "~/env";
import { db } from "~/server/db";

// HS256-signed JWT shared with the portal (Auth.js v5) for cross-app SSO.
// Both apps MUST use this exact encode/decode so cookies are interoperable.
const ssoSecret = () =>
  new TextEncoder().encode(env.NEXTAUTH_SECRET ?? "");
const SSO_JWT_ALG = "HS256";

async function ssoEncode(params: {
  token?: Record<string, unknown>;
  maxAge?: number;
}): Promise<string> {
  const { token = {}, maxAge = 30 * 24 * 60 * 60 } = params;
  return new SignJWT({ ...token })
    .setProtectedHeader({ alg: SSO_JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(ssoSecret());
}

async function ssoDecode(params: {
  token?: string;
}): Promise<Record<string, unknown> | null> {
  if (!params.token) return null;
  try {
    const { payload } = await jwtVerify(params.token, ssoSecret(), {
      algorithms: [SSO_JWT_ALG],
    });
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  // eslint-disable-next-line no-unused-vars
  interface Session extends DefaultSession {
    user: {
      id: number;
      isBetaUser: boolean;
      isAdmin: boolean;
      isWaitlisted: boolean;
      // ...other properties
      // role: UserRole;
    } & DefaultSession["user"];
  }

  // eslint-disable-next-line no-unused-vars
  interface User {
    id: number;
    isBetaUser: boolean;
    isAdmin: boolean;
    isWaitlisted: boolean;
  }
}

declare module "next-auth/jwt" {
  // eslint-disable-next-line no-unused-vars
  interface JWT {
    mosendUid?: number;
    isBetaUser?: boolean;
    isAdmin?: boolean;
    isWaitlisted?: boolean;
  }
}

/**
 * Auth providers
 */

function getProviders() {
  const providers: Provider[] = [];

  if (env.GITHUB_ID && env.GITHUB_SECRET) {
    providers.push(
      GitHubProvider({
        clientId: env.GITHUB_ID,
        clientSecret: env.GITHUB_SECRET,
        allowDangerousEmailAccountLinking: true,
        authorization: {
          params: {
            scope: "read:user user:email",
          },
        },
      })
    );
  }

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        allowDangerousEmailAccountLinking: true,
      })
    );
  }

  if (env.FROM_EMAIL) {
    providers.push(
      EmailProvider({
        from: env.FROM_EMAIL,
        async sendVerificationRequest({ identifier: email, url, token }) {
          await sendSignUpEmail(email, token, url);
        },
        async generateVerificationToken() {
          return Math.random().toString(36).substring(2, 7).toLowerCase();
        },
      })
    );
  }

  if (providers.length === 0 && process.env.SKIP_ENV_VALIDATION !== "true") {
    throw new Error("No auth providers found, need atleast one");
  }

  return providers;
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
const cookieDomain = env.AUTH_COOKIE_DOMAIN;
const useSecureCookies = env.NODE_ENV === "production";
const sessionCookieName = useSecureCookies
  ? "__Secure-next-auth.session-token"
  : "next-auth.session-token";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  jwt: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    encode: ssoEncode as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    decode: ssoDecode as any,
  },
  ...(cookieDomain
    ? {
        cookies: {
          sessionToken: {
            name: sessionCookieName,
            options: {
              httpOnly: true,
              sameSite: "lax",
              path: "/",
              secure: useSecureCookies,
              domain: cookieDomain,
            },
          },
        },
      }
    : {}),
  callbacks: {
    jwt: async ({ token, user, trigger }) => {
      // On direct sign-in within mosend, `user` comes from the Prisma adapter.
      if (user) {
        token.email = user.email ?? token.email;
      }

      // Re-hydrate local User every time mosendUid is missing (cross-app SSO
      // JWT issued by portal) or on explicit update(). Email is the shared
      // identifier across the two apps.
      const needsRehydrate =
        trigger === "update" || token.mosendUid === undefined;

      if (needsRehydrate) {
        const email = (token.email as string | undefined) ?? "";
        if (email) {
          const dbUser = await db.user.findFirst({
            where: { email: { equals: email, mode: "insensitive" } },
          });
          if (dbUser) {
            token.mosendUid = dbUser.id;
            token.isBetaUser = dbUser.isBetaUser;
            token.isAdmin =
              dbUser.isAdmin || dbUser.email === env.ADMIN_EMAIL;
            token.isWaitlisted = dbUser.isWaitlisted;
            token.email = dbUser.email ?? token.email;
            token.name = dbUser.name ?? token.name;
            token.picture = dbUser.image ?? token.picture;
          }
        }
      }
      return token;
    },
    session: ({ session, token }) => ({
      ...session,
      user: {
        ...session.user,
        id: (token.mosendUid as number | undefined) ?? 0,
        isBetaUser: Boolean(token.isBetaUser),
        isAdmin: Boolean(token.isAdmin),
        isWaitlisted: Boolean(token.isWaitlisted),
      },
    }),
  },
  adapter: PrismaAdapter(db) as Adapter,
  pages: {
    signIn: "/login",
  },
  events: {
    createUser: async ({ user }) => {
      let invitesAvailable = false;

      if (user.email) {
        const invites = await db.teamInvite.findMany({
          where: { email: user.email },
        });

        invitesAvailable = invites.length > 0;
      }

      if (
        !env.NEXT_PUBLIC_IS_CLOUD ||
        env.NODE_ENV === "development" ||
        invitesAvailable
      ) {
        await db.user.update({
          where: { id: user.id },
          data: { isBetaUser: true },
        });
      } else {
        await db.user.update({
          where: { id: user.id },
          data: { isBetaUser: true, isWaitlisted: true },
        });
      }
    },
  },
  providers: getProviders(),
};

/**
 * Wrapper for `getServerSession` so that you don't need to import the `authOptions` in every file.
 *
 * @see https://next-auth.js.org/configuration/nextjs
 */
export const getServerAuthSession = () => getServerSession(authOptions);
