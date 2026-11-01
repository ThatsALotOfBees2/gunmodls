// Builds a Unity Humanoid Avatar for N1CK from his bone names, so humanoid animation (Mixamo, Starter Assets, mocap)
// can drive him through an Animator. His own clips stay legacy clips played by N1CK.cs; you only need this for
// retargeting.
// Usage: keep this file in an Editor folder. Select the imported n1ck model (the .glb asset, its prefab, or an
// instance in the scene), then Tools > Gunmodls > N1CK > Build Humanoid Avatar. It saves <model>_Avatar.asset next to
// the asset (or in Assets/ for a scene object) and, for a scene object, sets up an Animator with that Avatar.
// The file's rest pose is a T-pose with every bone at identity rotation (palms down, thumbs forward), which is the pose
// Unity expects, so no pose fixing is needed. n1ck.glb hangs every mesh on its bone; unity/n1ck.glb is one skinned
// mesh per LOD whose joints are these bones (plus pistons, emitters, chest_panel). The Avatar only needs the bone names
// either way.
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

public static class N1CKAvatarBuilder
{
    // bone name in the file -> Unity human bone name (also in the .glb extras as "humanoid")
    public static readonly Dictionary<string, string> Map = BuildMap();

    static Dictionary<string, string> BuildMap()
    {
        var m = new Dictionary<string, string>
        {
            { "hips", "Hips" }, { "spine", "Spine" }, { "chest", "Chest" }, { "upper_chest", "UpperChest" },
            { "neck", "Neck" }, { "head", "Head" },
        };
        foreach (var s in new[] { "l", "r" })
        {
            var side = s == "l" ? "Left" : "Right";
            m["shoulder_" + s] = side + "Shoulder";
            m["upper_arm_" + s] = side + "UpperArm";
            m["lower_arm_" + s] = side + "LowerArm";
            m["hand_" + s] = side + "Hand";
            m["upper_leg_" + s] = side + "UpperLeg";
            m["lower_leg_" + s] = side + "LowerLeg";
            m["foot_" + s] = side + "Foot";
            m["toes_" + s] = side + "Toes";
            foreach (var f in new[] { "thumb", "index", "middle", "ring", "pinky" })
            {
                var finger = f == "pinky" ? "Little" : char.ToUpperInvariant(f[0]) + f.Substring(1);
                m[f + "_1_" + s] = side + " " + finger + " Proximal";
                m[f + "_2_" + s] = side + " " + finger + " Intermediate";
                m[f + "_3_" + s] = side + " " + finger + " Distal";
            }
        }
        return m;
    }

    [MenuItem("Tools/Gunmodls/N1CK/Build Humanoid Avatar")]
    static void BuildFromSelection()
    {
        var go = Selection.activeGameObject;
        if (go == null) { Debug.LogWarning("N1CK: select the imported n1ck model first."); return; }
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
        Debug.Log("N1CK: saved humanoid Avatar to " + outPath, avatar);
    }

    [MenuItem("Tools/Gunmodls/N1CK/Build Humanoid Avatar", true)]
    static bool CanBuild()
    {
        return Selection.activeGameObject != null;
    }

    // root: the object the Animator will sit on (the imported model's root)
    public static Avatar Build(GameObject root)
    {
        var all = root.GetComponentsInChildren<Transform>(true);
        var human = new List<HumanBone>();
        var keep = new HashSet<Transform>();
        var seen = new HashSet<string>();
        foreach (var t in all)
        {
            string humanName;
            if (!Map.TryGetValue(t.name, out humanName) || !seen.Add(t.name)) continue;
            var hb = new HumanBone { boneName = t.name, humanName = humanName };
            hb.limit.useDefaultValues = true;
            human.Add(hb);
            // the skeleton needs every transform from the root down to each human bone
            for (var p = t; p != null; p = p.parent)
            {
                keep.Add(p);
                if (p == root.transform) break;
            }
        }
        if (human.Count < Map.Count) Debug.LogWarning("N1CK: found " + human.Count + " of " + Map.Count + " bones; is this the n1ck model?");
        var skeleton = new List<SkeletonBone>();
        foreach (var t in all)
        {
            if (!keep.Contains(t)) continue;
            skeleton.Add(new SkeletonBone { name = t.name, position = t.localPosition, rotation = t.localRotation, scale = t.localScale });
        }
        var desc = new HumanDescription
        {
            human = human.ToArray(),
            skeleton = skeleton.ToArray(),
            upperArmTwist = 0.5f,
            lowerArmTwist = 0.5f,
            upperLegTwist = 0.5f,
            lowerLegTwist = 0.5f,
            armStretch = 0.05f,
            legStretch = 0.05f,
            feetSpacing = 0f,
            hasTranslationDoF = false,
        };
        var avatar = AvatarBuilder.BuildHumanAvatar(root, desc);
        avatar.name = "n1ck_Avatar";
        if (!avatar.isValid || !avatar.isHuman)
        {
            Debug.LogError("N1CK: the Avatar is not a valid humanoid (see the console for Unity's reason).");
            Object.DestroyImmediate(avatar);
            return null;
        }
        return avatar;
    }
}
