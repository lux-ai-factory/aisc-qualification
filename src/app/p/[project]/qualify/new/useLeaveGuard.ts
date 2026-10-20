"use client";

import { useEffect, useRef, type RefObject } from "react";

// Leaving the form with changes in it loses them, so the person is asked first.
// "Changes" is the form's own content compared with what it held when it
// opened: what was typed, picked, or written in by a document prefill. Moving
// between parts or carousel pages changes nothing and asks nothing.
//
// Two ways out are covered: a link inside the app (asked with confirm, before
// Next's Link handles the click) and closing or reloading the tab (the
// browser's own warning). A download link is not leaving. While the form is
// being saved nothing is asked: the save is the way out.
const QUESTION = "Leave without saving? What you changed here will be lost.";

function contentOf(form: HTMLFormElement): string {
  return JSON.stringify(
    [...new FormData(form)].map(([name, value]) => [
      name,
      typeof value === "string" ? value : value.name,
    ]),
  );
}

export function useLeaveGuard(
  formRef: RefObject<HTMLFormElement | null>,
  saving: boolean,
) {
  const savingNow = useRef(saving);
  savingNow.current = saving;

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const opened = contentOf(form);
    const changed = () =>
      !savingNow.current &&
      formRef.current !== null &&
      contentOf(formRef.current) !== opened;

    const onUnload = (e: BeforeUnloadEvent) => {
      if (!changed()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // a new tab or window
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (!link || link.hasAttribute("download")) return;
      if (link.getAttribute("target") === "_blank") return;
      if (changed() && !window.confirm(QUESTION)) e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [formRef]);
}
