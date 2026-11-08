"""operators/human-rig: procedural animation clips baked onto the geared rig (imported by integrate_rig.py).
Derived from the human-proto anim.py; adds prop bones (PropPistolDrop, PropPistolBelt, PropMag) that follow
their holster / pouch (the constant blend of bones the prop was skinned to) and go into the hand in the
Holster / HolsterBelt / Reload clips, plus geared-body offsets (arms clear the plate bag and pouches, wider
crouch, hip-flex limits).

Every clip is computed per frame with our own FK + analytic two-bone IK (no Blender constraints),
then keyed as local quaternions (+ Hips location). Bones keep Unity-Humanoid names.
Axes (armature space = Blender world): +Z up, character faces -Y, his left is +X.

Clips (30 fps, all loop):  Idle 4 s, Ready 3 s, Walk 1.1 s (in place), CrouchIdle 4 s, LookAround 6 s
Public:  build_clips(rig) -> {name: action};  POSES (static checks) via pose_at(rig, clip, t)
"""
import math
import bpy
from mathutils import Matrix, Quaternion, Vector

FPS = 30
CLIPS = {'Idle': 4.0, 'Ready': 3.0, 'Walk': 1.1, 'CrouchIdle': 4.0, 'LookAround': 6.0, 'Holster': 4.2,
         'HolsterBelt': 4.2, 'Reload': 3.6}
CLIP_FN = {'Idle': 'idle', 'Ready': 'ready', 'Walk': 'walk', 'CrouchIdle': 'crouch', 'LookAround': 'look_around',
           'Holster': 'holster', 'HolsterBelt': 'holster_belt', 'Reload': 'reload'}
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
TAU = 2 * math.pi
FINGERS = ('Thumb', 'Index', 'Middle', 'Ring', 'Little')
SEG = ('Proximal', 'Intermediate', 'Distal')


def qa(axis, deg):
    return Quaternion(Vector(axis).normalized(), math.radians(deg))


def mirror_q(q):
    """mirror a rotation across the YZ plane (left <-> right)."""
    return Quaternion((q.w, q.x, -q.y, -q.z))


def mirror_v(v):
    return Vector((-v.x, v.y, v.z))


def ease(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


class Pose:
    def __init__(self, rig):
        self.rig = rig
        bones = list(rig.data.bones)
        depth = {b.name: len(b.parent_recursive) for b in bones}
        self.order = sorted((b.name for b in bones), key=lambda n: depth[n])
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in bones}
        self.rest = {b.name: b.matrix_local.copy() for b in bones}
        self.length = {b.name: b.length for b in bones}
        self.rel = {}
        for n in self.order:
            p = self.parent[n]
            self.rel[n] = (self.rest[p].inverted() @ self.rest[n]) if p else self.rest[n].copy()
        self.reset()

    def reset(self):
        self.basis = {n: Matrix.Identity(4) for n in self.order}
        self.fk()

    def fk(self):
        P = {}
        for n in self.order:
            p = self.parent[n]
            P[n] = (P[p] if p else Matrix.Identity(4)) @ self.rel[n] @ self.basis[n]
        self.pose = P

    def head(self, n):
        return self.pose[n].translation.copy()

    def rot(self, n):
        return self.pose[n].to_quaternion()

    def set_rest_rot(self, n, D):
        """rotation D (armature axes) relative to the parent's rest frame."""
        Rb = self.rest[n].to_quaternion()
        loc = self.basis[n].translation.copy()
        self.basis[n] = Matrix.Translation(loc) @ (Rb.inverted() @ D @ Rb).to_matrix().to_4x4()

    def add_rest_rot(self, n, D):
        Rb = self.rest[n].to_quaternion()
        self.basis[n] = self.basis[n] @ (Rb.inverted() @ D @ Rb).to_matrix().to_4x4()

    def apply_world_rot(self, n, Q, fk=True):
        """rotate bone n (and its subtree) by armature-space Q about its posed head."""
        Rc = self.rot(n)
        self.basis[n] = self.basis[n] @ (Rc.inverted() @ Q @ Rc).to_matrix().to_4x4()
        if fk: self.fk()

    def set_world_rot(self, n, Rdes, fk=True):
        self.apply_world_rot(n, Rdes @ self.rot(n).inverted(), fk)

    def move_root(self, n, v):
        """translate a root bone by armature-space v (relative to rest)."""
        Rb = self.rest[n].to_quaternion()
        b = self.basis[n]
        self.basis[n] = Matrix.Translation(Rb.inverted() @ Vector(v)) @ b.to_quaternion().to_matrix().to_4x4()


def signed_angle(a, b, axis):
    a = a - axis * a.dot(axis); b = b - axis * b.dot(axis)
    if a.length < 1e-9 or b.length < 1e-9: return 0.0
    a.normalize(); b.normalize()
    return math.atan2(axis.dot(a.cross(b)), max(-1.0, min(1.0, a.dot(b))))


