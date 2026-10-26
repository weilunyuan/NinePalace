(function () {
  if (window.ninepalace) return;

  const listeners = new Set();
  const roomStorageKey = "ninepalace.active-room.v1";
  let lastState = null;
  let eventSource = null;
  let activeRoom = readRoomSession();

  function offlineState(message) {
    const Game = window.NinePalaceXiangqi;
    const game = new Game();
    return {
      board: game.board(),
      turn: game.turn(),
      history: [],
      phase: "home",
      status: message || "本地游戏服务未连接。请先运行 npm run web。",
      thinking: false,
      outcome: null,
      engineFailure: false,
      inCheck: false,
    };
  }

  function readRoomSession() {
    try {
      const value = JSON.parse(localStorage.getItem(roomStorageKey) || "null");
      return value && typeof value.code === "string" && typeof value.token === "string" ? value : null;
    } catch {
      return null;
    }
  }

  function storeRoomSession(session) {
    activeRoom = session;
    try {
      if (session) localStorage.setItem(roomStorageKey, JSON.stringify(session));
      else localStorage.removeItem(roomStorageKey);
    } catch {}
    reconnectEvents();
  }

  function publish(state) {
    lastState = state;
    for (const listener of listeners) listener(state);
  }

  async function request(url, options) {
    const response = await fetch(url, options);
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || `游戏服务错误（${response.status}）`);
    return result;
  }

  async function post(url, body = {}) {
    return request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function roomUrl(action = "", query = {}) {
    const url = new URL(`/api/rooms/${encodeURIComponent(activeRoom.code)}${action ? `/${action}` : ""}`, location.origin);
    url.search = new URLSearchParams({ ...query, token: activeRoom.token });
    return url;
  }

  function connectEvents() {
    if (eventSource) return;
    const url = activeRoom ? roomUrl("events") : new URL("/api/events", location.origin);
    eventSource = new EventSource(url);
    eventSource.onmessage = (event) => {
      try {
        publish(JSON.parse(event.data));
      } catch {
        // Ignore malformed events and keep the last valid board state.
      }
    };
    eventSource.onerror = () => {
      if (activeRoom && lastState) {
        publish({ ...lastState, connection: "reconnecting", status: "房间服务连接中断，正在尝试重连" });
      } else if (!activeRoom) {
        publish(offlineState());
      }
    };
  }

  function reconnectEvents() {
    eventSource?.close();
    eventSource = null;
    if (listeners.size) connectEvents();
  }

  function inviteUrls(result) {
    const bases = Array.isArray(result.inviteUrls) && result.inviteUrls.length
      ? result.inviteUrls
      : [location.origin];
    return [...new Set(bases.map((base) => {
      const url = new URL("/", base);
      url.searchParams.set("room", result.roomCode);
      return url.href;
    }))];
  }

  async function setRoomResult(result) {
    const session = { code: result.roomCode, token: result.token };
    storeRoomSession(session);
    publish(result.state);
    return { ...result, inviteUrls: inviteUrls(result) };
  }

  window.ninepalace = {
    async getState() {
      try {
        if (activeRoom) {
          const state = await request(roomUrl());
          publish(state);
          return state;
        }
        const state = await request("/api/state");
        publish(state);
        return state;
      } catch (error) {
        if (activeRoom && lastState) {
          const state = { ...lastState, connection: "reconnecting", status: "房间服务连接中断，正在尝试重连" };
          publish(state);
          return state;
        }
        return lastState || offlineState(error.message || undefined);
      }
    },
    async startGame(engineId, playerColor, difficulty) {
      try {
        storeRoomSession(null);
        const state = await post("/api/start", { engineId, playerColor, difficulty });
        publish(state);
        return state;
      } catch (error) {
        return offlineState(`无法连接本地游戏服务：${error.message}。请先运行 npm run web。`);
      }
    },
    async createRoom() {
      const result = await post("/api/rooms");
      return setRoomResult(result);
    },
    async joinRoom(code) {
      const roomCode = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
      if (roomCode.length !== 6) throw new Error("请输入 6 位房间码");
      const token = activeRoom?.code === roomCode ? activeRoom.token : null;
      const result = await post(`/api/rooms/${encodeURIComponent(roomCode)}/join`, token ? { token } : {});
      return setRoomResult(result);
    },
    async leaveRoom() {
      storeRoomSession(null);
      return this.getState();
    },
    async getLegalMoves(square) {
      try {
        if (activeRoom) return await request(roomUrl("legal-moves", { square }));
        const query = new URLSearchParams({ square });
        return await request(`/api/legal-moves?${query}`);
      } catch {
        return [];
      }
    },
    async submitMove(move, difficulty) {
      try {
        if (activeRoom) return await post(roomUrl("move").pathname, { move, token: activeRoom.token });
        return await post("/api/move", { move, difficulty });
      } catch (error) {
        return { ok: false, message: `游戏服务连接中断：${error.message}` };
      }
    },
    async undo() {
      if (activeRoom) return { ok: false, message: "好友对局中不能悔棋" };
      try { return await post("/api/undo"); }
      catch (error) { return { ok: false, message: error.message }; }
    },
    async resign() {
      try {
        if (activeRoom) return await post(roomUrl("resign").pathname, { token: activeRoom.token });
        return await post("/api/resign");
      } catch (error) {
        return { ok: false, message: error.message };
      }
    },
    async retryEngine(difficulty) {
      try { return await post("/api/retry-engine", { difficulty }); }
      catch (error) { return { ok: false, message: error.message }; }
    },
    async analyzeGame(_recordId, moves, engineId) {
      return post("/api/analyze", { moves, engineId });
    },
    onState(listener) {
      listeners.add(listener);
      connectEvents();
      if (lastState) listener(lastState);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          eventSource?.close();
          eventSource = null;
        }
      };
    },
  };

  const inviteCode = new URLSearchParams(location.search).get("room");
  const initialRequest = inviteCode ? window.ninepalace.joinRoom(inviteCode) : window.ninepalace.getState();
  initialRequest.then((result) => publish(result.state || result)).catch((error) => publish(offlineState(error.message)));
})();
