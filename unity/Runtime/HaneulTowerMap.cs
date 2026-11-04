// Sets up the Haneul Tower map (maps/haneul-tower/unity/haneul-tower.glb, imported with glTFast) by surface type.
// Put it on the root of the imported map (or run Tools > Gunmodls > Set Up Haneul Tower Map, which adds it, runs
// Setup in the editor and saves a prefab) and give it maps/haneul-tower/layout.json as a TextAsset.
// Unity 2021 LTS to Unity 6, no extra packages besides glTFast for the import.
//
// glTFast does not expose glTF extras by default, so the surface type of every node comes from its name prefix
// (the naming table in maps/haneul-tower/INTEGRATION.md). layout.json adds the data the names do not carry: the
// Wall Fortification size of each REINF_ unit, wall thickness, the site and defender side of each unit, hatch
// mounting, room names. Without layout.json the unit size is guessed from the unit's mesh width.
//
// Setup() (on Awake when setupOnAwake is on, or from the editor menu):
//   - adds a HaneulSurface component (HaneulSurface.cs) to every typed node (type, id, floor, flags, fortification size);
//   - colliders: a static MeshCollider on every solid typed mesh (walls, glass, slabs, hatches, decks, rails),
//     a BoxCollider (size 1, the node's scale is the box size) on every COL_ empty, trigger boxes on the
//     ZONE_EXT_ reveal volumes; DECO_, ENV_, STAIR_ meshes (walk on the COL_STAIR_ ramps, landings and spiral treads)
//     and HOLO_ get none;
//   - the backdrop (BACKDROP_city: the whole city skyline as one mesh with one baked material; BACKDROP_sky: the sky
//     dome): no collider, no shadow casting or receiving, no light or reflection probes, never an occluder and not
//     culled by occlusion; it is one draw call each and always on screen, so there is nothing to cull or batch;
//   - optional layers per class (soft, hard, trigger, marker; breakable glass is on the soft layer, tempered on hard);
//   - fills the registry: lookups by node name or collider, reinforce units, hatches, barricade slots,
//     attacker and defender spawns, objectives and sites, cover spots, callouts, prop markers.
//
// Coordinates: glTFast negates X on import (glTF +X is Unity -X). Node transforms are already converted, so use the
// transforms. Positions read from layout.json go through FromLayout() (x -> -x).
// Walls (user rule): every breakable wall is reinforceable. A wall is either fully hard (HARD_<wallId>) or a
// reinforceable wall: its Wall Fortification units are the only breakable parts (REINF_<wallId>_<k>, reinforceable,
// IsReinforceable true) and its junction ends, jambs, trims and header are hard (HARD_<wallId>_hdr). Every corner and
// T-junction is hard for 1.0 m. SOFT_ nodes are destructible props only; hatches stay reinforceable, soft floor
// patches are destructible but not reinforceable.
// Blast shutters (SHUTTER_<bayId>, one per facade bay with glass, open by default): each is a mesh with one blend
// shape, "closed" (weight 100 = closed), on a SkinnedMeshRenderer (glTFast imports morph targets that way). They move,
// so they get no static flags and no mesh collider: their closed-state box COL_SHUTTER_<bayId> gets a BoxCollider that
// is enabled only while the shutter is fully closed. SetShutters / SetShutter animate them (Update, travel_s from
// layout.json) and raise ShutterMoveStarted / ShutterMoveFinished (also as UnityEvents). The glb's shared clips
// shutters_close / shutters_open drive the same blend shapes; use either the clips or these methods, not both at once.
// Directions: REINF_ units face transform.forward (the defender room); hatches face transform.up (every hatch is
// reinforced from above, face-up on the slab); BARR_ slots face transform.forward (the wall normal). A Wall Fortification prefab placed as
// a child at the identity pose of a REINF_ or HATCH_ node sits exactly on its mount.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;

public enum HaneulSurfaceType
{
    Unknown, Hard, Soft, Reinforceable, Hatch, SoftFloor, SoftCeiling, InteriorGlass, FacadeGlassBreakable,
    FacadeGlassTempered, GlassFloor, Rail, BarricadeDoor, BarricadeWindow, Opening, Stair, Ladder, Walkway, Ledge,
    Bridge, Terrace, Hologram, RevealZone, AttackerSpawn, DefenderSpawn, Objective, Cover, Callout, PropMarker,
    Collider, Deco, Env, Backdrop,
    Shutter     // appended (enum values are serialized as numbers: never insert before the end)
}

public enum FortificationSize { None, Small, Standard, Large, XL, Hatch }

public class HaneulTowerMap : MonoBehaviour
{
    [Header("Data")]
    public TextAsset layoutJson;                 // maps/haneul-tower/layout.json (optional, recommended)
    public bool setupOnAwake = true;             // off when the prefab was already set up in the editor
    [Header("Colliders")]
    public bool addColliders = true;
    public bool decoColliders = false;           // DECO_ dressing is purely visual; leave off
    [Header("Layers (-1 leaves them as imported)")]
    public int softLayer = -1;                   // SOFT_, REINF_, HATCH_, SOFTFLOOR_, SOFTCEIL_, GLASSI_, GLASS_B_
    public int hardLayer = -1;                   // HARD_, GLASS_T_, GLASS_TF_, slabs, decks
    public int triggerLayer = -1;                // ZONE_EXT_ volumes
    public int markerLayer = -1;                 // empties (spawns, slots, objectives ...)
    [Header("Markers")]
    public bool hideColliderMeshes = true;       // COL_ nodes are empties; any renderer on them is switched off
    [Header("Blast shutters")]
    public bool shuttersClosedOnStart = false;   // the map ships with every shutter open
    public float shutterTravelOverride = 0f;     // > 0 replaces layout travel_s (seconds for the full travel)
    [Serializable] public class ShutterEvent : UnityEvent<HaneulSurface, bool> { }
    public ShutterEvent onShutterStarted = new ShutterEvent();    // (shutter, closing)
    public ShutterEvent onShutterFinished = new ShutterEvent();   // (shutter, closed)
    public event Action<HaneulSurface, bool> ShutterMoveStarted;  // (shutter, closing)
    public event Action<HaneulSurface, bool> ShutterMoveFinished; // (shutter, closed)

