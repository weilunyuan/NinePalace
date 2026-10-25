(function () {
  if (location.protocol !== "http:" && location.protocol !== "https:") return;
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.register("./service-worker.js").catch((error) => {
    console.warn("NinePalace 离线外壳暂时不可用", error);
  });

  const button = document.querySelector("#pwa-install-button");
  let installPrompt = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    button.hidden = false;
  });
  button.addEventListener("click", async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    installPrompt = null;
    button.hidden = true;
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    button.hidden = true;
  });
})();
