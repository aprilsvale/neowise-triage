import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const PORT = 3123;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
    server = spawn(process.execPath, ["server.mjs"], {
        env: { ...process.env, PORT: String(PORT) },
        stdio: "ignore",
    });
    for (let i = 0; i < 60; i++) {
        try {
            const r = await fetch(BASE + "/");
            if (r.ok) return;
        } catch {}
        await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("server did not start");
});

after(() => server?.kill());

async function postRaw(bodyString) {
    const res = await fetch(BASE + "/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: bodyString,
    });
    return { status: res.status, body: await res.json() };
}

const post = (text) => postRaw(JSON.stringify({ text }));

const MANUAL = { status: "manual_review", topic: null, draft: null };

test("[timeout] → manual_review", async () => {
    const { status, body } = await post("[timeout]");
    assert.equal(status, 200);
    assert.deepEqual(body, MANUAL);
});

test("[error] → manual_review", async () => {
    const { body } = await post("[error]");
    assert.deepEqual(body, MANUAL);
});

test("[bad-json] → manual_review", async () => {
    const { body } = await post("[bad-json]");
    assert.deepEqual(body, MANUAL);
});

test("[bad-topic] → manual_review", async () => {
    const { body } = await post("[bad-topic]");
    assert.deepEqual(body, MANUAL);
});

test("[empty-draft] → manual_review", async () => {
    const { body } = await post("[empty-draft]");
    assert.deepEqual(body, MANUAL);
});

test("пустой text → 400 invalid_input", async () => {
    const { status, body } = await post("");
    assert.equal(status, 400);
    assert.deepEqual(body, { status: "invalid_input" });
});

test("text из пробелов → 400 invalid_input", async () => {
    const { status, body } = await post("   ");
    assert.equal(status, 400);
    assert.deepEqual(body, { status: "invalid_input" });
});

test("text не строка → 400 invalid_input", async () => {
    const { status, body } = await postRaw(JSON.stringify({ text: 123 }));
    assert.equal(status, 400);
    assert.deepEqual(body, { status: "invalid_input" });
});

test("нет поля text → 400 invalid_input", async () => {
    const { status, body } = await postRaw(JSON.stringify({}));
    assert.equal(status, 400);
    assert.deepEqual(body, { status: "invalid_input" });
});

test("битый JSON → 400 invalid_input", async () => {
    const { status, body } = await postRaw("{not json");
    assert.equal(status, 400);
    assert.deepEqual(body, { status: "invalid_input" });
});

test("happy path → ready (delivery)", async () => {
    const { status, body } = await post("Хочу узнать про доставку");
    assert.equal(status, 200);
    assert.equal(body.status, "ready");
    assert.equal(body.topic, "delivery");
    assert.equal(typeof body.draft, "string");
    assert.ok(body.draft.trim().length > 0);
});

test("happy path → ready (pricing)", async () => {
    const { body } = await post("Сколько стоит?");
    assert.equal(body.status, "ready");
    assert.equal(body.topic, "pricing");
});