    public static HaneulTowerMap Instance { get; private set; }
    public bool IsSetUp { get; private set; }

    // ---------------------------------------------------------------- registry
    readonly Dictionary<string, HaneulSurface> byName = new Dictionary<string, HaneulSurface>();
    readonly Dictionary<Collider, HaneulSurface> byCollider = new Dictionary<Collider, HaneulSurface>();
    public readonly List<HaneulSurface> ReinforceUnits = new List<HaneulSurface>();
    public readonly List<HaneulSurface> Hatches = new List<HaneulSurface>();
    public readonly List<HaneulSurface> BarricadeDoors = new List<HaneulSurface>();
    public readonly List<HaneulSurface> BarricadeWindows = new List<HaneulSurface>();
    public readonly List<HaneulSurface> AttackerSpawns = new List<HaneulSurface>();
    public readonly List<HaneulSurface> DefenderSpawns = new List<HaneulSurface>();
    public readonly List<HaneulSurface> Objectives = new List<HaneulSurface>();
    public readonly List<HaneulSurface> CoverSpots = new List<HaneulSurface>();
    public readonly List<HaneulSurface> Callouts = new List<HaneulSurface>();
    public readonly List<HaneulSurface> PropMarkers = new List<HaneulSurface>();
    public readonly List<HaneulSurface> RevealZones = new List<HaneulSurface>();
    public readonly List<HaneulSurface> Shutters = new List<HaneulSurface>();
    public readonly Dictionary<string, Site> Sites = new Dictionary<string, Site>();
    public int ReinforceBudget { get; private set; } = 8;    // per defending team per round (layout rules)

    public class Site
    {
        public string id, name, floor;
        public string[] rooms = new string[0];
        public readonly List<HaneulSurface> objectives = new List<HaneulSurface>();
        public readonly List<HaneulSurface> defenderSpawns = new List<HaneulSurface>();
        public readonly List<HaneulSurface> reinforceUnits = new List<HaneulSurface>();
        public readonly List<HaneulSurface> hatches = new List<HaneulSurface>();
    }

    // ---------------------------------------------------------------- prefixes (longest first where one contains another)
    static readonly KeyValuePair<string, HaneulSurfaceType>[] Prefixes =
    {
        P("SOFTFLOOR_", HaneulSurfaceType.SoftFloor), P("SOFTCEIL_", HaneulSurfaceType.SoftCeiling),
        P("SOFT_", HaneulSurfaceType.Soft), P("REINF_", HaneulSurfaceType.Reinforceable), P("HARD_", HaneulSurfaceType.Hard),
        P("HATCH_", HaneulSurfaceType.Hatch), P("GLASSI_", HaneulSurfaceType.InteriorGlass),
        P("GLASS_TF_", HaneulSurfaceType.GlassFloor), P("GLASS_T_", HaneulSurfaceType.FacadeGlassTempered),
        P("GLASS_B_", HaneulSurfaceType.FacadeGlassBreakable), P("RAIL_", HaneulSurfaceType.Rail),
        P("BARR_D_", HaneulSurfaceType.BarricadeDoor), P("BARR_W_", HaneulSurfaceType.BarricadeWindow),
        P("OPEN_", HaneulSurfaceType.Opening), P("STAIR_", HaneulSurfaceType.Stair), P("LADDER_", HaneulSurfaceType.Ladder),
        P("WALK_", HaneulSurfaceType.Walkway), P("LEDGE_", HaneulSurfaceType.Ledge), P("BRIDGE_", HaneulSurfaceType.Bridge),
        P("TERRACE", HaneulSurfaceType.Terrace), P("HOLO_", HaneulSurfaceType.Hologram), P("ZONE_EXT_", HaneulSurfaceType.RevealZone),
        P("SPAWN_ATK_", HaneulSurfaceType.AttackerSpawn), P("SPAWN_DEF_", HaneulSurfaceType.DefenderSpawn),
        P("OBJ_", HaneulSurfaceType.Objective), P("COVER_", HaneulSurfaceType.Cover), P("CALLOUT_", HaneulSurfaceType.Callout),
        P("PROP_", HaneulSurfaceType.PropMarker), P("COL_", HaneulSurfaceType.Collider), P("DECO_", HaneulSurfaceType.Deco),
        P("ENV_", HaneulSurfaceType.Env), P("BACKDROP_", HaneulSurfaceType.Backdrop), P("SHUTTER_", HaneulSurfaceType.Shutter),
    };
    static KeyValuePair<string, HaneulSurfaceType> P(string p, HaneulSurfaceType t) { return new KeyValuePair<string, HaneulSurfaceType>(p, t); }

    // the type of a node name, and the name without its prefix
    public static HaneulSurfaceType Classify(string nodeName, out string id)
    {
        id = "";
        if (string.IsNullOrEmpty(nodeName)) return HaneulSurfaceType.Unknown;
        // glTFast may add " (1)" style suffixes when names repeat
        var n = nodeName;
        var sp = n.IndexOf(' ');
        if (sp > 0) n = n.Substring(0, sp);
        foreach (var kv in Prefixes)
        {
            if (!n.StartsWith(kv.Key, StringComparison.Ordinal)) continue;
            id = n.Substring(kv.Key.Length);
            return kv.Value;
        }
        return HaneulSurfaceType.Unknown;
    }
    public static HaneulSurfaceType Classify(string nodeName) { string id; return Classify(nodeName, out id); }

