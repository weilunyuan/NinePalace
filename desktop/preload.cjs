const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ninepalace", {
  getState: () => ipcRenderer.invoke("game:get-state"),
  startGame: (engineId) => ipcRenderer.invoke("game:start", engineId),
  getLegalMoves: (square) => ipcRenderer.invoke("game:get-legal-moves", square),
  submitMove: (move, difficulty) => ipcRenderer.invoke("game:move", move, difficulty),
  undo: () => ipcRenderer.invoke("game:undo"),
  resign: () => ipcRenderer.invoke("game:resign"),
  retryEngine: (difficulty) => ipcRenderer.invoke("game:retry-engine", difficulty),
  analyzeGame: (recordId, moves, engineId) => ipcRenderer.invoke("game:analyze", recordId, moves, engineId),
  createRoom: () => ipcRenderer.invoke("room:create"),
  joinRoom: (code) => ipcRenderer.invoke("room:join", code),
  leaveRoom: () => ipcRenderer.invoke("room:leave"),
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
