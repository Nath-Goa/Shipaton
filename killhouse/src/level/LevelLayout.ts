/**
 * Compound floor plan, one character per 2 m cell (north is the top row).
 *
 *   #  brick wall, full height        =  doorway (lintel above 2.6 m)
 *   .  open floor                     S  player start
 *   C  steel crate stack (1-3 high)   c  single waist-high crate
 *   B  oil-drum cluster               J  concrete jersey barrier
 *   P  steel I-beam column            E  OPFOR rifleman spawn
 *   Q  quadrotor drone spawn          A  ammunition crate   H  medkit
 *
 * West block: armory (start) and three offices. Centre: the main warehouse
 * hall with a 2 x 3 column grid. East: the loading-dock corridor.
 */
export const LEVEL_MAP: readonly string[] = [
  '##########################',
  '#S...c#......C.......#..Q#',
  '#.....#..E...C.......#...#',
  '#..A..=..............=.E.#',
  '#c...H#.CC...P...P...#...#',
  '###=###..C.......C.E.#C..#',
  '#.....#......Q.......##=##',
  '#..E..=..B...........=...#',
  '#.....#..B...P...P...#.c.#',
  '#..c..#........E.....#...#',
  '##=####..CC.......cc.#.E.#',
  '#.....=..CC...E......=...#',
  '#.E...#......P...P...#.J.#',
  '#.....#..............#...#',
  '####=##....C...Q.C...#.J.#',
  '#..A..=.E..C.....C..H=...#',
  '#c...E#..........E...#.E.#',
  '##########################',
];

/** Compass heading the player faces at the start: east, toward the hall door. */
export const START_HEADING_DEGREES = 90;

export interface LampSpec {
  readonly col: number;
  readonly row: number;
  /** Bakes a static shadow map once at load (lamps never move). */
  readonly shadow: boolean;
  /** A failing ballast: random dropouts and buzz. */
  readonly flicker: boolean;
}

/** Six hung lamps; everything else is lit by the player's weapon light. */
export const LAMPS: readonly LampSpec[] = [
  { col: 3, row: 2, shadow: true, flicker: false },
  { col: 10, row: 2, shadow: true, flicker: false },
  { col: 15, row: 7, shadow: true, flicker: false },
  { col: 12, row: 13, shadow: false, flicker: false },
  { col: 23, row: 8, shadow: false, flicker: true },
  { col: 3, row: 12, shadow: false, flicker: false },
];

/** Doorways that get an illuminated EXIT sign, and which side of the wall it hangs on. */
export const EXIT_SIGNS: readonly { readonly col: number; readonly row: number }[] = [
  { col: 6, row: 3 },
  { col: 21, row: 7 },
  { col: 4, row: 14 },
  { col: 21, row: 15 },
];
