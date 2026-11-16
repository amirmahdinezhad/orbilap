import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, lstatSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const secret = /^[a-zA-Z0-9_-]{32,128}$/;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const tag = /^[a-f0-9]{64}$/;
const maxDevices = 64;
const inviteLifetime = 15 * 60 * 1000;
const freshFor = 4 * 60 * 1000;
const windowLengths = { "5-hour": 5 * 3600000, Weekly: 7 * 86400000 };

class RequestError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

function requireValue(ok, message, status = 400, code) {
  if (!ok) throw new RequestError(status, message, code);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw new RequestError(413, "The request is too large.");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new RequestError(400, "Invalid request."); }
}

function capacity(value) {
  requireValue(Number.isInteger(value) && value >= 1 && value <= maxDevices,
    "Choose a capacity from 1 to 64.");
  return value;
}

function deviceName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  requireValue(name.length > 0 && Array.from(name).length <= 64 && !/[\p{Cc}\p{Cf}]/u.test(name),
    "Use a device name with 1–64 characters.");
  return name;
}

function measurements(value, field, time) {
  requireValue(Array.isArray(value) && value.length <= 2, "Invalid measurements.");
  const keys = new Set();
  return value.map((sample) => {
    requireValue(sample && (sample.window === "5-hour" || sample.window === "Weekly") &&
      !keys.has(sample.window) && Number.isSafeInteger(sample.resetsAt) &&
      (field === "tokens" ? Number.isSafeInteger(sample.tokens) && sample.tokens >= 0
        : Number.isFinite(sample.percent) && sample.percent >= 0 && sample.percent <= 100), "Invalid measurement.");
    keys.add(sample.window);
    return { window: sample.window, resetsAt: sample.resetsAt, [field]: sample[field] };
  }).filter(sample => sample.resetsAt > time && sample.resetsAt <= time + windowLengths[sample.window]);
}

function validateShares(value, devices) {
  if (value === null) return null;
  requireValue(value && typeof value === "object" && !Array.isArray(value), "Invalid device shares.");
  const active = new Set(devices.filter(device => device.revokedAt === null).map(device => device.id));
  const shares = Object.entries(value);
  requireValue(shares.every(([id, share]) => active.has(id) && Number.isInteger(share) && share >= 0 && share <= 100) &&
    shares.reduce((sum, [, share]) => sum + share, 0) <= 100, "Device shares must total at most 100%.", 409, "invalid_shares");
  return JSON.stringify(value);
}

function currentEstimates(devices, settings, time) {
  if (settings.quota_at == null || time - settings.quota_at > freshFor) return [];
  const active = devices.filter(device => device.revokedAt === null);
  if (!active.length || active.some(device => device.sampledAt == null || time - device.sampledAt > freshFor)) return [];
  const shares = JSON.parse(settings.shares);
  const freshUntil = Math.min(settings.quota_at, ...active.map(device => device.sampledAt)) + freshFor;
  return JSON.parse(settings.quotas).flatMap(quota => {
    if (quota.resetsAt <= time) return [];
    const start = quota.resetsAt - windowLengths[quota.window];
    const reports = devices.filter(device => device.revokedAt === null || device.revokedAt >= start).map(device => ({
      device, sample: device.samples.find(sample => sample.window === quota.window && sample.resetsAt === quota.resetsAt),
    }));
    if (reports.some(({ sample }) => !sample)) return [];
    const tokens = reports.reduce((total, { sample }) => total + sample.tokens, 0);
    if (tokens === 0) return [];
    return reports.filter(({ device }) => device.revokedAt === null).map(({ device, sample }) => ({
      deviceId: device.id, window: quota.window, resetsAt: quota.resetsAt,
      percent: Math.round(quota.percent * sample.tokens / tokens * 100) / 100,
      validUntil: Math.min(quota.resetsAt, freshUntil),
      share: shares === null ? 100 / active.length : (shares[device.id] ?? null),
    }));
  });
}

