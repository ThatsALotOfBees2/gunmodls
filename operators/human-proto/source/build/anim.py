"""Stage 4a: procedural animation clips baked onto the MakeHuman rig (imported by integrate.py).

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
CLIPS = {'Idle': 4.0, 'Ready': 3.0, 'Walk': 1.1, 'CrouchIdle': 4.0, 'LookAround': 6.0}
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
    def __init__(self, rig):
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
        pole = (self.knee0[s] + (W - a0)) + knee_fwd * 0.6 + Vector((0.06 * side, 0, 0))
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

    def relaxed_arm(self, s, swing=0.0, breath=0.0):
        sg = 1 if s == 'L' else -1
        sh = self.P.head('LeftUpperArm' if s == 'L' else 'RightUpperArm')
        W = sh + Vector((0.055 * sg, -0.05 + swing, -0.50 + 0.004 * breath))
        f = Vector((0.06 * sg, -0.25 - swing * 0.6, -1.0))
        n = Vector((-1.0 * sg, 0.25, 0.0))
        pole = Vector((0.25 * sg, 0.6, 0.0))
        Rh = hand_rot(self.P, s, f, n)
        self.arm[s].solve(self.P, W, self.P.head(('Left' if s == 'L' else 'Right') + 'LowerArm') + pole, Rh)
        fingers(self.P, s, (18, 26, 14), thumb=(8, 14, 10), thumb_in=10)

    # rifle hold (no rifle): stock in the right shoulder pocket, muzzle depressed ~25 deg (low ready)
    def rifle(self, muzzle_down=24.0, cant=0.0):
        sh = self.sh0['R']
        butt = sh + Vector((0.06, -0.08, -0.03))
        d = Vector((0.10, -math.cos(math.radians(muzzle_down)), -math.sin(math.radians(muzzle_down)))).normalized()
        up = d.cross(X).normalized()
        if up.z < 0: up = -up
        side = up.cross(d).normalized()          # points to his left (+X)
        grip_w = butt + d * 0.215 - up * 0.10 - side * 0.012     # right wrist behind/below the pistol grip
        fore_w = butt + d * 0.47 - up * 0.075 + side * 0.03       # left wrist under the handguard
        # right hand: fingers wrap the grip (fingers point down/forward-left), palm faces left
        fr = (-up * 0.85 + d * 0.35 + side * 0.15)
        nr = side
        # left hand: palm up/right under the handguard, fingers curl over to his right
        fl = (d * 0.55 - side * 0.65 + up * 0.25)
        nl = (up * 0.8 - side * 0.4)
        self.reach('R', grip_w, fr, nr, (-0.25, 0.1, -0.6),
                   lambda P, s: fingers(P, s, (62, 78, 40), thumb=(25, 25, 20), thumb_in=35, index=(8, 12, 6)))
        self.reach('L', fore_w, fl, nl, (0.2, 0.25, -0.6),
                   lambda P, s: fingers(P, s, (48, 60, 30), thumb=(15, 20, 10), thumb_in=20))

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
        self.spine(bend=9.0, yaw=16 + yaw * 0.45, breath=br, hips_yaw=-18 + yaw * 0.12, hips_pitch=4)
        self.shoulders(lift=0.4 * br, fwd_l=6, fwd_r=3)
        self.neck(yaw=yaw * 0.6, pitch=-6 + 3 * math.sin(TAU * t / T * 2), eyes_yaw=max(-20, min(20, (lead - yaw) * 0.9)))
        P.fk()
        self.plant_foot('L', self.ankle0['L'] + Vector((-0.03, -0.13, 0.0)), yaw=-14)
        self.plant_foot('R', self.ankle0['R'] + Vector((0.01, 0.16, 0.0)), yaw=-32)
        self.rifle(muzzle_down=26 + br)

    def crouch(self, t):
        P = self.P; P.reset()
        br = 0.5 - 0.5 * math.cos(TAU * t / 4.0)
        s = math.sin(TAU * t / 4.0)
        self.hips_move((0.0, 0.05, -0.30 + 0.004 * br))
        self.spine(bend=16 + 0.6 * br, yaw=14 + 1.0 * s, breath=0.8 * br, hips_yaw=-12, hips_pitch=18)
        self.shoulders(lift=0.3 * br, fwd_l=6, fwd_r=3)
        self.neck(yaw=2 * s, pitch=-18, eyes_yaw=3 * math.sin(TAU * t / 2))
        P.fk()
        self.plant_foot('L', self.ankle0['L'] + Vector((-0.01, -0.20, 0.0)), yaw=-10)
        self.plant_foot('R', Vector((self.ball0['R'].x + 0.02, self.ball0['R'].y + 0.17, 0.0)), yaw=-25, pitch=34, pivot='ball')
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

    def pose_at(self, clip, t):
        {'Idle': self.idle, 'Ready': self.ready, 'Walk': self.walk, 'CrouchIdle': self.crouch,
         'LookAround': self.look_around}[clip](t)
        return self.P.basis


def apply_basis(rig, basis):
    for n, B in basis.items():
        pb = rig.pose.bones[n]
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = B.to_quaternion()
        pb.location = B.translation


def build_clips(rig, clips=None, only_deform_keys=True):
    ch = Character(rig)
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
            if any(fr[n][0].angle > 1e-5 for fr in frames): moving.add(n)
        for f, fr in enumerate(frames):
            for n, (q, loc) in fr.items():
                if n not in moving and n != 'Hips': continue
                if n in prev and prev[n].dot(q) < 0: q = -q
                prev[n] = q
                pb = rig.pose.bones[n]; pb.rotation_mode = 'QUATERNION'
                pb.rotation_quaternion = q
                pb.keyframe_insert('rotation_quaternion', frame=f + 1, group=n)
                if n == 'Hips':
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
