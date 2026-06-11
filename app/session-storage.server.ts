import { Session } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import type { session } from "@prisma/client";
import prisma from "./db.server";

export class PrismaSessionIdStorage implements SessionStorage {
  async storeSession(session: Session): Promise<boolean> {
    const data = sessionToRow(session);
    await prisma.session.upsert({
      where: { sessionId: session.id },
      update: data,
      create: data,
    });
    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const row = await prisma.session.findUnique({ where: { sessionId: id } });
    return row ? rowToSession(row) : undefined;
  }

  async deleteSession(id: string): Promise<boolean> {
    try {
      await prisma.session.delete({ where: { sessionId: id } });
    } catch {
      // already gone
    }
    return true;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    await prisma.session.deleteMany({ where: { sessionId: { in: ids } } });
    return true;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const rows = await prisma.session.findMany({
      where: { shop },
      take: 25,
      orderBy: [{ expires: "desc" }],
    });
    return rows.map(rowToSession);
  }
}

function sessionToRow(session: Session) {
  const sessionParams = session.toObject();
  return {
    sessionId: session.id,
    shop: session.shop,
    state: session.state,
    isOnline: session.isOnline,
    scope: session.scope || null,
    expires: session.expires || null,
    accessToken: session.accessToken || "",
    userId: sessionParams.onlineAccessInfo?.associated_user.id || null,
    firstName:
      sessionParams.onlineAccessInfo?.associated_user.first_name || null,
    lastName: sessionParams.onlineAccessInfo?.associated_user.last_name || null,
    email: sessionParams.onlineAccessInfo?.associated_user.email || null,
    accountOwner:
      sessionParams.onlineAccessInfo?.associated_user.account_owner || false,
    locale: sessionParams.onlineAccessInfo?.associated_user.locale || null,
    collaborator:
      sessionParams.onlineAccessInfo?.associated_user.collaborator || false,
    emailVerified:
      sessionParams.onlineAccessInfo?.associated_user.email_verified || false,
    refreshToken: sessionParams.refreshToken || null,
    refreshTokenExpires: sessionParams.refreshTokenExpires || null,
  };
}

function rowToSession(row: session): Session {
  const sessionParams: Record<string, string | number | boolean> = {
    id: row.sessionId,
    shop: row.shop,
    state: row.state,
    isOnline: row.isOnline,
    userId: String(row.userId),
    firstName: String(row.firstName),
    lastName: String(row.lastName),
    email: String(row.email),
    locale: String(row.locale),
  };

  if (row.accountOwner !== null) {
    sessionParams.accountOwner = row.accountOwner;
  }
  if (row.collaborator !== null) {
    sessionParams.collaborator = row.collaborator;
  }
  if (row.emailVerified !== null) {
    sessionParams.emailVerified = row.emailVerified;
  }
  if (row.expires) {
    sessionParams.expires = row.expires.getTime();
  }
  if (row.scope) {
    sessionParams.scope = row.scope;
  }
  if (row.accessToken) {
    sessionParams.accessToken = row.accessToken;
  }
  if (row.refreshToken) {
    sessionParams.refreshToken = row.refreshToken;
  }
  if (row.refreshTokenExpires) {
    sessionParams.refreshTokenExpires = row.refreshTokenExpires.getTime();
  }

  return Session.fromPropertyArray(Object.entries(sessionParams), true);
}
