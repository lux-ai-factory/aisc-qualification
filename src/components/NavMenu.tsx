"use client";

import { useEffect, useRef } from "react";

/**
 * A dropdown in the site nav: a <details> whose <summary> is the label, so it
 * opens and closes with no script at all. The script only closes it again when
 * an item is picked (the header survives client navigation, so it would
 * otherwise stay open over the next page), on Escape, and on a click outside.
 */
export default function NavMenu({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = () => {
      if (ref.current) ref.current.open = false;
    };
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <details ref={ref} className="nav-menu">
      <summary>{label}</summary>
      <div
        className="nav-menu-panel"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a") && ref.current)
            ref.current.open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
}
