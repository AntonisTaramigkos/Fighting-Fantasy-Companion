/* Fighting Fantasy Manager - LocalStorage (Full Manager)
   Features:
   - Landing page + artwork
   - New Game wizard: name + animated dice rolls (Skill/Stamina/Luck)
   - Full manager: sheet, inventory, potions, luck tests, encounters, combat helper
   - Dice roller modal (1-2 dice, animated, logged)
   - Export Save (Import removed)
*/

const STORAGE_KEY = "ff_manager_state_v1";

/* -------------------- Utilities -------------------- */
const el = (id) => document.getElementById(id);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const nowStamp = () => new Date().toLocaleString();

function rollDieSides(sides) {
  return Math.floor(Math.random() * sides) + 1;
}
function rollDie() { return rollDieSides(6); }
function roll2d6() { return rollDie() + rollDie(); }

function downloadJson(filename, dataObj) {
  const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

/** Animated die: rapidly changes numbers then settles on final */
function animateDieSides(element, sides, durationMs = 650, intervalMs = 55) {
  element.classList.add("rolling");
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      element.textContent = String(rollDieSides(sides));
      if (Date.now() - start >= durationMs) {
        clearInterval(timer);
        element.classList.remove("rolling");
        const final = rollDieSides(sides);
        element.textContent = String(final);
        resolve(final);
      }
    }, intervalMs);
  });
}

/* -------------------- State -------------------- */
function createDefaultState() {
  return {
    version: 1,
    player: {
      name: "",
      skill: { initial: null, current: null },
      stamina: { initial: null, current: null },
      luck: { initial: null, current: null },
      provisions: 10,
      gold: 0,
      equipment: [],
      treasure: [],
      potion: { choice: "none", used: false },
    },
    encounters: [], // {id,name,skill,stamina:{initial,current},status}
    activeEncounterId: null,
    logs: { luck: [], combat: [], dice: [] },
  };
}

let state = loadState();

/* -------------------- Persistence -------------------- */
function hasSave() {
  return !!localStorage.getItem(STORAGE_KEY);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function sanitizeState(s) {
  const d = createDefaultState();
  const out = { ...d, ...s };
  out.player = { ...d.player, ...(s.player || {}) };

  ["skill", "stamina", "luck"].forEach((k) => {
    out.player[k] = { ...d.player[k], ...(out.player[k] || {}) };
  });

  out.player.name = typeof out.player.name === "string" ? out.player.name : "";
  out.player.equipment = Array.isArray(out.player.equipment) ? out.player.equipment : [];
  out.player.treasure = Array.isArray(out.player.treasure) ? out.player.treasure : [];
  out.player.provisions = Number.isFinite(out.player.provisions) ? out.player.provisions : 10;
  out.player.gold = Number.isFinite(out.player.gold) ? out.player.gold : 0;

  out.player.potion = { ...d.player.potion, ...(out.player.potion || {}) };
  if (!["none", "skill", "strength", "fortune"].includes(out.player.potion.choice)) {
    out.player.potion.choice = "none";
  }
  out.player.potion.used = !!out.player.potion.used;

  out.encounters = Array.isArray(out.encounters) ? out.encounters : [];
  out.activeEncounterId = out.activeEncounterId ?? null;

  out.logs = { ...d.logs, ...(out.logs || {}) };
  out.logs.luck = Array.isArray(out.logs.luck) ? out.logs.luck : [];
  out.logs.combat = Array.isArray(out.logs.combat) ? out.logs.combat : [];
  out.logs.dice = Array.isArray(out.logs.dice) ? out.logs.dice : [];

  enforceCaps(out);
  return out;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    return sanitizeState(JSON.parse(raw));
  } catch {
    return createDefaultState();
  }
}

/* -------------------- Navigation -------------------- */
function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  el(`screen-${name}`).classList.add("active");
}

/* -------------------- Rules & Helpers -------------------- */
function hasStatsRolled() {
  const p = state.player;
  return [p.skill.initial, p.stamina.initial, p.luck.initial].every((v) => Number.isFinite(v));
}

