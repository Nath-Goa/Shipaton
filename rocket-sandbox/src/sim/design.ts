import { Vector3 } from 'three';
import { G0 } from './bodies';
import { PartDef, partDef } from './parts';

export type NodeName = 'top' | 'bottom' | 'radial' | 'surface';

export interface PartInst {
  id: number;
  partId: string;
  /** Radial parts: angle around the parent (rad) and height of the part centre relative to the parent centre (m) */
  angle?: number;
  yOffset?: number;
  /** Symmetry group */
  group?: number;
}

export interface Edge { a: number; an: NodeName; b: number; bn: NodeName }

export type StageKind = 'ignite' | 'detach' | 'jettison' | 'chute' | 'legs';
export interface StageAction { kind: StageKind; part: number }

export interface Design {
  v: 1;
  name: string;
  parts: PartInst[];
  edges: Edge[];
  root: number;
  stages: StageAction[][];
  nextId: number;
  nextGroup: number;
}

export interface Placed {
  inst: PartInst;
  def: PartDef;
  /** Centre of the part in vessel design space (+Y up, metres) */
  pos: Vector3;
  yTop: number;
  yBottom: number;
  radius: number;
}

export function emptyDesign(name = 'New rocket'): Design {
  return { v: 1, name, parts: [], edges: [], root: -1, stages: [], nextId: 1, nextGroup: 1 };
}

export function cloneDesign(d: Design): Design {
  return JSON.parse(JSON.stringify(d)) as Design;
}

export function instOf(d: Design, id: number): PartInst {
  const p = d.parts.find((q) => q.id === id);
  if (!p) throw new Error(`no part ${id}`);
  return p;
}

export function neighbours(d: Design, id: number): { other: number; myNode: NodeName; otherNode: NodeName }[] {
  const out: { other: number; myNode: NodeName; otherNode: NodeName }[] = [];
  for (const e of d.edges) {
    if (e.a === id) out.push({ other: e.b, myNode: e.an, otherNode: e.bn });
    else if (e.b === id) out.push({ other: e.a, myNode: e.bn, otherNode: e.an });
  }
  return out;
}

/** Lays the design out in space by walking from the root. */
export function layout(d: Design): Map<number, Placed> {
  const out = new Map<number, Placed>();
  if (d.root < 0 || d.parts.length === 0) return out;
  const place = (inst: PartInst, y: number, x = 0, z = 0) => {
    const def = partDef(inst.partId);
    out.set(inst.id, {
      inst, def, pos: new Vector3(x, y, z), yTop: y + def.length / 2, yBottom: y - def.length / 2, radius: def.dia / 2,
    });
  };
  place(instOf(d, d.root), 0);
  const queue = [d.root];
  while (queue.length) {
    const id = queue.shift()!;
    const here = out.get(id)!;
    for (const nb of neighbours(d, id)) {
      if (out.has(nb.other)) continue;
      const inst = instOf(d, nb.other);
      const def = partDef(inst.partId);
      if (nb.myNode === 'surface') {
        const ang = inst.angle ?? 0;
        const dist = here.radius + def.dia / 2 * 0.9;
        place(inst, here.pos.y + (inst.yOffset ?? 0), Math.cos(ang) * dist, Math.sin(ang) * dist);
      } else if (nb.myNode === 'bottom') {
        place(inst, here.yBottom - def.length / 2);
      } else if (nb.myNode === 'top') {
        place(inst, here.yTop + def.length / 2);
      }
      queue.push(nb.other);
    }
  }
  return out;
}

export function nodeDia(def: PartDef, node: NodeName): number | null {
  if (node === 'top') return def.topDia;
  if (node === 'bottom') return def.bottomDia;
  return null;
}

export function nodeUsed(d: Design, id: number, node: NodeName): boolean {
  return d.edges.some((e) => (e.a === id && e.an === node) || (e.b === id && e.bn === node));
}

export interface FreeNode { part: number; node: 'top' | 'bottom'; dia: number }

export function freeStackNodes(d: Design): FreeNode[] {
  const out: FreeNode[] = [];
  for (const p of d.parts) {
    const def = partDef(p.partId);
    if (def.attach !== 'stack') continue;
    for (const node of ['top', 'bottom'] as const) {
      const dia = nodeDia(def, node);
      if (dia && !nodeUsed(d, p.id, node)) out.push({ part: p.id, node, dia });
    }
  }
  return out;
}

