const RELAY_PATH = "/ninepalace/v1";
const LOBBY_RELAY_PATH = "/ninepalace/v2";
const ROOM_CODE = /^[1-9][0-9]{4}$/;
const SESSION_TOKEN = /^[A-Za-z0-9_-]{32}$/;
const MAX_MESSAGE_BYTES = 64 * 1024;
const RECONNECT_MS = 60_000;

function remoteError(code) {
  return Object.assign(new Error(code), { code });
}

function relayAddress(value, lobby = false) {
  const address = typeof value === "string" ? value.trim() : "";
  if (!address) throw remoteError("remoteRelayRequired");
  let url;
  try { url = new URL(address); }
  catch { throw remoteError("remoteBadRelay"); }
  if (url.protocol === "https:") url.protocol = "wss:";
  if (url.protocol === "http:") url.protocol = "ws:";
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "wss:" && !(url.protocol === "ws:" && loopback))
    || url.username || url.password || url.search || url.hash) throw remoteError("remoteBadRelay");
  const endpoint = lobby ? LOBBY_RELAY_PATH : RELAY_PATH;
  if (url.pathname === "/" || (lobby && url.pathname === RELAY_PATH)) url.pathname = endpoint;
  if (url.pathname !== endpoint) throw remoteError("remoteBadRelay");
  return url.href;
}

module.exports = { RELAY_PATH, LOBBY_RELAY_PATH, ROOM_CODE, SESSION_TOKEN, MAX_MESSAGE_BYTES, RECONNECT_MS, remoteError, relayAddress };