function enforceCaps(s = state) {
  const p = s.player;
  ["skill", "stamina", "luck"].forEach((k) => {
    const init = p[k].initial;
    const cur = p[k].current;
    if (Number.isFinite(init) && Number.isFinite(cur)) {
      p[k].current = clamp(cur, 0, init);
    }
  });
  p.provisions = clamp(p.provisions, 0, 999);
  p.gold = clamp(p.gold, 0, 999999);
}

function logLuck(msg) {
  state.logs.luck.unshift(`[${nowStamp()}] ${msg}`);
}
function logCombat(msg) {
  state.logs.combat.unshift(`[${nowStamp()}] ${msg}`);
}
function logDice(msg) {
  state.logs.dice.unshift(`[${nowStamp()}] ${msg}`);
}

/* ---- Official initial rolls ---- */
function rollInitialStats() {
  const p = state.player;
  p.skill.initial = rollDie() + 6;
  p.skill.current = p.skill.initial;

  p.stamina.initial = roll2d6() + 12;
  p.stamina.current = p.stamina.initial;

  p.luck.initial = rollDie() + 6;
  p.luck.current = p.luck.initial;

  logLuck("Rolled initial stats.");
  saveState();
  renderApp();
}

/* ---- Actions ---- */
function eatProvision() {
  const p = state.player;
  if (!hasStatsRolled()) return logLuck("Roll stats first.");
  if (p.provisions <= 0) return logLuck("No provisions left.");

  p.provisions -= 1;
  p.stamina.current = clamp(p.stamina.current + 4, 0, p.stamina.initial);

  saveState();
  renderApp();
}

function testLuck() {
  const p = state.player;
  if (!hasStatsRolled()) return logLuck("Roll stats first.");

  const roll = roll2d6();
  const wasLucky = roll <= p.luck.current;

  const before = p.luck.current;
  p.luck.current = clamp(p.luck.current - 1, 0, p.luck.initial);

  logLuck(`Test Your Luck: rolled ${roll} vs LUCK ${before} → ${wasLucky ? "LUCKY ✅" : "UNLUCKY ❌"}. LUCK now ${p.luck.current}.`);
  saveState();
  renderApp();
  return wasLucky;
}

function choosePotion(value) {
  state.player.potion.choice = value;
  saveState();
  renderApp();
}

function usePotion() {
  const p = state.player;
  if (!hasStatsRolled()) return logLuck("Roll stats first.");
  if (p.potion.used) return logLuck("Potion already used this adventure.");
  if (p.potion.choice === "none") return logLuck("Choose a potion first.");

  if (p.potion.choice === "skill") {
    p.skill.current = p.skill.initial;
    logLuck("Used Potion of Skill: SKILL restored to Initial.");
  } else if (p.potion.choice === "strength") {
    p.stamina.current = p.stamina.initial;
    logLuck("Used Potion of Strength: STAMINA restored to Initial.");
  } else if (p.potion.choice === "fortune") {
    p.luck.initial = (p.luck.initial ?? 0) + 1;
    p.luck.current = p.luck.initial;
    logLuck("Used Potion of Fortune: Initial LUCK +1, LUCK restored.");
  }

  p.potion.used = true;
  enforceCaps();
  saveState();
  renderApp();
}

/* -------------------- Inventory -------------------- */
function addListItem(kind, text) {
  const clean = (text || "").trim();
  if (!clean) return;
  state.player[kind].push(clean);
  saveState();
  renderApp();
}
function removeListItem(kind, index) {
  state.player[kind].splice(index, 1);
  saveState();
  renderApp();
}

/* -------------------- Encounters -------------------- */
function addEncounter() {
  const name = prompt("Monster name?");
  if (!name) return;

  const skill = Number(prompt("Monster SKILL? (number)", "8"));
  const stamina = Number(prompt("Monster STAMINA? (number)", "8"));
  if (!Number.isFinite(skill) || !Number.isFinite(stamina)) return;

  const enc = {
    id: uid(),
    name: name.trim(),
    skill: clamp(skill, 1, 99),
    stamina: { initial: clamp(stamina, 1, 999), current: clamp(stamina, 0, 999) },
    status: "active", // active | defeated | escaped
  };

  state.encounters.unshift(enc);
  state.activeEncounterId = enc.id;

  saveState();
  renderApp();
}

