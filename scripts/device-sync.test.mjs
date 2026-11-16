import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { createHash } from "node:crypto";
import { createDeviceSync } from "./device-sync.mjs";

const key = () => randomBytes(32).toString("base64url");
const member = () => ({ id: randomUUID(), key: key() });

test("two Macs see the same group, enforce capacity, and reject revoked credentials", async (t) => {
  let now = 1_795_000_000_000;
  const setup = key();
  const server = createDeviceSync({ database: ":memory:", setupKey: setup, now: () => now });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/v1/devices`;
  const groupId = randomUUID();
  const accountTag = randomBytes(32).toString("hex");
  const host = member(), laptop = member(), third = member();
  const call = async (device, body, setupKey) => {
    const headers = { Authorization: `Bearer ${device.key}`, "Content-Type": "application/json" };
    if (setupKey) headers["X-Setup-Key"] = setupKey;
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify({ groupId, ...body }) });
    return { status: res.status, body: await res.json() };
  };
  const create = { action: "create", name: "Home Mac", deviceId: host.id, capacity: 2, accountTag };
  assert.equal((await call(host, create, key())).status, 401);
  assert.equal((await call(host, create, setup)).status, 200);
  assert.equal((await call(host, create, setup)).body.devices.length, 1);
  const { invitation } = (await call(host, { action: "invite" })).body;
  const join = { action: "join", name: "Work Mac", deviceId: laptop.id, accountTag, invitation };
  assert.equal((await call(laptop, { ...join, accountTag: "0".repeat(64) })).status, 403);
  assert.equal((await call(laptop, join)).status, 200);
  assert.equal((await call(laptop, join)).body.devices.length, 2);
  assert.equal((await call(third, { ...join, deviceId: third.id })).status, 410);
  assert.equal((await call(host, { action: "invite" })).status, 409);
  assert.equal((await call(host, { action: "capacity", capacity: 1 })).status, 409);

  const reset = now + 600000;
  const usage = (tokens) => [{ window: "Weekly", resetsAt: reset, tokens }];
  const official = [{ window: "Weekly", resetsAt: reset, percent: 50 }];
  assert.equal((await call(host, { action: "status", samples: usage(60), quotas: official })).body.estimates.length, 0);
  const snapshot = (await call(laptop, { action: "status", samples: usage(40),
    quotas: [{ ...official[0], percent: 100 }] })).body;
  assert.equal(snapshot.ownerDeviceId, host.id);
  assert.equal(snapshot.estimates.find(item => item.deviceId === laptop.id).percent, 20);
  assert.equal(snapshot.alerts.length, 0);
  assert.ok(!JSON.stringify(snapshot).includes(laptop.key));
  assert.equal((await call(laptop, { action: "status", groupId: randomUUID() })).status, 403);

  for (const body of [{ action: "capacity", capacity: 3 }, { action: "invite" },
    { action: "shares", shares: { [laptop.id]: 100 } }, { action: "revoke", deviceId: host.id }]) {
    const refused = await call(laptop, body);
    assert.equal(refused.status, 403);
    assert.equal(refused.body.code, "owner_required");
  }
  assert.equal((await call(host, { action: "revoke", deviceId: laptop.id })).body.code, "not_over_share");
  assert.equal((await call(host, { action: "shares", shares: { [host.id]: 91, [laptop.id]: 10 } })).status, 409);
  assert.equal((await call(host, { action: "shares", shares: { [third.id]: 10 } })).status, 409);
  const custom = (await call(host, { action: "shares", shares: { [host.id]: 90, [laptop.id]: 10 } })).body;
  assert.equal(custom.shares[laptop.id], 10);
  assert.deepEqual(custom.alerts.map(alert => [alert.deviceId, alert.percent, alert.share]), [[laptop.id, 20, 10]]);
  assert.deepEqual((await call(laptop, { action: "status" })).body.alerts, custom.alerts);
  assert.equal((await call(host, { action: "status" })).body.alerts.length, 1);
  assert.equal((await call(host, { action: "shares", shares: { [host.id]: 10, [laptop.id]: 10 } })).body.alerts.length, 2);
  assert.equal((await call(laptop, { action: "status" })).body.alerts.length, 1);
  assert.equal((await call(host, { action: "shares", shares: null })).body.shares, null);
  assert.equal((await call(host, { action: "revoke", deviceId: laptop.id })).body.code, "not_over_share");

  await call(host, { action: "shares", shares: { [host.id]: 90, [laptop.id]: 10 } });
  now += 4 * 60_000 + 1;
  assert.equal((await call(host, { action: "status" })).body.estimates.length, 0);
  assert.equal((await call(host, { action: "revoke", deviceId: laptop.id })).body.code, "not_over_share");
  now = reset + 1;
  const next = now + 60000;
  await call(host, { action: "status", samples: [{ ...usage(60)[0], resetsAt: next }],
    quotas: [{ ...official[0], resetsAt: next }] });
  assert.equal((await call(host, { action: "status" })).body.alerts.length, 0);
  await call(laptop, { action: "status", samples: [{ ...usage(40)[0], resetsAt: next }] });
  assert.equal((await call(host, { action: "status" })).body.alerts[0].resetsAt, next);
  const revoked = (await call(host, { action: "revoke", deviceId: laptop.id })).body;
  assert.ok(!Object.hasOwn(revoked.shares, laptop.id));
  assert.equal((await call(laptop, { action: "status" })).status, 403);
  assert.equal((await call(host, { action: "capacity", capacity: 1 })).body.capacity, 1);
});

test("racing joins cannot claim the same final slot", async (t) => {
  const setup = key(), first = member(), second = member(), third = member(), fourth = member();
  const server = createDeviceSync({ database: ":memory:", setupKey: setup });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/v1/devices`;
  const groupId = randomUUID(), accountTag = randomBytes(32).toString("hex");
  const request = async (who, action, extra = {}) => {
    const res = await fetch(url, { method: "POST",
      headers: { Authorization: `Bearer ${who.key}`, "Content-Type": "application/json", "X-Setup-Key": setup },
      body: JSON.stringify({ action, groupId, accountTag, deviceId: who.id, name: "Laptop", ...extra }),
    });
    return { status: res.status, ...await res.json() };
  };
  assert.equal((await request(first, "create", { capacity: 3 })).status, 200);
  const { invitation } = await request(first, "invite");
  assert.equal((await request(second, "join", { invitation })).status, 200);
  const [inviteA, inviteB] = await Promise.all([request(first, "invite"), request(first, "invite")]);
  const results = await Promise.all([
    request(third, "join", { invitation: inviteA.invitation }),
    request(fourth, "join", { invitation: inviteB.invitation }),
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal((await request(first, "status")).devices.length, 3);
});

test("upgrading a legacy group keeps the first joined Mac as owner", async (t) => {
  const directory = mkdtempSync(joinPath(tmpdir(), "orbilap-owner-test-"));
  const filename = joinPath(directory, "devices.db");
  const first = member(), second = member(), groupId = randomUUID();
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const legacy = new DatabaseSync(filename);
  legacy.exec(`
    CREATE TABLE groups (id TEXT PRIMARY KEY, account_tag TEXT NOT NULL, capacity INTEGER NOT NULL);
    CREATE TABLE devices (id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), secret_hash TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL, last_seen INTEGER NOT NULL, revoked_at INTEGER, samples TEXT NOT NULL DEFAULT '[]');
  `);
  legacy.prepare("INSERT INTO groups VALUES (?, ?, 4)").run(groupId, hash(groupId));
  const add = legacy.prepare("INSERT INTO devices (id, group_id, secret_hash, name, last_seen) VALUES (?, ?, ?, ?, 45)");
  add.run(first.id, groupId, hash(first.key), "Zebra");
  add.run(second.id, groupId, hash(second.key), "Alba");
  legacy.close();
  const server = createDeviceSync({ database: filename, setupKey: key() }).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  });
  const status = await fetch(`http://127.0.0.1:${server.address().port}/v1/devices`, { method: "POST",
    headers: { Authorization: `Bearer ${second.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "status", groupId }),
  });
  const group = await status.json();
  assert.equal(group.ownerDeviceId, first.id);
  assert.equal(group.devices[0].id, second.id);
  assert.equal(group.shares, null);
});
