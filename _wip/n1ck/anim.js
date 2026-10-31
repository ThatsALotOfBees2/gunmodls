/* ------------------------------------------------------------------ animation: poses, clips and face timelines */
// Owner: the animation agent. Contract: SPEC.md ("Animation").
// CLIPS[name] = { len: seconds, loop: bool, label, pose(t) -> pose (see POSE in core.js),
//                 face(t) -> face cell name, tint(t) -> 0..1 alarm tint (optional, default 0) }
// Clips without root motion: N1CK stays over the origin (walk is in place, the game moves the root).
const ANIM = (() => {
  const { sym, curl } = POSE;
  const TAU = Math.PI * 2;
  // a blink cell for `face` while t is inside one of the blink windows (0.12 s each)
  const blink = (t, face, at = [1.3, 3.4]) => at.some((b) => t >= b && t < b + 0.12) ? face + '_blink' : face;
  // relaxed hands: a gentle cascade from index to pinky, thumb resting
  function hands(rot, k = 1) {
    for (const s of ['l', 'r']) {
      curl(rot, s, 'index', [10 * k, 14 * k, 8 * k], 2);
      curl(rot, s, 'middle', [14 * k, 18 * k, 10 * k], 0);
      curl(rot, s, 'ring', [18 * k, 22 * k, 12 * k], -2);
      curl(rot, s, 'pinky', [22 * k, 26 * k, 14 * k], -5);
      curl(rot, s, 'thumb', [6 * k, 10 * k, 8 * k]);
    }
    return rot;
  }
  // open, warm stance: chest up, shoulders down and a touch back, arms a little away from the body,
  // palms turned slightly forward, weight easy. b = breath phase (-1..1).
  function stand(b = 0, sway = 0) {
    const rot = {};
    rot.spine = [-1.5 + 0.4 * b, 0, -0.8 * sway];
    rot.chest = [-1.5 + 0.6 * b, 0, -0.4 * sway];
    rot.upper_chest = [-1 + 0.5 * b, 0, 0];
    rot.neck = [2, 0, 0.5 * sway];
    rot.head = [-1, 0, 2 + 0.6 * sway];
    sym(rot, 'shoulder', [0, 3, -4 - 0.6 * b]);
    sym(rot, 'upper_arm', [-6, 18, -74 + 0.8 * b]);
    sym(rot, 'lower_arm', [0, -14, 0]);
    sym(rot, 'hand', [0, 0, -4]);
    sym(rot, 'upper_leg', [0, 0, 3]);
    sym(rot, 'lower_leg', [2, 0, 0]);
    sym(rot, 'foot', [-2, 0, -3]);
    hands(rot);
    return { rot, hips: [0.006 * sway, -0.004 + 0.0015 * b, 0] };
  }
  const idle = (t) => stand(Math.sin(TAU * t / 4), Math.sin(TAU * t / 4 + 1.2));

  const CLIPS = {
    idle: { len: 4, loop: true, label: 'Idle', pose: idle, face: (t) => blink(t, 'neutral') },
  };
  // the page's clip buttons, in order; clips not defined yet show disabled
  const ORDER = ['idle', 'walk', 'talk_gesture', 'wave', 'laugh', 'sad', 'worried', 'alert', 'nullfield_activate'];
  const LABELS = { idle: 'Idle', walk: 'Walk', talk_gesture: 'Talk', wave: 'Wave', laugh: 'Laugh', sad: 'Sad', worried: 'Worried', alert: 'Alert', nullfield_activate: 'Nullfield' };
  return { CLIPS, ORDER, LABELS, stand, hands, blink };
})();
