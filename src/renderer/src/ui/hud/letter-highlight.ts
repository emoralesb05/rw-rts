const LETTER_PULSE_CLASSES = [
  "animate-[letter-pulse_3.5s_ease-out]",
  "relative",
  "z-[1]",
] as const;

export function pulseLetterElement(el: HTMLElement) {
  el.classList.remove(...LETTER_PULSE_CLASSES);
  void el.offsetWidth;
  el.classList.add(...LETTER_PULSE_CLASSES);
  window.setTimeout(() => el.classList.remove(...LETTER_PULSE_CLASSES), 3600);
}