function setActiveEncounter(id) {
  state.activeEncounterId = id;
  saveState();
  renderApp();
}

function findActiveEncounter() {
  return state.encounters.find((e) => e.id === state.activeEncounterId) || null;
}

function damageEncounter(id, dmg) {
  const enc = state.encounters.find((e) => e.id === id);
  if (!enc) return;

  enc.stamina.current = clamp(enc.stamina.current - dmg, 0, enc.stamina.initial);
  if (enc.stamina.current === 0) enc.status = "defeated";

  saveState();
  renderApp();
}

function removeEncounter(id) {
  state.encounters = state.encounters.filter((e) => e.id !== id);
  if (state.activeEncounterId === id) state.activeEncounterId = null;
  saveState();
  renderApp();
}

function toggleEncounterEscaped(id) {
  const enc = state.encounters.find((e) => e.id === id);
  if (!enc) return;
  enc.status = enc.status === "escaped" ? "active" : "escaped";
  saveState();
  renderApp();
}

/* -------------------- Combat -------------------- */
function combatRound(useLuck) {
  const p = state.player;
  const enc = findActiveEncounter();

  if (!hasStatsRolled()) return logCombat("Roll stats first.");
  if (!enc) return logCombat("No active monster selected.");
  if (enc.status !== "active") return logCombat("Active monster is not in 'active' status.");

  const playerRoll = roll2d6();
  const monsterRoll = roll2d6();

  const playerAS = playerRoll + p.skill.current;
  const monsterAS = monsterRoll + enc.skill;

  let damage = 2;
  let outcome = "tie";
  if (playerAS > monsterAS) outcome = "player";
  else if (monsterAS > playerAS) outcome = "monster";

  if (useLuck && outcome !== "tie") {
    const luckRoll = roll2d6();
    const beforeLuck = p.luck.current;
    const lucky = luckRoll <= p.luck.current;

    // Luck always decreases after testing
    p.luck.current = clamp(p.luck.current - 1, 0, p.luck.initial);

    // FF luck-in-battle rules
    if (outcome === "player") damage = lucky ? 4 : 1;
    else damage = lucky ? 1 : 3;

    logCombat(`Luck used: rolled ${luckRoll} vs LUCK ${beforeLuck} → ${lucky ? "LUCKY ✅" : "UNLUCKY ❌"}. LUCK now ${p.luck.current}.`);
  }

  if (outcome === "player") {
    enc.stamina.current = clamp(enc.stamina.current - damage, 0, enc.stamina.initial);
    if (enc.stamina.current === 0) enc.status = "defeated";
    logCombat(`Player wins: Player AS ${playerAS} (2d6=${playerRoll}+SKILL=${p.skill.current}) vs Monster AS ${monsterAS} (2d6=${monsterRoll}+SKILL=${enc.skill}). Damage to monster: ${damage}.`);
  } else if (outcome === "monster") {
    p.stamina.current = clamp(p.stamina.current - damage, 0, p.stamina.initial);
    logCombat(`Monster wins: Monster AS ${monsterAS} (2d6=${monsterRoll}+SKILL=${enc.skill}) vs Player AS ${playerAS} (2d6=${playerRoll}+SKILL=${p.skill.current}). Damage to player: ${damage}.`);
  } else {
    logCombat(`Tie: Player AS ${playerAS} vs Monster AS ${monsterAS}. No damage.`);
  }

  enforceCaps();
  saveState();
  renderApp();
}

/* -------------------- Rendering -------------------- */
function setText(id, text) {
  el(id).textContent = text;
}

