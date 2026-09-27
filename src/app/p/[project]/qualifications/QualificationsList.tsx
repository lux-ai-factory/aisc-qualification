import Link from "next/link";
import { versionLabel } from "@/domain/SystemCard";

// The versions of the project's one AI system, each a row linking to its card.
// A row carries only what it takes to pick one: which system, which version,
// when it was saved, and how much is in it.
export type ListItem = {
  id: string;
  /** The version of the project's AI system this card describes (one card per
   *  version); absent when the platform could not say. */
  versionNumber?: number;
  /** Who saved the version, when the platform says. */
  createdBy?: string | null;
  systemName: string;
  systemVersion: string;
  company: string;
  description: string;
  /** ISO string; rendered to the minute, because two runs of the same system on
   *  the same day are the normal case. */
  savedAt: string;
  answers: number;
  risks: number;
};

/** ISO to "YYYY-MM-DD HH:MM", in UTC, so the list does not shift with the
 *  reader's timezone between server and client render. */
export function stamp(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

export default function QualificationsList({
  project,
  items,
}: {
  project: string;
  items: ListItem[];
}) {
  if (items.length === 0) {
    return (
      <div className="qf-empty">
        <p>The AI system has no AI card yet.</p>
        <Link className="btn" href={`/p/${project}/system/edit`}>
          Describe the AI system
        </Link>
      </div>
    );
  }

  return (
    <ul className="qf-rows">
      {items.map((item) => (
        <li key={item.id}>
          <Link className="qf-row" href={`/p/${project}/qualify/${item.id}`}>
            <div className="qf-row-main">
              {item.versionNumber !== undefined && (
                <p className="qf-row-sysver">Version {item.versionNumber}</p>
              )}
              <h3>
                {item.systemName}{" "}
                <span className="qf-row-ver">
                  {versionLabel(item.systemVersion)}
                </span>
              </h3>
              <p className="qf-row-sub">
                {item.company} · {item.description}
              </p>
            </div>
            <div className="qf-row-meta">
              <time dateTime={item.savedAt}>{stamp(item.savedAt)} UTC</time>
              {item.createdBy && <span className="qf-row-counts">saved by {item.createdBy}</span>}
              <span className="qf-row-counts">
                {item.answers} answers · {item.risks} risks
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
