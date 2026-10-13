import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { build } from 'vite';
const require = createRequire(import.meta.url);
const convex = join(dirname(require.resolve('convex/package.json')), 'bin/main.js');
const hosting = join(dirname(require.resolve('@convex-dev/static-hosting/package.json')), 'dist/cli/index.js');
function run(bin, args) {
 const result = spawnSync(process.execPath, [bin, ...args], { stdio: 'inherit' });
 if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('Deploying Futura 2035 backend to production.');
run(convex, ['deploy', '--yes']);
const urls = JSON.parse(execFileSync(process.execPath, [convex, 'run', '--prod', '--component', 'staticHosting', 'lib:getUrls', '{}', '--typecheck=disable', '--codegen=disable'], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }));
if (urls.cloudUrl !== 'https://nautical-chicken-192.convex.cloud') throw new Error('Unexpected Futura production target; upload stopped.');
console.log('Building Futura frontend for production.');
await build({ configFile: false, envFile: false, define: { 'import.meta.env.VITE_CONVEX_URL': JSON.stringify(urls.cloudUrl) } });
console.log('Uploading Futura frontend to Convex production.');
run(hosting, ['upload', '--prod']);
console.log(`Live: ${urls.siteUrl}`);