class Limb:
    """two-bone analytic IK: upper -> (rigid twist) -> lower -> (twist) -> end."""
    def __init__(self, P, upper, lower, end, twist_lower=None):
        self.u, self.l, self.e, self.tw = upper, lower, end, twist_lower
        P.reset()
        S, E, W = P.head(upper), P.head(lower), P.head(end)
        self.a, self.b = (E - S).length, (W - E).length
        n = (E - S).cross(W - E).normalized()
        self.su = 1.0 if P.pose[upper].col[0].xyz.dot(n) >= 0 else -1.0
        self.sl = 1.0 if P.pose[lower].col[0].xyz.dot(n) >= 0 else -1.0
        self.rest_end = P.rot(end)
        self.rest_W = W

    def solve(self, P, W, pole, Rend=None, twist_share=0.6):
        S = P.head(self.u)
        d_vec = W - S; d = d_vec.length
        d = min(max(d, abs(self.a - self.b) + 1e-4), (self.a + self.b) * 0.9995)
        u = d_vec.normalized(); W = S + u * d
        along = (self.a ** 2 - self.b ** 2 + d ** 2) / (2 * d)
        h = math.sqrt(max(self.a ** 2 - along ** 2, 0.0))
        pv = (pole - S); pv = pv - u * pv.dot(u)
        if pv.length < 1e-6: pv = Vector((0, -1, 0)) - u * u.y
        pv.normalize()
        E = S + u * along + pv * h
        n = (E - S).cross(W - E).normalized()
        # upper: swing then hinge twist
        P.apply_world_rot(self.u, (P.head(self.l) - S).rotation_difference(E - S))
        ax = (E - S).normalized()
        P.apply_world_rot(self.u, Quaternion(ax, signed_angle(P.pose[self.u].col[0].xyz, self.su * n, ax)))
        # lower
        El = P.head(self.l)
        P.apply_world_rot(self.l, (P.head(self.e) - El).rotation_difference(W - El))
        ax = (W - El).normalized()
        P.apply_world_rot(self.l, Quaternion(ax, signed_angle(P.pose[self.l].col[0].xyz, self.sl * n, ax)))
        if Rend is not None:
            if self.tw:     # share forearm pronation with the twist bone (no candy-wrap at the wrist)
                q = Rend @ P.rot(self.e).inverted()
                v = Vector((q.x, q.y, q.z)); proj = ax * v.dot(ax)
                tq = Quaternion((q.w, proj.x, proj.y, proj.z)); tq.normalize()
                ang = 2 * math.atan2(proj.length, tq.w if tq.w != 0 else 1e-9) * (1 if v.dot(ax) >= 0 else -1)
                if ang > math.pi: ang -= TAU
                if ang < -math.pi: ang += TAU
                P.apply_world_rot(self.tw, Quaternion(ax, ang * twist_share))
            P.set_world_rot(self.e, Rend)
        return E


def frame_from(f, n):
    f = Vector(f).normalized(); n = Vector(n); n = (n - f * n.dot(f)).normalized()
    return Matrix((f, n, f.cross(n))).transposed()


def hand_rot(P, side, f_des, n_des):
    """armature-space rotation for the hand so its finger direction = f_des and palm normal = n_des."""
    s = 'Left' if side == 'L' else 'Right'
    sg = 1.0 if side == 'L' else -1.0
    P0 = P._rest_pose
    w, m = P0[f'{s}Hand'], P0[f'{s}MiddleProximal']
    f0 = (m - w).normalized()
    across = (P0[f'{s}IndexProximal'] - P0[f'{s}LittleProximal']).normalized()
    n0 = f0.cross(across).normalized() * sg
    F0 = frame_from(f0, n0); F1 = frame_from(f_des, n_des)
    return (F1 @ F0.transposed()).to_quaternion() @ P._rest_rot[f'{s}Hand']


def fingers(P, side, curl, spread=0.0, thumb=(10, 10, 5), thumb_in=0.0, index=None):
    """curl in degrees per segment (prox, inter, dist); applied about each bone's local X (MH hinge axis)."""
    s = 'Left' if side == 'L' else 'Right'
    for fi, fn in enumerate(FINGERS):
        c = thumb if fn == 'Thumb' else (index if (fn == 'Index' and index is not None) else curl)
        for si, sn in enumerate(SEG):
            b = f'{s}{fn}{sn}'
            if b not in P.basis: continue
            ang = c[si]
            q = Quaternion(Vector((1, 0, 0)), math.radians(ang * P._curl_sign[b]))
            if fn == 'Thumb' and si == 0 and thumb_in:
                q = Quaternion(Vector((0, 0, 1)), math.radians(thumb_in * P._curl_sign[b])) @ q
            P.basis[b] = P.basis[b] @ q.to_matrix().to_4x4()


F_RELAXED = dict(curl=(18, 26, 14), thumb=(8, 14, 10), thumb_in=10, index=(18, 26, 14))
F_GRIP = dict(curl=(62, 78, 40), thumb=(25, 25, 20), thumb_in=35, index=(8, 12, 6))


def fingers_mix(P, side, A, B, k):
    mix = lambda a, b: tuple(x + (y - x) * k for x, y in zip(a, b))
    fingers(P, side, mix(A['curl'], B['curl']), thumb=mix(A['thumb'], B['thumb']),
            thumb_in=A['thumb_in'] + (B['thumb_in'] - A['thumb_in']) * k, index=mix(A['index'], B['index']))


def _calibrate(P):
    """per finger bone: the sign of a local-X rotation that curls toward the palm."""
    P.reset()
    P._rest_pose = {n: P.head(n) for n in P.order}
    P._rest_rot = {n: P.rot(n) for n in P.order}
    P._curl_sign = {}
    for s, sg in (('Left', 1.0), ('Right', -1.0)):
        w, m = P._rest_pose[f'{s}Hand'], P._rest_pose[f'{s}MiddleProximal']
        f0 = (m - w).normalized()
        across = (P._rest_pose[f'{s}IndexProximal'] - P._rest_pose[f'{s}LittleProximal']).normalized()
        palm = f0.cross(across).normalized() * sg
        for fn in FINGERS:
            for sn in SEG:
                b = f'{s}{fn}{sn}'
                if b not in P.rest: continue
                R = P._rest_rot[b]; yax = R @ Vector((0, 1, 0)); xax = R @ Vector((1, 0, 0))
                moved = Quaternion(xax, 0.3) @ yax       # +X rotation of the bone direction
                ref = palm if fn != 'Thumb' else (palm + f0 * 0.3).normalized()
                P._curl_sign[b] = 1.0 if (moved - yax).dot(ref) > 0 else -1.0


