import { test, expect } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import * as schema from "../server/schema";
import { rectangle } from "./whiteboard-fixture";
const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

test("Drizzle creates a fresh database and applies the adoption baseline only once", async () => {
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  try {
    await migrate(db, { migrationsFolder });
    await db
      .update(schema.workspaces)
      .set({ name: "Keep my workspace", revision: 9 })
      .where(eq(schema.workspaces.id, 1));
    await migrate(db, { migrationsFolder });
    expect(await db.select().from(schema.officeSettings)).toEqual([
      { id: 1, password: true, sso: false, version: 1 },
    ]);
    expect(await db.select().from(schema.workspaces)).toEqual([
      {
        id: 1,
        name: "Keep my workspace",
        mapId: "nature-small",
        revision: 9,
        features: { whiteboard: true },
      },
    ]);
    const rows = await pg.query(
      "SELECT count(*)::integer AS count FROM drizzle.__drizzle_migrations",
    );
    expect(rows.rows).toEqual([{ count: 1 }]);
    // A fresh install retains the same database-enforced unique keys and delete cascades.
    const constraints = await pg.query<{ name: string }>(
      `SELECT conname AS name FROM pg_constraint WHERE conname IN ('user_username_key','session_token_key','account_userId_fkey','session_userId_fkey') ORDER BY conname`,
    );
    expect(constraints.rows.map((r) => r.name)).toEqual([
      "account_userId_fkey",
      "session_token_key",
      "session_userId_fkey",
      "user_username_key",
    ]);
  } finally {
    await pg.close();
  }
}, 20000);

test("upgrading a populated legacy database retains settings, drawings, S3 references, identities and audit IDs", async () => {
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  try {
    await pg.exec(
      await Bun.file(
        new URL("./fixtures/legacy-schema.sql", import.meta.url),
      ).text(),
    );
    const scene = [rectangle("retained-drawing")];
    await pg.query(`INSERT INTO "user" (id,name,email,"emailVerified",username,role,approved,avatar,availability,"statusText","mustChangePassword")
      VALUES ('legacy','Legacy Owner','legacy@local.invalid',true,'legacy_owner','owner',true,'sage','busy','Existing status',false)`);
    await pg.query(
      `INSERT INTO account (id,"accountId","providerId","userId","accessToken","refreshToken","updatedAt") VALUES ('oidc','original-subject','authentik','legacy','encrypted-access','encrypted-refresh',now())`,
    );
    await pg.query(
      `INSERT INTO session (id,"expiresAt",token,"updatedAt","userId",method,"policyVersion") VALUES ('session',now()+interval '1 hour','retained-token',now(),'legacy','sso',7)`,
    );
    await pg.query(
      `INSERT INTO office_whiteboards (id,elements) VALUES ('zen-small:floor',$1::jsonb)`,
      [JSON.stringify(scene)],
    );
    await pg.query(
      `INSERT INTO office_files (id,board_id,object_key,name,size,created_by) VALUES ('snapshot','zen-small:floor','whiteboards/existing.png','Drawing.png',123,'legacy')`,
    );
    await pg.exec(`UPDATE office_settings SET password=false,sso=true,version=7;
      UPDATE workspace_settings SET name='Existing Office',map_id='zen-small',revision=8,features='{"whiteboard":false}';
      INSERT INTO office_audit(actor,action) VALUES ('legacy','Existing audit entry');`);
    const before = (
      await pg.query("SELECT id,actor,action,created_at FROM office_audit")
    ).rows;
    await migrate(db, { migrationsFolder });
    await migrate(db, { migrationsFolder });
    expect(
      (await pg.query("SELECT id,actor,action,created_at FROM office_audit"))
        .rows,
    ).toEqual(before);
    expect(
      (await db.select().from(schema.whiteboardScenes))[0].elements,
    ).toEqual(scene);
    expect((await db.select().from(schema.officeFiles))[0]).toMatchObject({
      objectKey: "whiteboards/existing.png",
      createdBy: "legacy",
      size: 123,
    });
    expect((await db.select().from(schema.accounts))[0]).toMatchObject({
      providerId: "authentik",
      accountId: "original-subject",
      accessToken: "encrypted-access",
      refreshToken: "encrypted-refresh",
    });
    expect((await db.select().from(schema.sessions))[0]).toMatchObject({
      token: "retained-token",
      method: "sso",
      policyVersion: 7,
    });
    expect((await db.select().from(schema.officeSettings))[0]).toMatchObject({
      password: false,
      sso: true,
      version: 7,
    });
    expect((await db.select().from(schema.workspaces))[0]).toMatchObject({
      name: "Existing Office",
      mapId: "zen-small",
      revision: 8,
      features: { whiteboard: false },
    });
    const [entry] = await db
      .insert(schema.officeAudit)
      .values({
        actor: "legacy",
        actorName: "Legacy Owner",
        action: "office.join",
      })
      .returning();
    expect(entry.id).toBe(2n);
    await db.delete(schema.users).where(eq(schema.users.id, "legacy"));
    expect(await db.select().from(schema.sessions)).toHaveLength(0);
    expect(await db.select().from(schema.accounts)).toHaveLength(0);
    expect(await db.select().from(schema.officeAudit)).toHaveLength(2);
    expect(await db.select().from(schema.officeFiles)).toHaveLength(1);
  } finally {
    await pg.close();
  }
}, 20000);
