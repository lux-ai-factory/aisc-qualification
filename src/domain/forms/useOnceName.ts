// The name a "Use once" form is saved under: "Custom questions: <system>,
// <UTC date>", numbered " (2)", " (3)", ... when that name is already taken.
// Pure: the caller hands in the date and every form name.

const MAX_SYSTEM = 80;

export function useOnceFormName(
  systemName: string,
  today: Date,
  taken: string[],
): string {
  const system =
    systemName
      .split(/\s+/)
      .filter(Boolean)
      .join(" ")
      .slice(0, MAX_SYSTEM)
      .trimEnd() || "unnamed system";
  const day = today.toISOString().slice(0, 10);
  const base = `Custom questions: ${system}, ${day}`;
  const used = new Set(taken.map((t) => t.trim().toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  let n = 2;
  while (used.has(`${base} (${n})`.toLowerCase())) n++;
  return `${base} (${n})`;
}