export function createDeviceSync({ database, setupKey, now = Date.now }) {
  requireValue(secret.test(setupKey ?? ""), "Configure a random setup key of at least 32 characters.");
  const setupHash = Buffer.from(digest(setupKey), "hex");
  if (database !== ":memory:") {
    mkdirSync(dirname(database), { recursive: true, mode: 0o700 });
    if (lstatSync(database, { throwIfNoEntry: false })?.isSymbolicLink())
      throw new Error("The device sync database cannot be a symbolic link.");
  }
  const db = new DatabaseSync(database);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY, account_tag TEXT NOT NULL, capacity INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), secret_hash TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL, last_seen INTEGER NOT NULL, revoked_at INTEGER, samples TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS device_group ON devices(group_id);
    CREATE TABLE IF NOT EXISTS invitations (
      hash TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id),
      issuer TEXT NOT NULL REFERENCES devices(id), expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS invitation_issuer ON invitations(issuer);
    CREATE TABLE IF NOT EXISTS device_alerts (
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      window TEXT NOT NULL, resets_at INTEGER NOT NULL, percent REAL NOT NULL, share REAL NOT NULL,
      PRIMARY KEY (device_id, window, resets_at)
    );
  `);
  db.exec("BEGIN IMMEDIATE");
  try {
    const addColumn = (table, name, type) => {
      if (!db.prepare(`PRAGMA table_info(${table})`).all().some(column => column.name === name))
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
    };
    addColumn("groups", "owner_id", "TEXT");
    addColumn("groups", "shares", "TEXT");
    addColumn("groups", "quotas", "TEXT NOT NULL DEFAULT '[]'");
    addColumn("groups", "quota_at", "INTEGER");
    addColumn("devices", "samples_at", "INTEGER");
    // Existing groups keep their earliest connected device as owner.
    db.exec(`UPDATE groups SET owner_id = (SELECT id FROM devices
      WHERE group_id = groups.id AND revoked_at IS NULL ORDER BY rowid LIMIT 1) WHERE owner_id IS NULL`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    db.close();
    throw error;
  }
  const group = db.prepare("SELECT * FROM groups WHERE id = ?");
  const credential = db.prepare("SELECT * FROM devices WHERE secret_hash = ?");
  const count = db.prepare("SELECT count(*) AS n FROM devices WHERE group_id = ? AND revoked_at IS NULL");
  const add = db.prepare("INSERT INTO devices(id, group_id, secret_hash, name, last_seen) VALUES (?, ?, ?, ?, ?)");
  const list = db.prepare(`SELECT id, name, last_seen AS lastSeen, revoked_at AS revokedAt, samples, samples_at AS sampledAt
    FROM devices WHERE group_id = ? ORDER BY revoked_at IS NOT NULL, name COLLATE NOCASE, id`);
  const devicesFor = id => list.all(id).map(row => ({ ...row, samples: JSON.parse(row.samples) }));
  const recordAlert = db.prepare("INSERT OR IGNORE INTO device_alerts VALUES (?, ?, ?, ?, ?)");
  const alertsFor = db.prepare(`SELECT device_id AS deviceId, window, resets_at AS resetsAt, percent, share, devices.name AS deviceName
    FROM device_alerts JOIN devices ON devices.id = device_id
    WHERE devices.group_id = ? AND devices.revoked_at IS NULL AND resets_at > ? AND (? OR device_id = ?)`);

  function snapshot(device, time) {
    const settings = group.get(device.group_id);
    const devices = devicesFor(device.group_id);
    const estimates = currentEstimates(devices, settings, time);
    for (const estimate of estimates) {
      if (estimate.share !== null && estimate.percent > estimate.share)
        recordAlert.run(estimate.deviceId, estimate.window, estimate.resetsAt, estimate.percent, estimate.share);
    }
    return {
      deviceId: device.id, ownerDeviceId: settings.owner_id, capacity: settings.capacity,
      devices, shares: JSON.parse(settings.shares), estimates,
      alerts: alertsFor.all(device.group_id, time, Number(device.id === settings.owner_id), device.id),
    };
  }

  function handle(body, token, providedKey) {
    const time = now();
    const hash = digest(token);
    const member = credential.get(hash);
    requireValue(uuid.test(body?.groupId ?? ""), "Invalid device group.");
    if (member) {
      requireValue(member.revoked_at === null, "This device has been revoked.", 403, "member_revoked");
      requireValue(member.group_id === body.groupId, "This device belongs to another group.", 403);
    }

    if (body.action === "create" || body.action === "join") {
      // A repeat after a lost response returns the original membership.
      if (member) return snapshot(member, time);
      requireValue(uuid.test(body.deviceId ?? "") && tag.test(body.accountTag ?? ""), "Invalid device registration.");
      const name = deviceName(body.name);
      if (body.action === "create") {
        const provided = Buffer.from(digest(providedKey ?? ""), "hex");
        requireValue(timingSafeEqual(provided, setupHash), "The server setup key was rejected.", 401);
        requireValue(!group.get(body.groupId), "This group already exists.", 409);
        db.prepare("INSERT INTO groups(id, account_tag, capacity, owner_id) VALUES (?, ?, ?, ?)")
          .run(body.groupId, body.accountTag, capacity(body.capacity), body.deviceId);
      } else {
        requireValue(secret.test(body.invitation ?? ""), "Invalid invitation.");
        const invitationHash = digest(body.invitation);
        const invite = db.prepare("SELECT * FROM invitations WHERE hash = ?").get(invitationHash);
        const settings = group.get(body.groupId);
        requireValue(invite && invite.group_id === body.groupId && invite.expires_at > time && invite.issuer === settings?.owner_id,
          "This invitation expired or was already used. Ask for a new invitation.", 410);
        requireValue(settings.account_tag === body.accountTag, "Add the same provider account before joining.", 403);
        requireValue(count.get(body.groupId).n < settings.capacity,
          "All device slots are in use. Increase capacity or revoke a device.", 409);
        db.prepare("DELETE FROM invitations WHERE hash = ?").run(invitationHash);
      }
      add.run(body.deviceId, body.groupId, hash, name, time);
      return snapshot(credential.get(hash), time);
    }

    requireValue(member, "This device has not joined the group.", 401, "member_missing");
    const settings = group.get(member.group_id);
    const isOwner = member.id === settings.owner_id;
    requireValue(body.action === "status" || isOwner, "Only the owner Mac can manage this group.", 403, "owner_required");
    db.prepare("DELETE FROM invitations WHERE expires_at <= ?").run(time);
    db.prepare("DELETE FROM device_alerts WHERE resets_at <= ?").run(time);
    // Keep a revoked device's samples for the largest supported usage window.
    db.prepare("DELETE FROM devices WHERE group_id = ? AND revoked_at < ?").run(member.group_id, time - 8 * 86400000);
    if (body.action === "status") {
      db.prepare("UPDATE devices SET last_seen = ? WHERE id = ?").run(time, member.id);
      if (body.samples !== undefined) {
        const samples = measurements(body.samples, "tokens", time);
        db.prepare("UPDATE devices SET samples = ?, samples_at = ? WHERE id = ?").run(JSON.stringify(samples), time, member.id);
      }
      if (isOwner && body.quotas !== undefined)
        db.prepare("UPDATE groups SET quotas = ?, quota_at = ? WHERE id = ?")
          .run(JSON.stringify(measurements(body.quotas, "percent", time)), time, member.group_id);
    } else if (body.action === "shares") {
      const shares = validateShares(body.shares, devicesFor(member.group_id));
      db.prepare("UPDATE groups SET shares = ? WHERE id = ?").run(shares, member.group_id);
    } else if (body.action === "capacity") {
      const maximum = capacity(body.capacity);
      requireValue(maximum >= count.get(member.group_id).n, "Revoke a device before lowering capacity below the connected count.", 409);
      db.prepare("UPDATE groups SET capacity = ? WHERE id = ?").run(maximum, member.group_id);
    } else if (body.action === "invite") {
      requireValue(count.get(member.group_id).n < group.get(member.group_id).capacity,
        "All device slots are in use. Increase capacity or revoke a device.", 409);
      // Multiple one-time invitations can be pending; admission still checks capacity.
      requireValue(db.prepare("SELECT count(*) AS n FROM invitations WHERE group_id = ?").get(member.group_id).n < maxDevices,
        "Too many active invitations. Wait for one to be used or expire.", 429);
      const invitation = randomBytes(32).toString("base64url");
      const expiresAt = time + inviteLifetime;
      db.prepare("INSERT INTO invitations VALUES (?, ?, ?, ?)").run(digest(invitation), member.group_id, member.id, expiresAt);
      return { invitation, expiresAt };
    } else if (body.action === "revoke") {
      requireValue(uuid.test(body.deviceId ?? "") && body.deviceId !== member.id, "Choose another connected device.");
      const target = db.prepare("SELECT id, revoked_at FROM devices WHERE id = ? AND group_id = ?").get(body.deviceId, member.group_id);
      requireValue(target, "That device is not in this group.", 404);
      if (target.revoked_at !== null) return snapshot(member, time);
      const over = currentEstimates(devicesFor(member.group_id), settings, time).some(estimate =>
        estimate.deviceId === target.id && estimate.share !== null && estimate.percent > estimate.share);
      requireValue(over, "This device has no current usage above its share.", 409, "not_over_share");
      db.prepare("DELETE FROM invitations WHERE issuer = ?").run(target.id);
      const shares = JSON.parse(settings.shares);
      if (shares !== null) {
        delete shares[target.id];
        db.prepare("UPDATE groups SET shares = ? WHERE id = ?").run(JSON.stringify(shares), member.group_id);
      }
      db.prepare("UPDATE devices SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?").run(time, target.id);
    } else {
      throw new RequestError(400, "Unknown device operation.");
    }
    return snapshot(member, time);
  }

  const server = createServer({ requestTimeout: 10000, headersTimeout: 5000 }, async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(body));
    };
    try {
      requireValue(req.method === "POST" && req.url === "/v1/devices", "Not found.", 404);
      const auth = req.headers.authorization ?? "";
      requireValue(auth.startsWith("Bearer ") && secret.test(auth.slice(7)), "Device credentials required.", 401);
      requireValue(req.headers["content-type"] === "application/json", "Send a JSON request.", 415);
      const body = await readBody(req);
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = handle(body, auth.slice(7), req.headers["x-setup-key"]);
        db.exec("COMMIT");
        reply(200, result);
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    } catch (error) {
      if (error instanceof RequestError) reply(error.status, { error: error.message, code: error.code });
      else reply(500, { error: "The device sync server could not save the request." });
    }
  });
  server.on("close", () => db.close());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.umask(0o077);
  const keyFile = process.env.ORBILAP_DEVICE_SETUP_KEY_FILE;
  if (!keyFile) throw new Error("Set ORBILAP_DEVICE_SETUP_KEY_FILE to an owner-only file containing a random setup key.");
  const server = createDeviceSync({
    database: process.env.ORBILAP_DEVICE_DB ?? join(homedir(), ".orbilap-device-sync", "devices.sqlite"),
    setupKey: readFileSync(keyFile, "utf8").trim(),
  });
  const port = Number(process.env.ORBILAP_DEVICE_PORT ?? 8788);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid device sync port.");
  server.listen(port, "127.0.0.1", () => console.log(`Orbilap device sync is listening on 127.0.0.1:${port}`));
}