    // ---------------------------------------------------------------- layout.json (only the fields used here)
    [Serializable] class LReinforcePanel { public string size; public float u0, u1; }
    [Serializable] class LReinforce { public string defender_side; public string site; public LReinforcePanel[] panels; public float far_side_z; }
    [Serializable] class LWall { public string id; public string floor; public float thickness; public string side_pos, side_neg; public LReinforce reinforce; }
    [Serializable] class LHatch { public string id; public string floor; public string top_room, bottom_room, reinforce_from; public float size; }
    [Serializable] class LObjective { public string id, room; }
    [Serializable] class LSite { public string id, name, floor; public string[] rooms; public LObjective[] objectives; }
    [Serializable] class LDefSpawn { public string id, site, floor; }
    [Serializable] class LSpawns { public LDefSpawn[] defenders; }
    [Serializable] class LReinfRules { public int budget; }
    [Serializable] class LRules { public LReinfRules reinforce; }
    [Serializable] class LRoom { public string id, floor, name; }
    [Serializable] class LShutter { public string id, bay, floor, face, room, site, @default; public float travel_s, travel_m, y_open; public bool double_height; }
    [Serializable] class LLayout { public LRules rules; public LWall[] walls; public LHatch[] hatches; public LSite[] sites; public LSpawns spawns; public LRoom[] rooms; public LShutter[] shutters; }

    LLayout layout;
    readonly Dictionary<string, LWall> walls = new Dictionary<string, LWall>();
    readonly Dictionary<string, LHatch> hatchData = new Dictionary<string, LHatch>();
    readonly Dictionary<string, string> defSpawnSite = new Dictionary<string, string>();
    readonly Dictionary<string, string> roomNames = new Dictionary<string, string>();
    readonly Dictionary<string, LShutter> shutterData = new Dictionary<string, LShutter>();

    public static Vector3 FromLayout(float x, float y, float z) { return new Vector3(-x, y, z); }
    public string RoomName(string roomId) { string n; return roomId != null && roomNames.TryGetValue(roomId, out n) ? n : roomId; }

    void Awake()
    {
        Instance = this;
        if (setupOnAwake) Setup();
        else Rebuild();
    }

    void OnDestroy() { if (Instance == this) Instance = null; }

    // full setup: components, colliders, layers and the registry (safe to call again)
    public void Setup()
    {
        ReadLayout();
        foreach (var t in GetComponentsInChildren<Transform>(true))
        {
            if (t == transform) continue;
            string id;
            var type = Classify(t.name, out id);
            if (type == HaneulSurfaceType.Unknown) continue;
            var s = t.GetComponent<HaneulSurface>();
            if (s == null) s = t.gameObject.AddComponent<HaneulSurface>();
            Describe(s, type, id, t);
            if (type == HaneulSurfaceType.Backdrop) { ConfigureBackdrop(t.gameObject); continue; }
            if (addColliders) AddCollider(s);
            ApplyLayer(s);
        }
        Rebuild();
        IsSetUp = true;
    }

    // registry only (the prefab was set up in the editor)
    public void Rebuild()
    {
        if (layout == null) ReadLayout();
        byName.Clear(); byCollider.Clear(); Sites.Clear();
        foreach (var l in new[] { ReinforceUnits, Hatches, BarricadeDoors, BarricadeWindows, AttackerSpawns, DefenderSpawns, Objectives, CoverSpots, Callouts, PropMarkers, RevealZones, Shutters }) l.Clear();
        moving.Clear();
        if (layout != null && layout.sites != null)
            foreach (var ls in layout.sites) Sites[ls.id] = new Site { id = ls.id, name = ls.name, floor = ls.floor, rooms = ls.rooms ?? new string[0] };
        foreach (var s in GetComponentsInChildren<HaneulSurface>(true))
        {
            byName[s.name] = s;
            foreach (var c in s.GetComponents<Collider>()) byCollider[c] = s;
            switch (s.type)
            {
                case HaneulSurfaceType.Reinforceable: ReinforceUnits.Add(s); SiteOf(s.site, x => x.reinforceUnits.Add(s)); break;
                case HaneulSurfaceType.Hatch: Hatches.Add(s); SiteOf(s.site, x => x.hatches.Add(s)); break;
                case HaneulSurfaceType.BarricadeDoor: BarricadeDoors.Add(s); break;
                case HaneulSurfaceType.BarricadeWindow: BarricadeWindows.Add(s); break;
                case HaneulSurfaceType.AttackerSpawn: AttackerSpawns.Add(s); break;
                case HaneulSurfaceType.DefenderSpawn: DefenderSpawns.Add(s); SiteOf(s.site, x => x.defenderSpawns.Add(s)); break;
                case HaneulSurfaceType.Objective: Objectives.Add(s); SiteOf(s.site, x => x.objectives.Add(s)); break;
                case HaneulSurfaceType.Cover: CoverSpots.Add(s); break;
                case HaneulSurfaceType.Callout: Callouts.Add(s); break;
                case HaneulSurfaceType.PropMarker: PropMarkers.Add(s); break;
                case HaneulSurfaceType.RevealZone:   // one entry per zone: the ZONE_EXT_<id> parent, not its box children
                    if (s.transform.parent == null || !s.transform.parent.name.StartsWith("ZONE_EXT_", StringComparison.Ordinal)) RevealZones.Add(s);
                    break;
                case HaneulSurfaceType.Shutter: Shutters.Add(s); break;
            }
        }
        foreach (var s in Shutters) LinkShutter(s);
        // every shutter starts open (layout default) unless shuttersClosedOnStart; colliders follow the state
        foreach (var s in Shutters) ApplyShutter(s, shuttersClosedOnStart ? 1f : 0f, shuttersClosedOnStart);
    }

