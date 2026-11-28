import { accountWindowLabel, canonicalAccountWindow } from "./accountPrefs";

/** Group model periods without changing the provider's full selection keys. */
export function limitGroups(provider: string, windows: string[]) {
  const groups = new Map<string, { id: string; model: string; options: { key: string; label: string }[] }>();
  for (const key of windows) {
    const split = provider === "antigravity" ? key.lastIndexOf(" · ") : -1;
    const model = split >= 0 ? key.slice(0, split) : provider === "antigravity" && canonicalAccountWindow(key) ? "Gemini Models" : "";
    const name = model.replace(/^Gemini(?:\s+\d[\d.]*)?\s*/i, "").trim();
    const short = model ? !name || name === "Models" ? "Gemini"
      : /^(?:Claude and GPT models|Claude & GPT \(shared\))$/i.test(name) ? "Claude & GPT" : name : "";
    const group = groups.get(model) ?? { id: model, model: short, options: [] };
    group.options.push({ key, label: accountWindowLabel(split >= 0 ? key.slice(split + 3).toLowerCase() : key) });
    groups.set(model, group);
  }
  const order = (name: string) => ({ Carbon: 0, Argon: 1, Gemini: 2 }[name] ?? 3);
  return [...groups.values()].sort((a, b) => order(a.model) - order(b.model));
}
