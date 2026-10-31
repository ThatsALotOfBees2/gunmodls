/* ------------------------------------------------------------------ part: legs (hip actuators, thighs, knees, shins, boots) */
// Owner: the legs agent. Attach to upper_leg_*, lower_leg_*, foot_*, toes_* (hip actuator stators may go on hips). Contract: SPEC.md.
PARTS.legs = function buildLegs(K) {
  K.blockout.legs(K);
};
