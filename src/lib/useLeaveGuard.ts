"use client";

import { useEffect, useRef, type RefObject } from "react";

// Leaving a page with unsaved changes loses them, so the person is asked first.
// What counts as a change is the page's own: the card form compares its content
// with what it held when it opened; a builder compares what it would save.
//
// Two ways out are covered: a link inside the app (asked with confirm, before
// Next's Link handles the click) and closing or reloading the tab (the
// browser's own warning). A download link is not leaving. While the page is
// being saved nothing is asked: the save is the way out.
const QUESTION = "Leave without saving? What you changed here will be lost.";

/** Ask before leaving while `changed()` is true and nothing is being saved. */
export function useLeaveGuard(changed: () => boolean, saving: boolean) {
  const changedNow = useRef(changed);
  changedNow.current = changed;
  const savingNow = useRef(saving);
  savingNow.current = saving;

  useEffect(() => {
    const leavingLoses = () => !savingNow.current && changedNow.current();

    const onUnload = (e: BeforeUnloadEvent) => {
      if (!leavingLoses()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // a new tab or window
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (!link || link.hasAttribute("download")) return;
      if (link.getAttribute("target") === "_blank") return;
      if (leavingLoses() && !window.confirm(QUESTION)) e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
}

function contentOf(form: HTMLFormElement): string {
  return JSON.stringify(
    [...new FormData(form)].map(([name, value]) => [
      name,
      typeof value === "string" ? value : value.name,
    ]),
  );
}

/** The guard for a form: what was typed, picked, or written in by a document prefill
 *  since it opened. Moving between parts or carousel pages changes nothing and asks nothing. */
export function useFormLeaveGuard(
  formRef: RefObject<HTMLFormElement | null>,
  saving: boolean,
) {
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (formRef.current) opened.current = contentOf(formRef.current);
  }, [formRef]);
  useLeaveGuard(
    () =>
      formRef.current !== null &&
      opened.current !== null &&
      contentOf(formRef.current) !== opened.current,
    saving,
  );
}