# ------------------------------------------------------------------ the character's bodies of motion
class Character:
    def __init__(self, rig, props=None):
        import os, json as _j
        self.props = props or {}
        self.GEAR = dict(self.GEAR); self.CROUCH = dict(self.CROUCH)
        self.GEAR.update(_j.loads(os.environ.get('ANIM_GEAR', '{}')))
        self.HOLSTER_BELT = dict(self.HOLSTER_BELT)
        self.HOLSTER_BELT.update(_j.loads(os.environ.get('ANIM_HOLSTER_BELT', '{}')))
        self.HOLSTER = dict(self.HOLSTER); self.HOLSTER.update(_j.loads(os.environ.get('ANIM_HOLSTER', '{}')))
        self.HOLSTER_BELT.update(_j.loads(os.environ.get('ANIM_HOLSTER_BOTH', '{}'))); self.HOLSTER.update(_j.loads(os.environ.get('ANIM_HOLSTER_BOTH', '{}')))       # tuning hooks (pen_rig sweeps)
        self.MAG_HAND = dict(self.MAG_HAND); self.MAG_HAND.update(_j.loads(os.environ.get('ANIM_MAG_HAND', '{}')))
        self.PISTOL_HAND = dict(self.PISTOL_HAND); self.PISTOL_HAND.update(_j.loads(os.environ.get('ANIM_PISTOL_HAND', '{}')))
        self.CROUCH.update(_j.loads(os.environ.get('ANIM_CROUCH', '{}')))
        self.P = P = Pose(rig)
        _calibrate(P)
        self.arm = {s: Limb(P, f'{n}UpperArm', f'{n}LowerArm', f'{n}Hand', f'{n}LowerArmTwist')
                    for s, n in (('L', 'Left'), ('R', 'Right'))}
        self.leg = {s: Limb(P, f'{n}UpperLeg', f'{n}LowerLeg', f'{n}Foot', None)
                    for s, n in (('L', 'Left'), ('R', 'Right'))}
        r = P._rest_pose
        self.hip0 = r['Hips']
        self.ankle0 = {'L': r['LeftFoot'], 'R': r['RightFoot']}
        self.ball0 = {'L': r['LeftToes'], 'R': r['RightToes']}
        self.knee0 = {'L': r['LeftLowerLeg'], 'R': r['RightLowerLeg']}
        self.sh0 = {'L': r['LeftUpperArm'], 'R': r['RightUpperArm']}
        self.elb0 = {'L': r['LeftLowerArm'], 'R': r['RightLowerArm']}
        self.foot_rot0 = {'L': P._rest_rot['LeftFoot'], 'R': P._rest_rot['RightFoot']}
        self.chest_rest = P.rest['UpperChest'].copy()

    # --- body primitives
    def spine(self, bend=0.0, yaw=0.0, side=0.0, breath=0.0, hips_yaw=0.0, hips_roll=0.0, hips_pitch=0.0):
        P = self.P
        P.set_rest_rot('Hips', qa(Z, hips_yaw) @ qa(Y, hips_roll) @ qa(X, hips_pitch))
        # distribute bend / counter-yaw / side bend over the 5 spine segments; breath lifts the chest
        for b, wgt, br in (('Spine', 0.18, 0.2), ('spine04', 0.2, 0.3), ('Chest', 0.22, 0.6), ('spine02', 0.22, 1.0),
                           ('UpperChest', 0.18, 0.8)):
            P.set_rest_rot(b, qa(Z, yaw * wgt) @ qa(Y, side * wgt) @ qa(X, bend * wgt - breath * br))

    def neck(self, yaw=0.0, pitch=0.0, roll=0.0, eyes_yaw=0.0, eyes_pitch=0.0):
        P = self.P
        for b, wgt in (('Neck', 0.25), ('neck02', 0.2), ('neck03', 0.15), ('Head', 0.4)):
            P.set_rest_rot(b, qa(Z, yaw * wgt) @ qa(X, pitch * wgt) @ qa(Y, roll * wgt))
        for b in ('LeftEye', 'RightEye'):
            if b in P.basis: P.set_rest_rot(b, qa(Z, eyes_yaw) @ qa(X, eyes_pitch))

    def shoulders(self, lift=0.0, fwd_l=0.0, fwd_r=0.0):
        P = self.P
        P.set_rest_rot('LeftShoulder', qa(Y, -lift) @ qa(Z, -fwd_l))
        P.set_rest_rot('RightShoulder', mirror_q(qa(Y, -lift) @ qa(Z, -fwd_r)))

    def hips_move(self, v):
        self.P.move_root('Hips', v)

    def plant_foot(self, s, pos, yaw=0.0, pitch=0.0, pivot='ankle', toe_flat=True):
        """put the foot: pos = where its pivot (ankle / ball / heel) sits; pitch>0 toe down, <0 toe up."""
        P = self.P
        a0, b0 = self.ankle0[s], self.ball0[s]
        heel0 = Vector((a0.x, a0.y + 0.045, 0.0))
        q = qa(Z, yaw) @ qa(X, pitch)
        piv0 = {'ankle': a0, 'ball': Vector((b0.x, b0.y, 0.0)), 'heel': heel0}[pivot]
        W = Vector(pos) + q @ (a0 - piv0)
        side = 1 if s == 'L' else -1
        knee_fwd = q @ Vector((0.0, -1.0, 0.0))
        pole = (self.knee0[s] + (W - a0)) + knee_fwd * 0.6 + Vector(((0.06 + getattr(self, '_knee_out', 0.0)) * side, 0, 0))
        n = 'Left' if s == 'L' else 'Right'
        self.leg[s].solve(P, W, pole, q @ self.foot_rot0[s])
        if toe_flat and pitch > 0:
            P.apply_world_rot(f'{n}Toes', qa(X, -pitch * 0.9))

    def chest_delta(self):
        P = self.P
        return P.pose['UpperChest'] @ self.chest_rest.inverted()

    def reach(self, s, W, f_des, n_des, pole_off, fing, local=True):
        """hand to W (armature space, or UpperChest-relative rest space if local) with orientation."""
        P = self.P
        f_des, n_des, W = Vector(f_des), Vector(n_des), Vector(W)
        if local:
            M = self.chest_delta(); R = M.to_quaternion()
            W = M @ W; f_des = R @ f_des; n_des = R @ n_des
        Rh = hand_rot(P, s, f_des, n_des)
        pole = P.head(f'{"Left" if s == "L" else "Right"}LowerArm') + Vector(pole_off)
        self.arm[s].solve(P, W, pole, Rh)
        fing(P, s)

    # ---- geared-body offsets (integration): the proto clips were made for a slim carrier. With the modular kit the
    # arms must clear the cummerbund pouches (bang right, radio left), the rifle-mag / admin stack on the front bag
    # and the belt line; the rifle sits forward of the plate bag.
    GEAR = dict(abd=0.105, abd_r=0.15, arm_fwd=0.0, arm_fwd_r=0.07, pole_out=0.9,          # relaxed arms: wrist out / forward, elbow pole out
                butt_fwd=0.11, butt_out=0.0, butt_up=0.0,      # rifle butt: forward of the front plate bag
                fore_d=0.60, fore_side=0.11, fore_up=0.075,    # support hand further out on the handguard
                pole_l=(1.0, -0.15, -0.3), pole_r=(-0.70, 0.10, -0.45),   # elbows down and out
                look_hips=0.22, look_spine=0.34, look_push=0.06, reload_push=0.08, reload_pole=(1.0, -0.6, -0.2),
                reload_arc=0.05, reload_arc_up=0.0, reload_in=0.30)    # LookAround: turn more from the hips; Reload: mag path bows round the bag

    def relaxed_target(self, s, swing=0.0, breath=0.0, abd=None):
        G = self.GEAR; sg = 1 if s == 'L' else -1
        abd = (G['abd'] if s == 'L' else G.get('abd_r', G['abd'])) if abd is None else abd
        sh = self.P.head('LeftUpperArm' if s == 'L' else 'RightUpperArm')
        fwd = G['arm_fwd'] if s == 'L' else G.get('arm_fwd_r', G['arm_fwd'])     # right hand clear of the holster grip
        W = sh + Vector(((0.055 + abd) * sg, -0.05 - fwd + swing, -0.50 + 0.004 * breath + abd * 0.18))
        f = Vector(((0.06 + abd * 0.9) * sg, -0.25 - swing * 0.6, -1.0))
        n = Vector((-1.0 * sg, 0.25, 0.0))
        pole = Vector((G['pole_out'] * sg, 0.6, 0.0))
        return W, hand_rot(self.P, s, f, n), pole

    def arm_to(self, s, W, Rh, pole_off, fing):
        n = 'Left' if s == 'L' else 'Right'
        self.arm[s].solve(self.P, W, self.P.head(n + 'LowerArm') + Vector(pole_off), Rh)
        fing(self.P, s)

    @staticmethod
    def f_relaxed(P, s): fingers(P, s, (18, 26, 14), thumb=(8, 14, 10), thumb_in=10)
    @staticmethod
    def f_grip(P, s): fingers(P, s, (62, 78, 40), thumb=(25, 25, 20), thumb_in=35, index=(8, 12, 6))
    @staticmethod
    def f_fore(P, s): fingers(P, s, (48, 60, 30), thumb=(15, 20, 10), thumb_in=20)
    @staticmethod
    def f_mag(P, s): fingers(P, s, (55, 62, 35), thumb=(20, 25, 15), thumb_in=40)
    @staticmethod
    def f_support(P, s): fingers(P, s, (40, 55, 30), thumb=(12, 15, 10), thumb_in=5)

    def relaxed_arm(self, s, swing=0.0, breath=0.0):
        W, Rh, pole = self.relaxed_target(s, swing, breath)
        self.arm_to(s, W, Rh, pole, self.f_relaxed)

    # rifle hold (no rifle): stock in the right shoulder pocket, muzzle depressed ~25 deg (low ready)
    def rifle_frame(self, muzzle_down=24.0, push=0.0, inboard=0.0):
        """armature-space rifle frame (follows the chest): butt, bore d, up, side (+X = his left).
        push: extra forward offset (m) of the whole rifle (reload, looking right)."""
        G = self.GEAR; sh = self.sh0['R']
        butt = sh + Vector((0.06 - G['butt_out'], -0.08 - G['butt_fwd'] - push, -0.03 + G['butt_up']))
        d = Vector((0.10 + inboard, -math.cos(math.radians(muzzle_down)), -math.sin(math.radians(muzzle_down)))).normalized()
        up = d.cross(X).normalized()
        if up.z < 0: up = -up
        side = up.cross(d).normalized()
        M = self.chest_delta(); Rq = M.to_quaternion()
        return M @ butt, Rq @ d, Rq @ up, Rq @ side

    def rifle_targets(self, muzzle_down=24.0, push=0.0, inboard=0.0):
        G = self.GEAR; P = self.P
        butt, d, up, side = self.rifle_frame(muzzle_down, push, inboard)
        grip_w = butt + d * 0.215 - up * 0.10 - side * 0.012     # right wrist behind/below the pistol grip
        fore_w = butt + d * G['fore_d'] - up * G['fore_up'] + side * G['fore_side']   # left wrist under the handguard
        fr = (-up * 0.85 + d * 0.35 + side * 0.15); nr = side
        fl = (d * 0.55 - side * 0.65 + up * 0.25); nl = (up * 0.8 - side * 0.4)
        return {'R': (grip_w, hand_rot(P, 'R', fr, nr)), 'L': (fore_w, hand_rot(P, 'L', fl, nl)),
                'frame': (butt, d, up, side)}

    def rifle(self, muzzle_down=24.0, cant=0.0, left_override=None, push=0.0, pole_l=None, inboard=0.0):
        G = self.GEAR
        T = self.rifle_targets(muzzle_down, push, inboard)
        self.arm_to('R', *T['R'], G['pole_r'], self.f_grip)
        if left_override is None:
            self.arm_to('L', *T['L'], pole_l or G['pole_l'], self.f_fore)
        return T

    # ---------------------------------------------------------------- clips: pose for time t

    def idle(self, t):
        P = self.P; P.reset()
        T = CLIPS['Idle']; ph = TAU * t / T
        br = 0.5 - 0.5 * math.cos(TAU * t / 4.0)
        sway = math.sin(ph)                                           # weight shift L<->R once per loop
        self.hips_move((0.012 * sway, 0.0, -0.012 - 0.004 * abs(sway) + 0.002 * br))
        self.spine(bend=2.0, side=-1.2 * sway, breath=1.4 * br, hips_roll=1.6 * sway, hips_yaw=-1.0 * sway)
        self.shoulders(lift=0.8 * br)
        self.neck(yaw=4 * math.sin(ph + 1.0), pitch=1.5 + 1.0 * math.sin(2 * ph), roll=0.8 * sway,
                  eyes_yaw=3 * math.sin(2 * ph + 0.5))
        P.fk()
        self.plant_foot('L', self.ankle0['L'] + Vector((-0.04, 0.0, 0.0)), yaw=-7)
        self.plant_foot('R', self.ankle0['R'] + Vector((0.04, 0.02, 0.0)), yaw=8)
        self.relaxed_arm('L', swing=0.006 * math.sin(ph), breath=br)
        self.relaxed_arm('R', swing=-0.006 * math.sin(ph), breath=br)

    def _ready_base(self, t, yaw=0.0, pitch=0.0, side=0.0, drop=0.035, br=0.0, eyes_yaw=0.0):
        P = self.P
        self.hips_move((0.0, 0.03, -drop))
        self.spine(bend=9.0, yaw=16 + yaw, side=side, breath=1.0 * br, hips_yaw=-18, hips_pitch=4)
        self.shoulders(lift=0.4 * br, fwd_l=6, fwd_r=3)
        self.neck(yaw=1.5 + yaw * 0.6 * 0, pitch=-6 + pitch, eyes_yaw=eyes_yaw)
        P.fk()
        # bladed stance: left foot forward, right foot back and turned out
        self.plant_foot('L', self.ankle0['L'] + Vector((-0.03, -0.13, 0.0)), yaw=-14)
        self.plant_foot('R', self.ankle0['R'] + Vector((0.01, 0.16, 0.0)), yaw=-32)

    def ready(self, t):
        P = self.P; P.reset()
        br = 0.5 - 0.5 * math.cos(TAU * t / 3.0)
        s = math.sin(TAU * t / 3.0)
        self._ready_base(t, yaw=0.8 * s, side=0.4 * s, br=br, eyes_yaw=2 * math.sin(TAU * t / 1.5))
        self.rifle(muzzle_down=24 + 0.8 * br)

    def look_around(self, t):
        P = self.P; P.reset()
        T = CLIPS['LookAround']
        # key yaw angles (torso+head), held, smooth: centre -> left -> hold -> right -> hold -> centre
        keys = [(0.0, 0), (0.9, 0), (1.7, 55), (2.6, 55), (3.8, -50), (4.8, -50), (5.6, 0), (6.0, 0)]
        for (t0, a0), (t1, a1) in zip(keys, keys[1:]):
            if t0 <= t <= t1:
                yaw = a0 + (a1 - a0) * ease((t - t0) / (t1 - t0)); break
        # eyes lead the head
        lead = 0.0
        for (t0, a0), (t1, a1) in zip(keys, keys[1:]):
            if t0 <= t + 0.18 <= t1:
                lead = a0 + (a1 - a0) * ease((t + 0.18 - t0) / (t1 - t0)); break
        else:
            lead = yaw
        br = 0.5 - 0.5 * math.cos(TAU * t / 3.0)
        P.reset()
        self.hips_move((0.0, 0.03, -0.035))
        G = self.GEAR
        self.spine(bend=9.0, yaw=16 + yaw * G['look_spine'], breath=br, hips_yaw=-18 + yaw * G['look_hips'], hips_pitch=4)
        self.shoulders(lift=0.4 * br, fwd_l=6, fwd_r=3)
        self.neck(yaw=yaw * 0.6, pitch=-6 + 3 * math.sin(TAU * t / T * 2), eyes_yaw=max(-20, min(20, (lead - yaw) * 0.9)))
        P.fk()
        self.plant_foot('L', self.ankle0['L'] + Vector((-0.03, -0.13, 0.0)), yaw=-14)
        self.plant_foot('R', self.ankle0['R'] + Vector((0.01, 0.16, 0.0)), yaw=-32)
        right = max(0.0, -yaw) / 50.0                      # looking right: the support arm swings across the bag
        self.rifle(muzzle_down=26 + br - 6 * right, push=self.GEAR['look_push'] * right,
                   pole_l=tuple(Vector(self.GEAR['pole_l']).lerp(Vector((1.0, -0.5, -0.1)), right)))

    # geared crouch: hips less deep and less pitched (thighs stay below the belt line / pistol mags), feet wider,
    # knees pushed out (pole), spine takes more of the bend
    # fixB: pistol mags moved to the left hip, so the spine takes less of the bend (belly off the belt front edge)
    CROUCH = dict(drop=0.22, back=0.05, bend=15.0, hp=6.0, lx=0.15, ly=-0.12, rx=0.07, ry=0.17, lyaw=-18, ryaw=-30,
                  knee_out=0.12)

    def crouch(self, t):
        P = self.P; P.reset(); CR = self.CROUCH
        br = 0.5 - 0.5 * math.cos(TAU * t / 4.0)
        s = math.sin(TAU * t / 4.0)
        self.hips_move((0.0, CR['back'], -CR['drop'] + 0.004 * br))
        self.spine(bend=CR['bend'] + 0.6 * br, yaw=14 + 1.0 * s, breath=0.8 * br, hips_yaw=-12, hips_pitch=CR['hp'])
        self.shoulders(lift=0.3 * br, fwd_l=6, fwd_r=3)
        self.neck(yaw=2 * s, pitch=-18 + (CR['bend'] - 16) * 0.5, eyes_yaw=3 * math.sin(TAU * t / 2))
        P.fk()
        self._knee_out = CR['knee_out']
        self.plant_foot('L', self.ankle0['L'] + Vector((CR['lx'], CR['ly'], 0.0)), yaw=CR['lyaw'])
        self.plant_foot('R', Vector((self.ball0['R'].x - CR['rx'], self.ball0['R'].y + CR['ry'], 0.0)), yaw=CR['ryaw'],
                        pitch=34, pivot='ball')
        self._knee_out = 0.0
        self.rifle(muzzle_down=22 + br)

    def walk(self, t):
        P = self.P; P.reset()
        T = CLIPS['Walk']; p = (t / T) % 1.0
        L = 0.62                              # foot travel during stance (half the stride length)
        duty = 0.6
        def foot(ph):
            ph %= 1.0
            if ph < duty:                     # stance: slides back under the body at constant speed
                y = -L / 2 + L * ph / duty; z = 0.0
                if ph < 0.1: pitch, piv = -14 * (1 - ph / 0.1) ** 1.5, 'heel'
                elif ph > 0.42: pitch, piv = 38 * ((ph - 0.42) / (duty - 0.42)) ** 1.6, 'ball'
                else: pitch, piv = 0.0, 'ankle'
            else:                             # swing: forward with a lift
                s = (ph - duty) / (1 - duty)
                y = L / 2 - L * ease(s); z = 0.075 * math.sin(math.pi * min(1, s * 1.15)) ** 1.2
                pitch = 38 * (1 - ease(s * 2.2)) - 14 * ease((s - 0.45) / 0.55); piv = 'ball' if s < 0.3 else 'heel'
                if s >= 0.3: piv = 'ankle'
            return y, z, pitch, piv
        bob = -0.032 + 0.016 * math.cos(TAU * 2 * (p - 0.3))
        sway = 0.022 * math.sin(TAU * (p - 0.05))       # toward the stance foot
        self.hips_move((sway, 0.0, bob))
        rot = math.sin(TAU * p)
        self.spine(bend=4.0, yaw=-7 * rot, side=-1.5 * rot, breath=0.3, hips_yaw=6 * rot,
                   hips_roll=2.5 * math.sin(TAU * (p - 0.05)))
        self.shoulders(fwd_l=-2 * rot, fwd_r=2 * rot)
        self.neck(yaw=1 * rot, pitch=2.0, roll=-1.0 * rot)
        P.fk()
        for s, off, sg in (('L', 0.0, 1), ('R', 0.5, -1)):
            y, z, pitch, piv = foot(p + off)
            a0 = self.ankle0[s]
            base = Vector((a0.x - 0.07 * sg, a0.y + y, 0.0))
            if piv == 'ankle':
                pos = base + Vector((0, 0, a0.z + z))
            elif piv == 'ball':
                pos = Vector((base.x, self.ball0[s].y + y, z))
            else:
                pos = Vector((base.x, a0.y + 0.045 + y, z))
            self.plant_foot(s, pos, yaw=-5 * sg, pitch=pitch, pivot=piv, toe_flat=(piv == 'ball' and z < 0.01))
        # arms swing opposite to the legs
        sw = math.sin(TAU * (p + 0.0))
        self.relaxed_arm('L', swing=0.13 * sw)
        self.relaxed_arm('R', swing=-0.13 * sw)


    # ---------------------------------------------------------------- Holster: draw the pistol, present, reholster
    # pistol local frame (prop bone): +Y bore (muzzle), -Z slide top, +Z grip down, +X the pistol's left side.
    PISTOL_HAND = dict(w=(-0.034, -0.124, 0.066), f=(0.0, 0.92, -0.38), n=(1.0, 0.0, 0.05))     # right hand on the grip
    PISTOL_SUPPORT = dict(w=(0.040, -0.090, 0.078), f=(-0.62, 0.40, 0.42), n=(-1.0, 0.1, 0.25))  # left hand wraps over
    PISTOL_GRIP_C = (0.0, -0.075, 0.045)

    def hand_on(self, s, M, spec):
        """wrist target + hand rotation from a prop pose M (armature space) and a hand spec in prop-local coords."""
        R = M.to_quaternion()
        W = M @ Vector(spec['w'])
        return W, hand_rot(self.P, s, R @ Vector(spec['f']), R @ Vector(spec['n']))

    @staticmethod
    def _lerp_target(A, B, k):
        return A[0].lerp(B[0], k), A[1].slerp(B[1], k)

    @staticmethod
    def _lerp_M(A, B, k):
        q = A.to_quaternion().slerp(B.to_quaternion(), k)
        return Matrix.Translation(A.translation.lerp(B.translation, k)) @ q.to_matrix().to_4x4()

    @staticmethod
    def _seg(t, keys):
        """keys [(t0, v0), (t1, v1) ...] -> eased value (v may be a float)."""
        if t <= keys[0][0]: return keys[0][1]
        for (t0, a), (t1, b) in zip(keys, keys[1:]):
            if t0 <= t <= t1: return a + (b - a) * ease((t - t0) / max(t1 - t0, 1e-6))
        return keys[-1][1]

    def _pistol_present(self, k_up):
        """isosceles presentation: bore forward (-Y), slide up; k_up 0 = compressed at the chest, 1 = extended."""
        Rm = Matrix(((1, 0, 0), (0, 0, -1), (0, -1, 0))).transposed()   # bone X->+X, Y->-Y, Z->-Z (columns)
        Rm = Matrix((Vector((1, 0, 0)), Vector((0, -1, 0)), Vector((0, 0, -1)))).transposed()
        pos_c = Vector((-0.06, -0.43, 1.33 + 0.025)); pos_e = Vector((-0.035, -0.59, 1.43 + 0.025))
        M = Rm.to_4x4(); M.translation = pos_c.lerp(pos_e, k_up)
        # place by the grip so the hands land where they should: shift so the prop head (centroid) is at the point
        return M

    def _pistol_rock(self, Mdrawn):
        """after clearing the holster: muzzle rotated forward at the right hip, slightly down."""
        Rm = Matrix((Vector((1, 0, 0)), Vector((0, -0.985, -0.17)), Vector((0, 0.17, -0.985)))).transposed()
        M = Rm.to_4x4(); M.translation = Vector((-0.29, -0.27, 1.10 + 0.025))
        return M

    # fixB: hold_w = extra wrist offset (pistol frame) while the pistol is still holstered (hand high on the grip, fingers
    # under the hood / clear of the shell mouth); appr_out / appr_up = the hand comes in from outside and above;
    # draw_out = where the drawn pistol drifts after clearing the holster (belt: out and back, under the bang pouches)
    HOLSTER = dict(dx=0.05, drop=0.055, side=-24.0, yaw=-14.0, hyaw=12.0, hroll=-3.0, labd=0.25,
                   rpole=(-1.0, 0.25, 0.1), hold_w=(0.0, -0.025, 0.0), appr_out=0.05, appr_up=0.03)
    HOLSTER_BELT = dict(dx=0.02, drop=-0.02, side=8.0, yaw=-20.0, hyaw=10.0, hroll=-2.0, labd=0.12,
                        rpole=(-0.8, 0.7, 0.2), hold_w=(-0.01, -0.01, 0.0), appr_out=0.05, appr_up=0.03,
                        draw_out=(-0.06, 0.03, 0.0))

    def holster(self, t, prop='PropPistolDrop', clip='Holster', lift=0.17, HG=None):
        P = self.P; P.reset()
        T = CLIPS[clip]; br = 0.5 - 0.5 * math.cos(TAU * t / 2.1)
        S = self._seg
        reach = S(t, [(0.15, 0.0), (0.70, 1.0), (3.55, 1.0), (4.0, 0.0)])          # right hand to the grip
        draw = S(t, [(0.80, 0.0), (1.15, 1.0), (3.15, 1.0), (3.50, 0.0)])          # pistol out of the holster
        pres = S(t, [(1.15, 0.0), (1.45, 0.45), (1.85, 1.0), (2.65, 1.0), (2.95, 0.45), (3.15, 0.0)])
        sup = S(t, [(1.40, 0.0), (1.80, 1.0), (2.65, 1.0), (2.90, 0.0)])            # left hand support
        # body: square, slightly lowered stance when presenting
        k = sup
        lean = reach * (1 - pres); HG = HG or self.HOLSTER
        self.hips_move((HG['dx'] * lean, 0.01 * k, -0.015 - 0.025 * k - HG['drop'] * lean + 0.002 * br))
        self.spine(bend=2.0 + 7.0 * k + 3.0 * reach * (1 - draw), breath=1.0 * br, side=HG['side'] * lean,
                   yaw=HG['yaw'] * lean, hips_yaw=HG['hyaw'] * lean, hips_roll=HG['hroll'] * lean)
        self.shoulders(lift=0.5 * br - 6.0 * lean, fwd_l=4 * k, fwd_r=4 * k)
        self.neck(yaw=-6 * reach * (1 - draw), pitch=1.0 + 8 * reach * (1 - draw) - 3 * k, roll=8.0 * lean)
        P.fk()
        self.plant_foot('L', self.ankle0['L'] + Vector((0.02, -0.04 * k, 0.0)), yaw=-8)
        self.plant_foot('R', self.ankle0['R'] + Vector((-0.02, 0.05 * k, 0.0)), yaw=10)
        P.fk()
        Mf = self.prop_follow(prop)
        bore = Mf.to_quaternion() @ Vector((0, 1, 0))
        dout = Vector(HG.get('draw_out', (0.0, 0.0, 0.0)))          # fixB: the drawn pistol ends up out from the body
        Mdrawn = Matrix.Translation(-bore * lift + dout) @ Mf
        if pres <= 0.45:
            # clears the holster along the bore first, then drifts out (path below the straight line by dout*(d - d^2))
            Mp = self._lerp_M(Mdrawn, self._pistol_rock(Mdrawn), pres / 0.45) if draw >= 1.0 else \
                Matrix.Translation(-dout * (draw - draw * draw)) @ self._lerp_M(Mf, Mdrawn, draw) if draw > 0 else Mf
        else:
            Mp = self._lerp_M(self._pistol_rock(Mdrawn), self._pistol_present(0.0), min(1, (pres - 0.45) / 0.2)) \
                if pres < 0.65 else self._pistol_present((pres - 0.65) / 0.35)
        # right hand: relaxed -> on the grip (holster pose) -> rides the pistol
        rel = self.relaxed_target('R', 0.0, br)
        hold = reach * (1 - draw)                       # fixB: hand on the still-holstered grip: higher, fingers open
        spec = dict(self.PISTOL_HAND, w=tuple(Vector(self.PISTOL_HAND['w']) + Vector(HG.get('hold_w', (0, 0, 0))) * hold))
        on = self.hand_on('R', Mp, spec)
        W, Rh = self._lerp_target(rel[:2], on, reach)
        arc = math.sin(math.pi * reach) * (1 - draw)     # approach / release: come in from outside and above the hood
        W = W + Vector((-HG.get('appr_out', 0.0) * arc, 0.0, HG.get('appr_up', 0.0) * arc))
        pole_r = Vector(rel[2]).lerp(Vector(HG['rpole']), reach * (1 - pres)).lerp(Vector((-0.6, 0.3, -0.35)), pres)
        curl = reach * (1 - HG.get('hold_open', 0.0) * hold)
        self.arm_to('R', W, Rh, pole_r, lambda P, s: fingers_mix(P, s, F_RELAXED, F_GRIP, curl))
        # left hand: relaxed (out a little more while he dips to the holster) -> wraps the right hand
        rel = self.relaxed_target('L', 0.0, br, abd=self.GEAR['abd'] + HG['labd'] * lean)
        on = self.hand_on('L', Mp, self.PISTOL_SUPPORT)
        W, Rh = self._lerp_target(rel[:2], on, sup)
        self.arm_to('L', W, Rh, Vector(rel[2]).lerp(Vector((0.45, 0.45, -0.25)), sup), self.f_support if sup > 0.5 else self.f_relaxed)
        if reach > 0 or draw > 0:
            self._prop_override[prop] = Mp if draw > 0 else Mf

    def holster_belt(self, t):
        self.holster(t, prop='PropPistolBelt', clip='HolsterBelt', lift=0.17, HG=self.HOLSTER_BELT)

    # ---------------------------------------------------------------- Reload: retention reload from the front pouch
    # mag local frame (prop bone): +Y feed end (down in the pouch), -Y baseplate (sticks out of the pouch), +Z mag front
    MAG_HAND = dict(w=(0.13, -0.190, 0.0), f=(-0.45, 0.89, 0.0), n=(-1.0, 0.0, 0.1))   # fixB: hand on the baseplate end, clear of the pouch

    def _mag_well(self, T):
        butt, d, up, side = T['frame']
        Ycol = -up; Zcol = d; Xcol = Ycol.cross(Zcol)       # feed end (+Y) up into the magwell, front along the bore
        Ycol = -Ycol                                         # +Y local = feed end -> must point UP (toward the receiver)
        Ycol = up.copy(); Xcol = Ycol.cross(Zcol).normalized(); Zcol = Xcol.cross(Ycol).normalized()
        M = Matrix((Xcol, Ycol, Zcol)).transposed().to_4x4()
        # mag centre: 95 mm below the magwell mouth, which is 0.30 m along the bore and 45 mm under it
        M.translation = butt + d * 0.30 - up * 0.045 - up * 0.095
        return M

    def reload(self, t):
        P = self.P; P.reset()
        br = 0.5 - 0.5 * math.cos(TAU * t / 3.6)
        S = self._seg
        self._ready_base(t, br=br)
        tilt = S(t, [(0.2, 0.0), (0.6, 1.0), (3.0, 1.0), (3.4, 0.0)])               # muzzle up for the swap
        T = self.rifle(muzzle_down=24 + 0.8 * br - 14 * tilt, left_override=True, push=self.GEAR['reload_push'] * tilt,
                       inboard=self.GEAR['reload_in'] * tilt)
        P.fk()
        go = S(t, [(0.25, 0.0), (0.65, 1.0), (3.05, 1.0), (3.45, 0.0)])            # left hand off the handguard
        pull = S(t, [(0.75, 0.0), (1.05, 1.0), (2.55, 1.0), (2.85, 0.0)])           # mag out of / back into the pouch
        well = S(t, [(1.05, 0.0), (1.50, 1.0), (1.95, 1.0), (2.40, 0.0)])           # mag to / from the magwell
        seat = S(t, [(1.50, 0.0), (1.62, 1.0), (1.85, 1.0), (1.95, 0.0)])          # push up to seat (and strip)
        Mf = self.prop_follow('PropMag')
        ax = Mf.to_quaternion() @ Vector((0, 1, 0))                                  # down into the pouch
        Mout = Matrix.Translation(-ax * 0.14) @ Mf
        Mw = self._mag_well(T); Mw = Matrix.Translation(T['frame'][2] * 0.015 * seat) @ Mw
        Mbelow = Matrix.Translation(-T['frame'][2] * 0.06) @ Mw
        if well <= 0: Mm = self._lerp_M(Mf, Mout, pull)
        elif well < 0.75:
            k = well / 0.75; Mm = self._lerp_M(Mout, Mbelow, k)
            # fixB: bow the path forward and up, round the front-bag / pouch edge instead of through it
            bow = math.sin(math.pi * k)
            Mm = Matrix.Translation(Vector((0.0, -self.GEAR['reload_arc'] * bow, self.GEAR['reload_arc_up'] * bow))) @ Mm
        else: Mm = self._lerp_M(Mbelow, Mw, (well - 0.75) / 0.25)
        fore = T['L']
        on = self.hand_on('L', Mm, self.MAG_HAND)
        W, Rh = self._lerp_target(fore, on, go)
        self.arm_to('L', W, Rh, Vector(self.GEAR['pole_l']).lerp(Vector(self.GEAR['reload_pole']), go),
                    self.f_mag if go > 0.5 else self.f_fore)
        if pull > 0 or well > 0: self._prop_override['PropMag'] = Mm

    # ---------------------------------------------------------------- props
    def prop_follow(self, name):
        """armature-space pose matrix of prop `name` when it rides in its holster / pouch: the (re-orthonormalised)
        blend of the deformation matrices of the bones it was skinned to."""
        P = self.P
        acc = None
        for b, w in self.props[name]['follow'].items():
            D = P.pose[b] @ P.rest[b].inverted()
            acc = D * w if acc is None else acc + D * w
        T = acc @ P.rest[name]
        q = T.to_3x3().normalized().to_quaternion()
        return Matrix.Translation(T.translation) @ q.to_matrix().to_4x4()

    def set_prop(self, name, M):
        P = self.P
        base = P.pose[P.parent[name]] @ P.rel[name]
        P.basis[name] = base.inverted() @ M
        P.pose[name] = M.copy()

    def pose_at(self, clip, t):
        self._prop_override = {}
        getattr(self, CLIP_FN[clip])(t)
        self.P.fk()
        for name in self.props:
            M = self._prop_override.get(name)
            self.set_prop(name, M if M is not None else self.prop_follow(name))
        return self.P.basis


