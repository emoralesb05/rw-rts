type CanvasGesture = {
  button: number;
  downElement?: EventTarget | null;
  upElement?: EventTarget | null;
  getDistance(): number;
};

/** Window-level pointer release must never click through a React overlay. */
export function isCanvasClick(pointer: CanvasGesture, canvas: EventTarget) {
  return (
    pointer.button === 0 &&
    pointer.downElement === canvas &&
    pointer.upElement === canvas &&
    pointer.getDistance() < 6
  );
}
