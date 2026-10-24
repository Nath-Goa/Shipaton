/** Keyboard / pointer state shared between the game loop and the React overlay. */
export interface StickState { x: number; y: number }

export class Controls {
  keys = new Set<string>();
  stick: StickState = { x: 0, y: 0 };
  roll = 0;
  throttleDelta = 0;
  touchThrottle: number | null = null;
  private handlers: ((code: string, e: KeyboardEvent) => void)[] = [];

  onPress(fn: (code: string, e: KeyboardEvent) => void): () => void {
    this.handlers.push(fn);
    return () => { this.handlers = this.handlers.filter((h) => h !== fn); };
  }

  attach(): () => void {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) {
        this.keys.add(e.code);
        for (const h of this.handlers) h(e.code, e);
      }
    };
    const up = (e: KeyboardEvent) => { this.keys.delete(e.code); };
    const blur = () => { this.keys.clear(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }

  held(...codes: string[]): boolean { return codes.some((c) => this.keys.has(c)); }
}

export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && (('ontouchstart' in window) || navigator.maxTouchPoints > 0) && window.matchMedia('(pointer: coarse)').matches;
}
