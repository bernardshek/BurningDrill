export type DrillSettings = {
  format: "cash";
  tableSize: 6 | 9;
  line: string;
  difficulty: "easy" | "medium" | "hard";
  packId: string;
  /** Close-decisions-only sampler mode. */
  closeOnly: boolean;
  /** Named mini-drill filter (btn_flop_cbet | bb_vs_cbet | all). */
  drillId: string;
};

const SETTINGS_KEY = "poker-trainer:saved-drill";

export const DEFAULT_SETTINGS: DrillSettings = {
  format: "cash",
  tableSize: 6,
  line: "BTN_vs_BB_SRP",
  difficulty: "medium",
  packId: "toy-6max-expand",
  closeOnly: false,
  drillId: "btn_flop_cbet",
};

export function loadSavedDrill(): DrillSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DrillSettings>;
    // Migrate legacy default pack id so Random lands on expand.
    let packId = parsed.packId ?? DEFAULT_SETTINGS.packId;
    if (packId === "toy-6max") packId = "toy-6max-expand";
    const drillId =
      typeof parsed.drillId === "string" && parsed.drillId.length > 0
        ? parsed.drillId
        : DEFAULT_SETTINGS.drillId;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      packId,
      closeOnly: Boolean(parsed.closeOnly),
      drillId,
    };
  } catch {
    return null;
  }
}

export function saveDrillSettings(settings: DrillSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
