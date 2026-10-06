"use client";

import { useRef, type ReactNode } from "react";

// Pages of a block, one shown at a time. Every page stays mounted, the others only hidden: the
// fields are uncontrolled and posted with the form, and the document prefill writes onto them,
// so a page out of view must still hold its answers. A required field left empty on a hidden
// page would block the submit without the browser being able to show it, so the first one the
// browser reports brings its page into view and shows its message there.
export default function Carousel({
  pages,
  page,
  onPage,
  label,
}: {
  /** Each page with a stable key: keyed by place, removing a page would remount the ones
   *  after it and lose what was typed in them. */
  pages: { key: string | number; node: ReactNode }[];
  /** The page in view; kept in range here, so a caller may pass one past the end. */
  page: number;
  onPage: (page: number) => void;
  /** What a page is, for the counter and the buttons: "Risk" gives "Risk 2 of 3". */
  label: string;
}) {
  const shown = Math.max(0, Math.min(page, pages.length - 1));
  const pageEls = useRef<(HTMLDivElement | null)[]>([]);
  // One submit fires an invalid event per empty field: only the first one picks the page.
  const jumping = useRef(false);

  const onInvalid = (e: React.FormEvent<HTMLDivElement>) => {
    if (jumping.current) return;
    const target = e.target as HTMLElement;
    const at = pageEls.current.findIndex((el) => el?.contains(target));
    if (at < 0 || at === shown) return;
    jumping.current = true;
    onPage(at);
    setTimeout(() => {
      jumping.current = false;
      (target as HTMLInputElement).reportValidity?.();
    }, 0);
  };

  pageEls.current.length = pages.length;
  if (pages.length === 0) return null;
  return (
    <div className="qf-carousel" onInvalidCapture={onInvalid}>
      {pages.map((p, i) => (
        <div
          key={p.key}
          ref={(el) => {
            pageEls.current[i] = el;
          }}
          className="qf-carousel-page"
          hidden={i !== shown}
          role="group"
          aria-label={`${label} ${i + 1} of ${pages.length}`}
        >
          {p.node}
        </div>
      ))}
      {pages.length > 1 && (
        <nav className="qf-carousel-nav" aria-label={`${label} pages`}>
          <button
            type="button"
            className="qf-carousel-step"
            onClick={() => onPage(shown - 1)}
            disabled={shown === 0}
          >
            ‹ Previous
          </button>
          <span className="qf-carousel-dots">
            {pages.map((_, i) => (
              <button
                type="button"
                key={i}
                className={`qf-carousel-dot${i === shown ? " active" : ""}`}
                onClick={() => onPage(i)}
                aria-label={`${label} ${i + 1}`}
                aria-current={i === shown ? "step" : undefined}
              >
                {i + 1}
              </button>
            ))}
          </span>
          <span className="qf-carousel-count">
            {label} {shown + 1} of {pages.length}
          </span>
          <button
            type="button"
            className="qf-carousel-step"
            onClick={() => onPage(shown + 1)}
            disabled={shown === pages.length - 1}
          >
            Next ›
          </button>
        </nav>
      )}
    </div>
  );
}
