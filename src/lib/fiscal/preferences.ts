import { defaultFilters, CATEGORIES, type FiscalDirection, type FiscalFilters } from "./domain";
const key = (companyId: string, direction: FiscalDirection) =>
  `mesachef:fiscal:filters:${companyId}:${direction}`;
export function readFiscalFilters(companyId: string, direction: FiscalDirection): FiscalFilters {
  const defaults = defaultFilters(direction);
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key(companyId, direction)) ?? "null");
    if (!saved || typeof saved !== "object") return defaults;
    const restored = { ...defaults };
    for (const field of Object.keys(defaults) as (keyof FiscalFilters)[]) {
      const value = (saved as Record<string, unknown>)[field];
      if (typeof value === "string" && value.length <= 200) restored[field] = value;
    }
    if (!CATEGORIES[direction].some((c) => c.value === restored.category))
      restored.category = defaults.category;
    return restored;
  } catch {
    return defaults;
  }
}
export function saveFiscalFilters(
  companyId: string,
  direction: FiscalDirection,
  filters: FiscalFilters,
) {
  try {
    localStorage.setItem(key(companyId, direction), JSON.stringify(filters));
  } catch {
    /* Preferences are optional when browser storage is unavailable. */
  }
}