export function canAttachStack(d: Design, target: number, node: 'top' | 'bottom', newDef: PartDef): boolean {
  if (newDef.attach !== 'stack') return false;
  const tdef = partDef(instOf(d, target).partId);
  const tdia = nodeDia(tdef, node);
  if (!tdia || nodeUsed(d, target, node)) return false;
  if (tdef.kind === 'engine' && newDef.kind !== 'decoupler') return false;
  const mine = nodeDia(newDef, node === 'bottom' ? 'top' : 'bottom');
  return !!mine && Math.abs(mine - tdia) < 0.01;
}

export function canAttachRadial(d: Design, target: number, newDef: PartDef): boolean {
  if (newDef.attach !== 'radial') return false;
  const tdef = partDef(instOf(d, target).partId);
  return tdef.attach === 'stack' && tdef.kind !== 'engine' && tdef.kind !== 'fairing' && tdef.kind !== 'decoupler';
}

export function defaultRadialOffset(parent: PartDef, child: PartDef): number {
  const h = parent.length;
  switch (child.kind) {
    case 'srb': return -h / 2 + child.length / 2;
    case 'leg': return -h / 2 + Math.min(h * 0.45, 0.6);
    case 'chute': return h / 2 - child.length / 2 - 0.05;
    default: return 0;
  }
}

export interface Mutation { design: Design; added: number[] }

/** Adds a stack part. Returns null when the nodes don't fit. */
export function addStack(d0: Design, target: number | null, node: 'top' | 'bottom', partId: string): Mutation | null {
  const def = partDef(partId);
  const d = cloneDesign(d0);
  const id = d.nextId++;
  if (d.parts.length === 0) {
    if (def.attach !== 'stack') return null;
    d.parts.push({ id, partId });
    d.root = id;
    return { design: d, added: [id] };
  }
  if (target == null || !canAttachStack(d, target, node, def)) return null;
  d.parts.push({ id, partId });
  d.edges.push({ a: target, an: node, b: id, bn: node === 'bottom' ? 'top' : 'bottom' });
  return { design: d, added: [id] };
}

export function addRadial(d0: Design, target: number, partId: string, count: number, angle = 0): Mutation | null {
  const def = partDef(partId);
  if (!canAttachRadial(d0, target, def)) return null;
  const d = cloneDesign(d0);
  const parent = partDef(instOf(d, target).partId);
  const group = count > 1 ? d.nextGroup++ : undefined;
  const added: number[] = [];
  for (let i = 0; i < count; i++) {
    const id = d.nextId++;
    d.parts.push({ id, partId, angle: angle + (i * Math.PI * 2) / count, yOffset: defaultRadialOffset(parent, def), group });
    d.edges.push({ a: target, an: 'surface', b: id, bn: 'radial' });
    added.push(id);
  }
  return { design: d, added };
}

/** Everything attached to `id` on the side away from the root, including `id`. */
export function subtreeOf(d: Design, id: number): Set<number> {
  const seen = new Set<number>([d.root]);
  const queue = [d.root];
  const parentOf = new Map<number, number>();
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nb of neighbours(d, cur)) {
      if (seen.has(nb.other)) continue;
      seen.add(nb.other);
      parentOf.set(nb.other, cur);
      queue.push(nb.other);
    }
  }
  const out = new Set<number>([id]);
  const kids = new Map<number, number[]>();
  for (const [c, p] of parentOf) kids.set(p, [...(kids.get(p) ?? []), c]);
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const c of kids.get(cur) ?? []) { out.add(c); stack.push(c); }
  }
  return out;
}

export function groupMembers(d: Design, id: number): number[] {
  const g = instOf(d, id).group;
  return g == null ? [id] : d.parts.filter((p) => p.group === g).map((p) => p.id);
}

function dropFromStages(d: Design) {
  const ids = new Set(d.parts.map((p) => p.id));
  d.stages = d.stages.map((s) => s.filter((a) => ids.has(a.part))).filter((s) => s.length);
}

