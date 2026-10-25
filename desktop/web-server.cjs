const { createServer } = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
};

const STATIC_FILES = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/styles.css", "styles.css"],
  ["/lobby.css", "lobby.css"],
  ["/match.css", "match.css"],
  ["/renderer.js", "renderer.js"],
  ["/browser-bootstrap.js", "browser-bootstrap.js"],
  ["/browser-expose.js", "browser-expose.js"],
  ["/browser-client.js", "browser-client.js"],
  ["/i18n.js", "i18n.js"],
  ["/character-select.js", "character-select.js"],
  ["/settings.js", "settings.js"],
  ["/chinese-notation.js", "chinese-notation.js"],
  ["/pwa-register.js", "pwa-register.js"],
  ["/manifest.webmanifest", "manifest.webmanifest"],
  ["/service-worker.js", "service-worker.js"],
  ["/icon-192.svg", "icon-192.svg"],
  ["/icon-512.svg", "icon-512.svg"],
  ["/assets/ninepalace-red-rook-girl.png", "assets/ninepalace-red-rook-girl.png"],
  ["/assets/ninepalace-red-horse-girl.png", "assets/ninepalace-red-horse-girl.png"],
  ["/assets/ninepalace-black-rook-loli.png", "assets/ninepalace-black-rook-loli.png"],
  ["/assets/ninepalace-black-horse-loli.png", "assets/ninepalace-black-horse-loli.png"],
  ["/assets/ninepalace-hand-red-rook.png", "assets/ninepalace-hand-red-rook.png"],
  ["/assets/ninepalace-hand-red-horse.png", "assets/ninepalace-hand-red-horse.png"],
  ["/assets/ninepalace-hand-black-rook.png", "assets/ninepalace-hand-black-rook.png"],
  ["/assets/ninepalace-hand-black-horse.png", "assets/ninepalace-hand-black-horse.png"],
  ["/vendor/xiangqi-js/xiangqi.js", "../vendor/xiangqi-js/xiangqi.js"],
]);

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const contentType = (request.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    const error = new Error("请求需要 application/json 内容类型");
    error.statusCode = 415;
    throw error;
  }
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString("utf8");
    if (Buffer.byteLength(body) > 8192) {
      const error = new Error("请求内容过大");
      error.statusCode = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(body || "{}");
  } catch {
    const error = new Error("请求 JSON 格式无效");
    error.statusCode = 400;
    throw error;
  }
}

function checkOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function createWebServer({ api, friendRooms = null, friendRoomsOnly = false, desktopDirectory = __dirname }) {
  if (!api || typeof api.getState !== "function" || typeof api.subscribe !== "function") {
    throw new TypeError("createWebServer 需要完整的 API 适配器");
  }
  const roomAttempts = new Map();
  function allowRoomOperation(request, operation, limit, windowMs) {
    const address = request.socket.remoteAddress || "unknown";
    const key = `${operation}:${address}`;
    const current = Date.now();
    const recent = (roomAttempts.get(key) || []).filter((timestamp) => timestamp > current - windowMs);
    if (recent.length >= limit) {
      roomAttempts.set(key, recent);
      return false;
    }
    recent.push(current);
    roomAttempts.set(key, recent);
    if (roomAttempts.size > 2000) {
      for (const [entry, timestamps] of roomAttempts) {
        if (!timestamps.some((timestamp) => timestamp > current - 60 * 60 * 1000)) roomAttempts.delete(entry);
      }
    }
    return true;
  }
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const headers = {
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
    };

    if (url.pathname === "/api/events") {
      if (friendRoomsOnly) return sendJson(response, 404, { message: "找不到该 API" });
      if (request.method !== "GET") return sendJson(response, 405, { message: "只支持 GET" });
      if (!checkOrigin(request)) return sendJson(response, 403, { message: "拒绝跨来源请求" });
      response.writeHead(200, {
        ...headers,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      response.write(`data: ${JSON.stringify(api.getState())}\n\n`);
      const unsubscribe = api.subscribe((state) => {
        if (!response.writableEnded) response.write(`data: ${JSON.stringify(state)}\n\n`);
      });
      const keepAlive = setInterval(() => {
        if (!response.writableEnded) response.write(": keep-alive\n\n");
      }, 20000);
      response.on("close", () => {
        clearInterval(keepAlive);
        unsubscribe?.();
      });
      return;
    }

    const roomPath = url.pathname.match(/^\/api\/rooms(?:\/([A-Z0-9]+))?(?:\/(events|legal-moves|move|resign|join))?$/i);
    if (roomPath) {
      if (!friendRooms) return sendJson(response, 404, { message: "好友房服务未启用" });
      if (!checkOrigin(request)) return sendJson(response, 403, { message: "拒绝跨来源请求" });
      const [, rawCode, action] = roomPath;
      const code = rawCode ? rawCode.toUpperCase() : "";
      const token = url.searchParams.get("token") || request.headers["x-ninepalace-room-token"] || "";
      try {
        if (action === "events") {
          if (request.method !== "GET") return sendJson(response, 405, { message: "只支持 GET" });
          const initialState = friendRooms.getState(code, token);
          response.writeHead(200, {
            ...headers,
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          });
          response.write(`data: ${JSON.stringify(initialState)}\n\n`);
          const unsubscribe = friendRooms.subscribe(code, token, (state) => {
            if (!response.writableEnded) response.write(`data: ${JSON.stringify(state)}\n\n`);
          });
          const keepAlive = setInterval(() => {
            if (!response.writableEnded) response.write(": keep-alive\n\n");
          }, 20000);
          response.on("close", () => {
            clearInterval(keepAlive);
            unsubscribe();
          });
          return;
        }
        if (!rawCode && request.method === "POST") {
          if (!allowRoomOperation(request, "create", 20, 60 * 1000)) {
            return sendJson(response, 429, { message: "创建房间请求过于频繁，请稍后再试" });
          }
          await readJson(request);
          const result = friendRooms.create();
          const inviteUrls = typeof api.getInviteUrls === "function" ? api.getInviteUrls(request) : [];
          return sendJson(response, 201, { ...result, inviteUrls });
        }
        if (rawCode && action === "join" && request.method === "POST") {
          if (!allowRoomOperation(request, "join", 30, 60 * 1000)) {
            return sendJson(response, 429, { message: "加入房间尝试过于频繁，请稍后再试" });
          }
          const body = await readJson(request);
          return sendJson(response, 200, friendRooms.join(code, body.token || null));
        }
        if (rawCode && !action && request.method === "GET") {
          return sendJson(response, 200, friendRooms.getState(code, token));
        }
        if (rawCode && action === "legal-moves" && request.method === "GET") {
          return sendJson(response, 200, friendRooms.getLegalMoves(code, token, url.searchParams.get("square")));
        }
        if (rawCode && action === "move" && request.method === "POST") {
          const body = await readJson(request);
          return sendJson(response, 200, friendRooms.submitMove(code, body.token || token, body.move));
        }
        if (rawCode && action === "resign" && request.method === "POST") {
          const body = await readJson(request);
          return sendJson(response, 200, friendRooms.resign(code, body.token || token));
        }
        return sendJson(response, 405, { message: "不支持的请求方法" });
      } catch (error) {
        return sendJson(response, error.statusCode || 500, { ok: false, message: error.message });
      }
    }

    if (url.pathname.startsWith("/api/")) {
      if (friendRoomsOnly && url.pathname !== "/api/analyze") return sendJson(response, 404, { message: "找不到该 API" });
      if (!checkOrigin(request)) return sendJson(response, 403, { message: "拒绝跨来源请求" });
      if (request.method === "GET" && url.pathname === "/api/state") {
        return sendJson(response, 200, await api.getState());
      }
      if (request.method === "GET" && url.pathname === "/api/legal-moves") {
        return sendJson(response, 200, await api.getLegalMoves(url.searchParams.get("square")));
      }
      if (request.method !== "POST") return sendJson(response, 405, { message: "不支持的请求方法" });
      try {
        if (url.pathname === "/api/analyze" && !allowRoomOperation(request, "analysis", 3, 60 * 1000)) {
          return sendJson(response, 429, { message: "复盘请求过于频繁，请稍后再试" });
        }
        const body = await readJson(request);
        let value;
        switch (url.pathname) {
          case "/api/start": value = await api.startGame(body.engineId); break;
          case "/api/move": value = await api.submitMove(body.move, body.difficulty); break;
          case "/api/undo": value = await api.undo(); break;
          case "/api/resign": value = await api.resign(); break;
          case "/api/retry-engine": value = await api.retryEngine(body.difficulty); break;
          case "/api/analyze":
            if (typeof api.analyzeGame !== "function") return sendJson(response, 404, { message: "复盘服务未启用" });
            value = await api.analyzeGame(body.moves, undefined, body.engineId);
            break;
          default: return sendJson(response, 404, { message: "找不到该 API" });
        }
        return sendJson(response, 200, value);
      } catch (error) {
        return sendJson(response, error.statusCode || 500, { ok: false, message: error.message });
      }
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { ...headers, Allow: "GET, HEAD" });
      return response.end();
    }
    const relativePath = STATIC_FILES.get(url.pathname);
    if (!relativePath) {
      response.writeHead(404, headers);
      return response.end("Not found");
    }
    const filePath = path.resolve(desktopDirectory, relativePath);
    fs.readFile(filePath, (error, content) => {
      if (error) {
        response.writeHead(404, headers);
        response.end("Not found");
        return;
      }
      response.writeHead(200, {
        ...headers,
        "Content-Type": CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
        "Cache-Control": url.pathname === "/service-worker.js" ? "no-cache" : "public, max-age=0, must-revalidate",
      });
      if (request.method === "HEAD") return response.end();
      response.end(content);
    });
  });
  return server;
}

module.exports = { createWebServer };
