// The browser APIs React Flow measures itself with, which jsdom does not have.
// Shared so every test that renders the canvas agrees on the same fake
// geometry: the pane is 900x700, a node 220x70.
export function installReactFlowEnv(): void {
  global.ResizeObserver = class {
    constructor(private cb: ResizeObserverCallback) {}
    observe(t: Element) {
      this.cb(
        [
          {
            target: t,
            contentRect: { width: 220, height: 70 },
          } as unknown as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  HTMLElement.prototype.getBoundingClientRect = function () {
    const pane = (this as HTMLElement).classList?.contains("react-flow__pane");
    const w = pane ? 900 : 220,
      h = pane ? 700 : 70;
    return {
      x: 0,
      y: 0,
      width: w,
      height: h,
      top: 0,
      left: 0,
      right: w,
      bottom: h,
      toJSON() {},
    } as DOMRect;
  };
  (SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox =
    () => ({ x: 0, y: 0, width: 60, height: 12, toJSON() {} }) as DOMRect;
  if (!global.DOMMatrixReadOnly) {
    global.DOMMatrixReadOnly = class {
      m22 = 1;
      constructor(_t?: string) {}
    } as unknown as typeof DOMMatrixReadOnly;
  }
}
