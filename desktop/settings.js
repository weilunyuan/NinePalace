(function () {
  const STORAGE_KEY = "ninepalace.preferences.v2";
  const LEGACY_STORAGE_KEY = "ninepalace.preferences.v1";
  const motionPreference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const dialog = document.querySelector("#settings-dialog");
  const openButton = document.querySelector("#settings-open");
  const engineSelect = document.querySelector("#engine-setting");
  const difficultySelect = document.querySelector("#difficulty-setting");
  const sideSelect = document.querySelector("#player-side");
  const motionSelect = document.querySelector("#motion-setting");
  const soundToggle = document.querySelector("#sound-toggle");
  let audioContext = null;

  function loadPreferences() {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      const saved = JSON.parse(current || localStorage.getItem(LEGACY_STORAGE_KEY) || "{}");
      return {
        engineId: ["pikafish", "fairy-stockfish"].includes(saved.engineId) ? saved.engineId : "pikafish",
        difficulty: ["beginner", "easy", "normal", "strong"].includes(saved.difficulty) ? saved.difficulty : "beginner",
        playerColor: saved.playerColor === "b" ? "b" : "r",
        motion: ["system", "reduce", "full"].includes(saved.motion) ? saved.motion : "system",
        // The previous version defaulted sound off. Enabling it on upgrade ensures
        // existing users hear the requested piece-drop cue on their next game.
        sound: current ? saved.sound === true : true,
      };
    } catch {
      return { engineId: "pikafish", difficulty: "beginner", playerColor: "r", motion: "system", sound: true };
    }
  }

  const preferences = loadPreferences();

  function savePreferences() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch {}
  }

  function applyMotionPreference() {
    const reduce = preferences.motion === "reduce"
      || (preferences.motion === "system" && Boolean(motionPreference?.matches));
    document.documentElement.classList.toggle("reduce-motion", reduce);
    window.dispatchEvent(new Event("ninepalace:motion-change"));
  }

  function updateControls() {
    engineSelect.value = preferences.engineId;
    difficultySelect.value = preferences.difficulty;
    sideSelect.value = preferences.playerColor;
    document.querySelector(".lobby-start-emblem").textContent = preferences.playerColor === "b" ? "將" : "帥";
    motionSelect.value = preferences.motion;
    soundToggle.checked = preferences.sound;
  }

  function getAudioContext() {
    const AudioContextType = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextType) return null;
    if (!audioContext) audioContext = new AudioContextType();
    if (audioContext.state === "suspended") void audioContext.resume();
    return audioContext;
  }

  function playMoveSound({ engine = false, finished = false } = {}) {
    if (!preferences.sound) return;
    try {
      const context = getAudioContext();
      if (!context) return;
      const start = context.currentTime;

      // Keep the existing end-of-game cue distinct from a move.
      if (finished) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(392, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.025, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.17);
        return;
      }

      // A brief filtered click plus a damped, falling-pitch body sounds closer
      // to a Xiangqi piece landing on a wooden board than a sustained beep.
      const noiseLength = Math.floor(context.sampleRate * 0.045);
      const noiseBuffer = context.createBuffer(1, noiseLength, context.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let index = 0; index < noiseData.length; index += 1) {
        noiseData[index] = (Math.random() * 2 - 1) * (1 - index / noiseData.length);
      }
      const click = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const clickGain = context.createGain();
      click.buffer = noiseBuffer;
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1900, start);
      filter.Q.setValueAtTime(0.7, start);
      clickGain.gain.setValueAtTime(0.0001, start);
      clickGain.gain.exponentialRampToValueAtTime(0.11, start + 0.002);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.045);
      click.connect(filter);
      filter.connect(clickGain);
      clickGain.connect(context.destination);
      click.start(start);
      click.stop(start + 0.05);

      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(engine ? 485 : 535, start);
      oscillator.frequency.exponentialRampToValueAtTime(engine ? 270 : 300, start + 0.09);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.045, start + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.12);
    } catch (error) {
      console.warn("NinePalace 无法播放走棋音效", error);
    }
  }

  engineSelect.addEventListener("change", () => {
    preferences.engineId = engineSelect.value === "fairy-stockfish" ? "fairy-stockfish" : "pikafish";
    savePreferences();
  });
  difficultySelect.addEventListener("change", () => {
    preferences.difficulty = difficultySelect.value;
    savePreferences();
  });
  sideSelect.addEventListener("change", () => {
    preferences.playerColor = sideSelect.value === "b" ? "b" : "r";
    savePreferences();
    updateControls();
  });
  motionSelect.addEventListener("change", () => {
    preferences.motion = motionSelect.value;
    savePreferences();
    applyMotionPreference();
  });
  soundToggle.addEventListener("change", () => {
    preferences.sound = soundToggle.checked;
    savePreferences();
    if (preferences.sound) getAudioContext();
  });
  openButton.addEventListener("click", () => {
    if (preferences.sound) getAudioContext();
    dialog.showModal();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => openButton.focus());
  motionPreference?.addEventListener?.("change", () => {
    if (preferences.motion === "system") applyMotionPreference();
  });
  document.addEventListener("pointerdown", () => {
    if (preferences.sound) getAudioContext();
  }, { passive: true });

  updateControls();
  applyMotionPreference();
  window.npSettings = { getPreferences: () => ({ ...preferences }), playMoveSound };
})();
