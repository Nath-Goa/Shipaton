import { addRadial, addStack, autoStage, Design, emptyDesign } from './design';

class Builder {
  design: Design;
  last = -1;
  constructor(name: string) { this.design = emptyDesign(name); }

  /** Adds a part hanging below the previous stack part. */
  below(partId: string): this {
    const m = addStack(this.design, this.last < 0 ? null : this.last, 'bottom', partId);
    if (!m) throw new Error(`preset: cannot attach ${partId} under part ${this.last}`);
    this.design = m.design;
    this.last = m.added[0];
    return this;
  }

  /** Adds radial parts to the most recent stack part. */
  radial(partId: string, count: number, target = this.last, angle = Math.PI / 4): this {
    const m = addRadial(this.design, target, partId, count, angle);
    if (!m) throw new Error(`preset: cannot attach ${partId} radially to ${target}`);
    this.design = m.design;
    return this;
  }

  /** Remembers the id of the last stack part. */
  mark(): number { return this.last; }

  done(): Design {
    this.design.stages = autoStage(this.design);
    return this.design;
  }
}

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  /** Recommended starting situation */
  start: 'pad' | 'leo';
  build: () => Design;
}

export const PRESETS: Preset[] = [
  {
    id: 'sparrow', name: 'Sparrow Training Rocket', start: 'pad',
    blurb: 'One engine, two boosters, a parachute. Hop to space and glide home — a gentle first flight.',
    build: () => {
      const b = new Builder('Sparrow Training Rocket').below('pod_s1');
      const pod = b.mark();
      b.radial('chute_s1', 1, pod, 0);
      b.below('shield_s1').below('tank_s1_2_4');
      const tank = b.mark();
      b.below('eng_spark');
      b.radial('srb_s1', 2, tank, 0);
      return b.done();
    },
  },
  {
    id: 'meridian', name: 'Meridian Orbital Launcher', start: 'pad',
    blurb: 'Two-stage rocket carrying a three-seat capsule to low Earth orbit and home again.',
    build: () => {
      const b = new Builder('Meridian Orbital Launcher').below('pod_s2');
      const pod = b.mark();
      b.radial('chute_s2', 2, pod, 0);
      b.below('shield_s2').below('dec_s2').below('tank_s2_4').below('eng_owl').below('dec_s2').below('adp_s2_s3');
      b.below('tank_s3_12');
      const core = b.mark();
      b.below('eng_titan');
      b.radial('srb_s1', 6, core, 0);
      return b.done();
    },
  },
  {
    id: 'colossus', name: 'Colossus Heavy Launcher', start: 'pad',
    blurb: 'Three stages and four side boosters for crewed deep-space stacks. Payload fairing included.',
    build: () => {
      const b = new Builder('Colossus Heavy Launcher').below('cabin_s3');
      const cabin = b.mark();
      b.radial('chute_s2', 3, cabin, 0);
      b.below('shield_s3').below('dec_s3').below('tank_s3_4').below('eng_condor').below('dec_s3');
      b.below('tank_s3_8');
      b.below('eng_condor').below('dec_s3');
      b.below('tank_s3_12');
      const core = b.mark();
      b.below('eng_titan');
      b.radial('srb_s2', 4, core, 0);
      return b.done();
    },
  },
  {
    id: 'kestrel', name: 'Kestrel Reusable Booster', start: 'pad',
    blurb: 'The first stage keeps a probe core, boosters and landing legs. Stage with about 30% propellant left, then press Tab to fly the booster back down on its own engine.',
    build: () => {
      const b = new Builder('Kestrel Reusable Booster').below('pod_s2');
      const pod = b.mark();
      b.radial('chute_s2', 2, pod, 0);
      b.below('shield_s2').below('dec_s2').below('tank_s2_8').below('eng_owl').below('dec_s2').below('adp_s2_s3');
      b.below('probe_s3').below('tank_s3_8');
      const core = b.mark();
      b.below('eng_titan');
      b.radial('leg_s2', 4, core, 0);
      b.radial('srb_s1', 2, core, Math.PI / 4);
      return b.done();
    },
  },
  {
    id: 'selene', name: 'Selene Lunar Lander', start: 'leo',
    blurb: 'Starts in low Earth orbit with a transfer stage and a legged lander that can land and relaunch from the Moon.',
    build: () => {
      const b = new Builder('Selene Lunar Lander').below('lander_s2');
      b.below('tank_s2_2');
      const lt = b.mark();
      b.below('eng_owl');
      b.radial('leg_s1', 4, lt, 0);
      b.below('dec_s2').below('tank_s2_8').below('eng_owl');
      return b.done();
    },
  },
  {
    id: 'odyssey', name: 'Odyssey Interplanetary Ship', start: 'leo',
    blurb: 'Nuclear-thermal cruiser with a jump drive for the stars. Starts in low Earth orbit.',
    build: () => {
      const b = new Builder('Odyssey Interplanetary Ship').below('cabin_s3').below('jump_drive').below('tank_s3_12');
      b.below('eng_phoenix');
      return b.done();
    },
  },
];
