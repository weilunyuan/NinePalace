const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ninepalace", {
  getState: () => ipcRenderer.invoke("game:get-state"),
  startGame: (engineId, playerColor, difficulty) => ipcRenderer.invoke("game:start", engineId, playerColor, difficulty),
  getLegalMoves: (square) => ipcRenderer.invoke("game:get-legal-moves", square),
  submitMove: (move, difficulty) => ipcRenderer.invoke("game:move", move, difficulty),
  undo: () => ipcRenderer.invoke("game:undo"),
  resign: () => ipcRenderer.invoke("game:resign"),
  retryEngine: (difficulty) => ipcRenderer.invoke("game:retry-engine", difficulty),
  analyzeGame: (recordId, moves, engineId) => ipcRenderer.invoke("game:analyze", recordId, moves, engineId),
  createRoom: (playerColor) => ipcRenderer.invoke("room:create", playerColor),
  joinRoom: (code) => ipcRenderer.invoke("room:join", code),
  leaveRoom: () => ipcRenderer.invoke("room:leave"),
  createRemoteRoom: (playerColor) => ipcRenderer.invoke("remote:create", playerColor),
  joinRemoteRoom: (code) => ipcRenderer.invoke("remote:join", code),
  cancelRemoteRoom: () => ipcRenderer.invoke("remote:cancel"),
  onState: (listener) => {
    const handler = (_event, state) => listener(state);
    ipcRenderer.on("game:state", handler);
    return () => ipcRenderer.removeListener("game:state", handler);
  },
  onAnalysisProgress: (listener) => {
    const handler = (_event, progress) => listener(progress);
    ipcRenderer.on("game:analysis-progress", handler);
    return () => ipcRenderer.removeListener("game:analysis-progress", handler);
  },
});
