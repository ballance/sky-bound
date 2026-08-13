// Load/save progress to localStorage. Corrupt/absent save → fresh defaults.
import { STARTING_PARTS, START_KNOWLEDGE } from "./parts.js";

const KEY = "skybound.save.v1";

function defaults() {
  return {
    knowledge: START_KNOWLEDGE,
    unlockedParts: [...STARTING_PARTS],
    milestonesEarned: [],
    missionsDone: [],
    savedRocket: null,
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const s = JSON.parse(raw);
    // shallow-merge so a partial/old save never crashes the game
    const merged = { ...defaults(), ...s };
    // ensure every starting part is owned (covers old saves + newly-promoted parts)
    for (const id of STARTING_PARTS) {
      if (!merged.unlockedParts.includes(id)) merged.unlockedParts.push(id);
    }
    return merged;
  } catch {
    return defaults();
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked — progress just won't persist this session */
  }
}

export function reset() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  return defaults();
}
