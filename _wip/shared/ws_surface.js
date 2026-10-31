const NOISE = /* glsl */`
varying vec3 vObjPos;
uniform float uGrain, uColorVar, uRoughVar, uWood;
uniform vec3 uWoodDark;
float h3(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x), mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x), mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x), f.y), f.z);
}
float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a*vnoise(p); p = p*2.03 + 1.7; a *= 0.5; } return s; }
// fw = pixel footprint in noise cells at the first octave; octaves near or below a pixel fade to their mean
float fbmAA(vec3 p, float fw){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a*mix(vnoise(p), 0.5, smoothstep(0.3, 1.0, fw)); p = p*2.03 + 1.7; a *= 0.5; fw *= 2.03; } return s; }
`;

// Physical material with object-space grain (colour mottling + roughness breakup); wood adds
// laminate figure running along the stock.
function surface(params, noise = {}) {
  const m = new THREE.MeshPhysicalMaterial(params);
  const u = {
    uGrain: { value: noise.grain ?? 6 },
    uColorVar: { value: noise.colorVar ?? 0.06 },
    uRoughVar: { value: noise.roughVar ?? 0.08 },
    uWood: { value: noise.wood ? 1 : 0 },
    uWoodDark: { value: new THREE.Color(noise.woodDark ?? '#3a1a0c') },
  };
  m.userData.u = u;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = 'varying vec3 vObjPos;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vObjPos = position;');
    s.fragmentShader = NOISE + s.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        float n1 = fbmAA(vObjPos * uGrain, length(fwidth(vObjPos * uGrain)));
        if (uWood > 0.5) {
          float warp = fbm3(vObjPos * vec3(0.08, 0.7, 0.7));
          float lines = fbm3(vec3(vObjPos.x * 0.12, vObjPos.y * 11.0 + warp * 4.0, vObjPos.z * 11.0));
          float bands = 0.5 + 0.5 * sin((vObjPos.y * 1.6 + vObjPos.z * 0.6 + warp * 5.0 + lines * 1.6) * 6.2831);
          float t = smoothstep(0.35, 1.0, bands * 0.45 + lines * 0.6);
          diffuseColor.rgb = mix(diffuseColor.rgb, uWoodDark, t * 0.6);
        }
        diffuseColor.rgb *= 1.0 + uColorVar * (n1 - 0.5) * 2.0;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + uRoughVar * (fbmAA(vObjPos * uGrain * 3.7 + 7.1, length(fwidth(vObjPos * uGrain * 3.7))) - 0.5) * 2.0, 0.04, 1.0);`);
  };
  m.customProgramCacheKey = () => 'grain-wood-v2';
  return m;
}

