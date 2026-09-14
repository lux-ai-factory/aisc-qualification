"use client";

import { useId, useState, type ReactNode } from "react";

// A compiled qualification has two faces: what was answered, and what was made
// of it. They used to stack down one page, which meant the card and its source
// competed for the same scroll. As tabs, each gets the whole page.
//
// Both panels are rendered on the server and handed in as props, so switching
// tabs costs nothing and the card's graph keeps its state while you read the
// form.
const TABS = [
  { id: "form", label: "Answered form" },
  { id: "card", label: "AI card" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function QualificationTabs({
  form,
  card,
}: {
  form: ReactNode;
  card: ReactNode;
}) {
  // The form opens first: it is the thing the user filled in, and it is what
  // tells you whether the card below it is built on the right answers.
  const [active, setActive] = useState<TabId>("form");
  const base = useId();
  const tabId = (id: TabId) => `${base}-tab-${id}`;

  return (
    <>
      <div className="qf-tabs" role="tablist" aria-label="Qualification">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={tabId(tab.id)}
            className={active === tab.id ? "active" : ""}
            aria-selected={active === tab.id}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Only the active panel is mounted. The inactive one is not merely
          hidden: the ontology canvas measures itself to fit, and it cannot do
          that inside a display:none subtree. */}
      <div
        role="tabpanel"
        className="qf-tabpanel"
        aria-labelledby={tabId(active)}
      >
        {active === "form" ? form : card}
      </div>
    </>
  );
}
