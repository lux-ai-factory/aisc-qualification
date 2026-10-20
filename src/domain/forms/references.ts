// Importing a questionnaire file by reference: which of its items name a set
// version or a question this install does not have. References match by (setId,
// setVersion, scope, localId), never by names. Pure: the service looks the
// set versions up, this builds the sentences a person reads.

/** One item of a references file. */
export type ReferenceItem = {
  setId: string;
  setName: string;
  setVersion: number;
  scope: string;
  localId: string;
};

/** A set version this install has; `keys` are "<scope>:<localId>" of its questions, `name` the set's name here. */
export type FoundSetVersion = {
  setId: string;
  number: number;
  name: string;
  versionId: string;
  keys: string[];
};

/** One sentence per missing set version (once) and per missing question, in item order. */
export function missingReferences(
  items: ReferenceItem[],
  found: FoundSetVersion[],
): string[] {
  const out: string[] = [];
  const named = new Set<string>();
  for (const it of items) {
    const version = found.find(
      (f) => f.setId === it.setId && f.number === it.setVersion,
    );
    if (!version) {
      const key = `${it.setId}\u0000${it.setVersion}`;
      if (named.has(key)) continue;
      named.add(key);
      out.push(
        `Question set "${it.setName || it.setId}" (${it.setId}) v${it.setVersion} is not on this install.`,
      );
      continue;
    }
    const key = `${it.scope}:${it.localId}`;
    if (!version.keys.includes(key))
      out.push(
        `${key} is not in question set "${version.name}" v${version.number}.`,
      );
  }
  return out;
}
