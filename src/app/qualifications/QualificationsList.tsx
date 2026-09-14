import Link from "next/link";
import { versionLabel } from "@/domain/SystemCard";

// The compiled qualifications, as a list of rows that link to their card.
// A row carries only what it takes to pick one: which system, which version,
// when it was saved, and how much is in it.
export type ListItem = {
  id: string;
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

export default function QualificationsList({ items }: { items: ListItem[] }) {
  if (items.length === 0) {
    return (
      <div className="qf-empty">
        <p>You haven&apos;t qualified any system yet.</p>
        <Link className="btn" href="/qualify/new">
          Start your first qualification
        </Link>
      </div>
    );
  }

  return (
    <ul className="qf-rows">
      {items.map((item) => (
        <li key={item.id}>
          <Link className="qf-row" href={`/qualify/${item.id}`}>
            <div className="qf-row-main">
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
