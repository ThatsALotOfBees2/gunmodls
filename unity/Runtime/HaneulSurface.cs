// One typed node of the Haneul Tower map (maps/haneul-tower): its surface type and gameplay flags. HaneulTowerMap.Setup
// adds it to every node whose name carries a known prefix; the enums HaneulSurfaceType and FortificationSize live in
// HaneulTowerMap.cs. Unity 2021 LTS to Unity 6.
using UnityEngine;

public class HaneulSurface : MonoBehaviour
{
    public HaneulSurfaceType type;
    public string id = "";               // the name without its prefix (wall, opening, hatch, site, spawn id ...)
    public string floor = "";            // F1, F2, F3, or empty for the exterior
    public bool destructible;            // shoot and breach through it
    public bool reinforceable;           // takes a Wall Fortification unit (REINF_ = every breakable wall, HATCH_)
    public bool stopsBullets;            // hard surfaces, tempered glass, rails' glass panels do not
    public bool blocksVision;
    public bool walkable;
    // REINF_ and HATCH_ only
    public FortificationSize fortification = FortificationSize.None;
    public float unitWidth;              // m (1.0, 1.5, 3.0, 4.0; hatch 1.2)
    public float farSideZ;               // set the gadget's far_side node to this (minus the wall or slab thickness)
    public string wallId = "";           // REINF_: the wall it belongs to
    public int unitIndex = -1;           // REINF_: k in REINF_<wallId>_<k>
    public string site = "";             // REINF_/OBJ_/SPAWN_DEF_: the objective site
    public string defenderRoom = "";     // REINF_: the room the unit faces; HATCH_: the side it is reinforced from
    public bool mountedFromBelow;        // HATCH_: the unit hangs face-down under the slab
    public bool reinforced;              // set by gameplay code
}

