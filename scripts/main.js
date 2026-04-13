const MODULE_ID = "reaction-reminder-dot";
const FLAG_SPENT = "spentReaction";
const REACTION_TYPES = new Set(["reaction", "reactiondamage", "reactionmanual"]);

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "enableAutoTrack", {
    name: "RRD.SettingsEnableAutoTrackName",
    hint: "RRD.SettingsEnableAutoTrackHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "allowPlayersToToggleOwned", {
    name: "RRD.SettingsAllowPlayersToggleName",
    hint: "RRD.SettingsAllowPlayersToggleHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
});

Hooks.on("renderApplicationV2", (app, element) => {
  if (!isCombatTrackerApp(app)) return;

  const combat = game.combat;
  if (!combat) return;

  const rows = element.querySelectorAll("[data-combatant-id]");

  for (const row of rows) {
    const combatantId = row.dataset.combatantId;
    const combatant = combat.combatants.get(combatantId);
    if (!combatant) continue;

    let dot = row.querySelector(".rrd-dot");
    if (!dot) {
      dot = document.createElement("button");
      dot.type = "button";
      dot.className = "rrd-dot";
      dot.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (!canToggle(combatant)) return;

        const isSpent = !!combatant.getFlag(MODULE_ID, FLAG_SPENT);
        await combatant.setFlag(MODULE_ID, FLAG_SPENT, !isSpent);
        ui.combat?.render(false);
      });

      const anchor = row.querySelector(".token-name, .combatant-name, h4") ?? row;
      anchor.appendChild(dot);
    }

    const isSpent = !!combatant.getFlag(MODULE_ID, FLAG_SPENT);
    dot.dataset.spent = isSpent ? "true" : "false";
    dot.title = isSpent
      ? game.i18n.localize("RRD.DotSpentTitle")
      : game.i18n.localize("RRD.DotAvailableTitle");

    if (canToggle(combatant)) {
      dot.removeAttribute("disabled");
    } else {
      dot.setAttribute("disabled", "disabled");
    }
  }
});

Hooks.on("combatTurnChange", async (combat, prior, current) => {
  if (!combat?.started) return;

  const turnIndex = current?.turn;
  if (!Number.isInteger(turnIndex)) return;

  const currentCombatant = combat.turns?.[turnIndex];
  if (!currentCombatant) return;

  const alreadyReset = !currentCombatant.getFlag(MODULE_ID, FLAG_SPENT);
  if (alreadyReset) return;

  await currentCombatant.setFlag(MODULE_ID, FLAG_SPENT, false);
  ui.combat?.render(false);
});

Hooks.on("combatStart", async (combat) => {
  for (const combatant of combat.combatants) {
    if (!combatant.getFlag(MODULE_ID, FLAG_SPENT)) continue;
    await combatant.setFlag(MODULE_ID, FLAG_SPENT, false);
  }
  ui.combat?.render(false);
});

Hooks.on("dnd5e.postUseActivity", async (...args) => {
  if (!game.settings.get(MODULE_ID, "enableAutoTrack")) return;

  const activity = args[0];
  if (!activity) return;

  const activationType = String(
    activity?.activation?.type
      ?? activity?.system?.activation?.type
      ?? activity?.item?.system?.activation?.type
      ?? ""
  ).toLowerCase();

  if (!REACTION_TYPES.has(activationType)) return;

  const actor = activity?.actor ?? activity?.item?.actor;
  if (!actor) return;

  const combat = game.combat;
  if (!combat?.started) return;

  const combatant = combat.combatants.find((entry) => entry.actor?.id === actor.id);
  if (!combatant) return;

  if (combatant.getFlag(MODULE_ID, FLAG_SPENT)) return;

  await combatant.setFlag(MODULE_ID, FLAG_SPENT, true);
  ui.combat?.render(false);
});

function canToggle(combatant) {
  if (game.user.isGM) return true;
  if (!game.settings.get(MODULE_ID, "allowPlayersToToggleOwned")) return false;
  return !!combatant.actor?.testUserPermission(game.user, "OWNER");
}

function isCombatTrackerApp(app) {
  if (!app) return false;
  if (app.id === "combat") return true;
  return app.constructor?.name === "CombatTracker";
}
