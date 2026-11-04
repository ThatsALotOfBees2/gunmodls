// Builds a Unity Humanoid Avatar for the human operator prototype (operators/human-proto), so Mecanim humanoid clips
// (Mixamo, Starter Assets, mocap) can drive him. His own clips stay Legacy clips played by HumanOperatorProto.cs.
// Usage: keep this file in an Editor folder. Select the imported human-proto model (the .glb asset, its prefab or a
// scene instance), then Tools > Gunmodls > Human Proto > Build Humanoid Avatar. It saves <model>_Avatar.asset next to
// the asset (or in Assets/ for a scene object) and, for a scene object, adds an Animator with that Avatar.
// The bones already carry Unity's human bone names without spaces (LeftUpperArm, LeftIndexProximal, ...), from the
// MakeHuman default skeleton. The file's rest pose is MakeHuman's A-pose (arms ~42 deg down, elbows bent forward),
// so the builder records a T-pose in the Avatar's skeleton description (arms and fingers straightened along +-X) and
// leaves the scene's transforms untouched. Twist bones (*UpperArmTwist, *LowerArmTwist, *UpperLegTwist,
// *LowerLegTwist) and the MakeHuman extras (spine04, spine02, neck02/03, pelvis.*, metacarpals, face bones) are kept
// in the skeleton but are not human bones.
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

public static class HumanOperatorProtoAvatar
{
    static readonly string[] Body = {
        "Hips", "Spine", "Chest", "UpperChest", "Neck", "Head", "Jaw", "LeftEye", "RightEye",
        "LeftShoulder", "LeftUpperArm", "LeftLowerArm", "LeftHand", "RightShoulder", "RightUpperArm", "RightLowerArm", "RightHand",
        "LeftUpperLeg", "LeftLowerLeg", "LeftFoot", "LeftToes", "RightUpperLeg", "RightLowerLeg", "RightFoot", "RightToes",
    };
    static readonly string[] Fingers = { "Thumb", "Index", "Middle", "Ring", "Little" };
    static readonly string[] Segments = { "Proximal", "Intermediate", "Distal" };

    // file bone name -> Unity human bone name ("LeftIndexProximal" -> "Left Index Proximal")
    public static Dictionary<string, string> Map()
    {
        var m = new Dictionary<string, string>();
        foreach (var b in Body) m[b] = Spaced(b);
        foreach (var side in new[] { "Left", "Right" })
            foreach (var f in Fingers)
                foreach (var s in Segments)
                    m[side + f + s] = side + " " + f + " " + s;
        return m;
    }

    static string Spaced(string n)
    {
        var sb = new System.Text.StringBuilder();
        for (var i = 0; i < n.Length; i++)
        {
            if (i > 0 && char.IsUpper(n[i])) sb.Append(' ');
            sb.Append(n[i]);
        }
        return sb.ToString();
    }

    [MenuItem("Tools/Gunmodls/Human Proto/Build Humanoid Avatar")]
    static void BuildFromSelection()
    {
        var go = Selection.activeGameObject;
        if (go == null) { Debug.LogWarning("HumanProto: select the imported human-proto model first."); return; }
        var avatar = Build(go);
        if (avatar == null) return;
        var assetPath = AssetDatabase.GetAssetPath(go);
        var dir = string.IsNullOrEmpty(assetPath) ? "Assets" : Path.GetDirectoryName(assetPath).Replace('\\', '/');
        var name = string.IsNullOrEmpty(assetPath) ? go.name : Path.GetFileNameWithoutExtension(assetPath);
        var outPath = AssetDatabase.GenerateUniqueAssetPath(dir + "/" + name + "_Avatar.asset");
        AssetDatabase.CreateAsset(avatar, outPath);
        AssetDatabase.SaveAssets();
        if (string.IsNullOrEmpty(assetPath))
        {
            var animator = go.GetComponent<Animator>();
            if (animator == null) animator = Undo.AddComponent<Animator>(go);
            animator.avatar = avatar;
            animator.applyRootMotion = false;
        }
        Debug.Log("HumanProto: saved humanoid Avatar to " + outPath, avatar);
    }

    [MenuItem("Tools/Gunmodls/Human Proto/Build Humanoid Avatar", true)]
    static bool CanBuild() { return Selection.activeGameObject != null; }

