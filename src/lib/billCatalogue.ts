/** Keep provider keys intact for requests; normalize only their presentation. */
export function categoryKey(category: string): string {
  const value = category.trim().toLowerCase();
  if (/bett+ing|gaming/.test(value)) return "Betting";
  const keys: Record<string, string> = {
    airtime: "Airtime", data: "Data", utility: "Utility",
    "cable tv": "Cable TV", "internet subscription": "Internet Subscription",
  };
  return keys[value] || category;
}

export function visibleCategories(categories: string[]): string[] {
  const seen = new Set<string>();
  return categories.filter(category => {
    const key = categoryKey(category);
    if (/education/i.test(category) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isVisibleBiller(biller: { id?: string; name?: string; biller_id?: string; biller_name?: string }): boolean {
  // MegaMillions is a lottery even though its name contains neither lotto nor lottery.
  return !/lotto|lottery|mega[\s_-]*millions/i.test(
    `${biller.id || biller.biller_id || ""} ${biller.name || biller.biller_name || ""}`,
  );
}

const FRESH_MS = 12 * 60 * 60 * 1000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export function readBillCache<T>(key: string, freshOnly = false): T | null {
  try {
    const entry = JSON.parse(localStorage.getItem(key) || "null");
    if (entry && Date.now() - entry.t < (freshOnly ? FRESH_MS : MAX_AGE_MS)) return entry.v as T;
  } catch { /* storage is optional */ }
  return null;
}
export function writeBillCache(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value })); } catch { /* storage is optional */ }
}

const pending = new Map<string, Promise<unknown[]>>();
export async function fetchBillCatalogue<T>(key: string, fetchList: () => Promise<T[]>): Promise<T[]> {
  const fresh = readBillCache<T[]>(key, true);
  if (fresh) return fresh;
  const existing = pending.get(key);
  if (existing) return existing as Promise<T[]>;
  const request = fetchList().then(list => {
    if (list.length) writeBillCache(key, list);
    return list;
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}