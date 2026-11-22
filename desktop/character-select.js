(function () {
  const STORAGE_KEY = "ninepalace.character.v1";
  const characters = {
    "red-rook": {
      image: "ninepalace-red-rook-girl.png",
      nameKey: "redRookName",
      quoteKey: "redRookQuote",
      ariaKey: "redRookAria",
    },
    "red-horse": {
      image: "ninepalace-red-horse-white-tights.png",
      nameKey: "redHorseName",
      quoteKey: "redHorseQuote",
      ariaKey: "redHorseAria",
    },
    "black-rook": {
      image: "ninepalace-black-rook-loli.png",
      nameKey: "blackRookName",
      quoteKey: "blackRookQuote",
      ariaKey: "blackRookAria",
    },
    "black-horse": {
      image: "ninepalace-black-horse-adult.png",
      nameKey: "blackHorseName",
      quoteKey: "blackHorseQuote",
      ariaKey: "blackHorseAria",
    },
  };

  const hero = document.querySelector("#lobby-character");
  const heroQuote = document.querySelector("#lobby-character-quote");
  const companionCard = document.querySelector("#companion-card");
  const companionPortrait = document.querySelector("#companion-portrait");
  const companionName = document.querySelector("#companion-name");
  const companionQuote = document.querySelector("#companion-quote");
  const choices = [...document.querySelectorAll(".lobby-character-choice[data-character-id]")];

  function applyCharacter(id, persist = true) {
    const character = characters[id] ? id : "red-rook";
    const profile = characters[character];
    const imagePath = `./assets/${profile.image}`;
    document.body.dataset.character = character;
    hero.src = imagePath;
    companionPortrait.src = imagePath;
    heroQuote.dataset.i18n = profile.quoteKey;
    companionCard.dataset.i18nAria = profile.ariaKey;
    companionName.dataset.i18n = profile.nameKey;
    companionQuote.dataset.i18n = profile.quoteKey;
    choices.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.characterId === character));
    });
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, character); } catch {}
    }
    window.npI18n?.applyStatic();
  }

  choices.forEach((button) => {
    button.addEventListener("click", () => applyCharacter(button.dataset.characterId));
  });

  let initial = "red-rook";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (characters[saved]) initial = saved;
  } catch {}
  applyCharacter(initial, false);
})();
