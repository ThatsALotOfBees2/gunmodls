// Turns the game-ready .glb files from this repo (each model's unity/ folder, imported with glTFast)
// into prefabs:
//   - a LODGroup on the root, built from the *_LOD0 / *_LOD1 / *_LOD2 children;
//   - a BoxCollider on every *_COL node (the box mesh and its renderer are removed).
// Usage: keep this file in an Editor folder, select the imported .glb assets (or a folder holding them),
// then Tools > Gunmodls > Build Prefabs From Selection. Each prefab is saved next to its .glb.
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

public static class GunmodlsPrefabBuilder
{
    // screen-relative heights at which LOD0, LOD1 and LOD2 hand over; below the last one the model is culled
    static readonly float[] LodHeights = { 0.25f, 0.06f, 0.008f };

    [MenuItem("Tools/Gunmodls/Build Prefabs From Selection")]
    static void BuildFromSelection()
    {
        var made = 0;
        foreach (var guid in Selection.assetGUIDs)
        {
            var path = AssetDatabase.GUIDToAssetPath(guid);
            if (AssetDatabase.IsValidFolder(path))
            {
                foreach (var g in AssetDatabase.FindAssets("t:GameObject", new[] { path }))
                    if (Build(AssetDatabase.GUIDToAssetPath(g))) made++;
            }
            else if (Build(path)) made++;
        }
        Debug.Log("Gunmodls: built " + made + " prefab(s).");
    }

    [MenuItem("Tools/Gunmodls/Build Prefabs From Selection", true)]
    static bool CanBuild()
    {
        return Selection.assetGUIDs.Length > 0;
    }

    public static bool Build(string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();
        if (ext != ".glb" && ext != ".gltf") return false;
        var source = AssetDatabase.LoadAssetAtPath<GameObject>(path);
        if (source == null)
        {
            Debug.LogWarning("Gunmodls: no model in " + path + " (is glTFast installed?)");
            return false;
        }
        var instance = Object.Instantiate(source);
        instance.name = source.name;
        try
        {
            Setup(instance);
            PrefabUtility.SaveAsPrefabAsset(instance, Path.ChangeExtension(path, ".prefab"));
            return true;
        }
        finally
        {
            Object.DestroyImmediate(instance);
        }
    }

    public static void Setup(GameObject root)
    {
        AddColliders(root);
        AddLods(root);
    }

    static void AddColliders(GameObject root)
    {
        var nodes = new List<Transform>();
        foreach (var t in root.GetComponentsInChildren<Transform>(true))
            if (t.name.EndsWith("_COL")) nodes.Add(t);
        foreach (var t in nodes)
        {
            // the box mesh sits on the node itself or on primitive children
            var filters = t.GetComponentsInChildren<MeshFilter>(true);
            var bounds = new Bounds();
            var any = false;
            foreach (var f in filters)
            {
                if (f.sharedMesh == null) continue;
                var mb = f.sharedMesh.bounds;
                var toNode = t.worldToLocalMatrix * f.transform.localToWorldMatrix;
                for (var i = 0; i < 8; i++)
                {
                    var corner = mb.center + Vector3.Scale(mb.extents, new Vector3((i & 1) == 0 ? -1 : 1, (i & 2) == 0 ? -1 : 1, (i & 4) == 0 ? -1 : 1));
                    var p = toNode.MultiplyPoint3x4(corner);
                    if (!any) { bounds = new Bounds(p, Vector3.zero); any = true; }
                    else bounds.Encapsulate(p);
                }
            }
            if (!any) continue;
            var box = t.gameObject.AddComponent<BoxCollider>();
            box.center = bounds.center;
            box.size = bounds.size;
            foreach (var f in filters)
            {
                var r = f.GetComponent<MeshRenderer>();
                if (r != null) Object.DestroyImmediate(r);
                Object.DestroyImmediate(f);
            }
        }
    }

    static void AddLods(GameObject root)
    {
        var levels = new[] { new List<Renderer>(), new List<Renderer>(), new List<Renderer>() };
        foreach (var r in root.GetComponentsInChildren<Renderer>(true))
        {
            // the nearest ancestor called <name>_LOD<n> decides the level
            for (var t = r.transform; t != null; t = t.parent)
            {
                var n = t.name;
                if (n.Length > 5 && n.Substring(n.Length - 5, 4) == "_LOD" && char.IsDigit(n[n.Length - 1]))
                {
                    var level = n[n.Length - 1] - '0';
                    if (level < levels.Length) levels[level].Add(r);
                    break;
                }
                if (t == root.transform) break;
            }
        }
        if (levels[0].Count == 0) return;
        var lods = new List<LOD>();
        for (var l = 0; l < levels.Length; l++)
            if (levels[l].Count > 0) lods.Add(new LOD(LodHeights[l], levels[l].ToArray()));
        var group = root.GetComponent<LODGroup>();
        if (group == null) group = root.AddComponent<LODGroup>();
        group.SetLODs(lods.ToArray());
        group.RecalculateBounds();
    }
}
