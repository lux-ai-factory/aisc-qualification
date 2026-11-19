// On Save the browser fires "invalid" on every empty required field at once, in page order,
// refuses the save, and shows its message on the first one only, and only if that field is
// in view. Fields sit in hidden parts (the left menu) and hidden pages (each carousel), so
// those bring the field into view. They must all follow that first field alone: if each
// followed its own, a later empty field would win, the view would land on a part after the
// one the browser points at, and a part's pages would be left turned to a later page.
//
// So every invalid event of one save is grouped by its form; only the first field of the
// group may move the view. If anything moved, that field's message is shown again once it
// is in view, and the invalid event that re-showing fires moves nothing.
type Burst = { first: Element; moved: boolean };

const bursts = new WeakMap<object, Burst>();
let reshowing = false;

/** Call from an onInvalidCapture handler. `show` brings the field into view and says whether it had to. */
export function revealFirstInvalid(
  target: EventTarget,
  show: (field: HTMLElement) => boolean,
): void {
  if (reshowing) return;
  const field = target as HTMLInputElement;
  const key: object = field.form ?? field.ownerDocument ?? field;
  let burst = bursts.get(key);
  if (!burst) {
    const opened: Burst = { first: field, moved: false };
    burst = opened;
    bursts.set(key, opened);
    setTimeout(() => {
      bursts.delete(key);
      if (!opened.moved) return;
      reshowing = true;
      try {
        field.reportValidity?.();
      } finally {
        reshowing = false;
      }
    }, 0);
  }
  if (burst.first !== field) return;
  if (show(field)) burst.moved = true;
}
