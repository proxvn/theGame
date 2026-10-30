/* EMBER RUN — an endless auto-runner.
   Canvas 960x540, pixel-art assets, procedural world. */
(function () {
  "use strict";

  const W = 960;
  const H = 540;
  const GROUND = 470;
  const STEP = 1 / 60;
  const GRAVITY = 2400;
  const JUMP_V = -760;
  const HOLD_GRAVITY = 0.44;
  const COYOTE = 0.1;
  const MAX_LEVEL = 18;
  const LEVEL_METERS = 170;
  const COMBO_TIME = 2.7;
  const SLASH_DUR = 0.3;
  const PARRY_WINDOW = 0.2;
  const HERO_SCALE = 0.28;

  const HERO = {
    run: { w: 210, h: 315, ax: 162, ay: 315, n: 6 },
    jump: { w: 225, h: 340, ax: 172, ay: 340, n: 5 },
    slash: { w: 660, h: 365, ax: 312, ay: 365, n: 9 },
    idle: { w: 192, h: 378, ax: 98, ay: 378, n: 3 },
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const chance = (p) => Math.random() < p;
  const fmt = (n) =>
    Math.max(0, Math.floor(n))
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, "\u2009");
  const hash = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  };

  const $ = (sel) => document.querySelector(sel);

  const canvas = $("#game");
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = false;

  const els = {
    hud: $("#hud"),
    startScreen: $("#startScreen"),
    pauseScreen: $("#pauseScreen"),
    gameoverScreen: $("#gameoverScreen"),
    btnStart: $("#btnStart"),
    btnSound: $("#btnSound"),
    btnPause: $("#btnPause"),
    btnResume: $("#btnResume"),
    btnPauseRestart: $("#btnPauseRestart"),
    btnPauseMenu: $("#btnPauseMenu"),
    btnRestart: $("#btnRestart"),
    btnMenu: $("#btnMenu"),
    menuBest: $("#menuBest"),
    menuBestDist: $("#menuBestDist"),
    pauseScore: $("#pauseScore"),
    finalScore: $("#finalScore"),
    newRecord: $("#newRecord"),
    statDist: $("#statDist"),
    statKills: $("#statKills"),
    statParry: $("#statParry"),
    statCombo: $("#statCombo"),
    statLevel: $("#statLevel"),
    statEmbers: $("#statEmbers"),
    hearts: $("#hearts"),
    levelNum: $("#levelNum"),
    score: $("#score"),
    dist: $("#dist"),
    best: $("#best"),
    combo: $("#combo"),
    comboMult: $("#comboMult"),
    comboFill: $("#comboFill"),
    levelFill: $("#levelFill"),
    perkList: $("#perkList"),
    banner: $("#banner"),
    toast: $("#toast"),
    hint: $("#hint"),
    touch: $("#touch"),
  };

  /* ------------------------------------------------------------- assets */

  const ASSET_DEFS = [
    ["sky", "assets/game/bg/sky.png"],
    ["cloudsHi", "assets/game/bg/clouds_hi.png"],
    ["cloudsLo", "assets/game/bg/clouds_lo.png"],
    ["mountains", "assets/game/bg/mountains.png"],
    ["treeline", "assets/game/bg/treeline.png"],
    ["trees", "assets/game/bg/trees.png"],
    ["platform", "assets/game/sprites/platform.png"],
    ["tree", "assets/game/sprites/tree.png"],
    ["treeDark", "assets/game/sprites/tree_dark.png"],
    ["heroRun", "assets/game/sprites/hero_run.png"],
    ["heroJump", "assets/game/sprites/hero_jump.png"],
    ["heroSlash", "assets/game/sprites/hero_slash.png"],
    ["heroIdle", "assets/game/sprites/hero_idle.png"],
    ["bat", "assets/game/sprites/bat.png"],
    ["slime", "assets/game/sprites/slime.png"],
  ];

  const IMG = {};
  let assetsReady = false;
  let assetsLoaded = 0;

  function loadAssets() {
    return Promise.all(
      ASSET_DEFS.map(
        ([key, src]) =>
          new Promise((resolve, reject) => {
            const im = new Image();
            im.onload = () => {
              IMG[key] = im;
              assetsLoaded++;
              resolve();
            };
            im.onerror = () => reject(new Error("Не загрузился ассет: " + src));
            im.src = src;
          })
      )
    );
  }

  /* ------------------------------------------------------------- storage */

  const BEST_KEY = "emberRun.best.v1";
  const HINT_KEY = "emberRun.hintSeen.v1";

  let BEST = { score: 0, dist: 0 };
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.score === "number") BEST = { score: parsed.score, dist: parsed.dist || 0 };
    }
  } catch (e) {
    /* storage may be unavailable */
  }

  function saveBest() {
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(BEST));
    } catch (e) {
      /* ignore */
    }
  }

  function hintSeen() {
    try {
      return localStorage.getItem(HINT_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function markHintSeen() {
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch (e) {
      /* ignore */
    }
  }

  /* --------------------------------------------------------------- state */

  const G = {
    mode: "menu",
    time: 0,
    runTime: 0,
    distance: 0,
    scroll: 0,
    speed: 0,
    targetSpeed: 0,
    meters: 0,
    score: 0,
    level: 1,
    combo: 0,
    comboTimer: 0,
    maxCombo: 0,
    mult: 1,
    kills: 0,
    parries: 0,
    embers: 0,
    objects: [],
    projectiles: [],
    particles: [],
    floaters: [],
    player: null,
    spawnTimer: 0,
    emberTimer: 0,
    perkTimer: 0,
    nextSurgeIn: 0,
    surgeActive: 0,
    lastPattern: "",
    shake: 0,
    flash: 0,
    flashColor: "255,90,70",
    hitstop: 0,
    slowmoT: 0,
    timeScale: 1,
    timeScaleTarget: 1,
    night: 0,
    deadTimer: 0,
    bestBeat: false,
    ambient: [],
    hintIdx: -1,
    hintTimer: 0,
    hintOn: false,
  };

  const input = { jumpHeld: false, jumpBuffer: 0, attackBuffer: 0, parryBuffer: 0 };

  function makeAmbient() {
    return Array.from({ length: 30 }, () => ({
      x: rand(0, W),
      y: rand(90, GROUND - 30),
      z: rand(0.15, 1),
      phase: rand(0, Math.PI * 2),
      speed: rand(4, 16),
      size: rand(1, 2.6),
      leaf: chance(0.16),
      hue: chance(0.5) ? "green" : "gold",
    }));
  }

  G.ambient = makeAmbient();

  function makePlayer() {
    return {
      x: W * 0.26,
      y: GROUND,
      vy: 0,
      onGround: true,
      support: "ground",
      coyote: 0,
      jumpsLeft: 0,
      jumpsMax: 1,
      runT: 0,
      attackT: 0,
      attackCd: 0,
      attackHits: null,
      parryT: 0,
      parryCd: 0,
      parrySuccess: false,
      hp: 3,
      maxHp: 3,
      invuln: 0,
      shield: 0,
      magnet: 0,
      slowmo: 0,
      dbl: 0,
      fury: 0,
      flipT: 0,
      flipDir: 1,
      trailT: 0,
      dustT: 0,
      deathRot: 0,
      deathVY: 0,
      dead: false,
    };
  }

  /* --------------------------------------------------------------- audio */

  let muted = false;
  function toggleSound() {
    muted = !muted;
    if (window.Sound) window.Sound.setMuted(muted);
    els.btnSound.classList.toggle("muted", muted);
    els.btnSound.setAttribute("aria-label", muted ? "Включить звук" : "Выключить звук");
    if (!muted && window.Sound) window.Sound.ui();
  }

  function playSound(name, ...args) {
    if (muted || !window.Sound) return;
    const fn = window.Sound[name];
    if (typeof fn === "function") {
      try {
        fn.apply(window.Sound, args);
      } catch (e) {
        /* audio node errors should never break the game */
      }
    }
  }

  /* ---------------------------------------------------------------- glow */

  function makeGlow(rgb, size) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, "rgba(" + rgb + ",0.95)");
    grd.addColorStop(0.28, "rgba(" + rgb + ",0.55)");
    grd.addColorStop(0.65, "rgba(" + rgb + ",0.12)");
    grd.addColorStop(1, "rgba(" + rgb + ",0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return c;
  }

  const GLOW = {
    orange: makeGlow("255,170,80", 96),
    gold: makeGlow("255,209,102", 96),
    cyan: makeGlow("95,230,255", 96),
    pink: makeGlow("255,107,203", 96),
    blue: makeGlow("154,168,255", 96),
    red: makeGlow("255,90,80", 96),
    green: makeGlow("120,230,140", 96),
    white: makeGlow("255,255,255", 96),
  };

  function glow(key, x, y, size, alpha) {
    const g = GLOW[key];
    if (!g || alpha <= 0) return;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha;
    ctx.drawImage(g, x - size / 2, y - size / 2, size, size);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /* ------------------------------------------------------------- UI bits */

  const HEART_PATH =
    "M12 21s-7.4-4.6-9.2-8.9C1.3 8.1 3.2 4.6 6.7 4.6c2 0 3.4 1.1 4.3 2.6.9-1.5 2.3-2.6 4.3-2.6 3.5 0 5.4 3.5 3.9 7.5C17.4 16.4 12 21 12 21z";

  let lastHp = -1;

  function buildHearts(force) {
    const p = G.player;
    if (!p) return;
    if (!force && els.hearts.children.length === p.maxHp) return;
    els.hearts.innerHTML = "";
    for (let i = 0; i < p.maxHp; i++) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "heart");
      svg.setAttribute("viewBox", "0 0 24 24");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", HEART_PATH);
      path.setAttribute("fill", "#ff5d5d");
      svg.appendChild(path);
      els.hearts.appendChild(svg);
    }
    lastHp = -1;
  }

  function updateHearts(animate) {
    const p = G.player;
    if (!p) return;
    if (els.hearts.children.length !== p.maxHp) buildHearts(true);
    const children = els.hearts.children;
    for (let i = 0; i < children.length; i++) {
      children[i].classList.toggle("empty", i >= p.hp);
    }
    if (animate && lastHp !== -1 && p.hp !== lastHp) {
      if (p.hp < lastHp) {
        const lost = children[p.hp];
        if (lost) {
          lost.classList.remove("lose");
          void lost.getBoundingClientRect();
          lost.classList.add("lose");
        }
      } else {
        const gained = children[p.hp - 1];
        if (gained) {
          gained.classList.remove("pop");
          void gained.getBoundingClientRect();
          gained.classList.add("pop");
        }
      }
    }
    lastHp = p.hp;
  }

  const PERK_DEFS = {
    shield: {
      label: "ЩИТ",
      glyph: "Щ",
      color: "#5fe6ff",
      colorRgb: "95,230,255",
      dur: 7,
      desc: "Поглощает удары, пока держится",
    },
    magnet: {
      label: "МАГНИТ",
      glyph: "М",
      color: "#ff6bcb",
      colorRgb: "255,107,203",
      dur: 10,
      desc: "Искры сами летят к тебе",
    },
    slowmo: {
      label: "ХРОНОС",
      glyph: "Ч",
      color: "#9aa8ff",
      colorRgb: "154,168,255",
      dur: 5,
      desc: "Мир замедляется",
    },
    dbl: {
      label: "ДВОЙНОЙ ПРЫЖОК",
      glyph: "2",
      color: "#ffd166",
      colorRgb: "255,209,102",
      dur: 16,
      desc: "Ещё один прыжок в воздухе",
    },
    fury: {
      label: "ЯРОСТЬ",
      glyph: "Я",
      color: "#ff8a3c",
      colorRgb: "255,138,60",
      dur: 8,
      desc: "Удар шире, огонь сильнее",
    },
    heal: {
      label: "ЛЕЧЕНИЕ",
      glyph: "+",
      color: "#ff5d5d",
      colorRgb: "255,93,93",
      dur: 0,
      desc: "Возвращает здоровье",
    },
  };

  const chipEls = new Map();

  function chipFor(key) {
    if (chipEls.has(key)) return chipEls.get(key);
    const def = PERK_DEFS[key];
    const el = document.createElement("div");
    el.className = "perk-chip";
    el.style.setProperty("--c", def.color);
    el.innerHTML = '<span class="glyph">' + def.glyph + '</span><i class="fill"></i>';
    els.perkList.appendChild(el);
    chipEls.set(key, el);
    return el;
  }

  function clearChips() {
    chipEls.forEach((el) => el.remove());
    chipEls.clear();
  }

  function updateChips() {
    const p = G.player;
    if (!p) return;
    ["shield", "magnet", "slowmo", "dbl", "fury"].forEach((key) => {
      const t = p[key];
      if (t > 0) {
        const def = PERK_DEFS[key];
        const el = chipFor(key);
        const fill = el.querySelector(".fill");
        fill.style.transform = "scaleX(" + clamp(t / def.dur, 0, 1) + ")";
        el.classList.toggle("low", t < 2);
      } else if (chipEls.has(key)) {
        const el = chipEls.get(key);
        el.remove();
        chipEls.delete(key);
      }
    });
  }

  function showBanner(title, sub, danger) {
    els.banner.classList.remove("show");
    els.banner.classList.toggle("danger", !!danger);
    els.banner.querySelector("b").textContent = title;
    els.banner.querySelector("span").textContent = sub || "";
    void els.banner.offsetWidth;
    els.banner.classList.add("show");
  }

  function showToast(title, desc, color) {
    els.toast.classList.remove("show");
    els.toast.style.setProperty("--tc", color);
    els.toast.querySelector("b").textContent = title;
    els.toast.querySelector("span").textContent = desc;
    void els.toast.offsetWidth;
    els.toast.classList.add("show");
  }

  const TOUCH_UI = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  const HINTS = TOUCH_UI
    ? [
        "ЖМИ «ПРЫЖОК». ДЕРЖИ ДОЛЬШЕ — ВЫШЕ.",
        "«УДАР» — РУБИ ВРАГОВ НА БЕГУ.",
        "«ПАРИР» ОТРАЖАЕТ СНАРЯДЫ. ОТРАЖЁННЫЙ УБИВАЕТ.",
        "ЛОВИ РЕДКИЕ КРИСТАЛЛЫ — ОНИ ДАЮТ СИЛУ.",
      ]
    : [
        "ПРОБЕЛ — ПРЫЖОК. ДЕРЖИ ДОЛЬШЕ — ВЫШЕ.",
        "J / X — УДАР. РУБИ ВРАГОВ НА БЕГУ.",
        "K / C — ПАРИРУЙ СНАРЯДЫ. ОТРАЖЁННЫЙ СНАРЯД УБИВАЕТ.",
        "ЛОВИ РЕДКИЕ КРИСТАЛЛЫ — ОНИ ДАЮТ СИЛУ.",
      ];

  function startHints() {
    if (hintSeen()) return;
    G.hintOn = true;
    G.hintIdx = -1;
    G.hintTimer = 0;
    els.hint.classList.add("show");
    nextHint();
  }

  function nextHint() {
    G.hintIdx = (G.hintIdx + 1) % HINTS.length;
    els.hint.textContent = HINTS[G.hintIdx];
  }

  function stopHints() {
    G.hintOn = false;
    els.hint.classList.remove("show");
    markHintSeen();
  }

  /* --------------------------------------------------------------- input */

  const JUMP_KEYS = new Set(["Space", "ArrowUp", "KeyW"]);
  const ATTACK_KEYS = new Set(["KeyJ", "KeyX"]);
  const PARRY_KEYS = new Set(["KeyK", "KeyC"]);

  function unlockAudio() {
    if (window.Sound) {
      window.Sound.ensure();
    }
  }

  function pressJump() {
    unlockAudio();
    if (G.mode === "menu") {
      if (assetsReady) startGame();
      return;
    }
    if (G.mode === "gameover") {
      startGame();
      return;
    }
    if (G.mode === "dying") return;
    if (G.mode === "paused") {
      togglePause(false);
      return;
    }
    if (G.mode !== "playing") return;
    input.jumpHeld = true;
    input.jumpBuffer = 0.14;
  }

  function releaseJump() {
    input.jumpHeld = false;
    const p = G.player;
    if (p && G.mode === "playing" && !p.onGround && p.vy < -230) p.vy *= 0.52;
  }

  function pressAttack() {
    unlockAudio();
    if (G.mode !== "playing") return;
    input.attackBuffer = 0.14;
  }

  function pressParry() {
    unlockAudio();
    if (G.mode !== "playing") return;
    input.parryBuffer = 0.14;
  }

  window.addEventListener(
    "keydown",
    (e) => {
      if (JUMP_KEYS.has(e.code)) {
        e.preventDefault();
        if (!e.repeat) pressJump();
        return;
      }
      if (ATTACK_KEYS.has(e.code)) {
        e.preventDefault();
        if (!e.repeat) pressAttack();
        return;
      }
      if (PARRY_KEYS.has(e.code)) {
        e.preventDefault();
        if (!e.repeat) pressParry();
        return;
      }
      if (e.code === "KeyP" || e.code === "Escape") {
        if (G.mode === "playing" || G.mode === "paused") {
          e.preventDefault();
          togglePause();
        }
        return;
      }
      if (e.code === "KeyM") {
        e.preventDefault();
        toggleSound();
        return;
      }
      if (e.code === "KeyR") {
        if (G.mode === "gameover") startGame();
        return;
      }
      if (e.code === "Enter") {
        if (G.mode === "menu") startGame();
        else if (G.mode === "gameover") startGame();
        else if (G.mode === "paused") togglePause(false);
      }
    },
    { passive: false }
  );

  window.addEventListener("keyup", (e) => {
    if (JUMP_KEYS.has(e.code)) releaseJump();
  });

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (e) => {
    if (G.mode !== "playing") return;
    if (e.button === 2) {
      pressParry();
    } else if (e.button === 0) {
      unlockAudio();
      input.jumpHeld = true;
      input.jumpBuffer = 0.14;
    }
  });
  canvas.addEventListener("pointerup", (e) => {
    if (e.button === 0) releaseJump();
  });
  window.addEventListener("blur", () => {
    input.jumpHeld = false;
    if (G.mode === "playing") togglePause(true);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && G.mode === "playing") togglePause(true);
  });

  const portraitMq = window.matchMedia ? window.matchMedia("(orientation: portrait)") : null;
  if (portraitMq) {
    const onOrientation = () => {
      if (portraitMq.matches && window.matchMedia("(pointer: coarse)").matches && G.mode === "playing") {
        input.jumpHeld = false;
        togglePause(true);
      }
    };
    if (portraitMq.addEventListener) portraitMq.addEventListener("change", onOrientation);
    else if (portraitMq.addListener) portraitMq.addListener(onOrientation);
  }

  els.touch.querySelectorAll(".tbtn").forEach((btn) => {
    const act = btn.dataset.act;
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      unlockAudio();
      btn.classList.add("held");
      if (act === "jump") {
        if (G.mode === "playing") {
          input.jumpHeld = true;
          input.jumpBuffer = 0.14;
        } else {
          pressJump();
        }
      } else if (act === "attack") pressAttack();
      else pressParry();
    });
    const end = (e) => {
      e.preventDefault();
      btn.classList.remove("held");
      if (act === "jump") releaseJump();
    };
    btn.addEventListener("pointerup", end);
    btn.addEventListener("pointercancel", end);
    btn.addEventListener("pointerleave", end);
  });

  /* ------------------------------------------------------------ game flow */

  function setMenuBest() {
    els.menuBest.textContent = fmt(BEST.score);
    els.menuBestDist.textContent = fmt(BEST.dist) + " м";
    els.best.textContent = fmt(BEST.score);
  }

  function resetRun() {
    G.mode = "playing";
    G.runTime = 0;
    G.distance = 0;
    G.speed = 250;
    G.targetSpeed = 250;
    G.meters = 0;
    G.score = 0;
    G.level = 1;
    G.combo = 0;
    G.comboTimer = 0;
    G.maxCombo = 0;
    G.mult = 1;
    G.kills = 0;
    G.parries = 0;
    G.embers = 0;
    G.objects.length = 0;
    G.projectiles.length = 0;
    G.particles.length = 0;
    G.floaters.length = 0;
    G.player = makePlayer();
    G.spawnTimer = 1.15;
    G.emberTimer = 0.9;
    G.perkTimer = rand(19, 26);
    G.nextSurgeIn = rand(34, 46);
    G.surgeActive = 0;
    G.lastPattern = "";
    G.shake = 0;
    G.flash = 0;
    G.hitstop = 0;
    G.slowmoT = 0;
    G.timeScale = 1;
    G.timeScaleTarget = 1;
    G.night = 0;
    G.deadTimer = 0;
    G.bestBeat = false;
    G.ambient = makeAmbient();
    G.hintTimer = 0;
    buildHearts(true);
    clearChips();
    updateHearts(false);
    updateHud(true);
    updateChips();
  }

  function startGame() {
    if (!assetsReady) return;
    unlockAudio();
    playSound("start");
    if (window.Sound) {
      window.Sound.startMusic();
      window.Sound.setIntensity(1);
      window.Sound.duck(false);
    }
    resetRun();
    els.startScreen.classList.add("hidden");
    els.pauseScreen.classList.add("hidden");
    els.gameoverScreen.classList.add("hidden");
    els.hud.classList.remove("hidden");
    els.hint.classList.remove("show");
    if (!hintSeen()) startHints();
    showBanner("ВПЕРЁД", "лес не кончается");
  }

  function togglePause(forcePause) {
    if (G.mode === "playing") {
      if (forcePause === false) return;
      G.mode = "paused";
      els.pauseScore.textContent = fmt(G.score);
      els.pauseScreen.classList.remove("hidden");
      if (window.Sound) window.Sound.duck(true);
      playSound("ui");
    } else if (G.mode === "paused") {
      G.mode = "playing";
      els.pauseScreen.classList.add("hidden");
      if (window.Sound) window.Sound.duck(false);
      playSound("ui");
    }
  }

  function backToMenu() {
    G.mode = "menu";
    G.player = null;
    G.objects.length = 0;
    G.projectiles.length = 0;
    G.particles.length = 0;
    G.floaters.length = 0;
    els.pauseScreen.classList.add("hidden");
    els.gameoverScreen.classList.add("hidden");
    els.hud.classList.add("hidden");
    els.startScreen.classList.remove("hidden");
    els.hint.classList.remove("show");
    clearChips();
    setMenuBest();
    if (window.Sound) {
      window.Sound.stopMusic();
      window.Sound.duck(false);
    }
  }

  function die() {
    if (G.mode !== "playing") return;
    const p = G.player;
    p.hp = 0;
    p.dead = true;
    p.deathVY = -520;
    p.deathRot = 0;
    G.mode = "dying";
    G.deadTimer = 0;
    G.shake = 16;
    G.flash = 0.55;
    G.flashColor = "255,70,50";
    G.hitstop = 0.1;
    playSound("gameOver");
    burst(p.x, p.y - 40, {
      count: 26,
      color: "#ff8a3c",
      speed: 380,
      gravity: 900,
      life: 0.9,
      size: 3,
      type: "spark",
    });
    burst(p.x, p.y - 40, {
      count: 16,
      color: "#3a1b16",
      speed: 240,
      gravity: 500,
      life: 1.1,
      size: 4,
      type: "dust",
    });
    ring(p.x, p.y - 40, "#ff8a3c", 24, 0.5);
    updateHearts(true);
  }

  function finalizeRun() {
    G.mode = "gameover";
    G.deadTimer = 0;
    const score = Math.floor(G.score);
    const dist = Math.floor(G.meters);
    const isRecord = score > BEST.score;
    if (isRecord) BEST.score = score;
    if (dist > BEST.dist) BEST.dist = dist;
    saveBest();

    els.finalScore.textContent = fmt(score);
    els.newRecord.classList.toggle("hidden", !isRecord);
    els.statDist.textContent = fmt(dist) + " м";
    els.statKills.textContent = fmt(G.kills);
    els.statParry.textContent = fmt(G.parries);
    els.statCombo.textContent = "×" + (1 + Math.min(5, Math.floor(G.maxCombo / 7)));
    els.statLevel.textContent = String(G.level);
    els.statEmbers.textContent = fmt(G.embers);
    els.gameoverScreen.classList.remove("hidden");
    els.hud.classList.add("hidden");
    setMenuBest();
    if (isRecord) playSound("record");
    if (window.Sound) window.Sound.duck(true);
  }

  /* ------------------------------------------------------------- spawner */

  function choosePattern() {
    const lv = G.level;
    const table = [
      { w: 10, fn: patSpike, name: "spike" },
      { w: 10, fn: patSlime, name: "slime" },
      { w: 11, fn: patBat, name: "bat" },
      { w: 6, fn: patEmberRun, name: "ember" },
      { w: lv >= 2 ? 8 : 0, fn: patSpikesDouble, name: "spikes2" },
      { w: lv >= 3 ? 7 : 0, fn: patSlimeSpike, name: "slimeSpike" },
      { w: lv >= 3 ? 7 : 0, fn: patBatPair, name: "batPair" },
      { w: lv >= 4 ? 6 : 0, fn: patBatLow, name: "batLow" },
      { w: lv >= 4 ? 6 : 0, fn: patBatSpike, name: "batSpike" },
      { w: lv >= 4 ? 7 : 0, fn: patCharger, name: "charger" },
      { w: lv >= 6 ? 6 : 0, fn: patChargerSpike, name: "chargerSpike" },
      { w: lv >= 5 ? 7 : 0, fn: patSpitter, name: "spitter" },
      { w: lv >= 8 ? 5 : 0, fn: patSpitterBat, name: "spitterBat" },
      { w: lv >= 3 ? 8 : 0, fn: patSaw, name: "saw" },
      { w: lv >= 5 ? 6 : 0, fn: patSawPendulum, name: "sawPend" },
      { w: lv >= 7 ? 5 : 0, fn: patSawPair, name: "sawPair" },
      { w: lv >= 3 ? 7 : 0, fn: patOrb, name: "orb" },
      { w: lv >= 2 ? 7 : 0, fn: patPlatform, name: "platform" },
      { w: lv >= 8 ? 4 : 0, fn: patGauntlet, name: "gauntlet" },
      { w: lv >= 6 ? 5 : 0, fn: patBatWave, name: "batWave" },
    ];
    let total = 0;
    for (const item of table) {
      if (item.w > 0 && item.name !== G.lastPattern) total += item.w;
    }
    let roll = Math.random() * total;
    for (const item of table) {
      if (item.w <= 0 || item.name === G.lastPattern) continue;
      roll -= item.w;
      if (roll <= 0) {
        G.lastPattern = item.name;
        item.fn(W + rand(70, 110));
        return;
      }
    }
    patSpike(W + 90);
  }

  function spawnInterval() {
    let base = clamp(1.42 - (G.level - 1) * 0.043, 0.63, 1.42);
    if (G.surgeActive > 0) base *= 0.58;
    return base + rand(0, 0.24);
  }

  function updateSpawning(dt) {
    if (G.surgeActive > 0) {
      G.surgeActive -= dt;
      if (G.surgeActive <= 0) G.surgeActive = 0;
    } else if (G.level >= 2) {
      G.nextSurgeIn -= dt;
      if (G.nextSurgeIn <= 0) {
        G.surgeActive = 3.4;
        G.nextSurgeIn = rand(36, 54);
        showBanner("НАПЛЫВ", "держи парирование", true);
        playSound("surge");
        G.flash = 0.14;
        G.flashColor = "255,70,50";
        G.shake = Math.max(G.shake, 8);
        for (let i = 0; i < 2; i++) {
          addBat(W + 60 + i * 110, GROUND - rand(120, 175));
        }
      }
    }

    G.spawnTimer -= dt;
    if (G.spawnTimer <= 0) {
      choosePattern();
      G.spawnTimer = spawnInterval();
    }

    G.emberTimer -= dt;
    if (G.emberTimer <= 0) {
      const baseY = chance(0.55) ? GROUND - rand(70, 125) : GROUND - rand(110, 150);
      addEmberArc(W + rand(90, 170), baseY, randInt(5, 7), chance(0.5));
      G.emberTimer = rand(1.45, 2.45);
    }

    G.perkTimer -= dt;
    if (G.perkTimer <= 0) {
      addPerk(W + 80, GROUND - rand(135, 160));
      G.perkTimer = clamp(rand(26, 40) - G.level * 0.45, 16, 40);
      const nextX = W + 80;
      for (let i = 0; i < 3; i++) {
        addEmber(nextX - 170 + i * 50, GROUND - 95 - i * 22);
      }
    }
  }

  /* -------------------------------------------------------------- objects */

  function addSpike(x, w) {
    G.objects.push({
      kind: "spike",
      x,
      y: GROUND - 27,
      w,
      h: 27,
      near: false,
      passed: false,
      dead: false,
    });
  }

  function addSlime(x) {
    G.objects.push({
      kind: "slime",
      x,
      y: GROUND + 2,
      phase: rand(0, 6),
      dead: false,
    });
  }

  function addBat(x, y) {
    G.objects.push({
      kind: "bat",
      x,
      y,
      baseY: y,
      phase: rand(0, 6),
      seed: rand(0, 10),
      amp: rand(10, 26),
      fireCd: rand(0.7, 1.8),
      near: false,
      passed: false,
      dead: false,
    });
  }

  function addCharger(x) {
    G.objects.push({
      kind: "charger",
      x,
      y: GROUND + 2,
      state: "run",
      timer: 0,
      phase: rand(0, 6),
      seed: rand(0, 10),
      near: false,
      passed: false,
      dead: false,
    });
  }

  function addSpitter(x, y) {
    G.objects.push({
      kind: "spitter",
      x,
      y,
      baseY: y,
      phase: rand(0, 6),
      seed: rand(0, 10),
      fireCd: rand(1.0, 1.9),
      near: false,
      passed: false,
      dead: false,
    });
  }

  function addSaw(x, baseY, amp) {
    G.objects.push({
      kind: "saw",
      x,
      y: baseY,
      baseY,
      amp,
      phase: rand(0, 6),
      seed: rand(0, 10),
      angle: rand(0, 6),
      near: false,
      passed: false,
      dead: false,
    });
  }

  function addPlatform(x, top, w) {
    G.objects.push({
      kind: "platform",
      x,
      y: top,
      top,
      w,
      h: 112,
      dead: false,
    });
  }

  function addEmber(x, y) {
    G.objects.push({
      kind: "ember",
      x,
      y,
      baseY: y,
      phase: rand(0, 6),
      spin: rand(0, 6),
      pulled: false,
      dead: false,
    });
  }

  function addEmberArc(x, baseY, n, inverted) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const lift = Math.sin(t * Math.PI) * (inverted ? 52 : 38);
      addEmber(x + i * 38, baseY - lift);
    }
  }

  function addEmberLine(x, y, n) {
    for (let i = 0; i < n; i++) addEmber(x + i * 36, y - i * 4);
  }

  function addPerk(x, y, onPlatform) {
    const options = ["shield", "magnet", "slowmo", "dbl", "fury", "heal"];
    if (G.player) {
      if (G.player.hp >= G.player.maxHp) options.splice(options.indexOf("heal"), 1);
      if (G.player.hp <= 1) options.push("shield", "heal");
    }
    const type = options[randInt(0, options.length - 1)];
    G.objects.push({
      kind: "perk",
      perk: type,
      x,
      y,
      baseY: y,
      phase: rand(0, 6),
      onPlatform: !!onPlatform,
      dead: false,
    });
    for (let i = 0; i < 3; i++) {
      addEmber(x - 120 + i * 48, y + 18 + i * 14);
    }
  }

  function addProjectile(x, y, vx, vy, fromBat, opts) {
    if (G.projectiles.length > 11) return;
    const acid = !!(opts && opts.acid);
    G.projectiles.push({
      x,
      y,
      vx,
      vy,
      r: acid ? 10 : 9,
      life: 6,
      phase: rand(0, 6),
      reflected: false,
      fromBat: !!fromBat,
      acid,
      grav: (opts && opts.grav) || 0,
      trailT: 0,
      dead: false,
    });
    burst(x, y, {
      count: 4,
      color: acid ? "#8bff9e" : "#ff4d4d",
      speed: 90,
      life: 0.3,
      size: 2,
      type: "spark",
    });
  }

  function spitAcid(o) {
    const p = G.player;
    const sx = o.x - 16;
    const sy = o.y + 8;
    const tx = p.x;
    const ty = p.y - 38;
    const dx = tx - sx;
    const dy = ty - sy;
    const flight = clamp(Math.abs(dx) / 300, 0.55, 1.05);
    const grav = 620;
    const vx = dx / flight;
    const vy = (dy - 0.5 * grav * flight * flight) / flight;
    addProjectile(sx, sy, vx, vy, false, { acid: true, grav });
    burst(sx, sy, {
      count: 6,
      color: "#8bff9e",
      speed: 140,
      life: 0.35,
      size: 2,
      type: "spark",
      gravity: 260,
    });
  }

  /* ------------------------------------------------------------- patterns */

  function patSpike(x) {
    const w = rand(58, 92);
    addSpike(x, w);
    if (chance(0.35)) addEmberArc(x + w / 2, GROUND - 92, 5, true);
  }

  function patSpikesDouble(x) {
    const w1 = rand(48, 66);
    const gap = rand(155, 195);
    addSpike(x, w1);
    addSpike(x + w1 + gap, rand(48, 66));
    addEmberArc(x + w1 + gap / 2, GROUND - 125, 5, true);
  }

  function patSlime(x) {
    addSlime(x);
    if (chance(0.4)) addEmberArc(x, GROUND - 108, 4, false);
  }

  function patSlimeSpike(x) {
    addSlime(x);
    addSpike(x + rand(155, 195), rand(52, 74));
  }

  function patBat(x) {
    addBat(x, GROUND - rand(112, 175));
  }

  function patBatPair(x) {
    addBat(x, GROUND - rand(120, 160));
    addBat(x + rand(120, 165), GROUND - rand(150, 195));
  }

  function patBatLow(x) {
    addBat(x, GROUND - rand(72, 96));
  }

  function patBatSpike(x) {
    addSpike(x, rand(54, 76));
    addBat(x + 84, GROUND - rand(128, 162));
  }

  function patSaw(x) {
    addSaw(x, GROUND - 24, 0);
    if (chance(0.4)) addEmberArc(x, GROUND - 108, 4, false);
  }

  function patSawPendulum(x) {
    addSaw(x, GROUND - 78, 36);
  }

  function patSawPair(x) {
    addSaw(x, GROUND - 24, 0);
    addSaw(x + rand(180, 225), GROUND - 72, 26);
  }

  function patOrb(x) {
    const y = GROUND - rand(46, 78);
    addProjectile(W + 46, y, -(175 + G.speed * 0.55), rand(-12, 12), false);
    G.flash = Math.max(G.flash, 0.06);
    G.flashColor = "255,90,60";
    playSound("parrySwing");
    for (let i = 0; i < 4; i++) {
      addParticle({
        type: "spark",
        x: W - rand(4, 20),
        y: y + rand(-16, 16),
        vx: -rand(120, 260),
        vy: rand(-40, 40),
        life: 0.3,
        size: rand(1.5, 2.5),
        color: "#ff6b5a",
        grav: 0,
        drag: 2,
      });
    }
  }

  function patPlatform(x) {
    const top = GROUND - rand(92, 112);
    const w = rand(190, 250);
    addPlatform(x, top, w);
    addEmberLine(x + 46, top - 30, 4);
    if (G.level >= 6 && chance(0.45)) {
      addSpike(x + w * 0.28, rand(56, 76));
      addSpike(x + w * 0.62, rand(56, 76));
    }
    if (chance(0.16)) {
      addPerk(x + w / 2, top - 58, true);
      G.perkTimer = Math.max(G.perkTimer, 16);
    }
  }

  function patGauntlet(x) {
    addSpike(x, 58);
    addSaw(x + 148, GROUND - 76, 24);
    addSpike(x + 280, 58);
    addEmberArc(x + 148, GROUND - 120, 5, true);
  }

  function patBatWave(x) {
    for (let i = 0; i < 3; i++) addBat(x + i * 88, GROUND - (112 + i * 36));
  }

  function patCharger(x) {
    addCharger(x + 60);
    if (chance(0.35)) addEmberArc(x, GROUND - 96, 4, true);
  }

  function patChargerSpike(x) {
    addCharger(x + 120);
    addSpike(x, 58);
  }

  function patSpitter(x) {
    addSpitter(x + 40, GROUND - rand(112, 150));
    if (chance(0.4)) addEmberArc(x + 20, GROUND - 70, 4, false);
  }

  function patSpitterBat(x) {
    addSpitter(x + 30, GROUND - rand(118, 152));
    addBat(x + 210, GROUND - rand(86, 118));
  }

  function patEmberRun(x) {
    addEmberArc(x, GROUND - rand(78, 132), 7, chance(0.5));
  }

  /* --------------------------------------------------------------- player */

  function startAttack() {
    const p = G.player;
    if (!p) return;
    p.attackT = SLASH_DUR;
    p.attackCd = 0.38;
    p.attackHits = new Set();
    playSound("slash");
    for (let i = 0; i < 3; i++) {
      addParticle({
        type: "spark",
        x: p.x + rand(24, 74),
        y: p.y - rand(26, 78),
        vx: rand(80, 260),
        vy: rand(-90, 90),
        life: 0.22,
        size: rand(1.5, 3),
        color: "#ffd7a0",
        grav: -60,
        drag: 3,
      });
    }
  }

  function startParry() {
    const p = G.player;
    if (!p) return;
    p.parryT = PARRY_WINDOW;
    p.parryCd = 0.52;
    p.parrySuccess = false;
    playSound("parrySwing");
    addParticle({
      type: "ring",
      x: p.x + 24,
      y: p.y - 42,
      life: 0.25,
      size: 16,
      color: "#5fe6ff",
      grow: 150,
      width: 2,
    });
  }

  function makePlayerJump(isDouble) {
    const p = G.player;
    p.onGround = false;
    p.support = null;
    p.coyote = 0;
    p.vy = JUMP_V * (isDouble ? 0.9 : 1);
    p.jumpsLeft = isDouble ? Math.max(0, p.jumpsLeft - 1) : Math.max(0, (p.dbl > 0 ? 2 : 1) - 1);
    if (isDouble) {
      p.flipT = 0.5;
      p.flipDir = p.flipDir === 1 ? -1 : 1;
      playSound("doubleJump");
      ring(p.x, p.y - 44, "#ffd166", 18, 0.4);
      burst(p.x, p.y - 20, {
        count: 10,
        color: "#ffd166",
        speed: 180,
        life: 0.4,
        size: 2,
        type: "spark",
        gravity: 300,
      });
      G.shake = Math.max(G.shake, 3);
    } else {
      playSound("jump");
      dust(p.x - 6, p.y, 7, -1);
    }
  }

  function updatePlayerPhysics(dt) {
    const p = G.player;

    if (p.onGround) {
      if (p.support && p.support !== "ground") {
        const o = p.support;
        if (o.dead || p.x < o.x - 8 || p.x > o.x + o.w + 8) {
          p.onGround = false;
          p.support = null;
          p.coyote = 0.08;
        } else {
          p.y = o.top;
        }
      } else {
        p.y = GROUND;
      }
    }

    if (!p.onGround) {
      p.coyote = Math.max(0, p.coyote - dt);
      const g = p.vy < 0 && input.jumpHeld ? GRAVITY * HOLD_GRAVITY : GRAVITY;
      p.vy = Math.min(p.vy + g * dt, 1700);
      const prevY = p.y;
      p.y += p.vy * dt;

      if (p.vy >= 0) {
        let landY = null;
        let landObj = null;
        for (const o of G.objects) {
          if (o.kind !== "platform" || o.dead) continue;
          if (p.x < o.x - 6 || p.x > o.x + o.w + 6) continue;
          if (prevY <= o.top + 2 && p.y >= o.top) {
            if (landY === null || o.top < landY) {
              landY = o.top;
              landObj = o;
            }
          }
        }
        if (landY !== null) land(p, landObj, landY);
        else if (p.y >= GROUND) land(p, null, GROUND);
      }
    } else {
      p.vy = 0;
    }

    if (!p.onGround && p.y > H + 120) {
      p.y = GROUND;
      p.onGround = true;
      p.vy = 0;
      p.support = "ground";
      hurtPlayer();
    }

    p.runT += dt * (7 + G.speed / 55);
    p.flipT = Math.max(0, p.flipT - dt);
    p.invuln = Math.max(0, p.invuln - dt);

    p.dustT -= dt;
    if (p.onGround && p.dustT <= 0) {
      p.dustT = clamp(0.2 - G.speed / 5200, 0.1, 0.2);
      addParticle({
        type: "dust",
        x: p.x - rand(10, 18),
        y: p.y - rand(0, 3),
        vx: -rand(20, 70),
        vy: -rand(8, 42),
        life: rand(0.24, 0.42),
        size: rand(1.5, 3),
        color: "#7a7166",
        gravity: 140,
      });
    }
  }

  function land(p, obj, surfaceY) {
    const impact = p.vy;
    p.y = surfaceY;
    p.vy = 0;
    p.onGround = true;
    p.support = obj || "ground";
    p.coyote = COYOTE;
    p.jumpsMax = p.dbl > 0 ? 2 : 1;
    p.jumpsLeft = p.jumpsMax;
    p.flipT = 0;
    if (impact > 420) {
      G.shake = Math.max(G.shake, clamp(impact / 160, 2, 8));
      playSound("land", impact > 780);
      dust(p.x, p.y, impact > 780 ? 12 : 6, 0);
    }
  }

  function hurtPlayer() {
    const p = G.player;
    if (!p || G.mode !== "playing" || p.invuln > 0) return;

    if (p.shield > 0) {
      p.shield = Math.max(0, p.shield - 2.1);
      p.invuln = 0.8;
      G.shake = 9;
      G.flash = 0.16;
      G.flashColor = "95,230,255";
      ring(p.x, p.y - 42, "#5fe6ff", 24, 0.5);
      if (p.shield <= 0) {
        playSound("shieldBreak");
        burst(p.x, p.y - 40, {
          count: 18,
          color: "#5fe6ff",
          speed: 300,
          life: 0.6,
          size: 2.5,
          type: "spark",
          gravity: 450,
        });
        showBanner("ЩИТ РАЗБИТ", "береги себя");
      } else {
        playSound("block");
      }
      return;
    }

    p.hp -= 1;
    p.invuln = 1.5;
    G.combo = 0;
    G.mult = 1;
    G.comboTimer = 0;
    G.shake = 15;
    G.flash = 0.4;
    G.flashColor = "255,70,50";
    G.hitstop = Math.max(G.hitstop, 0.06);
    playSound("hurt");
    burst(p.x, p.y - 40, {
      count: 16,
      color: "#ff5d5d",
      speed: 260,
      life: 0.6,
      size: 2.5,
      type: "spark",
      gravity: 500,
    });
    updateHearts(true);
    if (p.hp <= 0) die();
  }

  function addCombo(n) {
    G.combo += n;
    G.comboTimer = COMBO_TIME;
    G.maxCombo = Math.max(G.maxCombo, G.combo);
    G.mult = 1 + Math.min(5, Math.floor(G.combo / 7));
  }

  function addScore(base, x, y, color, label) {
    const value = Math.max(1, Math.round(base * G.mult));
    G.score += value;
    if (x != null) {
      addFloater(x, y, label || "+" + fmt(value), color || "#ffd166");
    }
    return value;
  }

  /* --------------------------------------------------------------- combat */

  function resolveAttack() {
    const p = G.player;
    const progress = 1 - p.attackT / SLASH_DUR;
    if (progress < 0.14 || progress > 0.74) return;
    const reach = p.fury > 0 ? 1.55 : 1;
    const box = {
      x: p.x + 4,
      y: p.y - 84,
      w: 96 * reach,
      h: 94,
    };
    for (const o of G.objects) {
      if (o.dead || !isEnemy(o)) continue;
      if (p.attackHits.has(o)) continue;
      const r = enemyRect(o);
      if (rectsOverlap(box, r)) {
        p.attackHits.add(o);
        const base = o.kind === "charger" ? 115 : o.kind === "spitter" ? 105 : o.kind === "slime" ? 65 : 75;
        hitEnemy(o, base, "slash");
      }
    }
    for (const pr of G.projectiles) {
      if (pr.dead || pr.reflected) continue;
      if (pr.x > box.x - 9 && pr.x < box.x + box.w && pr.y > box.y && pr.y < box.y + box.h) {
        pr.dead = true;
        addScore(18, pr.x, pr.y, "#ffd7a0");
        burst(pr.x, pr.y, {
          count: 8,
          color: "#ffb36b",
          speed: 220,
          life: 0.35,
          size: 2,
          type: "spark",
        });
        playSound("hitEnemy");
      }
    }
  }

  function resolveParry() {
    const p = G.player;
    if (p.parryT <= 0) return;
    for (const pr of G.projectiles) {
      if (pr.dead || pr.reflected) continue;
      if (pr.x < p.x - 24) continue;
      const d = dist2(pr.x, pr.y, p.x + 26, p.y - 44);
      if (d < 100 * 100) {
        reflectProjectile(pr);
      }
    }
  }

  function reflectProjectile(pr) {
    const p = G.player;
    pr.reflected = true;
    pr.grav = 0;
    const speed = Math.max(620, Math.abs(pr.vx) * 2.2);
    let best = null;
    let bestD = Infinity;
    for (const o of G.objects) {
      if (o.dead || !isEnemy(o)) continue;
      if (o.x < p.x + 30) continue;
      const ay = enemyAimY(o);
      const d = (o.x - pr.x) * (o.x - pr.x) + (ay - pr.y) * (ay - pr.y);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (best) {
      const flight = Math.max(0.08, Math.abs(best.x - pr.x) / speed);
      const tx = best.x - G.speed * flight;
      const ty = enemyAimY(best);
      const dx = tx - pr.x;
      const dy = ty - pr.y;
      const len = Math.hypot(dx, dy) || 1;
      pr.vx = (dx / len) * speed;
      pr.vy = (dy / len) * speed;
    } else {
      pr.vx = speed;
      pr.vy = -35;
    }
    pr.life = 3;
    G.parries++;
    p.parrySuccess = true;
    p.parryT = Math.max(p.parryT, 0.1);
    addCombo(2);
    addScore(140, pr.x, pr.y - 16, "#5fe6ff", "ПАРИРОВАНО");
    G.slowmoT = Math.max(G.slowmoT, 0.24);
    G.hitstop = Math.max(G.hitstop, 0.05);
    G.shake = Math.max(G.shake, 7);
    G.flash = Math.max(G.flash, 0.12);
    G.flashColor = "95,230,255";
    ring(pr.x, pr.y, "#5fe6ff", 16, 0.45);
    burst(pr.x, pr.y, {
      count: 16,
      color: "#5fe6ff",
      speed: 320,
      life: 0.5,
      size: 2.4,
      type: "spark",
      gravity: 200,
    });
    playSound("parry");
  }

  function hitEnemy(o, base, source) {
    if (o.dead) return;
    o.dead = true;
    G.kills++;
    addCombo(1);
    const palette =
      o.kind === "bat"
        ? { fx: "#ff8a7a", dust: "#2b2f36" }
        : o.kind === "slime"
          ? { fx: "#c7d3c0", dust: "#7d8781" }
          : o.kind === "charger"
            ? { fx: "#ffb066", dust: "#4a3830" }
            : { fx: "#9bffb0", dust: "#2f4a36" };
    addScore(base, o.x, o.y - 22, palette.fx);
    G.hitstop = Math.max(G.hitstop, 0.035);
    G.shake = Math.max(G.shake, 6);
    playSound("hitEnemy");
    burst(o.x, o.y - 6, {
      count: 14,
      color: palette.dust,
      speed: 260,
      life: 0.5,
      size: 3,
      type: "dust",
      gravity: 500,
    });
    burst(o.x, o.y - 6, {
      count: 8,
      color: "#ffb36b",
      speed: 300,
      life: 0.35,
      size: 2,
      type: "spark",
    });
    ring(o.x, o.y - 6, "#ffb36b", 12, 0.32);

    if (G.player.fury > 0) {
      ring(o.x, o.y - 6, "#ff8a3c", 26, 0.4);
      for (const other of G.objects) {
        if (other === o || other.dead || !isEnemy(other)) continue;
        if (dist2(other.x, other.y, o.x, o.y) < 100 * 100) {
          hitEnemy(other, 40, "fury");
        }
      }
    }
  }

  /* ---------------------------------------------------------- collisions */

  function isEnemy(o) {
    return o.kind === "bat" || o.kind === "slime" || o.kind === "charger" || o.kind === "spitter";
  }

  function enemyRect(o) {
    if (o.kind === "bat") return { x: o.x - 21, y: o.y - 15, w: 42, h: 30 };
    if (o.kind === "slime") return { x: o.x - 18, y: o.y - 32, w: 36, h: 32 };
    if (o.kind === "charger") return { x: o.x - 25, y: o.y - 38, w: 50, h: 38 };
    if (o.kind === "spitter") return { x: o.x - 20, y: o.y - 21, w: 40, h: 42 };
    return { x: o.x, y: o.y, w: 10, h: 10 };
  }

  function enemyAimY(o) {
    if (o.kind === "slime") return o.y - 20;
    if (o.kind === "charger") return o.y - 20;
    return o.y;
  }

  // Height of the drawn spike surface at world x (matches drawSpike's hash).
  function spikeSurfaceY(o, x) {
    const n = Math.max(2, Math.round(o.w / 19));
    const step = o.w / n;
    const i = clamp(Math.floor((x - o.x) / step), 0, n - 1);
    const t = clamp((x - o.x - i * step) / step, 0, 1);
    const h = o.h * (0.68 + hash(o.x * 0.03 + i) * 0.32);
    return o.y + o.h - h * (1 - Math.abs(t * 2 - 1));
  }

  function heroRect(p) {
    return { x: p.x - 16, y: p.y - 70, w: 32, h: 70 };
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function resolvePlayerHazards() {
    const p = G.player;
    if (p.invuln > 0) return;
    const hr = heroRect(p);
    for (const o of G.objects) {
      if (o.dead) continue;

      if (o.kind === "platform" || o.kind === "ember" || o.kind === "perk") continue;

      if (o.kind === "spike") {
        const left = Math.max(hr.x, o.x);
        const right = Math.min(hr.x + hr.w, o.x + o.w);
        if (right > left) {
          const n = Math.max(2, Math.round(o.w / 19));
          const step = o.w / n;
          const bottom = hr.y + hr.h;
          for (let i = 0; i < n; i++) {
            const apexX = o.x + (i + 0.5) * step;
            const sampleX = clamp(apexX, left, right);
            if (bottom > spikeSurfaceY(o, sampleX) + 0.5) {
              hurtPlayer();
              return;
            }
          }
        }
      } else if (isEnemy(o)) {
        if (rectsOverlap(hr, enemyRect(o))) {
          hurtPlayer();
          return;
        }
      } else if (o.kind === "saw") {
        const cx = clamp(o.x, hr.x, hr.x + hr.w);
        const cy = clamp(o.y, hr.y, hr.y + hr.h);
        if (dist2(o.x, o.y, cx, cy) < 25 * 25) {
          hurtPlayer();
          return;
        }
      }
    }
  }

  function resolvePickups() {
    const p = G.player;
    const cx = p.x;
    const cy = p.y - 38;
    for (const o of G.objects) {
      if (o.dead) continue;
      if (o.kind === "ember") {
        if (dist2(o.x, o.y, cx, cy) < 27 * 27) {
          o.dead = true;
          G.embers++;
          addCombo(1);
          addScore(15, o.x, o.y - 12, "#ffd166");
          playSound("ember", G.combo);
          ring(o.x, o.y, "#ffd166", 7, 0.3);
          burst(o.x, o.y, {
            count: 5,
            color: "#ffd166",
            speed: 150,
            life: 0.3,
            size: 1.8,
            type: "spark",
            gravity: 100,
          });
        }
      } else if (o.kind === "perk") {
        if (dist2(o.x, o.y, cx, cy) < 40 * 40) {
          o.dead = true;
          grantPerk(o.perk);
        }
      }
    }
  }

  function grantPerk(type) {
    const p = G.player;
    if (!p) return;
    const def = PERK_DEFS[type];
    addCombo(3);
    G.score += 100 * G.mult;
    playSound("perk");
    showToast(def.label, def.desc, def.color);
    ring(p.x, p.y - 38, def.color, 26, 0.55);
    burst(p.x, p.y - 38, {
      count: 20,
      color: def.color,
      speed: 300,
      life: 0.6,
      size: 2.5,
      type: "spark",
      gravity: 150,
    });
    if (type === "shield") {
      p.shield = def.dur;
      playSound("block");
    } else if (type === "magnet") {
      p.magnet = def.dur;
    } else if (type === "slowmo") {
      p.slowmo = def.dur;
    } else if (type === "dbl") {
      p.dbl = def.dur;
      p.jumpsLeft = Math.max(p.jumpsLeft, 1);
      p.jumpsMax = Math.max(p.jumpsMax, 2);
    } else if (type === "fury") {
      p.fury = def.dur;
    } else if (type === "heal") {
      if (p.hp < p.maxHp) {
        p.hp++;
      } else if (p.maxHp < 5) {
        p.maxHp++;
        p.hp++;
        buildHearts(true);
      } else {
        G.score += 400;
        addFloater(p.x, p.y - 90, "+400", "#ff5d5d");
      }
      playSound("heal");
      updateHearts(true);
    }
    updateChips();
  }

  /* -------------------------------------------------------------- updates */

  function updateTimeScaleTarget() {
    const p = G.player;
    const slow = p && (p.slowmo > 0 || G.slowmoT > 0);
    G.timeScaleTarget = slow ? 0.56 : 1;
  }

  function updateDifficulty(dt) {
    G.speed = lerp(G.speed, G.targetSpeed, Math.min(1, dt * 0.9));
    const newLevel = Math.min(MAX_LEVEL, 1 + Math.floor(G.meters / LEVEL_METERS));
    if (newLevel > G.level) {
      G.level = newLevel;
      onLevelUp();
    }
    G.targetSpeed = Math.min(640, 250 + (G.level - 1) * 22.5);
    G.night = clamp((G.meters - 380) / 2600, 0, 1);

    if (!G.bestBeat && BEST.score > 0 && G.score > BEST.score) {
      G.bestBeat = true;
      showBanner("РЕКОРД", "ты идёшь дальше всех");
      playSound("record");
    }
  }

  const LEVEL_FLAVOR = [
    "",
    "шипы и клыки",
    "снаряды в воздухе",
    "стая пробуждается",
    "шипы смыкаются",
    "сумерки",
    "свист пил",
    "без передышки",
    "охота",
    "глубина",
    "хроно рвётся",
    "ночь",
    "пламя",
    "предел",
    "тьма",
    "лес не отпустит",
  ];

  function onLevelUp() {
    showBanner("СЛОЖНОСТЬ " + G.level, LEVEL_FLAVOR[Math.min(G.level, LEVEL_FLAVOR.length - 1)] || "лес злее");
    playSound("levelUp");
    if (window.Sound) window.Sound.setIntensity(G.level);
    G.flash = 0.2;
    G.flashColor = "255,170,80";
    G.shake = Math.max(G.shake, 8);
  }

  function updateObjects(dt) {
    const p = G.player;
    const speed = G.speed;
    for (const o of G.objects) {
      if (o.dead) continue;

      if (o.kind === "spike" || o.kind === "platform") {
        o.x -= speed * dt;
        if (o.x + (o.w || 0) < -100) o.dead = true;
        if (!o.passed && o.kind === "spike" && o.x + o.w < p.x - 26) {
          o.passed = true;
          if (o.near && p.invuln <= 0) nearMiss(o.x + o.w / 2, o.y);
        }
        if (
          o.kind === "spike" &&
          !o.near &&
          Math.abs(o.x + o.w / 2 - p.x) < 40 &&
          p.y > o.y - 90 &&
          p.y < o.y + 10
        ) {
          o.near = true;
        }
      } else if (o.kind === "ember") {
        o.x -= speed * dt;
        o.phase += dt * 2.2;
        o.spin += dt * 1.8;
        if (p.magnet > 0) {
          const dx = p.x - o.x;
          const dy = p.y - 38 - o.y;
          const d = Math.hypot(dx, dy);
          if (d < 270) {
            o.pulled = true;
            o.x += (dx / (d || 1)) * 800 * dt;
            o.y += (dy / (d || 1)) * 800 * dt;
          } else {
            o.pulled = false;
          }
        } else {
          o.pulled = false;
        }
        if (!o.pulled) o.y = o.baseY + Math.sin(o.phase) * 4;
        if (o.x < -60) o.dead = true;
      } else if (o.kind === "perk") {
        o.x -= speed * 0.92 * dt;
        o.phase += dt;
        o.y = o.baseY + Math.sin(o.phase * 2) * 7;
        if (o.x < -80) o.dead = true;
      } else if (o.kind === "slime") {
        o.x -= (speed * 0.93 + 32) * dt;
        o.phase += dt * 9;
        o.y = GROUND + 2;
        if (o.x < -80) o.dead = true;
      } else if (o.kind === "bat") {
        o.x -= (speed + 40) * dt;
        o.phase += dt;
        o.y = o.baseY + Math.sin(o.phase * 3.1 + o.seed) * o.amp;
        if (G.level >= 3 && o.x < W - 8 && o.x > p.x + 160) {
          o.fireCd -= dt;
          if (o.fireCd <= 0) {
            o.fireCd = clamp(rand(2.2, 3.2) - G.level * 0.055, 1.1, 3.2);
            if (G.projectiles.length < 8) {
              const tx = p.x;
              const ty = p.y - 38;
              const dx = tx - o.x;
              const dy = ty - o.y;
              const d = Math.hypot(dx, dy) || 1;
              const sp = 215 + G.level * 5;
              addProjectile(o.x, o.y, (dx / d) * sp, (dy / d) * sp, true);
              playSound("parrySwing");
            }
          }
        }
        if (!o.passed && o.x < p.x - 34) {
          o.passed = true;
          if (o.near && p.invuln <= 0) nearMiss(o.x, o.y);
        }
        if (!o.near && Math.abs(o.x - p.x) < 42) o.near = true;
        if (o.x < -90) o.dead = true;
      } else if (o.kind === "charger") {
        o.phase += dt * (o.state === "lunge" ? 16 : 8);
        if (o.state === "run") {
          o.x -= (speed * 0.9 + 30) * dt;
          const gap = o.x - p.x;
          if (gap < 430 && gap > 70) {
            o.state = "tell";
            o.timer = 0.46;
            playSound("growl");
          }
        } else if (o.state === "tell") {
          o.x -= speed * 0.45 * dt;
          o.timer -= dt;
          if (Math.random() < 0.4) {
            addParticle({
              type: "dust",
              x: o.x + rand(-18, 18),
              y: GROUND - rand(0, 4),
              vx: -rand(30, 90),
              vy: -rand(20, 80),
              life: rand(0.25, 0.45),
              size: rand(2, 4),
              color: "#6b5a48",
              gravity: 300,
            });
          }
          if (o.timer <= 0) {
            o.state = "lunge";
            o.timer = 0.9;
            G.shake = Math.max(G.shake, 4);
            burst(o.x, GROUND - 10, {
              count: 10,
              color: "#8a6a4a",
              speed: 180,
              life: 0.4,
              size: 3,
              type: "dust",
              gravity: 300,
            });
          }
        } else {
          o.x -= (speed + 250) * dt;
          o.timer -= dt;
          if (Math.random() < 0.55) {
            addParticle({
              type: "spark",
              x: o.x + rand(10, 26),
              y: o.y - rand(8, 30),
              vx: rand(60, 160),
              vy: rand(-30, 30),
              life: 0.22,
              size: rand(1.2, 2.2),
              color: "#ff9a5c",
              gravity: 0,
            });
          }
          if (o.timer <= 0) o.state = "run";
        }
        o.y = GROUND + 2;
        if (!o.passed && o.x < p.x - 36) {
          o.passed = true;
          if (o.near && p.invuln <= 0) nearMiss(o.x, o.y - 20);
        }
        if (!o.near && Math.abs(o.x - p.x) < 64) o.near = true;
        if (o.x < -110) o.dead = true;
      } else if (o.kind === "spitter") {
        o.phase += dt;
        o.x -= (speed + 14) * dt;
        o.y = o.baseY + Math.sin(o.phase * 1.7 + o.seed) * 7;
        if (o.x < W - 10 && o.x > p.x + 150) {
          o.fireCd -= dt;
          if (o.fireCd <= 0) {
            o.fireCd = clamp(rand(2.6, 3.5) - G.level * 0.055, 1.5, 3.5);
            if (G.projectiles.length < 10) {
              spitAcid(o);
              playSound("spit");
            }
          }
        }
        if (!o.passed && o.x < p.x - 34) {
          o.passed = true;
          if (o.near && p.invuln <= 0) nearMiss(o.x, o.y);
        }
        if (!o.near && Math.abs(o.x - p.x) < 46) o.near = true;
        if (o.x < -90) o.dead = true;
      } else if (o.kind === "saw") {
        o.x -= (speed + 18) * dt;
        o.phase += dt;
        o.y = o.baseY + Math.sin(o.phase * 2.2 + o.seed) * o.amp;
        o.angle += dt * (o.amp > 0 ? 5 : 9);
        if (!o.passed && o.x < p.x - 32) {
          o.passed = true;
          if (o.near && p.invuln <= 0) nearMiss(o.x, o.y);
        }
        if (!o.near && Math.abs(o.x - p.x) < 46) o.near = true;
        if (o.x < -90) o.dead = true;
      }
    }
  }

  function nearMiss(x, y) {
    addCombo(1);
    addScore(25, x, y - 30, "#bfefff", "ВБЛИЗИ!");
    playSound("nearMiss");
  }

  function updateProjectiles(dt) {
    const p = G.player;
    for (const pr of G.projectiles) {
      if (pr.dead) continue;
      if (pr.grav) pr.vy += pr.grav * dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      pr.trailT -= dt;
      if (pr.trailT <= 0) {
        pr.trailT = 0.035;
        addParticle({
          type: "ember",
          x: pr.x,
          y: pr.y,
          vx: -pr.vx * 0.06,
          vy: -pr.vy * 0.06,
          life: 0.28,
          size: pr.reflected ? 2.4 : 2,
          color: pr.reflected ? "#5fe6ff" : pr.acid ? "#8bff9e" : "#ff6b5a",
          grav: 0,
          drag: 1,
        });
      }

      if (!pr.reflected) {
        if (dist2(pr.x, pr.y, p.x, p.y - 38) < 28 * 28) {
          pr.dead = true;
          hurtPlayer();
        }
      } else {
        for (const o of G.objects) {
          if (o.dead || !isEnemy(o)) continue;
          const r = enemyRect(o);
          if (pr.x > r.x && pr.x < r.x + r.w && pr.y > r.y && pr.y < r.y + r.h) {
            pr.dead = true;
            hitEnemy(o, 190, "reflect");
            addFloater(o.x, o.y - 44, "ОТРАЖЕНО", "#5fe6ff");
            break;
          }
        }
      }

      if (!pr.reflected && pr.acid && pr.y >= GROUND - 2) {
        pr.dead = true;
        burst(pr.x, GROUND, {
          count: 8,
          color: "#8bff9e",
          speed: 150,
          life: 0.4,
          size: 2,
          type: "spark",
          gravity: 420,
        });
        ring(pr.x, GROUND - 2, "#8bff9e", 8, 0.3);
      }

      if (pr.life <= 0 || pr.x < -80 || pr.x > W + 260 || pr.y < -120 || pr.y > H + 80) {
        pr.dead = true;
      }
    }
  }

  function updateSim(dt) {
    const p = G.player;
    G.runTime += dt;

    p.attackCd = Math.max(0, p.attackCd - dt);
    p.parryCd = Math.max(0, p.parryCd - dt);
    p.attackT = Math.max(0, p.attackT - dt);
    if (p.parryT > 0) {
      p.parryT = Math.max(0, p.parryT - dt);
    }

    if (input.attackBuffer > 0) {
      if (p.attackCd <= 0) {
        startAttack();
        input.attackBuffer = 0;
      }
    }
    if (input.parryBuffer > 0) {
      if (p.parryCd <= 0) {
        startParry();
        input.parryBuffer = 0;
      }
    }
    if (input.jumpBuffer > 0) {
      if (p.onGround || p.coyote > 0) {
        makePlayerJump(false);
        input.jumpBuffer = 0;
      } else if (p.jumpsLeft > 0) {
        makePlayerJump(true);
        input.jumpBuffer = 0;
      }
    }
    input.jumpBuffer = Math.max(0, input.jumpBuffer - dt);
    input.attackBuffer = Math.max(0, input.attackBuffer - dt);
    input.parryBuffer = Math.max(0, input.parryBuffer - dt);

    updatePlayerPhysics(dt);

    G.distance += G.speed * dt;
    G.scroll += G.speed * dt;
    G.meters = G.distance / 20;
    G.score += G.speed * dt * 0.09;

    updateDifficulty(dt);
    updateSpawning(dt);
    updateObjects(dt);

    if (p.attackT > 0) resolveAttack();
    if (p.parryT > 0) resolveParry();

    updateProjectiles(dt);
    resolvePickups();
    resolvePlayerHazards();

    p.trailT -= dt;
    if (p.trailT <= 0) {
      p.trailT = 0.055;
      emitTrail(p);
    }

    updateParticles(dt);
    updateFloaters(dt);

    G.objects = G.objects.filter((o) => !o.dead);
    G.projectiles = G.projectiles.filter((pr) => !pr.dead);

    if (G.mode === "playing" && p.hp <= 0) die();
  }

  function updateRealTimers(raw) {
    const p = G.player;
    if (!p) return;

    if (G.comboTimer > 0) {
      G.comboTimer -= raw;
      if (G.comboTimer <= 0) {
        G.combo = 0;
        G.mult = 1;
      }
    }

    ["shield", "magnet", "slowmo", "dbl", "fury"].forEach((key) => {
      if (p[key] > 0) p[key] = Math.max(0, p[key] - raw);
    });
    if (p.dbl <= 0) p.jumpsMax = p.onGround ? 1 : Math.min(p.jumpsMax, 1);

    G.slowmoT = Math.max(0, G.slowmoT - raw);
    G.shake = Math.max(0, G.shake - raw * 44);
    G.flash = Math.max(0, G.flash - raw * 1.8);
    G.hitstop = Math.max(0, G.hitstop - raw);

    if (G.hintOn) {
      G.hintTimer += raw;
      if (G.hintTimer > 3.6) {
        G.hintTimer = 0;
        if (G.hintIdx >= HINTS.length - 1) {
          stopHints();
        } else {
          nextHint();
        }
      }
    }

    updateChips();
  }

  function updateMenu(raw) {
    G.scroll += 26 * raw;
    const a = G.ambient;
    for (const f of a) {
      f.x -= (8 + G.speed * 0.1) * raw * f.z;
      f.phase += raw * (0.6 + f.z);
      if (f.x < -20) {
        f.x = W + 20;
        f.y = rand(90, GROUND - 30);
      }
    }
  }

  function updateDying(raw) {
    G.deadTimer += raw;
    G.shake = Math.max(0, G.shake - raw * 30);
    G.flash = Math.max(0, G.flash - raw * 1.6);
    updateParticles(raw * 0.55);
    updateFloaters(raw * 0.7);
    const p = G.player;
    if (p) {
      p.deathVY += GRAVITY * 0.55 * raw;
      p.y += p.deathVY * raw;
      p.deathRot += raw * 5.2;
    }
    if (G.deadTimer > 1.0) finalizeRun();
  }

  function updateParticles(dt) {
    if (G.particles.length > 460) G.particles.splice(0, G.particles.length - 460);
    for (const pt of G.particles) {
      pt.life -= dt;
      if (pt.life <= 0) continue;
      if (pt.type === "ring") {
        pt.size += (pt.grow || 100) * dt;
        continue;
      }
      pt.vy += (pt.grav || 0) * dt;
      const drag = pt.drag || 0;
      if (drag) {
        const k = Math.max(0, 1 - drag * dt);
        pt.vx *= k;
        pt.vy *= k;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
    }
    G.particles = G.particles.filter((pt) => pt.life > 0 && pt.y < H + 80 && pt.x > -120 && pt.x < W + 220);
  }

  function updateFloaters(dt) {
    for (const f of G.floaters) {
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= 1 - 2.4 * dt;
    }
    G.floaters = G.floaters.filter((f) => f.life > 0);
  }

  function emitTrail(p) {
    const color = p.fury > 0 ? "#ff9a4d" : p.shield > 0 ? "#5fe6ff" : "#ffb36b";
    addParticle({
      type: "ember",
      x: p.x - rand(16, 28),
      y: p.y - rand(12, 52),
      vx: -rand(30, 90),
      vy: rand(-26, 10),
      life: rand(0.22, 0.45),
      size: rand(1.4, 2.6),
      color,
      grav: -40,
      drag: 2,
    });
  }

  /* ------------------------------------------------------------- particles */

  function addParticle(opts) {
    G.particles.push({
      type: opts.type || "dust",
      x: opts.x,
      y: opts.y,
      vx: opts.vx || 0,
      vy: opts.vy || 0,
      life: opts.life || 0.4,
      max: opts.life || 0.4,
      size: opts.size || 2,
      color: opts.color || "#ffd166",
      grav: opts.grav || 0,
      drag: opts.drag || 0,
      grow: opts.grow || 0,
      width: opts.width || 2,
    });
  }

  function burst(x, y, opts) {
    const count = opts.count || 8;
    for (let i = 0; i < count; i++) {
      const ang = rand(0, Math.PI * 2);
      const spd = rand(opts.speed * 0.3, opts.speed);
      addParticle({
        type: opts.type || "spark",
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: rand(opts.life * 0.5, opts.life),
        size: rand(1.4, opts.size || 3),
        color: opts.color,
        grav: opts.gravity || 0,
        drag: 1.4,
      });
    }
  }

  function dust(x, y, n, dir) {
    for (let i = 0; i < n; i++) {
      addParticle({
        type: "dust",
        x: x + rand(-10, 10),
        y: y - rand(0, 6),
        vx: rand(-90, 40) + (dir || 0) * 60,
        vy: rand(-80, -10),
        life: rand(0.25, 0.5),
        size: rand(2, 5),
        color: "#c3cbb0",
        grav: 260,
        drag: 1.5,
      });
    }
  }

  function ring(x, y, color, size, life) {
    addParticle({
      type: "ring",
      x,
      y,
      life,
      max: life,
      size,
      color,
      grow: 130,
      width: 2.5,
    });
  }

  function addFloater(x, y, text, color) {
    G.floaters.push({
      x,
      y,
      text,
      color,
      life: 0.95,
      max: 0.95,
      vy: -52,
    });
  }

  /* ---------------------------------------------------------------- draw */

  function drawLayer(img, factor, y, h, alpha) {
    if (!img) return;
    const scale = h / img.height;
    const tw = Math.ceil(img.width * scale);
    const period = tw * 2;
    let off = (G.scroll * factor) % period;
    if (off < 0) off += period;
    off = Math.floor(off);
    const start = -off;
    for (let i = 0; i < 4; i++) {
      const x = start + i * tw;
      if (x > W || x + tw < 0) continue;
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      if (i % 2 === 0) {
        ctx.drawImage(img, x, y, tw, h);
      } else {
        ctx.save();
        ctx.translate(x + tw, y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, tw, h);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawSky() {
    if (!IMG.sky) {
      ctx.fillStyle = "#101d1d";
      ctx.fillRect(0, 0, W, H);
      return;
    }
    drawLayer(IMG.sky, 0.02, 0, H, 1);

    // stars when night sets in
    if (G.night > 0.05) {
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 54; i++) {
        const x = hash(i * 7.1) * W;
        const y = hash(i * 13.7 + 2) * 300;
        const tw = 0.5 + 0.5 * Math.sin(G.time * (1 + hash(i) * 2) + i);
        ctx.globalAlpha = G.night * 0.55 * tw;
        ctx.fillStyle = "#d9ecff";
        const s = hash(i * 3.3) > 0.82 ? 2 : 1;
        ctx.fillRect(x, y, s, s);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }

    // sun
    const sunX = W * 0.72 - ((G.scroll * 0.006) % 120);
    const sunY = 165 + G.night * 150;
    glow("orange", sunX, sunY, 400, (0.16 + G.night * 0.08) * (1 - G.night * 0.45));
    ctx.globalAlpha = 0.1 * (1 - G.night * 0.7);
    ctx.fillStyle = "#ffd9a0";
    ctx.beginPath();
    ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // moon at night
    if (G.night > 0.18) {
      const mx = W * 0.21;
      const my = 116;
      glow("blue", mx, my, 120, (G.night - 0.18) * 0.4);
      ctx.globalAlpha = clamp((G.night - 0.18) * 1.5, 0, 0.8);
      ctx.fillStyle = "#dfe9ff";
      ctx.beginPath();
      ctx.arc(mx, my, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(160,180,215,0.3)";
      ctx.beginPath();
      ctx.arc(mx - 5, my - 4, 4, 0, Math.PI * 2);
      ctx.arc(mx + 6, my + 5, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawBackground() {
    drawLayer(IMG.cloudsHi, 0.045, 0, H, 0.95);
    drawLayer(IMG.cloudsLo, 0.085, 0, H, 0.85);
    drawLayer(IMG.mountains, 0.16, 0, H, 1);
    drawLayer(IMG.treeline, 0.3, 0, H, 1);
    drawLayer(IMG.trees, 0.48, 0, H, 0.82);

    // low drifting fog bands
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 2; i++) {
      const t = G.time * (0.02 + i * 0.008) + i * 0.4;
      const x = -((G.scroll * (0.1 + i * 0.05) + t * 300) % (W + 500));
      const y = 300 + i * 90;
      const grad = ctx.createLinearGradient(x, 0, x + 600, 0);
      grad.addColorStop(0, "rgba(190,220,205,0)");
      grad.addColorStop(0.5, "rgba(190,220,205," + (0.045 - i * 0.012) + ")");
      grad.addColorStop(1, "rgba(190,220,205,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, 620, 54 + i * 18);
      ctx.fillRect(x + W + 300, y, 620, 54 + i * 18);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function drawMidTrees() {
    if (!IMG.treeDark) return;
    const spacing = 430;
    const factor = 0.72;
    const scroll = G.scroll * factor;
    const first = Math.floor(scroll / spacing) - 1;
    for (let i = 0; i < 5; i++) {
      const idx = first + i;
      const x = idx * spacing - scroll + hash(idx * 5.13) * 150;
      if (x < -180 || x > W + 160) continue;
      if (hash(idx * 9.77) < 0.22) continue;
      const h = 100 + hash(idx * 3.7) * 110;
      const w = (h / IMG.treeDark.height) * IMG.treeDark.width;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(IMG.treeDark, Math.round(x), Math.round(GROUND + 8 - h), Math.round(w), Math.round(h));
      ctx.globalAlpha = 1;
    }
  }

  function drawGround() {
    // soil
    ctx.fillStyle = "#1a241d";
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = "#263126";
    ctx.fillRect(0, GROUND, W, 9);
    ctx.fillStyle = "#2e4d32";
    ctx.fillRect(0, GROUND, W, 5);
    ctx.fillStyle = "#6fc45a";
    ctx.fillRect(0, GROUND, W, 3);
    ctx.fillStyle = "#a4e778";
    ctx.fillRect(0, GROUND, W, 1);

    // soil strata
    ctx.fillStyle = "#202b21";
    ctx.fillRect(0, GROUND + 24, W, 2);
    ctx.fillStyle = "#151d17";
    ctx.fillRect(0, GROUND + 42, W, 3);
    ctx.fillStyle = "#101711";
    ctx.fillRect(0, GROUND + 58, W, 2);

    const scroll = G.scroll;

    // grass tufts
    const spacing = 29;
    const first = Math.floor(scroll / spacing) - 1;
    for (let i = 0; i < W / spacing + 4; i++) {
      const idx = first + i;
      const x = Math.round(idx * spacing - scroll + hash(idx * 1.7) * 18);
      if (x < -8 || x > W + 8) continue;
      const h = 3 + Math.floor(hash(idx * 2.9) * 7);
      const shade = hash(idx * 7.3);
      ctx.fillStyle = shade > 0.66 ? "#8fe070" : shade > 0.3 ? "#5cb254" : "#3f8f45";
      ctx.fillRect(x, GROUND - h, 1, h);
      if (h > 5) ctx.fillRect(x + 2, GROUND - h + 2, 1, h - 2);
      if (h > 7) ctx.fillRect(x - 2, GROUND - h + 4, 1, h - 4);
    }

    // flowers
    const fSpacing = 173;
    const fFirst = Math.floor(scroll / fSpacing) - 1;
    for (let i = 0; i < W / fSpacing + 3; i++) {
      const idx = fFirst + i;
      const x = Math.round(idx * fSpacing - scroll + hash(idx * 4.4) * 120);
      if (x < -6 || x > W + 6) continue;
      if (hash(idx * 8.8) < 0.42) continue;
      ctx.fillStyle = hash(idx * 2.2) > 0.5 ? "#7fe6ff" : "#ffd166";
      ctx.fillRect(x, GROUND - 5, 2, 2);
      ctx.fillStyle = "#3a7d46";
      ctx.fillRect(x, GROUND - 3, 1, 3);
    }

    // stones
    const sSpacing = 211;
    const sFirst = Math.floor(scroll / sSpacing) - 1;
    for (let i = 0; i < W / sSpacing + 3; i++) {
      const idx = sFirst + i;
      const x = Math.round(idx * sSpacing - scroll + hash(idx * 6.6) * 140);
      if (x < -16 || x > W + 16) continue;
      if (hash(idx * 3.1) < 0.35) continue;
      const w = 5 + Math.floor(hash(idx * 9.2) * 9);
      const h = 3 + Math.floor(hash(idx * 5.5) * 4);
      ctx.fillStyle = "#4a5650";
      ctx.fillRect(x, GROUND + 13, w, h);
      ctx.fillStyle = "#64716a";
      ctx.fillRect(x + 1, GROUND + 13, w - 2, 1);
      ctx.fillStyle = "#121a15";
      ctx.fillRect(x + 2, GROUND + 13 + h, w - 2, 1);
    }

    // roots
    const rSpacing = 97;
    const rFirst = Math.floor(scroll / rSpacing) - 1;
    for (let i = 0; i < W / rSpacing + 3; i++) {
      const idx = rFirst + i;
      const x = Math.round(idx * rSpacing - scroll + hash(idx * 2.4) * 60);
      if (x < -40 || x > W + 10) continue;
      if (hash(idx * 1.9) < 0.55) continue;
      ctx.fillStyle = "#2f241c";
      ctx.fillRect(x, GROUND + 10, 20, 2);
      ctx.fillRect(x + 6, GROUND + 12, 2, 8);
      ctx.fillRect(x + 15, GROUND + 12, 2, 5);
    }

    // top highlight line shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, GROUND + 3, W, 1);
  }

  function drawNightTint() {
    if (G.night <= 0.01) return;
    ctx.fillStyle = "rgba(8,14,38," + (G.night * 0.4) + ")";
    ctx.fillRect(0, 0, W, H);
    const grad = ctx.createLinearGradient(0, GROUND - 160, 0, GROUND + 40);
    grad.addColorStop(0, "rgba(60,80,140,0)");
    grad.addColorStop(1, "rgba(60,80,140," + (G.night * 0.12) + ")");
    ctx.fillStyle = grad;
    ctx.fillRect(0, GROUND - 160, W, 200);
  }

  function drawAmbient() {
    const nightBoost = 0.4 + G.night * 0.6;
    for (const f of G.ambient) {
      const x = ((f.x + Math.sin(G.time * 0.3 + f.phase) * 10) % (W + 40)) - 20;
      const y = f.y + Math.sin(G.time * 0.7 + f.phase) * 8;
      if (f.leaf) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(G.time * 0.8 + f.phase);
        ctx.globalAlpha = 0.35 * f.z;
        ctx.fillStyle = f.hue === "green" ? "#68b96a" : "#c7a35d";
        ctx.fillRect(-2, -1, 4, 2);
        ctx.restore();
        continue;
      }
      const col = f.hue === "green" ? "green" : "gold";
      const a = (0.16 + 0.24 * (0.5 + 0.5 * Math.sin(G.time * 2 + f.phase))) * nightBoost * f.z;
      glow(col, x, y, 10 + f.size * 5, a);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function drawPlatform(o) {
    if (!IMG.platform) return;
    const drawY = o.top - 11;
    const h = 118;
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = "#050b08";
    ctx.beginPath();
    ctx.ellipse(o.x + o.w / 2, GROUND + 12, o.w * 0.38, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.drawImage(IMG.platform, Math.round(o.x), Math.round(drawY), Math.round(o.w), h);
  }

  function drawSpike(o) {
    const n = Math.max(2, Math.round(o.w / 19));
    const step = o.w / n;
    ctx.fillStyle = "#111a17";
    ctx.fillRect(o.x, o.y + o.h - 4, o.w, 4);
    for (let i = 0; i < n; i++) {
      const x = o.x + i * step;
      const h = o.h * (0.68 + hash(o.x * 0.03 + i) * 0.32);
      ctx.fillStyle = "#3f4a44";
      ctx.beginPath();
      ctx.moveTo(x, o.y + o.h);
      ctx.lineTo(x + step * 0.5, o.y + o.h - h);
      ctx.lineTo(x + step, o.y + o.h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#75827a";
      ctx.beginPath();
      ctx.moveTo(x + step * 0.32, o.y + o.h - h * 0.15);
      ctx.lineTo(x + step * 0.5, o.y + o.h - h);
      ctx.lineTo(x + step * 0.62, o.y + o.h - h * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#c4d0c5";
      ctx.fillRect(x + step * 0.48, o.y + o.h - h, 1, 4);
    }
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(o.x + o.w / 2, GROUND + 1, o.w * 0.55, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSaw(o) {
    const r = 25;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.angle);
    ctx.fillStyle = "#171d1e";
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const a2 = a + 0.26;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(Math.cos(a2) * r, Math.sin(a2) * r);
      ctx.lineTo(Math.cos(a + 0.13) * (r + 10), Math.sin(a + 0.13) * (r + 10));
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#4b5255";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a3032";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#6e767a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      ctx.fillStyle = "#8e9698";
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 10, Math.sin(a) * 10, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#ff5d4d";
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    glow("red", o.x, o.y, 44, 0.25 + 0.1 * Math.sin(G.time * 5 + o.seed));
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(o.x, GROUND + 1, 22, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBat(o) {
    if (!IMG.bat) return;
    const fw = 96;
    const frame = Math.floor(G.time * 12 + o.seed) % 4;
    const s = 0.56;
    const drawSize = fw * s;
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "#040906";
    ctx.beginPath();
    ctx.ellipse(o.x, GROUND + 2, 13, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(Math.cos(o.phase * 3.1 + o.seed) * 0.1);
    ctx.scale(-1, 1);
    ctx.drawImage(IMG.bat, frame * fw, 0, fw, fw, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    ctx.restore();
    glow("red", o.x, o.y + 3, 33, 0.3);
    if (o.fireCd < 0.5 && G.level >= 3) glow("red", o.x, o.y, 44, 0.36);
  }

  function drawSlime(o) {
    if (!IMG.slime) return;
    const fw = 96;
    const frame = Math.floor(o.phase) % 6;
    const s = 0.55;
    const drawSize = fw * s;
    const breathe = Math.sin(o.phase * 0.55);
    const sx = 1 - breathe * 0.045;
    const sy = 1 + breathe * 0.06;
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#040906";
    ctx.beginPath();
    ctx.ellipse(o.x, GROUND + 2, 19 * sx, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(-sx, sy);
    ctx.drawImage(IMG.slime, frame * fw, 0, fw, fw, -drawSize / 2, -drawSize, drawSize, drawSize);
    ctx.restore();
    glow("red", o.x, o.y - 19, 28, 0.28);
  }

  function drawCharger(o) {
    const bob = Math.sin(o.phase * 0.8) * 1.1;
    const crouch = o.state === "tell" ? 4 : 0;
    const stretch = o.state === "lunge" ? 1.12 : 1;
    const sink = o.y + bob * 0.3 + crouch;

    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#030805";
    ctx.beginPath();
    ctx.ellipse(o.x, GROUND + 3, 26, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // dark halo keeps the silhouette readable against the green forest
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = "#030805";
    ctx.beginPath();
    ctx.ellipse(o.x, o.y - 20, 30, 21, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(o.x, sink);
    ctx.scale(stretch, 2 - stretch);

    // legs
    for (let i = 0; i < 4; i++) {
      const swing = Math.sin(o.phase * 2 + i * 1.9) * 4;
      const lx = -16 + i * 10;
      ctx.fillStyle = i % 2 ? "#241c17" : "#2e231c";
      ctx.fillRect(lx + swing * 0.4, -14, 4, 14 + Math.max(0, swing));
      ctx.fillStyle = "#17110e";
      ctx.fillRect(lx + swing * 0.4, 0, 5, 2);
    }

    // tail
    ctx.strokeStyle = "#2a201a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, -24);
    ctx.quadraticCurveTo(33, -28 + Math.sin(o.phase * 2) * 3, 38, -34);
    ctx.stroke();

    // body
    ctx.fillStyle = "#33251d";
    ctx.beginPath();
    ctx.ellipse(0, -21, 25, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#453328";
    ctx.beginPath();
    ctx.ellipse(-2, -25, 20, 9, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // back ridge
    ctx.fillStyle = "#201711";
    for (let i = 0; i < 4; i++) {
      const bx = 4 + i * 6;
      const bh = 7 - i;
      ctx.beginPath();
      ctx.moveTo(bx, -31);
      ctx.lineTo(bx + 3, -31 - bh);
      ctx.lineTo(bx + 6, -31);
      ctx.closePath();
      ctx.fill();
    }

    // head and snout (faces left, toward the hero)
    ctx.fillStyle = "#3b2a21";
    ctx.beginPath();
    ctx.ellipse(-24, -26, 13, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2b1d17";
    ctx.fillRect(-37, -24, 13, 9);
    ctx.fillStyle = "#4d392c";
    ctx.fillRect(-36, -27, 9, 4);

    // tusk
    ctx.fillStyle = "#e8dfc8";
    ctx.beginPath();
    ctx.moveTo(-33, -15);
    ctx.lineTo(-29, -22);
    ctx.lineTo(-27, -15);
    ctx.closePath();
    ctx.fill();

    // ear
    ctx.fillStyle = "#241914";
    ctx.beginPath();
    ctx.moveTo(-20, -35);
    ctx.lineTo(-14, -42);
    ctx.lineTo(-12, -32);
    ctx.closePath();
    ctx.fill();

    // eye
    const tell = o.state === "tell" || o.state === "lunge";
    ctx.fillStyle = tell ? "#ff5a3c" : "#e0563a";
    ctx.fillRect(-29, -29, 5, 3);
    ctx.fillStyle = "#ffd0a0";
    ctx.fillRect(-29, -29, 2, 1);
    ctx.restore();

    glow("red", o.x - 8, o.y - 26, tell ? 56 : 38, tell ? 0.42 : 0.22);
  }

  function drawSpitter(o) {
    const pulse = 1 + Math.sin(o.phase * 2.4) * 0.035;
    const charge = o.fireCd < 0.45 ? clamp(1 - o.fireCd / 0.45, 0, 1) : 0;
    glow("green", o.x, o.y, 52 + charge * 30, 0.22 + charge * 0.28);

    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#030805";
    ctx.beginPath();
    ctx.ellipse(o.x, o.y, 25, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // tendrils
    ctx.strokeStyle = "#2c5a3a";
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      const sway = Math.sin(o.phase * 2.2 + i * 1.4) * 3;
      ctx.beginPath();
      ctx.moveTo(o.x + i * 8, o.y + 14);
      ctx.quadraticCurveTo(o.x + i * 9 + sway, o.y + 24, o.x + i * 7 - sway, o.y + 32);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(pulse, 2 - pulse);
    ctx.scale(-1, 1);

    // body sac
    ctx.fillStyle = "#1d3327";
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#294a36";
    ctx.beginPath();
    ctx.ellipse(4, -3, 12, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // leaves
    ctx.fillStyle = "#3f724d";
    for (let i = 0; i < 3; i++) {
      const a = -0.6 + i * 0.55;
      ctx.beginPath();
      ctx.moveTo(5, -18);
      ctx.lineTo(5 + Math.cos(a) * 12, -18 - Math.sin(a) * 12);
      ctx.lineTo(11, -16);
      ctx.closePath();
      ctx.fill();
    }

    // eye looks toward the hero (left)
    ctx.fillStyle = "#d9ffe2";
    ctx.beginPath();
    ctx.ellipse(-3, -5, 7, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0d1a10";
    ctx.beginPath();
    ctx.ellipse(-6, -5, 3, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8bff9e";
    ctx.fillRect(-7, -7, 1.5, 1.5);

    // mouth opens when it is about to spit
    ctx.fillStyle = "#102016";
    ctx.beginPath();
    ctx.ellipse(-13, 7, 4 + charge * 3, 3 + charge * 4, 0.2, 0, Math.PI * 2);
    ctx.fill();
    if (charge > 0.2) {
      ctx.fillStyle = "rgba(139,255,158," + (0.5 + charge * 0.5) + ")";
      ctx.beginPath();
      ctx.arc(-13, 7, 1.5 + charge * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // belly glow
    ctx.fillStyle = "rgba(139,255,158," + (0.06 + charge * 0.12) + ")";
    ctx.beginPath();
    ctx.ellipse(2, 6, 10, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEmber(o) {
    const bob = o.pulled ? 0 : Math.sin(o.phase) * 1.5;
    glow("gold", o.x, o.y + bob, 34, 0.5);
    ctx.save();
    ctx.translate(o.x, o.y + bob);
    ctx.rotate(o.spin);
    ctx.fillStyle = "#ffdf8a";
    ctx.fillRect(-3.5, -3.5, 7, 7);
    ctx.fillStyle = "#fff6d6";
    ctx.fillRect(-1.5, -1.5, 3, 3);
    ctx.restore();
  }

  function drawPerk(o) {
    const def = PERK_DEFS[o.perk];
    glow(o.perk === "shield" ? "cyan" : o.perk === "magnet" ? "pink" : o.perk === "slowmo" ? "blue" : o.perk === "heal" ? "red" : "gold", o.x, o.y, 70, 0.55);
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(G.time * 1.1 + o.phase);
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(11, 0);
    ctx.lineTo(0, 14);
    ctx.lineTo(-11, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(4, -4);
    ctx.lineTo(-4, -4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.fillStyle = "#101617";
    ctx.font = 'bold 11px "Lucida Console", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(def.glyph, 0, 1);
    ctx.restore();
    if (o.x < W - 40) {
      ctx.save();
      ctx.font = 'bold 9px "Lucida Console", monospace';
      ctx.textAlign = "center";
      const label = def.label;
      const tw = ctx.measureText(label).width + 12;
      ctx.fillStyle = "rgba(5,11,12,0.7)";
      ctx.fillRect(o.x - tw / 2, o.y + 22, tw, 15);
      ctx.fillStyle = def.color;
      ctx.fillText(label, o.x, o.y + 33);
      ctx.restore();
    }
  }

  function drawProjectile(pr) {
    const key = pr.reflected ? "cyan" : pr.acid ? "green" : "red";
    const core = pr.reflected ? "#ffffff" : pr.acid ? "#d6ffdf" : "#ff5d4d";
    glow(key, pr.x, pr.y, pr.reflected ? 44 : pr.acid ? 42 : 38, 0.55);
    ctx.fillStyle = pr.reflected ? "#bff6ff" : pr.acid ? "#173d24" : "#1c1112";
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, pr.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(pr.x + (pr.reflected ? 1 : -1), pr.y, pr.r * (pr.acid ? 0.42 : 0.52), 0, Math.PI * 2);
    ctx.fill();
    if (pr.acid) {
      ctx.fillStyle = "rgba(139,255,158,0.75)";
      ctx.beginPath();
      ctx.arc(pr.x + pr.r * 0.4, pr.y + pr.r * 0.5, 2, 0, Math.PI * 2);
      ctx.arc(pr.x - pr.r * 0.3, pr.y + pr.r * 0.8, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = pr.reflected
      ? "rgba(255,209,102,0.8)"
      : pr.acid
        ? "rgba(139,255,158,0.4)"
        : "rgba(255,120,90,0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, pr.r + 3 + Math.sin(G.time * 12 + pr.phase) * 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawFrame(img, anim, index, scale, screenX, feetY, alpha, rotation) {
    if (!img) return;
    const f = HERO[anim];
    const dx = Math.round(screenX - f.ax * scale);
    const dy = Math.round(feetY - f.ay * scale);
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    if (rotation) {
      const cx = screenX;
      const cy = feetY - f.ay * scale * 0.5;
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      ctx.translate(-cx, -cy);
    }
    ctx.drawImage(img, index * f.w, 0, f.w, f.h, dx, dy, Math.round(f.w * scale), Math.round(f.h * scale));
    ctx.restore();
  }

  function drawPlayerShadow(p) {
    let sy = GROUND;
    let size = 1;
    if (p.support && p.support !== "ground") sy = p.support.top;
    const height = Math.max(0, sy - p.y);
    size = clamp(1 - height / 260, 0.45, 1);
    ctx.globalAlpha = 0.28 * size;
    ctx.fillStyle = "#030805";
    ctx.beginPath();
    ctx.ellipse(p.x - 4, sy + 2, 24 * size, 5 * size, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawPlayer() {
    const p = G.player;
    if (!p) return;
    if (G.mode === "dying" || G.mode === "gameover") {
      if (G.mode === "dying") {
        drawFrame(IMG.heroJump, "jump", 4, HERO_SCALE, p.x, p.y, clamp(1 - G.deadTimer / 1.2, 0, 1), p.deathRot);
      }
      return;
    }
    drawPlayerShadow(p);
    if (p.invuln > 0) {
      const blink = Math.sin(G.time * 45) > 0 ? 0.45 : 1;
      drawHeroFor(p, blink);
    } else {
      drawHeroFor(p, 1);
    }

    if (p.shield > 0) {
      const t = G.time;
      const cy = p.y - 43;
      glow("cyan", p.x, cy, 120, 0.1 + 0.04 * Math.sin(t * 5));
      ctx.strokeStyle = "rgba(95,230,255,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, cy, 46 + Math.sin(t * 4) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(170,250,255,0.18)";
      ctx.beginPath();
      ctx.arc(p.x, cy, 52, t * 0.8, t * 0.8 + Math.PI * 1.2);
      ctx.stroke();
    }

    if (p.parryT > 0) {
      const prog = 1 - p.parryT / PARRY_WINDOW;
      const a = Math.max(0, 1 - prog * 1.4);
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(95,230,255," + (0.7 * a) + ")";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x + 20, p.y - 42, 54 + prog * 12, -1.2, 1.05);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255," + (0.35 * a) + ")";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x + 20, p.y - 42, 60 + prog * 14, -1.1, 0.95);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    }

    if (p.fury > 0) {
      glow("orange", p.x, p.y - 40, 150, 0.08 + 0.03 * Math.sin(G.time * 8));
    }

    const activeHit = p.attackT > 0 && 1 - p.attackT / SLASH_DUR > 0.14 && 1 - p.attackT / SLASH_DUR < 0.74;
    if (activeHit) {
      const prog = 1 - p.attackT / SLASH_DUR;
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = p.fury > 0 ? "rgba(255,110,50," + (0.5 * (1 - prog)) + ")" : "rgba(255,190,110," + (0.42 * (1 - prog)) + ")";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(p.x + 26, p.y - 44, 40 + prog * 52, -1.05, 1.15);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    }
  }

  function drawHeroFor(p, alpha) {
    let anim = "run";
    let frame = Math.floor(p.runT) % 6;

    if (p.attackT > 0) {
      anim = "slash";
      const prog = clamp(1 - p.attackT / SLASH_DUR, 0, 0.999);
      frame = Math.min(8, Math.floor(prog * 9));
    } else if (!p.onGround) {
      anim = "jump";
      if (p.vy < -420) frame = 1;
      else if (p.vy < -80) frame = 2;
      else if (p.vy < 140) frame = 3;
      else frame = 4;
    }

    let rotation = 0;
    if (p.flipT > 0 && anim === "jump") {
      const k = 1 - p.flipT / 0.5;
      rotation = p.flipDir * k * Math.PI * 2;
    }

    drawFrame(IMG.heroRun && anim === "run" ? IMG.heroRun : anim === "jump" ? IMG.heroJump : IMG.heroSlash, anim, frame, HERO_SCALE, p.x, p.y, alpha, rotation);
  }

  function drawIdleHero(x, feetY, scale) {
    if (!IMG.heroIdle) return;
    const frame = Math.floor(G.time * 4.5) % 3;
    drawFrame(IMG.heroIdle, "idle", frame, scale, x, feetY, 1, 0);
    glow("orange", x - 4, feetY - 56, 100, 0.12);
  }

  function drawFloaters() {
    ctx.textAlign = "center";
    ctx.font = 'bold 11px "Lucida Console", monospace';
    for (const f of G.floaters) {
      const a = clamp(f.life / f.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(4,8,8,0.75)";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    ctx.globalCompositeOperation = "lighter";
    for (const pt of G.particles) {
      const a = clamp(pt.life / pt.max, 0, 1);
      if (pt.type === "spark") {
        ctx.globalAlpha = a;
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = pt.size;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(pt.x - pt.vx * 0.025, pt.y - pt.vy * 0.025);
        ctx.stroke();
      } else if (pt.type === "ember") {
        glow(pt.color === "#5fe6ff" ? "cyan" : pt.color === "#ffb36b" ? "orange" : pt.color === "#ffd166" ? "gold" : "orange", pt.x, pt.y, pt.size * 6, a * 0.6);
      } else if (pt.type === "ring") {
        ctx.globalAlpha = a * 0.7;
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = pt.width;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    for (const pt of G.particles) {
      if (pt.type !== "dust") continue;
      const a = clamp(pt.life / pt.max, 0, 1) * 0.55;
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawSpeedLines() {
    const k = clamp((G.speed - 360) / 280, 0, 1);
    if (k <= 0) return;
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 9; i++) {
      const seed = hash(i * 9.31 + 4);
      const y = 80 + seed * (GROUND - 140);
      const sp = 300 + seed * 500;
      const total = W + 360;
      let x = total - ((G.time * sp + seed * 947) % total) - 180;
      const len = 40 + seed * 90;
      ctx.globalAlpha = (0.035 + 0.075 * k) * (0.4 + seed * 0.6);
      ctx.fillStyle = "#dff6ff";
      ctx.fillRect(x, y, len, 1);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function drawSlowOverlay() {
    if (G.timeScale > 0.92) return;
    const k = clamp((1 - G.timeScale) / 0.44, 0, 1);
    ctx.fillStyle = "rgba(80,130,255," + (0.06 * k) + ")";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(130,185,255," + (0.22 * k) + ")";
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, W - 4, H - 4);
    for (let i = 0; i < 14; i++) {
      const x = hash(i * 2.3) * W;
      const y = hash(i * 7.7) * H;
      ctx.globalAlpha = 0.5 * k;
      ctx.fillStyle = "#cfe3ff";
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawLowFog() {
    const g = ctx.createLinearGradient(0, GROUND - 90, 0, GROUND + 30);
    g.addColorStop(0, "rgba(180,220,210,0)");
    g.addColorStop(0.7, "rgba(180,220,210," + (0.035 + G.night * 0.05) + ")");
    g.addColorStop(1, "rgba(180,220,210,0.02)");
    ctx.fillStyle = g;
    ctx.fillRect(0, GROUND - 90, W, 120);
  }

  function drawObjects() {
    // platforms behind everything
    for (const o of G.objects) {
      if (o.kind === "platform" && !o.dead) drawPlatform(o);
    }
    for (const o of G.objects) {
      if (o.dead) continue;
      if (o.kind === "ember") drawEmber(o);
      else if (o.kind === "perk") drawPerk(o);
    }
    for (const o of G.objects) {
      if (o.dead) continue;
      if (o.kind === "spike") drawSpike(o);
      else if (o.kind === "saw") drawSaw(o);
      else if (o.kind === "slime") drawSlime(o);
      else if (o.kind === "bat") drawBat(o);
      else if (o.kind === "charger") drawCharger(o);
      else if (o.kind === "spitter") drawSpitter(o);
    }
  }

  function drawProjectiles() {
    for (const pr of G.projectiles) {
      if (!pr.dead) drawProjectile(pr);
    }
  }

  function drawScene() {
    if (!assetsReady) {
      ctx.fillStyle = "#0a1516";
      ctx.fillRect(0, 0, W, H);
      return;
    }
    drawSky();
    drawBackground();
    drawMidTrees();
    // push the backdrop back so the runner and hazards read clearly
    ctx.fillStyle = "rgba(5,14,12,0.12)";
    ctx.fillRect(0, 0, W, H);
    drawAmbient();
    drawGround();

    if (G.mode === "menu") {
      drawIdleHero(W * 0.8, GROUND, 0.34);
      drawLowFog();
      return;
    }

    drawNightTint();
    drawObjects();
    drawProjectiles();
    drawPlayer();
    drawParticles();
    drawFloaters();
    drawLowFog();
    drawSpeedLines();
    drawSlowOverlay();
  }

  function draw() {
    const shake = G.shake;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shake > 0.2) {
      ctx.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake);
    }
    drawScene();
    ctx.restore();
    if (G.flash > 0.001) {
      ctx.fillStyle = "rgba(" + G.flashColor + "," + clamp(G.flash, 0, 0.6) + ")";
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ------------------------------------------------------------------ HUD */

  const lastUi = { score: -1, dist: -1, level: -1, mult: -1, best: -1, fill: -1 };

  function updateHud(force) {
    if (G.mode === "menu") return;
    const score = Math.floor(G.score);
    if (force || score !== lastUi.score) {
      els.score.textContent = fmt(score);
      lastUi.score = score;
    }
    const meters = Math.floor(G.meters);
    if (force || meters !== lastUi.dist) {
      els.dist.textContent = fmt(meters);
      lastUi.dist = meters;
    }
    if (force || G.level !== lastUi.level) {
      els.levelNum.textContent = String(G.level);
      lastUi.level = G.level;
    }
    const shownBest = Math.max(BEST.score, score);
    if (force || shownBest !== lastUi.best) {
      els.best.textContent = fmt(shownBest);
      lastUi.best = shownBest;
      els.best.parentElement.classList.toggle("record", score > BEST.score && BEST.score > 0);
    }
    const mult = G.mult;
    if (force || mult !== lastUi.mult) {
      lastUi.mult = mult;
      els.comboMult.textContent = "×" + mult;
      els.combo.classList.toggle("on", G.combo >= 2);
      if (mult > 1) {
        els.combo.classList.remove("pop");
        void els.combo.offsetWidth;
        els.combo.classList.add("pop");
      }
    } else {
      els.combo.classList.toggle("on", G.combo >= 2);
    }
    const fill = (G.meters % LEVEL_METERS) / LEVEL_METERS;
    if (force || Math.abs(fill - lastUi.fill) > 0.002) {
      els.levelFill.style.transform = "scaleX(" + fill + ")";
      lastUi.fill = fill;
    }
    if (G.comboTimer > 0) {
      els.comboFill.style.transform = "scaleX(" + clamp(G.comboTimer / COMBO_TIME, 0, 1) + ")";
    } else {
      els.comboFill.style.transform = "scaleX(0)";
    }
    updateHearts(false);
  }

  /* ----------------------------------------------------------------- loop */

  let lastFrame = performance.now();
  let accumulator = 0;

  function frame(now) {
    const raw = clamp((now - lastFrame) / 1000, 0, 0.05);
    lastFrame = now;
    G.time += raw;

    if (assetsReady) {
      if (G.mode === "playing") {
        if (G.hitstop <= 0) {
          G.timeScale = lerp(G.timeScale, G.timeScaleTarget, Math.min(1, raw * 10));
          accumulator += raw * G.timeScale;
          let steps = 0;
          while (accumulator >= STEP && steps < 4) {
            updateSim(STEP);
            accumulator -= STEP;
            steps++;
          }
          if (steps >= 4) accumulator = 0;
        }
        updateRealTimers(raw);
        updateTimeScaleTarget();
        updateHud(false);
      } else if (G.mode === "dying") {
        updateDying(raw);
      } else if (G.mode === "menu") {
        updateMenu(raw);
      }
    }

    draw();
    requestAnimationFrame(frame);
  }

  /* ----------------------------------------------------------------- init */

  setMenuBest();
  els.startScreen.classList.remove("hidden");
  els.hud.classList.add("hidden");

  if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
    els.touch.classList.remove("hidden");
  } else if ("ontouchstart" in window) {
    els.touch.classList.remove("hidden");
  }

  els.btnStart.addEventListener("click", () => {
    unlockAudio();
    startGame();
  });
  els.btnSound.addEventListener("click", (e) => {
    e.stopPropagation();
    unlockAudio();
    toggleSound();
  });
  els.btnPause.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePause();
  });
  els.btnResume.addEventListener("click", () => togglePause(false));
  els.btnPauseRestart.addEventListener("click", () => {
    playSound("ui");
    startGame();
  });
  els.btnPauseMenu.addEventListener("click", () => {
    playSound("ui");
    backToMenu();
  });
  els.btnRestart.addEventListener("click", () => {
    playSound("ui");
    startGame();
  });
  els.btnMenu.addEventListener("click", () => {
    playSound("ui");
    backToMenu();
  });

  els.btnSound.classList.toggle("muted", muted);

  loadAssets()
    .then(() => {
      assetsReady = true;
      const label = els.btnStart.querySelector(".btn-label");
      if (label) label.textContent = "ВПЕРЁД";
      els.btnStart.disabled = false;
      setMenuBest();
    })
    .catch((err) => {
      console.error(err);
      const label = els.btnStart.querySelector(".btn-label");
      if (label) label.textContent = "ОШИБКА АССЕТОВ";
    });

  requestAnimationFrame(frame);

  // debugging hooks used by automated checks; harmless in production
  window.__EMBER__ = {
    state: G,
    start: startGame,
    perk: grantPerk,
    addPerkObject: addPerk,
    pattern: (name) => {
      const map = {
        spike: patSpike,
        slime: patSlime,
        bat: patBat,
        saw: patSaw,
        platform: patPlatform,
        orb: patOrb,
        batwave: patBatWave,
        charger: patCharger,
        chargerspike: patChargerSpike,
        spitter: patSpitter,
        spitterbat: patSpitterBat,
      };
      if (map[name]) map[name](W + 100);
    },
    setLevel: (n) => {
      G.distance = (Math.max(1, n) - 1) * LEVEL_METERS * 20;
      G.level = Math.max(1, Math.min(MAX_LEVEL, n));
      G.targetSpeed = Math.min(640, 250 + (G.level - 1) * 22.5);
      G.speed = G.targetSpeed;
      G.nextSurgeIn = 100;
    },
    hurt: hurtPlayer,
    step: (seconds) => {
      const total = clamp(seconds == null ? STEP : seconds, 0, 5);
      const n = Math.max(1, Math.round(total / STEP));
      G.time += total;
      if (G.mode === "playing") {
        for (let i = 0; i < n; i++) updateSim(STEP);
        updateRealTimers(total);
        updateTimeScaleTarget();
        updateHud(false);
      } else if (G.mode === "dying") {
        updateDying(total);
      } else if (G.mode === "menu") {
        updateMenu(total);
      }
      draw();
      return G;
    },
  };
})();