    public static Avatar Build(GameObject root)
    {
        var map = Map();
        var all = root.GetComponentsInChildren<Transform>(true);
        var byName = new Dictionary<string, Transform>();
        foreach (var t in all) if (!byName.ContainsKey(t.name)) byName[t.name] = t;

        // work on a temporary copy so the T-pose never touches the user's object or asset
        var copy = Object.Instantiate(root);
        copy.hideFlags = HideFlags.HideAndDontSave;
        try
        {
            var cAll = copy.GetComponentsInChildren<Transform>(true);
            var c = new Dictionary<string, Transform>();
            foreach (var t in cAll) if (!c.ContainsKey(t.name)) c[t.name] = t;
            EnforceTPose(copy.transform, c);

            var human = new List<HumanBone>();
            var keep = new HashSet<Transform>();
            foreach (var kv in map)
            {
                Transform t;
                if (!c.TryGetValue(kv.Key, out t)) continue;
                var hb = new HumanBone { boneName = kv.Key, humanName = kv.Value };
                hb.limit.useDefaultValues = true;
                human.Add(hb);
                for (var p = t; p != null; p = p.parent) { keep.Add(p); if (p == copy.transform) break; }
            }
            if (human.Count < 50) Debug.LogWarning("HumanProto: found " + human.Count + " human bones; is this the human-proto model?");
            var skeleton = new List<SkeletonBone>();
            foreach (var t in cAll)
            {
                if (!keep.Contains(t)) continue;
                // the root's own name must match the object the Animator sits on
                var nm = t == copy.transform ? root.name : t.name;
                skeleton.Add(new SkeletonBone { name = nm, position = t.localPosition, rotation = t.localRotation, scale = t.localScale });
            }
            var desc = new HumanDescription
            {
                human = human.ToArray(), skeleton = skeleton.ToArray(),
                upperArmTwist = 0.5f, lowerArmTwist = 0.5f, upperLegTwist = 0.5f, lowerLegTwist = 0.5f,
                armStretch = 0.05f, legStretch = 0.05f, feetSpacing = 0f, hasTranslationDoF = false,
            };
            var avatar = AvatarBuilder.BuildHumanAvatar(root, desc);
            avatar.name = "human-proto_Avatar";
            if (!avatar.isValid || !avatar.isHuman)
            {
                Debug.LogError("HumanProto: the Avatar is not a valid humanoid (see the console for Unity's reason).");
                Object.DestroyImmediate(avatar);
                return null;
            }
            return avatar;
        }
        finally { Object.DestroyImmediate(copy); }
    }

    // rotate the arm chain so upper arm, forearm and hand point straight out along +-X (palms down), the fingers
    // follow the hand; the legs already stand straight in the file
    static void EnforceTPose(Transform root, Dictionary<string, Transform> b)
    {
        foreach (var side in new[] { "Left", "Right" })
        {
            var outDir = root.TransformDirection(side == "Left" ? Vector3.right : Vector3.left);
            // glTF faces +Z and the character's left is +X after glTFast's import (which mirrors X): use the
            // side the bone actually sits on instead of trusting the axis convention
            Transform ua, la, hand;
            if (!b.TryGetValue(side + "UpperArm", out ua) || !b.TryGetValue(side + "LowerArm", out la) || !b.TryGetValue(side + "Hand", out hand)) continue;
            Transform hips;
            if (b.TryGetValue("Hips", out hips))
            {
                var lateral = ua.position - hips.position; lateral.y = 0f;
                if (Vector3.Dot(lateral, outDir) < 0f) outDir = -outDir;
            }
            Align(ua, la.position, outDir);
            Align(la, hand.position, outDir);
            Transform mid;
            if (b.TryGetValue(side + "MiddleProximal", out mid)) Align(hand, mid.position, outDir);
            foreach (var f in Fingers)
            {
                if (f == "Thumb") continue;
                for (var s = 0; s < 2; s++)
                {
                    Transform seg, next;
                    if (b.TryGetValue(side + f + Segments[s], out seg) && b.TryGetValue(side + f + Segments[s + 1], out next))
                        Align(seg, next.position, outDir);
                }
            }
        }
    }

    // rotate t about its own position so the direction to childPos becomes dir
    static void Align(Transform t, Vector3 childPos, Vector3 dir)
    {
        var cur = childPos - t.position;
        if (cur.sqrMagnitude < 1e-10f) return;
        t.rotation = Quaternion.FromToRotation(cur, dir) * t.rotation;
    }
}