    void SiteOf(string id, Action<Site> add)
    {
        if (string.IsNullOrEmpty(id)) return;
        Site site;
        if (!Sites.TryGetValue(id, out site)) { site = new Site { id = id, name = id }; Sites[id] = site; }
        add(site);
    }

    void ReadLayout()
    {
        walls.Clear(); hatchData.Clear(); defSpawnSite.Clear(); roomNames.Clear(); shutterData.Clear();
        layout = null;
        if (layoutJson == null) return;
        try { layout = JsonUtility.FromJson<LLayout>(layoutJson.text); }
        catch (Exception e) { Debug.LogWarning("HaneulTowerMap: layout.json could not be read (" + e.Message + "); falling back to names only", this); return; }
        if (layout == null) return;
        if (layout.walls != null) foreach (var w in layout.walls) if (w != null && w.id != null) walls[w.id] = w;
        if (layout.hatches != null) foreach (var h in layout.hatches) if (h != null && h.id != null) hatchData[h.id] = h;
        if (layout.spawns != null && layout.spawns.defenders != null) foreach (var d in layout.spawns.defenders) if (d != null && d.id != null) defSpawnSite[d.id] = d.site;
        if (layout.rooms != null) foreach (var r in layout.rooms) if (r != null && r.id != null) roomNames[r.id] = r.name;
        if (layout.shutters != null) foreach (var sh in layout.shutters) if (sh != null && sh.id != null) shutterData[sh.id] = sh;
        if (layout.rules != null && layout.rules.reinforce != null && layout.rules.reinforce.budget > 0) ReinforceBudget = layout.rules.reinforce.budget;
    }

    // ---------------------------------------------------------------- per-node description
    void Describe(HaneulSurface s, HaneulSurfaceType type, string id, Transform t)
    {
        s.type = type; s.id = id;
        s.floor = FloorOf(id);
        s.destructible = false; s.reinforceable = false; s.stopsBullets = false; s.blocksVision = false; s.walkable = false;
        switch (type)
        {
            case HaneulSurfaceType.Hard: case HaneulSurfaceType.FacadeGlassTempered:
                s.stopsBullets = true; s.blocksVision = type == HaneulSurfaceType.Hard; break;
            case HaneulSurfaceType.Soft:
                s.destructible = true; s.blocksVision = true;
                // a SOFT_ wall only comes from a layout older than the reinforce rule: it still counts as reinforceable
                if (walls.ContainsKey(id))
                {
                    s.reinforceable = true; s.wallId = id;
                    Debug.LogWarning("HaneulTowerMap: soft wall " + id + " found; current layouts have none (every breakable wall is REINF_ units). Re-export the map.", this);
                }
                break;
            case HaneulSurfaceType.Reinforceable:
                s.destructible = true; s.reinforceable = true; s.blocksVision = true; DescribeUnit(s, id, t); break;
            case HaneulSurfaceType.Hatch:
                s.destructible = true; s.reinforceable = true; s.walkable = true; s.blocksVision = true; DescribeHatch(s, id, t); break;
            case HaneulSurfaceType.SoftFloor: case HaneulSurfaceType.SoftCeiling:
                s.destructible = true; s.walkable = type == HaneulSurfaceType.SoftFloor; s.blocksVision = true; break;
            case HaneulSurfaceType.InteriorGlass: case HaneulSurfaceType.FacadeGlassBreakable:
                s.destructible = true; break;
            case HaneulSurfaceType.GlassFloor:
                s.stopsBullets = true; s.walkable = true; break;
            case HaneulSurfaceType.Rail:
                s.stopsBullets = false; break;                 // shoot and vault over
            case HaneulSurfaceType.BarricadeDoor: case HaneulSurfaceType.BarricadeWindow:
                s.destructible = true; break;                  // the barricade placed in the slot is
            case HaneulSurfaceType.Stair: case HaneulSurfaceType.Walkway: case HaneulSurfaceType.Ledge:
            case HaneulSurfaceType.Bridge: case HaneulSurfaceType.Terrace:
                s.walkable = true; s.stopsBullets = true; break;
            case HaneulSurfaceType.Hologram:
                // HOLO_stage blocks vision only; HOLO_stage_emitter is the destructible projector
                if (id.EndsWith("_emitter", StringComparison.Ordinal)) { s.destructible = true; s.stopsBullets = true; } else s.blocksVision = true;
                break;
            case HaneulSurfaceType.Shutter:
                {
                    // flags follow the state (ApplyShutter): open = no collider, sees and shoots through the bay
                    LShutter sh;
                    s.shutterTravel = 2f;
                    if (shutterData.TryGetValue(id, out sh))
                    {
                        s.defenderRoom = sh.room ?? ""; s.site = sh.site ?? ""; s.floor = sh.floor ?? s.floor;
                        if (sh.travel_s > 0f) s.shutterTravel = sh.travel_s;
                        s.shutterHeight = sh.travel_m;
                    }
                    break;
                }
            case HaneulSurfaceType.Objective:
                s.site = id.Length >= 2 ? id.Substring(0, 2) : id; break;     // OBJ_S1A -> S1
            case HaneulSurfaceType.DefenderSpawn:
                {
                    var k = id.LastIndexOf('_');                                // SPAWN_DEF_D1_3 -> D1
                    var d = k > 0 ? id.Substring(0, k) : id;
                    string site;
                    s.site = defSpawnSite.TryGetValue(d, out site) ? site : (d.StartsWith("D", StringComparison.Ordinal) ? "S" + d.Substring(1) : "");
                    break;
                }
        }
    }