/** Removes the part (all its symmetry copies) and everything hanging off it. */
export function removePart(d0: Design, id: number): Design {
  const d = cloneDesign(d0);
  if (id === d.root) return emptyDesign(d.name);
  const gone = new Set<number>();
  for (const m of groupMembers(d, id)) for (const s of subtreeOf(d, m)) gone.add(s);
  d.parts = d.parts.filter((p) => !gone.has(p.id));
  d.edges = d.edges.filter((e) => !gone.has(e.a) && !gone.has(e.b));
  dropFromStages(d);
  return d;
}

/** Re-attaches the subtree under `id` to a new stack node. The subtree keeps the node it hung from. */
export function moveStack(d0: Design, id: number, target: number, node: 'top' | 'bottom'): Design | null {
  if (id === d0.root) return null;
  const sub = subtreeOf(d0, id);
  if (sub.has(target)) return null;
  const link = d0.edges.find((e) => (e.b === id && sub.has(e.b) && !sub.has(e.a)) || (e.a === id && !sub.has(e.b)));
  if (!link) return null;
  const myNode = link.b === id ? link.bn : link.an;
  if (myNode === 'radial') return null;
  const want = node === 'bottom' ? 'top' : 'bottom';
  if (myNode !== want) return null;
  const def = partDef(instOf(d0, id).partId);
  const d = cloneDesign(d0);
  d.edges = d.edges.filter((e) => e !== link && !(e.a === link.a && e.b === link.b && e.an === link.an));
  if (!canAttachStack(d, target, node, def)) return null;
  d.edges.push({ a: target, an: node, b: id, bn: myNode });
  return d;
}

export function moveRadial(d0: Design, id: number, target: number): Design | null {
  const inst = instOf(d0, id);
  const def = partDef(inst.partId);
  if (def.attach !== 'radial' || !canAttachRadial(d0, target, def)) return null;
  const d = cloneDesign(d0);
  const i = d.edges.findIndex((e) => e.b === id && e.bn === 'radial');
  if (i < 0) return null;
  d.edges[i] = { a: target, an: 'surface', b: id, bn: 'radial' };
  const mv = instOf(d, id);
  mv.yOffset = defaultRadialOffset(partDef(instOf(d, target).partId), def);
  return d;
}

export function adjustRadial(d0: Design, id: number, dAngle: number, dY: number): Design {
  const d = cloneDesign(d0);
  for (const m of groupMembers(d, id)) {
    const p = instOf(d, m);
    p.angle = (p.angle ?? 0) + dAngle;
    p.yOffset = (p.yOffset ?? 0) + dY;
  }
  return d;
}

export function controlPart(d: Design): number | null {
  const pods = d.parts.filter((p) => partDef(p.partId).kind === 'pod');
  const crewed = pods.find((p) => (partDef(p.partId).crew ?? 0) > 0);
  return (crewed ?? pods[0])?.id ?? null;
}

/** Part ids reachable from `from` without crossing any decoupler's top-node link. */
function sectionOf(d: Design, from: number): Set<number> {
  const out = new Set<number>([from]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of d.edges) {
      if (isCutEdge(d, e)) continue;
      let other = -1;
      if (e.a === cur) other = e.b; else if (e.b === cur) other = e.a;
      if (other >= 0 && !out.has(other)) { out.add(other); queue.push(other); }
    }
  }
  return out;
}

export function isCutEdge(d: Design, e: Edge): boolean {
  const ka = partDef(instOf(d, e.a).partId).kind;
  const kb = partDef(instOf(d, e.b).partId).kind;
  return (ka === 'decoupler' && e.an === 'top') || (kb === 'decoupler' && e.bn === 'top');
}

/** Fuel-sharing group for a part: everything connected without crossing a decoupler. */
export function fuelSection(d: Design, id: number): Set<number> {
  return sectionOf(d, id);
}

