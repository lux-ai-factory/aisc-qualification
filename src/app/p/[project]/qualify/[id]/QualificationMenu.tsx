"use client";

import { useRef, useState, type ReactNode } from "react";

// A qualification is too long to read or fill in one scroll, so a menu on the
// left shows one part at a time: the parts of the form, then (on a saved card)
// the AI card, then the site's links pinned to its bottom (the header hides its
// own while this menu is on the page). The title sits in the panel, above the
// part, so the menu starts right under the site header.
//
// A saved card mounts only the part in view: every part is rendered on the
// server and handed in, so switching costs nothing, and the AI card's canvas
// measures itself to fit, which it cannot do inside display:none.
//
// The form being filled keeps every part mounted (keepMounted), the others only
// hidden: its fields are uncontrolled and posted with the form, and the
// document prefill writes onto them. A required field left empty in a hidden
// part would block the submit without the browser being able to show it, so
// the first one the browser reports brings its part into view.
const CARD = "card";

export type MenuPart = { id: string; label: string; content: ReactNode };

export default function QualificationMenu({
  parts,
  card,
  header,
  footer,
  nav,
  keepMounted = false,
}: {
  parts: MenuPart[];
  /** The AI card, the menu's last entry; absent while the form is being filled. */
  card?: ReactNode;
  /** The title, at the top of the panel above every part. */
  header?: ReactNode;
  /** Under every part, such as the form's save button. */
  footer?: ReactNode;
  nav?: ReactNode;
  keepMounted?: boolean;
}) {
  // The form opens first: it is the thing the user filled in, and it is what
  // tells you whether the card is built on the right answers.
  const [active, setActive] = useState(parts[0]?.id ?? CARD);
  const panel = useRef<HTMLDivElement>(null);
  const partEls = useRef<Map<string, HTMLDivElement | null>>(new Map());
  // One submit fires an invalid event per empty field: only the first one picks the part.
  const jumping = useRef(false);

  const pick = (id: string) => {
    setActive(id);
    // A part picked from far down the previous one starts at its own top.
    const el = panel.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView?.();
  };

  const onInvalid = (e: React.FormEvent<HTMLDivElement>) => {
    if (jumping.current) return;
    const target = e.target as HTMLElement;
    const at = parts.find((p) => partEls.current.get(p.id)?.contains(target));
    if (!at || at.id === active) return;
    jumping.current = true;
    setActive(at.id);
    setTimeout(() => {
      jumping.current = false;
      (target as HTMLInputElement).reportValidity?.();
    }, 0);
  };

  const part = parts.find((p) => p.id === active);
  const label = part?.label ?? "AI card";

  const item = (id: string, text: string) => (
    <li key={id}>
      <button
        type="button"
        className={active === id ? "active" : ""}
        aria-current={active === id ? "true" : undefined}
        onClick={() => pick(id)}
      >
        {text}
      </button>
    </li>
  );

  return (
    <div className="qf-layout">
      <aside className="qf-sidemenu">
        <nav aria-label="Qualification">
          <ul>{parts.map((p) => item(p.id, p.label))}</ul>
          {card !== undefined && (
            <ul className="qf-sidemenu-card">{item(CARD, "AI card")}</ul>
          )}
        </nav>
        {nav && <div className="qf-sidemenu-site">{nav}</div>}
      </aside>

      <div
        ref={panel}
        role="region"
        aria-label={label}
        className="qf-sidepanel"
        onInvalidCapture={keepMounted ? onInvalid : undefined}
      >
        {header}
        {keepMounted ? (
          parts.map((p) => (
            <div
              key={p.id}
              ref={(el) => {
                partEls.current.set(p.id, el);
              }}
              className="qf-sidepart"
              hidden={p.id !== active}
            >
              {p.content}
            </div>
          ))
        ) : part ? (
          <div className="qf-read">{part.content}</div>
        ) : (
          card
        )}
        {footer}
      </div>
    </div>
  );
}