def apply_basis(rig, basis):
    for n, B in basis.items():
        pb = rig.pose.bones[n]
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = B.to_quaternion()
        pb.location = B.translation


def build_clips(rig, clips=None, only_deform_keys=True, props=None):
    ch = Character(rig, props)
    for a in list(bpy.data.actions):
        if a.name in CLIPS and (not clips or a.name in clips): bpy.data.actions.remove(a)
    if rig.animation_data:
        for tr in list(rig.animation_data.nla_tracks):
            if tr.name in CLIPS and (not clips or tr.name in clips): rig.animation_data.nla_tracks.remove(tr)
    rig.animation_data_create()
    acts = {}
    for name, T in CLIPS.items():
        if clips and name not in clips: continue
        act = bpy.data.actions.new(name); act.use_fake_user = True
        rig.animation_data.action = act
        nf = int(round(T * FPS))
        prev = {}
        frames = []
        for f in range(nf + 1):
            B = ch.pose_at(name, (f % nf) / FPS)
            frames.append({n: (m.to_quaternion(), m.translation.copy()) for n, m in B.items()})
        moving = set()
        for n in frames[0]:
            if any(fr[n][0].angle > 1e-5 or fr[n][1].length > 1e-6 for fr in frames) or n in ch.props: moving.add(n)
        for f, fr in enumerate(frames):
            for n, (q, loc) in fr.items():
                if n not in moving and n != 'Hips': continue
                if n in prev and prev[n].dot(q) < 0: q = -q
                prev[n] = q
                pb = rig.pose.bones[n]; pb.rotation_mode = 'QUATERNION'
                pb.rotation_quaternion = q
                pb.keyframe_insert('rotation_quaternion', frame=f + 1, group=n)
                if n == 'Hips' or n in ch.props:
                    pb.location = loc; pb.keyframe_insert('location', frame=f + 1, group=n)
        acts[name] = act
        # stash on an NLA track so the exporter sees every action
        tr = rig.animation_data.nla_tracks.new(); tr.name = name
        st = tr.strips.new(name, 1, act); st.name = name
        tr.mute = True
        rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    return acts
