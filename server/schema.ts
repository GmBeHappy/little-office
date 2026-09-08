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
} from "drizzle-orm/pg-core";
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
  mustChangePassword: boolean("mustChangePassword").notNull(),
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
export const workspaces = pgTable(
  "workspace_settings",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull().default("Team workspace"),
    mapId: text("map_id")
      .$type<WorkspaceSettings["mapId"]>()
      .notNull()
      .default("nature-small"),
    revision: integer("revision").notNull().default(1),
    features: jsonb("features")
      .$type<NonNullable<WorkspaceSettings["features"]>>()
      .notNull()
      .default({ whiteboard: true }),
  },
  (table) => [check("workspace_settings_id_check", sql`${table.id} = 1`)],
);
export const whiteboardScenes = pgTable("office_whiteboards", {
  id: text("id").primaryKey(),
  elements: jsonb("elements").$type<BoardElement[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const officeFiles = pgTable("office_files", {
  id: text("id").primaryKey(),
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
