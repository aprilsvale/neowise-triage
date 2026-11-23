import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { classify } from "./mock-ai.mjs";

const html = await readFile(new URL("./index.html", import.meta.url));
const TIMEOUT_MS = 300;
const ALLOWED_TOPICS = new Set(["delivery", "pricing", "other"]);

function json(response, status, body) {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(body));
}

async function readBody(request) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
}

function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const manualReview = (response) =>
    json(response, 200, { status: "manual_review", topic: null, draft: null });

async function handleTriage(request, response) {

    let parsed;
    try {
        parsed = JSON.parse(await readBody(request));
    } catch {
        return json(response, 400, { status: "invalid_input" });
    }


    const text = parsed?.text;
    if (typeof text !== "string" || text.trim() === "") {
        return json(response, 400, { status: "invalid_input" });
    }


    let modelOutput;
    try {
        modelOutput = await withTimeout(classify(text), TIMEOUT_MS);
    } catch {
        return manualReview(response);
    }


    let result;
    try {
        result = JSON.parse(modelOutput);
    } catch {
        return manualReview(response);
    }


    const okTopic =
        result && typeof result.topic === "string" && ALLOWED_TOPICS.has(result.topic);
    const okDraft =
        result && typeof result.draft === "string" && result.draft.trim() !== "";

    if (!okTopic || !okDraft) {
        return manualReview(response);
    }

    return json(response, 200, {
        status: "ready",
        topic: result.topic,
        draft: result.draft,
    });
}

createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(html);
        return;
    }
    if (request.method !== "POST" || request.url !== "/api/triage") {
        return json(response, 404, { status: "not_found" });
    }
    try {
        await handleTriage(request, response);
    } catch {
        json(response, 500, { status: "server_error" });
    }
}).listen(Number(process.env.PORT || 3000), "127.0.0.1");