    static string FloorOf(string id)
    {
        if (id.Length >= 3 && id[0] == 'F' && char.IsDigit(id[1]) && id[2] == '_') return id.Substring(0, 2);
        var k = id.LastIndexOf("_F", StringComparison.Ordinal);        // HARD_C_N-18_F1, LEDGE_LG_F2
        if (k >= 0 && k + 3 == id.Length && char.IsDigit(id[k + 2])) return id.Substring(k + 1);
        return "";
    }

    void DescribeUnit(HaneulSurface s, string id, Transform t)
    {
        // REINF_<wallId>_<k>; wall ids contain underscores (F1_W22)
        var k = id.LastIndexOf('_');
        int idx;
        if (k <= 0 || !int.TryParse(id.Substring(k + 1), out idx)) { idx = -1; k = id.Length; }
        s.wallId = id.Substring(0, k); s.unitIndex = idx;
        LWall w;
        if (walls.TryGetValue(s.wallId, out w) && w.reinforce != null && w.reinforce.panels != null && idx >= 0 && idx < w.reinforce.panels.Length)
        {
            var p = w.reinforce.panels[idx];
            s.fortification = SizeOf(p.size);
            s.unitWidth = p.u1 - p.u0;
            s.farSideZ = w.reinforce.far_side_z != 0 ? w.reinforce.far_side_z : -w.thickness;
            s.site = w.reinforce.site ?? "";
            s.defenderRoom = w.reinforce.defender_side == "neg" ? w.side_neg : w.side_pos;
            return;
        }
        // no layout data: the unit mesh spans its width along local X and the wall along -Z
        var mf = t.GetComponent<MeshFilter>();
        if (mf != null && mf.sharedMesh != null)
        {
            var b = mf.sharedMesh.bounds;
            s.unitWidth = Mathf.Round(b.size.x * 10f) / 10f;
            s.fortification = SizeOfWidth(s.unitWidth);
            s.farSideZ = b.min.z;
        }
    }

    void DescribeHatch(HaneulSurface s, string id, Transform t)
    {
        s.fortification = FortificationSize.Hatch; s.unitWidth = 1.2f;
        // a unit mounted from below hangs face-down: its up points down
        s.mountedFromBelow = t.up.y < 0f;
        LHatch h;
        if (hatchData.TryGetValue(id, out h))
        {
            s.unitWidth = h.size > 0 ? h.size : 1.2f;
            s.mountedFromBelow = h.reinforce_from == "below";
            s.defenderRoom = s.mountedFromBelow ? h.bottom_room : h.top_room;
            s.site = SiteOfRoom(h.bottom_room);
            if (string.IsNullOrEmpty(s.site)) s.site = SiteOfRoom(h.top_room);
            s.floor = h.floor;
        }
        // hatches: farSideZ holds the slab thickness the anchors pass through (a depth, positive). It is informative only:
        // Reinforce() leaves the hatch gadget's own far side as shipped (0.3 m down, which matches the 0.3 m slab)
        s.farSideZ = 0.3f;
    }

    string SiteOfRoom(string room)
    {
        if (layout == null || layout.sites == null || string.IsNullOrEmpty(room)) return "";
        foreach (var ls in layout.sites) if (ls.rooms != null && Array.IndexOf(ls.rooms, room) >= 0) return ls.id;
        return "";
    }

    public static FortificationSize SizeOf(string size)
    {
        switch (size)
        {
            case "small": return FortificationSize.Small;
            case "standard": return FortificationSize.Standard;
            case "large": return FortificationSize.Large;
            case "xl": return FortificationSize.XL;
            case "hatch": return FortificationSize.Hatch;
            default: return FortificationSize.None;
        }
    }
    public static FortificationSize SizeOfWidth(float w)
    {
        if (w <= 0f) return FortificationSize.None;
        if (w < 1.25f) return FortificationSize.Small;
        if (w < 2.25f) return FortificationSize.Standard;
        if (w < 3.5f) return FortificationSize.Large;
        return FortificationSize.XL;
    }
    // the gadget's .glb name for a size (gadgets/wall-fortification/unity/)
    public static string GadgetFile(FortificationSize size)
    {
        switch (size)
        {
            case FortificationSize.Small: return "wall-fortification-small";
            case FortificationSize.Standard: return "wall-fortification-standard";
            case FortificationSize.Large: return "wall-fortification-large";
            case FortificationSize.XL: return "wall-fortification-xl";
            case FortificationSize.Hatch: return "wall-fortification-hatch";
            default: return "";
        }
    }

    // ---------------------------------------------------------------- colliders and layers
    static bool Solid(HaneulSurfaceType t)
    {
        switch (t)
        {
            case HaneulSurfaceType.Hard: case HaneulSurfaceType.Soft: case HaneulSurfaceType.Reinforceable: case HaneulSurfaceType.Hatch:
            case HaneulSurfaceType.SoftFloor: case HaneulSurfaceType.SoftCeiling: case HaneulSurfaceType.InteriorGlass:
            case HaneulSurfaceType.FacadeGlassBreakable: case HaneulSurfaceType.FacadeGlassTempered: case HaneulSurfaceType.GlassFloor:
            case HaneulSurfaceType.Rail: case HaneulSurfaceType.Walkway: case HaneulSurfaceType.Ledge: case HaneulSurfaceType.Bridge:
            case HaneulSurfaceType.Terrace: return true;
            default: return false;
        }
    }

