// Tools > Gunmodls > Set Up Haneul Tower Map: select the imported maps/haneul-tower/unity/haneul-tower.glb (or an
// instance of it in a scene) and run it. It adds HaneulTowerMap to the root, assigns layout.json (searched by name
// next to the .glb and in the project), runs Setup in the editor (typed components, mesh and box colliders, layers),
// sets static flags by surface type (destructibles and glass are never occluders), and saves HaneulTowerMap.prefab next to the .glb. The saved prefab has setupOnAwake off,
// so at runtime only the registry is rebuilt. Keep this file in an Editor folder. Unity 2021 LTS to Unity 6.
using System.IO;
using UnityEditor;
using UnityEngine;

public static class HaneulTowerMapSetup
{
    [MenuItem("Tools/Gunmodls/Set Up Haneul Tower Map")]
    static void SetUpSelection()
    {
        var sel = Selection.activeObject;
        if (sel == null) { Debug.LogWarning("Select the imported haneul-tower.glb or its instance first."); return; }
        var assetPath = AssetDatabase.GetAssetPath(sel);
        if (!string.IsNullOrEmpty(assetPath) && sel is GameObject asset)
        {
            // an asset: instantiate, set up, save a prefab next to it, remove the temporary instance
            var inst = (GameObject)PrefabUtility.InstantiatePrefab(asset);
            if (inst == null) inst = Object.Instantiate(asset);
            try
            {
                SetUp(inst, Path.GetDirectoryName(assetPath));
                var dst = Path.Combine(Path.GetDirectoryName(assetPath), "HaneulTowerMap.prefab").Replace('\\', '/');
                PrefabUtility.SaveAsPrefabAsset(inst, dst);
                Debug.Log("Haneul Tower map set up: " + dst);
            }
            finally { Object.DestroyImmediate(inst); }
            return;
        }
        if (sel is GameObject go)
        {
            Undo.RegisterFullObjectHierarchyUndo(go, "Set Up Haneul Tower Map");
            SetUp(go, null);
            Debug.Log("Haneul Tower map set up on " + go.name);
        }
    }

    [MenuItem("Tools/Gunmodls/Set Up Haneul Tower Map", true)]
    static bool Validate() { return Selection.activeObject is GameObject; }

    public static void SetUp(GameObject root, string folder)
    {
        var map = root.GetComponent<HaneulTowerMap>();
        if (map == null) map = root.AddComponent<HaneulTowerMap>();
        if (map.layoutJson == null) map.layoutJson = FindLayout(folder);
        if (map.layoutJson == null) Debug.LogWarning("layout.json not found: Wall Fortification sizes are guessed from mesh widths. Copy maps/haneul-tower/layout.json into the project.");
        map.Setup();
        map.setupOnAwake = false;
        // static flags by surface type (the cradle moves and gets none):
        // - hard structure, decks, stairs: batching + occluder + occludee static
        // - dressing and backdrop: batching + occludee (thin or far, never an occluder)
        // - glass, rails, holograms: occludee only (see-through: never occluders, never batched)
        // - destructible soft walls, units, hatches, floor/ceiling patches: no static flags, so their meshes stay
        //   their own (holes can be cut at runtime) and nothing stays culled behind a wall after it is blown open
        // Lightmap static is left to the project (the backdrop is kilometres wide and lit by emissive maps)
        foreach (var s in root.GetComponentsInChildren<HaneulSurface>(true))
        {
            var flags = StaticFlagsFor(s);
            if (flags == 0) continue;
            foreach (var r in s.GetComponentsInChildren<MeshRenderer>(true))
                if (r.GetComponentInParent<HaneulSurface>() == s) GameObjectUtility.SetStaticEditorFlags(r.gameObject, flags);
        }
        EditorUtility.SetDirty(map);
    }

    static StaticEditorFlags StaticFlagsFor(HaneulSurface s)
    {
        const StaticEditorFlags solid = StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccluderStatic | StaticEditorFlags.OccludeeStatic;
        switch (s.type)
        {
            case HaneulSurfaceType.Bridge:
                return s.id.StartsWith("CR_", System.StringComparison.Ordinal) ? (StaticEditorFlags)0 : solid;
            case HaneulSurfaceType.Hard: case HaneulSurfaceType.Ledge: case HaneulSurfaceType.Walkway:
            case HaneulSurfaceType.Terrace: case HaneulSurfaceType.Stair: case HaneulSurfaceType.Ladder:
                return solid;
            case HaneulSurfaceType.Deco: case HaneulSurfaceType.Env:
                return StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccludeeStatic;
            case HaneulSurfaceType.FacadeGlassBreakable: case HaneulSurfaceType.FacadeGlassTempered: case HaneulSurfaceType.InteriorGlass:
            case HaneulSurfaceType.GlassFloor: case HaneulSurfaceType.Rail: case HaneulSurfaceType.Hologram:
                return StaticEditorFlags.OccludeeStatic;
            default:
                return 0;   // Soft, Reinforceable, Hatch, SoftFloor, SoftCeiling and the markers
        }
    }

    static TextAsset FindLayout(string folder)
    {
        if (!string.IsNullOrEmpty(folder))
        {
            foreach (var p in new[] { Path.Combine(folder, "layout.json"), Path.Combine(Path.GetDirectoryName(folder) ?? "", "layout.json") })
            {
                var t = AssetDatabase.LoadAssetAtPath<TextAsset>(p.Replace('\\', '/'));
                if (t != null) return t;
            }
        }
        foreach (var guid in AssetDatabase.FindAssets("layout t:TextAsset"))
        {
            var p = AssetDatabase.GUIDToAssetPath(guid);
            if (p.EndsWith("/layout.json") && p.Contains("haneul")) return AssetDatabase.LoadAssetAtPath<TextAsset>(p);
        }
        return null;
    }
}