function renderList(listId, items, onRemove) {
  const ul = el(listId);
  ul.innerHTML = "";

  items.forEach((item, idx) => {
    const li = document.createElement("li");
    const left = document.createElement("span");
    left.textContent = item;

    const btn = document.createElement("button");
    btn.className = "small";
    btn.textContent = "Remove";
    btn.addEventListener("click", () => onRemove(idx));

    li.appendChild(left);
    li.appendChild(btn);
    ul.appendChild(li);
  });

  if (items.length === 0) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="badge">Empty</span><span></span>`;
    ul.appendChild(li);
  }
}

function renderEncounters() {
  const root = el("encounterList");
  root.innerHTML = "";

  if (state.encounters.length === 0) {
    const div = document.createElement("div");
    div.className = "encounter";
    div.textContent = "No monsters yet. Click “Add Monster”.";
    root.appendChild(div);
    return;
  }

  state.encounters.forEach((e) => {
    const wrap = document.createElement("div");
    wrap.className = "encounter" + (e.id === state.activeEncounterId ? " active" : "");

    const title = document.createElement("h3");
    title.textContent = e.name;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `SKILL ${e.skill} · STAMINA ${e.stamina.current}/${e.stamina.initial} · Status: ${e.status}`;

    const controls = document.createElement("div");
    controls.className = "controls";

    const mkBtn = (text, onClick, danger = false) => {
      const b = document.createElement("button");
      b.className = "small";
      b.textContent = text;
      if (danger) b.style.background = "#2a151a";
      b.addEventListener("click", onClick);
      return b;
    };

    controls.append(
      mkBtn(e.id === state.activeEncounterId ? "Active ✓" : "Set Active", () => setActiveEncounter(e.id)),
      mkBtn("-2", () => damageEncounter(e.id, 2)),
      mkBtn("-1", () => damageEncounter(e.id, 1)),
      mkBtn("-3", () => damageEncounter(e.id, 3)),
      mkBtn(e.status === "escaped" ? "Un-Escape" : "Escape", () => toggleEncounterEscaped(e.id)),
      mkBtn("Delete", () => removeEncounter(e.id), true),
    );

    wrap.append(title, meta, controls);
    root.appendChild(wrap);
  });
}

function renderApp() {
  const p = state.player;

  // Banner
  const name = p.name?.trim();
  el("playerBanner").textContent = name ? `Player: ${name}` : "Player: (no name)";

  // Stats
  setText("skillInitial", p.skill.initial ?? "—");
  setText("skillCurrent", p.skill.current ?? "—");
  setText("staminaInitial", p.stamina.initial ?? "—");
  setText("staminaCurrent", p.stamina.current ?? "—");
  setText("luckInitial", p.luck.initial ?? "—");
  setText("luckCurrent", p.luck.current ?? "—");

  setText("provisions", p.provisions);
  setText("gold", p.gold);

  // Potion
  el("potionSelect").value = p.potion.choice;
  setText("potionStatus", p.potion.used ? "Potion used ✅ (one per adventure)" : "Potion not used.");

  // Lists
  renderList("equipmentList", p.equipment, (idx) => removeListItem("equipment", idx));
  renderList("treasureList", p.treasure, (idx) => removeListItem("treasure", idx));

  // Logs
  el("luckLog").textContent = state.logs.luck.slice(0, 12).join("\n") || "No luck tests yet.";
  el("combatLog").textContent = state.logs.combat.slice(0, 14).join("\n") || "No combat rounds yet.";

  // Encounters
  renderEncounters();

  // Combat info
  const active = findActiveEncounter();
  el("combatInfo").textContent = active
    ? `Active: ${active.name} | SKILL ${active.skill} | STAMINA ${active.stamina.current}/${active.stamina.initial} | Status: ${active.status}`
    : "No active monster. Add one and select it.";
}

/* -------------------- New Game Wizard -------------------- */
const wizard = { rolled: { skill: false, stamina: false, luck: false } };

function wizardResetUI() {
  el("diceSkill").textContent = "—";
  el("diceStam1").textContent = "—";
  el("diceStam2").textContent = "—";
  el("diceLuck").textContent = "—";
  el("skillOut").textContent = "—";
  el("staminaOut").textContent = "—";
  el("luckOut").textContent = "—";
  el("newgameStatus").textContent = "Roll all three stats to continue.";
  el("btnContinueToGame").disabled = true;
  wizard.rolled = { skill: false, stamina: false, luck: false };
}

function wizardUpdateContinue() {
  const done = wizard.rolled.skill && wizard.rolled.stamina && wizard.rolled.luck;
  el("btnContinueToGame").disabled = !done;
  el("newgameStatus").textContent = done ? "Ready ✅ You can continue to the manager." : "Roll all three stats to continue.";
}

async function wizardRollSkill() {
  const d = await animateDieSides(el("diceSkill"), 6);
  const total = d + 6;

  state.player.skill.initial = total;
  state.player.skill.current = total;

  wizard.rolled.skill = true;
  el("skillOut").textContent = String(total);
  saveState();
  wizardUpdateContinue();
}

async function wizardRollStamina() {
  const d1 = await animateDieSides(el("diceStam1"), 6);
  const d2 = await animateDieSides(el("diceStam2"), 6);
  const total = d1 + d2 + 12;

  state.player.stamina.initial = total;
  state.player.stamina.current = total;

  wizard.rolled.stamina = true;
  el("staminaOut").textContent = String(total);
  saveState();
  wizardUpdateContinue();
}

async function wizardRollLuck() {
  const d = await animateDieSides(el("diceLuck"), 6);
  const total = d + 6;

  state.player.luck.initial = total;
  state.player.luck.current = total;

  wizard.rolled.luck = true;
  el("luckOut").textContent = String(total);
  saveState();
  wizardUpdateContinue();
}

async function wizardRollAll() {
  await wizardRollSkill();
  await wizardRollStamina();
  await wizardRollLuck();
}

/* -------------------- Tabs -------------------- */
function setupTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      el(`tab-${btn.dataset.tab}`).classList.add("active");
    });
  });
}

/* -------------------- Dice Modal -------------------- */
function diceModalSetOpen(isOpen) {
  const modal = el("diceModal");
  if (isOpen) {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    updateDiceCountUI();
    renderDiceModalLog();
  } else {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }
}

function updateDiceCountUI() {
  const count = Number(el("diceCount").value);
  el("diceFace2Box").classList.toggle("hidden", count !== 2);
}

function renderDiceModalLog() {
  const lines = state.logs.dice.slice(0, 10);
  el("diceModalLog").textContent = lines.length ? lines.join("\n") : "No rolls yet.";
}

function clearDiceModalResult() {
  el("diceModalFace1").textContent = "—";
  el("diceModalFace2").textContent = "—";
  el("diceModalTotal").textContent = "—";
}

/* -------------------- Events -------------------- */
function setupEvents() {
  // Landing
  el("btnLandingNew").addEventListener("click", () => {
    showScreen("newgame");
    wizardResetUI();
    el("playerNameInput").value = state.player.name || "";
    el("landingHint").textContent = "";
  });

  el("btnLandingLoad").addEventListener("click", () => {
    if (!hasSave()) {
      el("landingHint").textContent = "No local save found. Start a New Game.";
      return;
    }
    state = loadState();
    showScreen("app");
    renderApp();
  });

  el("btnLandingExit").addEventListener("click", () => {
    el("landingHint").textContent = "To exit, just close this tab/app window 🙂";
  });

  // New Game
  el("btnBackToLanding").addEventListener("click", () => showScreen("landing"));

  el("btnStartFresh").addEventListener("click", () => {
    const name = el("playerNameInput").value.trim();
    state = createDefaultState();
    state.player.name = name;
    saveState();
    wizardResetUI();
  });

  el("btnRollSkill").addEventListener("click", wizardRollSkill);
  el("btnRollStamina").addEventListener("click", wizardRollStamina);
  el("btnRollLuck").addEventListener("click", wizardRollLuck);
  el("btnRollAll").addEventListener("click", wizardRollAll);

  el("btnContinueToGame").addEventListener("click", () => {
    state.player.name = el("playerNameInput").value.trim();
    saveState();
    showScreen("app");
    renderApp();
  });

  // Main app toolbar
  el("btnHome").addEventListener("click", () => {
    showScreen("landing");
    el("landingHint").textContent = "";
  });

  el("btnNewAdventure").addEventListener("click", () => {
    const ok = confirm("Start a NEW adventure? This overwrites the current local save.");
    if (!ok) return;
    state = createDefaultState();
    saveState();
    showScreen("newgame");
    wizardResetUI();
    el("playerNameInput").value = "";
  });

  el("btnExport").addEventListener("click", () => {
    downloadJson(`ff-save-${Date.now()}.json`, state);
  });

  // Sheet buttons
  el("btnRollStats").addEventListener("click", rollInitialStats);
  el("btnEat").addEventListener("click", eatProvision);
  el("btnTestLuck").addEventListener("click", testLuck);

  el("potionSelect").addEventListener("change", (e) => choosePotion(e.target.value));
  el("btnUsePotion").addEventListener("click", usePotion);

  el("btnAddEquipment").addEventListener("click", () => {
    addListItem("equipment", el("equipmentInput").value);
    el("equipmentInput").value = "";
  });

  el("btnAddTreasure").addEventListener("click", () => {
    addListItem("treasure", el("treasureInput").value);
    el("treasureInput").value = "";
  });

  // Steppers (delegated)
  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const a = btn.dataset.action;
    const p = state.player;

    const adjustStat = (key, delta) => {
      if (!hasStatsRolled()) return;
      p[key].current = clamp(p[key].current + delta, 0, p[key].initial);
      saveState();
      renderApp();
    };

    switch (a) {
      case "inc-skill": adjustStat("skill", +1); break;
      case "dec-skill": adjustStat("skill", -1); break;
      case "inc-stamina": adjustStat("stamina", +1); break;
      case "dec-stamina": adjustStat("stamina", -1); break;
      case "inc-luck": adjustStat("luck", +1); break;
      case "dec-luck": adjustStat("luck", -1); break;

      case "inc-provisions":
        p.provisions = clamp(p.provisions + 1, 0, 999);
        saveState(); renderApp();
        break;
      case "dec-provisions":
        p.provisions = clamp(p.provisions - 1, 0, 999);
        saveState(); renderApp();
        break;

      case "inc-gold":
        p.gold = clamp(p.gold + 1, 0, 999999);
        saveState(); renderApp();
        break;
      case "dec-gold":
        p.gold = clamp(p.gold - 1, 0, 999999);
        saveState(); renderApp();
        break;
    }
  });

  // Encounters + combat
  el("btnAddEncounter").addEventListener("click", addEncounter);
  el("btnCombatRound").addEventListener("click", () => combatRound(el("chkUseLuck").checked));

  // Dice modal
  el("btnDice").addEventListener("click", () => diceModalSetOpen(true));
  el("btnDiceClose").addEventListener("click", () => diceModalSetOpen(false));
  el("diceModalBackdrop").addEventListener("click", () => diceModalSetOpen(false));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el("diceModal").classList.contains("open")) {
      diceModalSetOpen(false);
    }
  });

  el("diceCount").addEventListener("change", updateDiceCountUI);

  el("btnDiceClear").addEventListener("click", () => {
    clearDiceModalResult();
    state.logs.dice = [];
    saveState();
    renderDiceModalLog();
  });

  el("btnDiceRoll").addEventListener("click", async () => {
    const count = Number(el("diceCount").value);
    const sides = Number(el("diceSides").value);

    clearDiceModalResult();

    const r1 = await animateDieSides(el("diceModalFace1"), sides);
    let r2 = 0;

    if (count === 2) {
      r2 = await animateDieSides(el("diceModalFace2"), sides);
    }

    const total = r1 + r2;
    el("diceModalTotal").textContent = String(total);

    const label = count === 2
      ? `Rolled 2d${sides}: ${r1} + ${r2} = ${total}`
      : `Rolled 1d${sides}: ${r1}`;

    logDice(label);
    saveState();
    renderDiceModalLog();
  });
}

/* -------------------- Boot -------------------- */
setupTabs();
setupEvents();

if (!hasSave()) {
  el("landingHint").textContent = "No save found yet. Tap New Game to begin.";
  showScreen("landing");
} else {
  el("landingHint").textContent = "Save found ✅ You can Load Game or start New Game.";
  showScreen("landing");
}
/* -----------Service Worker --------*/
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then(() => console.log("Service Worker Registered"))
      .catch((err) => console.error("SW registration failed:", err));
  });
}