    void AddCollider(HaneulSurface s)
    {
        var go = s.gameObject;
        if (s.type == HaneulSurfaceType.Collider)
        {
            // COL_ empty: position, rotation, scale = size; ladder volumes are climb triggers
            if (go.GetComponent<Collider>() == null) { var bc = go.AddComponent<BoxCollider>(); bc.size = Vector3.one; bc.isTrigger = s.id.StartsWith("LD_", StringComparison.Ordinal); }
            // COL_SHUTTER_<bayId>: the closed-state box of a blast shutter, off while the shutter is open
            if (s.id.StartsWith("SHUTTER_", StringComparison.Ordinal)) { var bc = go.GetComponent<BoxCollider>(); if (bc != null) bc.enabled = shuttersClosedOnStart; }
            if (hideColliderMeshes) { var r = go.GetComponent<Renderer>(); if (r != null) r.enabled = false; }
            return;
        }
        if (s.type == HaneulSurfaceType.RevealZone)
        {
            // ZONE_EXT_<id>_<k> children are box volumes (scale = size); the parent holds no box
            if (go.transform.parent != null && go.transform.parent.name.StartsWith("ZONE_EXT_", StringComparison.Ordinal) && go.GetComponent<Collider>() == null)
            { var bc = go.AddComponent<BoxCollider>(); bc.size = Vector3.one; bc.isTrigger = true; }
            return;
        }
        if (s.type == HaneulSurfaceType.Shutter) return;    // moving blend-shape mesh: it collides through COL_SHUTTER_<id> only
        if (s.type == HaneulSurfaceType.Deco && !decoColliders) return;
        if (!Solid(s.type) && !(s.type == HaneulSurfaceType.Hologram && s.destructible) && !(s.type == HaneulSurfaceType.Deco)) return;
        var mf = go.GetComponent<MeshFilter>();
        if (mf == null || mf.sharedMesh == null || go.GetComponent<Collider>() != null) return;
        var mesh = mf.sharedMesh;
        // a mesh that is not CPU-readable can only be cooked in the editor; at runtime fall back to its box
        if (Application.isPlaying && !mesh.isReadable)
        {
            var bc = go.AddComponent<BoxCollider>(); bc.center = mesh.bounds.center; bc.size = mesh.bounds.size;
            return;
        }
        var mc = go.AddComponent<MeshCollider>();
        mc.sharedMesh = mesh; mc.convex = false;
        // the cradle moves (clip cradle_cycle); give it a kinematic body so the collider follows cheaply. The clip moves
        // the transform, not the body, so riders are not carried: parent the player to the cradle while they stand on it
        // (or move the character controller by the cradle's per-frame delta)
        if (s.type == HaneulSurfaceType.Bridge && s.id.StartsWith("CR_", StringComparison.Ordinal) && go.GetComponent<Rigidbody>() == null)
        { var rb = go.AddComponent<Rigidbody>(); rb.isKinematic = true; rb.useGravity = false; }
    }

    // BACKDROP_ nodes: pure scenery kilometres wide, lit by its emissive map. One renderer each, always drawn: no shadows,
    // no probes, no occlusion culling (an occlusion bake would only cost time on a mesh that surrounds the map)
    public static void ConfigureBackdrop(GameObject go)
    {
        foreach (var c in go.GetComponents<Collider>()) { if (Application.isPlaying) Destroy(c); else DestroyImmediate(c); }
        foreach (var r in go.GetComponentsInChildren<Renderer>(true))
        {
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            r.lightProbeUsage = UnityEngine.Rendering.LightProbeUsage.Off;
            r.reflectionProbeUsage = UnityEngine.Rendering.ReflectionProbeUsage.Off;
            r.allowOcclusionWhenDynamic = false;
        }
    }

    void ApplyLayer(HaneulSurface s)
    {
        int layer = -1;
        switch (s.type)
        {
            case HaneulSurfaceType.Soft: case HaneulSurfaceType.Reinforceable: case HaneulSurfaceType.Hatch: case HaneulSurfaceType.SoftFloor:
            case HaneulSurfaceType.SoftCeiling: case HaneulSurfaceType.InteriorGlass: case HaneulSurfaceType.FacadeGlassBreakable:
                layer = softLayer; break;
            case HaneulSurfaceType.Hard: case HaneulSurfaceType.FacadeGlassTempered: case HaneulSurfaceType.GlassFloor:
            case HaneulSurfaceType.Walkway: case HaneulSurfaceType.Ledge: case HaneulSurfaceType.Bridge: case HaneulSurfaceType.Terrace:
                layer = hardLayer; break;
            case HaneulSurfaceType.RevealZone: layer = triggerLayer; break;
            case HaneulSurfaceType.Shutter: layer = hardLayer; break;
            case HaneulSurfaceType.Collider: if (s.id.StartsWith("SHUTTER_", StringComparison.Ordinal)) layer = hardLayer; break;
            case HaneulSurfaceType.BarricadeDoor: case HaneulSurfaceType.BarricadeWindow: case HaneulSurfaceType.Opening:
            case HaneulSurfaceType.AttackerSpawn: case HaneulSurfaceType.DefenderSpawn: case HaneulSurfaceType.Objective:
            case HaneulSurfaceType.Cover: case HaneulSurfaceType.Callout: case HaneulSurfaceType.PropMarker:
                layer = markerLayer; break;
        }
        if (layer >= 0 && layer <= 31) s.gameObject.layer = layer;
    }

