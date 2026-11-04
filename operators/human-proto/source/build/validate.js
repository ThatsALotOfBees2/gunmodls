// node build/validate.js file.glb ... -> Khronos glTF validator summary
const fs = require('fs'), v = require('gltf-validator');
(async () => { for (const f of process.argv.slice(2)) {
  const r = await v.validateBytes(new Uint8Array(fs.readFileSync(f)), { maxIssues: 50 });
  console.log(f.split('/').pop(), JSON.stringify({ errors: r.issues.numErrors, warnings: r.issues.numWarnings, infos: r.issues.numInfos }),
    r.issues.messages.filter(m => m.severity <= 1).slice(0, 8).map(m => `${m.code} ${m.pointer||''}`).join(' | '));
}})();