/** The pieces left after cutting the link a staged decoupler/booster releases. Returns the part ids on the far side from `keep`. */
export function detachSide(d: Design, releaser: number, keep: number | null): Set<number> {
  const inst = instOf(d, releaser);
  const def = partDef(inst.partId);
  let cut: Edge | undefined;
  if (def.attach === 'radial') cut = d.edges.find((e) => e.b === releaser && e.bn === 'radial');
  else if (def.kind === 'decoupler') cut = d.edges.find((e) => (e.a === releaser && e.an === 'top') || (e.b === releaser && e.bn === 'top'));
  const seen = new Set<number>([releaser]);
  if (!cut) return seen;
  const queue = [releaser];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of d.edges) {
      if (e === cut) continue;
      let other = -1;
      if (e.a === cur) other = e.b; else if (e.b === cur) other = e.a;
      if (other >= 0 && !seen.has(other)) { seen.add(other); queue.push(other); }
    }
  }
  // if the controlling part ended up on the releaser's side, the other side is the one that leaves
  if (keep != null && seen.has(keep)) {
    const rest = new Set<number>();
    for (const p of d.parts) if (!seen.has(p.id)) rest.add(p.id);
    return rest;
  }
  return seen;
}

/** Builds a sensible default staging sequence. */
export function autoStage(d: Design): StageAction[][] {
  const ref = controlPart(d) ?? d.root;
  if (ref < 0) return [];
  // Depth = number of decouplers crossed from the command part; a decoupler belongs to the stage below it.
  const dep = new Map<number, number>();
  dep.set(ref, 0);
  const q2 = [ref];
  while (q2.length) {
    const cur = q2.shift()!;
    const dc = dep.get(cur)!;
    for (const nb of neighbours(d, cur)) {
      if (dep.has(nb.other)) continue;
      const k = partDef(instOf(d, nb.other).partId).kind;
      dep.set(nb.other, dc + (k === 'decoupler' && nb.otherNode === 'top' ? 1 : 0));
      q2.push(nb.other);
    }
  }
  const byKind = (kinds: string[]) => d.parts.filter((p) => kinds.includes(partDef(p.partId).kind));
  const engines = byKind(['engine', 'srb']);
  const decouplers = byKind(['decoupler']);
  const boosters = byKind(['srb']).filter((p) => partDef(p.partId).attach === 'radial');
  const maxD = Math.max(0, ...engines.map((p) => dep.get(p.id) ?? 0));
  const stages: StageAction[][] = [];
  const ignite = (depthK: number): StageAction[] =>
    engines.filter((p) => (dep.get(p.id) ?? 0) === depthK).map((p) => ({ kind: 'ignite' as const, part: p.id }));
  stages.push(ignite(maxD));
  if (boosters.length) stages.push(boosters.map((p) => ({ kind: 'detach' as const, part: p.id })));
  for (let k = maxD - 1; k >= 0; k--) {
    const st: StageAction[] = decouplers.filter((p) => (dep.get(p.id) ?? 0) === k + 1).map((p) => ({ kind: 'detach' as const, part: p.id }));
    st.push(...ignite(k));
    stages.push(st);
  }
  const fairings = byKind(['fairing']).map((p) => ({ kind: 'jettison' as const, part: p.id }));
  if (fairings.length) {
    const at = Math.min(stages.length, boosters.length ? 2 : 1);
    if (stages.length > at) stages[at].push(...fairings); else stages.push(fairings);
  }
  const legs = byKind(['leg']).map((p) => ({ kind: 'legs' as const, part: p.id }));
  const chutes = byKind(['chute']).map((p) => ({ kind: 'chute' as const, part: p.id }));
  if (legs.length) stages.push(legs);
  if (chutes.length) stages.push(chutes);
  return stages.filter((s) => s.length);
}

export interface StageInfo { dvVac: number; dvAtm: number; twr: number; mass: number; burn: number }
export interface DesignStats {
  mass: number; dryMass: number; crew: number; hasControl: boolean; height: number; maxRadius: number;
  totalDvVac: number; stages: StageInfo[]; warnings: string[]; jump: boolean; liftoffTwr: number;
}