    // ---------------------------------------------------------------- lookups
    public HaneulSurface Get(string nodeName) { HaneulSurface s; return nodeName != null && byName.TryGetValue(nodeName, out s) ? s : null; }
    public HaneulSurface Get(Collider c)
    {
        if (c == null) return null;
        HaneulSurface s;
        if (byCollider.TryGetValue(c, out s)) return s;
        return c.GetComponentInParent<HaneulSurface>();
    }
    public HaneulSurfaceType SurfaceOf(Collider c) { var s = Get(c); return s != null ? s.type : HaneulSurfaceType.Unknown; }
    public bool IsDestructible(Collider c) { var s = Get(c); return s != null && s.destructible && !s.reinforced; }
    public bool IsReinforceable(Collider c) { var s = Get(c); return s != null && s.reinforceable && !s.reinforced; }
    public bool StopsBullets(Collider c) { var s = Get(c); return s == null || s.stopsBullets || s.reinforced; }
    public FortificationSize FortificationFor(Collider c) { var s = Get(c); return s != null ? s.fortification : FortificationSize.None; }
    public static float WidthOf(FortificationSize size)
    {
        switch (size)
        {
            case FortificationSize.Small: return 1.0f;
            case FortificationSize.Standard: return 1.5f;
            case FortificationSize.Large: return 3.0f;
            case FortificationSize.XL: return 4.0f;
            case FortificationSize.Hatch: return 1.2f;
            default: return 0f;
        }
    }

    // the nearest free reinforce unit or hatch within maxDistance of a point (for the defender's placement prompt)
    public HaneulSurface NearestReinforcePoint(Vector3 point, float maxDistance = 2f, bool includeHatches = true)
    {
        HaneulSurface best = null; var bd = maxDistance * maxDistance;
        foreach (var l in includeHatches ? new[] { ReinforceUnits, Hatches } : new[] { ReinforceUnits })
            foreach (var s in l)
            {
                if (s.reinforced) continue;
                var d = (s.transform.position - point).sqrMagnitude;
                if (d < bd) { bd = d; best = s; }
            }
        return best;
    }

    // marks a unit or hatch as reinforced and puts the gadget instance on its mount (identity pose under the node);
    // the gadget's far_side node is moved to farSideZ (walls) so the star anchors land on the far face
    public GameObject Reinforce(HaneulSurface s, GameObject gadgetPrefab)
    {
        if (s == null || !s.reinforceable || s.reinforced) return null;
        s.reinforced = true;
        if (gadgetPrefab == null) return null;
        var g = Instantiate(gadgetPrefab, s.transform, false);
        g.transform.localPosition = Vector3.zero; g.transform.localRotation = Quaternion.identity; g.transform.localScale = Vector3.one;
        var far = FindDeep(g.transform, s.type == HaneulSurfaceType.Hatch ? "hatch_mount" : "far_side");
        if (far != null && s.type == HaneulSurfaceType.Reinforceable) { var p = far.localPosition; p.z = s.farSideZ; far.localPosition = p; }
        return g;
    }

    static Transform FindDeep(Transform t, string name)
    {
        if (t.name == name) return t;
        for (var i = 0; i < t.childCount; i++) { var r = FindDeep(t.GetChild(i), name); if (r != null) return r; }
        return null;
    }

    public List<HaneulSurface> AttackerSpawnPoints(string spawnId)   // A1..A4
    {
        var list = new List<HaneulSurface>();
        foreach (var s in AttackerSpawns) if (s.id.StartsWith(spawnId + "_", StringComparison.Ordinal)) list.Add(s);
        return list;
    }
    public Site GetSite(string siteId) { Site s; return siteId != null && Sites.TryGetValue(siteId, out s) ? s : null; }
    public HaneulSurface Callout(string roomId) { return Get("CALLOUT_" + roomId); }

    // which floor (F1..F3) a world point is on, from the floor heights (y 0, 4.2, 8.4 relative to the map root)
    public string FloorAt(Vector3 world)
    {
        var y = transform.InverseTransformPoint(world).y;
        if (y < 4.2f) return "F1";
        if (y < 8.4f) return "F2";
        return "F3";
    }

    // ---------------------------------------------------------------- blast shutters
    readonly List<HaneulSurface> moving = new List<HaneulSurface>();

    // finds the shutter's renderer, its "closed" blend shape and its COL_SHUTTER_ box; widens the renderer bounds to the
    // closed curtain (the imported bounds only hold the open stack in the housing, so a closed shutter could be culled)
    void LinkShutter(HaneulSurface s)
    {
        s.shutterRenderer = s.GetComponent<SkinnedMeshRenderer>();
        if (s.shutterRenderer == null) s.shutterRenderer = s.GetComponentInChildren<SkinnedMeshRenderer>(true);
        s.shutterBlendShape = -1;
        var smr = s.shutterRenderer;
        if (smr != null && smr.sharedMesh != null && smr.sharedMesh.blendShapeCount > 0)
        {
            var i = smr.sharedMesh.GetBlendShapeIndex("closed");
            s.shutterBlendShape = i >= 0 ? i : 0;
            // node origin = closed curtain bottom centre (local y 0 is the floor), local +Y up
            var b = smr.sharedMesh.bounds;
            var lo = smr.transform == s.transform ? 0f : s.transform.InverseTransformPoint(smr.transform.position).y;
            b.Encapsulate(new Vector3(b.center.x, -lo - 0.05f, b.center.z));
            smr.localBounds = b;
        }
        else Debug.LogWarning("HaneulTowerMap: shutter " + s.name + " has no blend shape \"closed\" (re-import the glb with glTFast)", this);
        var col = Get("COL_" + s.name);
        s.shutterCollider = col != null ? col.GetComponent<Collider>() : null;
        if (s.shutterCollider != null) byCollider[s.shutterCollider] = s;   // a hit on the closed box reports the shutter
        if (shutterTravelOverride > 0f) s.shutterTravel = shutterTravelOverride;
    }

