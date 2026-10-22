import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  index,
  check,
  foreignKey,
  uuid,
  primaryKey,
} from "drizzle-orm/pg-core";
import { DEFAULT_WORKSPACE_ID, type WorkspaceRole } from "../shared/workspaces";
import type { BoardElement } from "../shared/whiteboard";
import type { WorkspaceSettings } from "../shared/maps";

// Keep existing physical names and types so saved accounts and sessions remain valid.
export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique("user_email_key"),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image"),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  username: text("username").unique("user_username_key"),
  displayUsername: text("displayUsername"),
  role: text("role").notNull(),
  approved: boolean("approved").notNull(),
  avatar: text("avatar").notNull(),
  availability: text("availability").notNull(),
  statusText: text("statusText").notNull(),
  statusIcon: text("statusIcon").notNull().default(""),
  mustChangePassword: boolean("mustChangePassword").notNull(),
  disabled: boolean("disabled").notNull().default(false),
});
export const sessions = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique("session_token_key"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId").notNull(),
    method: text("method").notNull(),
    policyVersion: integer("policyVersion").notNull(),
  },
  (table) => [
    foreignKey({
      name: "session_userId_fkey",
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
    index("session_userId_idx").on(table.userId),
  ],
);
export const accounts = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId").notNull(),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({
      name: "account_userId_fkey",
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
    index("account_userId_idx").on(table.userId),
  ],
);
export const verifications = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);
export const officeSettings = pgTable(
  "office_settings",
  {
    id: integer("id").primaryKey(),
    password: boolean("password").notNull().default(true),
    sso: boolean("sso").notNull().default(false),
    version: integer("version").notNull().default(1),
  },
  (table) => [check("office_settings_id_check", sql`${table.id} = 1`)],
);
export const legacyWorkspaceSettings = pgTable(
  "workspace_settings",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull().default("Team workspace"),
    mapId: text("map_id")
      .$type<WorkspaceSettings["mapId"]>()
      .notNull()
      .default("nature-small"),
    revision: integer("revision").notNull().default(1),
    dailyMap: jsonb("daily_map")
      .$type<NonNullable<WorkspaceSettings["dailyMap"]>>()
      .notNull()
      .default({ enabled: false, date: "" }),
    features: jsonb("features")
      .$type<NonNullable<WorkspaceSettings["features"]>>()
      .notNull()
      .default({ whiteboard: true }),
  },
  (table) => [check("workspace_settings_id_check", sql`${table.id} = 1`)],
);
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdBy: text("created_by").references(() => users.id),
  mapId: text("map_id")
    .$type<WorkspaceSettings["mapId"]>()
    .notNull()
    .default("nature-small"),
  revision: integer("revision").notNull().default(1),
  features: jsonb("features")
    .$type<NonNullable<WorkspaceSettings["features"]>>()
    .notNull()
    .default({ whiteboard: true, wildlife: true, activities: true }),
  dailyMap: jsonb("daily_map")
    .$type<NonNullable<WorkspaceSettings["dailyMap"]>>()
    .notNull()
    .default({ enabled: false, date: "" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const workspaceOidc = pgTable("workspace_oidc", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull().unique(),
  issuer: text("issuer").notNull(),
  clientId: text("client_id").notNull(),
  clientSecret: text("client_secret").notNull(),
  domain: text("domain").notNull(),
  verificationToken: text("verification_token").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  enabled: boolean("enabled").notNull().default(false),
  revision: integer("revision").notNull().default(1),
});

export const memberships = pgTable(
  "workspace_memberships",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<WorkspaceRole>().notNull().default("member"),
    approved: boolean("approved").notNull().default(true),
    availability: text("availability").notNull().default("available"),
    statusText: text("status_text").notNull().default(""),
    statusIcon: text("status_icon").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("workspace_memberships_user").on(t.userId),
    check(
      "workspace_member_role",
      sql`${t.role} IN ('owner','admin','member')`,
    ),
  ],
);
export const invitations = pgTable(
  "workspace_invitations",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").$type<"admin" | "member">().notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("workspace_invitations_workspace").on(t.workspaceId),
    check("workspace_invitation_role", sql`${t.role} IN ('admin','member')`),
  ],
);
export const whiteboardScenes = pgTable("office_whiteboards", {
  id: text("id").primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .default(DEFAULT_WORKSPACE_ID)
    .references(() => workspaces.id),
  elements: jsonb("elements").$type<BoardElement[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const officeFiles = pgTable("office_files", {
  id: text("id").primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .default(DEFAULT_WORKSPACE_ID)
    .references(() => workspaces.id),
  boardId: text("board_id").notNull(),
  objectKey: text("object_key").notNull().unique("office_files_object_key_key"),
  name: text("name").notNull(),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: text("created_by").notNull().default(""),
});
export const officeAudit = pgTable(
  "office_audit",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .default(DEFAULT_WORKSPACE_ID)
      .references(() => workspaces.id),
    id: bigint("id", { mode: "bigint" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    actorName: text("actor_name"),
    targetName: text("target_name"),
    details: jsonb("details")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
  },
  (table) => [
    index("office_audit_action_id").on(table.action, table.id.desc()),
  ],
);

export const nativeHandoffs = pgTable("native_handoffs", {
  codeHash: text("code_hash").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  challenge: text("challenge").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