export function analyze(d: Design, surfaceG = 9.81, atmSea = true): DesignStats {
  void atmSea;
  const placed = layout(d);
  const warnings: string[] = [];
  let mass = 0;
  let dry = 0;
  let crew = 0;
  let top = -Infinity;
  let bottom = Infinity;
  let maxR = 0;
  for (const p of placed.values()) {
    mass += p.def.mass + (p.def.fuel ?? 0);
    dry += p.def.mass;
    crew += p.def.crew ?? 0;
    top = Math.max(top, p.yTop);
    bottom = Math.min(bottom, p.yBottom);
    if (p.def.attach === 'stack') maxR = Math.max(maxR, p.radius);
  }
  const ctrl = controlPart(d);
  if (d.parts.length && ctrl == null) warnings.push('No command pod: the rocket cannot be steered.');
  if (d.parts.length && !d.parts.some((p) => ['engine', 'srb'].includes(partDef(p.partId).kind))) warnings.push('No engine.');
  if (d.parts.length && !d.stages.some((s) => s.some((a) => a.kind === 'ignite'))) warnings.push('Staging never ignites an engine.');

  // remaining fuel per part as the staging sequence is replayed
  const fuel = new Map<number, number>();
  for (const p of d.parts) fuel.set(p.id, partDef(p.partId).fuel ?? 0);
  const alive = new Set(d.parts.map((p) => p.id));
  const active = new Set<number>();
  const stages: StageInfo[] = [];
  let totalDv = 0;
  let liftoffTwr = 0;
  const keep = ctrl ?? d.root;
  for (let si = 0; si < d.stages.length; si++) {
    for (const a of d.stages[si]) {
      if (!alive.has(a.part)) continue;
      if (a.kind === 'ignite') active.add(a.part);
      else if (a.kind === 'detach') {
        for (const g of detachSide(d, a.part, keep)) { alive.delete(g); active.delete(g); }
      } else if (a.kind === 'jettison') { alive.delete(a.part); active.delete(a.part); }
    }
    let m0 = 0;
    for (const id of alive) m0 += partDef(instOf(d, id).partId).mass + (fuel.get(id) ?? 0);
    const engines = [...active].filter((id) => alive.has(id));
    if (!engines.length) { stages.push({ dvVac: 0, dvAtm: 0, twr: 0, mass: m0, burn: 0 }); continue; }
    let F = 0;
    let mdVac = 0;
    let mdAtm = 0;
    let usable = 0;
    const sections = new Set<string>();
    for (const id of engines) {
      const def = partDef(instOf(d, id).partId);
      const f = def.thrust ?? 0;
      F += f;
      mdVac += f / ((def.ispVac ?? 300) * G0);
      mdAtm += f / ((def.ispAtm ?? 250) * G0);
      if (def.kind === 'srb') usable += fuel.get(id) ?? 0;
      else {
        const sec = [...sectionOf(d, id)].filter((x) => alive.has(x)).sort((x, y) => x - y);
        const key = sec.join(',');
        if (!sections.has(key)) {
          sections.add(key);
          for (const t of sec) if (partDef(instOf(d, t).partId).kind === 'tank') usable += fuel.get(t) ?? 0;
        }
      }
    }
    const ispV = F / (mdVac * G0);
    const ispA = F / (mdAtm * G0);
    const m1 = Math.max(1, m0 - usable);
    const dvVac = ispV * G0 * Math.log(m0 / m1);
    const dvAtm = ispA * G0 * Math.log(m0 / m1);
    const twr = F / (m0 * surfaceG);
    if (si === 0) liftoffTwr = (F * (ispA / ispV)) / (m0 * surfaceG);
    stages.push({ dvVac, dvAtm, twr, mass: m0, burn: mdVac > 0 ? usable / mdVac : 0 });
    totalDv += dvVac;
    // burn the fuel down
    let remaining = usable;
    for (const id of engines) if (partDef(instOf(d, id).partId).kind === 'srb') { remaining -= fuel.get(id) ?? 0; fuel.set(id, 0); }
    for (const id of alive) {
      if (remaining <= 0) break;
      const def = partDef(instOf(d, id).partId);
      if (def.kind !== 'tank') continue;
      const take = Math.min(fuel.get(id) ?? 0, remaining);
      // only tanks belonging to an active engine's section are drained
      if ([...sections].some((s) => s.split(',').includes(String(id)))) { fuel.set(id, (fuel.get(id) ?? 0) - take); remaining -= take; }
    }
  }
  return {
    mass, dryMass: dry, crew, hasControl: ctrl != null,
    height: top === -Infinity ? 0 : top - bottom, maxRadius: maxR,
    totalDvVac: totalDv, stages, warnings, jump: d.parts.some((p) => partDef(p.partId).kind === 'jump'), liftoffTwr,
  };
}