    // weight 0 = open .. 1 = closed (eased weight goes to the blend shape); the collider and flags are on only when closed
    void ApplyShutter(HaneulSurface s, float t, bool closedTarget)
    {
        s.shutterT = Mathf.Clamp01(t); s.shutterClosed = closedTarget;
        if (s.shutterRenderer != null && s.shutterBlendShape >= 0) s.shutterRenderer.SetBlendShapeWeight(s.shutterBlendShape, Mathf.SmoothStep(0f, 100f, s.shutterT));
        var closed = closedTarget && s.shutterT >= 1f;   // opening switches the collider off at once
        if (s.shutterCollider != null) s.shutterCollider.enabled = closed;
        s.stopsBullets = closed; s.blocksVision = closed;
    }

    public bool IsShutterClosed(HaneulSurface s) { return s != null && s.type == HaneulSurfaceType.Shutter && s.shutterT >= 1f; }
    public HaneulSurface Shutter(string bayId) { return Get("SHUTTER_" + bayId); }

    // close (true) or open (false) one shutter; instant skips the travel
    public void SetShutter(HaneulSurface s, bool closed, bool instant = false)
    {
        if (s == null || s.type != HaneulSurfaceType.Shutter) return;
        var target = closed ? 1f : 0f;
        if (instant || !Application.isPlaying)
        {
            moving.Remove(s); ApplyShutter(s, target, closed);
            RaiseFinished(s, closed); return;
        }
        if (Mathf.Approximately(s.shutterT, target) && s.shutterClosed == closed) return;
        // opening: the collider goes off at once (the curtain lifts); closing: it comes on when the curtain lands
        ApplyShutter(s, s.shutterT, closed);
        if (!moving.Contains(s)) moving.Add(s);
        if (ShutterMoveStarted != null) ShutterMoveStarted(s, closed);
        onShutterStarted.Invoke(s, closed);
    }

    // all shutters, or only those on a floor (F1..F3), in a room (F2_concierge) or at a site (S1..S4); null = any
    public int SetShutters(bool closed, string floor = null, string room = null, string site = null, bool instant = false)
    {
        var n = 0;
        foreach (var s in Shutters)
        {
            if (floor != null && s.floor != floor) continue;
            if (room != null && s.defenderRoom != room) continue;
            if (site != null && s.site != site) continue;
            SetShutter(s, closed, instant); n++;
        }
        return n;
    }
    public int CloseAllShutters(bool instant = false) { return SetShutters(true, null, null, null, instant); }
    public int OpenAllShutters(bool instant = false) { return SetShutters(false, null, null, null, instant); }
    public int SetFloorShutters(string floor, bool closed, bool instant = false) { return SetShutters(closed, floor, null, null, instant); }
    public int SetRoomShutters(string roomId, bool closed, bool instant = false) { return SetShutters(closed, null, roomId, null, instant); }

    void RaiseFinished(HaneulSurface s, bool closed)
    {
        if (ShutterMoveFinished != null) ShutterMoveFinished(s, closed);
        onShutterFinished.Invoke(s, closed);
    }

    void Update()
    {
        if (moving.Count == 0) return;
        var dt = Time.deltaTime;
        for (var i = moving.Count - 1; i >= 0; i--)
        {
            var s = moving[i];
            if (s == null) { moving.RemoveAt(i); continue; }
            var target = s.shutterClosed ? 1f : 0f;
            var t = Mathf.MoveTowards(s.shutterT, target, dt / Mathf.Max(0.05f, s.shutterTravel));
            ApplyShutter(s, t, s.shutterClosed);
            if (Mathf.Approximately(t, target)) { moving.RemoveAt(i); RaiseFinished(s, s.shutterClosed); }
        }
    }

#if UNITY_EDITOR
    void OnDrawGizmosSelected()
    {
        Gizmos.color = new Color(0.12f, 0.48f, 1f, 0.9f);
        foreach (var s in ReinforceUnits) if (s != null) { Gizmos.matrix = s.transform.localToWorldMatrix; Gizmos.DrawWireCube(new Vector3(0, 1, 0.13f), new Vector3(s.unitWidth, 2f, 0.26f)); }
        Gizmos.color = new Color(0.8f, 0.47f, 0.65f, 0.9f);
        foreach (var s in Hatches) if (s != null) { Gizmos.matrix = s.transform.localToWorldMatrix; Gizmos.DrawWireCube(new Vector3(0, 0.05f, 0), new Vector3(s.unitWidth, 0.1f, s.unitWidth)); }
        Gizmos.matrix = Matrix4x4.identity;
        Gizmos.color = Color.red; foreach (var s in AttackerSpawns) if (s != null) Gizmos.DrawSphere(s.transform.position + Vector3.up * 0.2f, 0.25f);
        Gizmos.color = Color.cyan; foreach (var s in DefenderSpawns) if (s != null) Gizmos.DrawSphere(s.transform.position + Vector3.up * 0.2f, 0.25f);
        Gizmos.color = Color.yellow; foreach (var s in Objectives) if (s != null) Gizmos.DrawWireSphere(s.transform.position + Vector3.up * 0.5f, 0.5f);
        Gizmos.color = new Color(0.76f, 0.09f, 0.36f, 0.9f);
        foreach (var s in Shutters) if (s != null && s.shutterCollider is BoxCollider) { var c = s.shutterCollider.transform; Gizmos.matrix = c.localToWorldMatrix; Gizmos.DrawWireCube(Vector3.zero, Vector3.one); }
        Gizmos.matrix = Matrix4x4.identity;
    }
#endif
}
