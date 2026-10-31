import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docs = resolve(root, '..');
const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const development = args.includes('--development');
if (!option('--sdk')) throw new Error('Provide the actual packed Cube SDK with --sdk package.tgz.');
const tarball = resolve(option('--sdk'));
if (!option('--cube-source')) throw new Error('Provide the matching reviewed Cube checkout with --cube-source.');
const cubeSource = resolve(option('--cube-source'));
const sha256 = data => createHash('sha256').update(data).digest('hex');
const packageSha256 = sha256(await readFile(tarball));
const expectedHash = option('--sdk-sha256');
if ((!development && !expectedHash) || (expectedHash && expectedHash !== packageSha256)) throw new Error('Provide the reviewed SDK tarball SHA-256; mismatches cannot be built.');

const runtime = join(root, '.build/runtime');
await mkdir(runtime, { recursive: true });
function run(command, values) {
  const result = spawnSync(command, values, {
    cwd: root, stdio: 'inherit',
    env: { ...process.env, npm_config_cache: join(root, '.build/npm-cache') },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed; Playground output was not accepted.`);
}
run('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', runtime, tarball]);
const require = createRequire(join(runtime, 'package.json'));
const nodeEntry = require.resolve('@cubearc/cube');
const { createCube } = await import(pathToFileURL(nodeEntry));
const sdk = await createCube();
if (typeof sdk.recipeJson !== 'function') throw new Error('The SDK artifact lacks the required exact recipe serialization API.');
for (const file of ['app.mjs', 'pipelines-view.mjs', 'index.html', 'styles.css']) await readFile(join(root, 'src', file));
const lock = JSON.parse(await readFile(join(docs, 'sources.lock.json'), 'utf8'));
if (!development && (sdk.build.sourceDirty || sdk.build.coreRevision !== lock.sources.cube)) {
  throw new Error('Production requires a clean SDK artifact from the reviewed Cube source lock.');
}
const catalogJson = sdk.catalogJson();
if (sha256(catalogJson.trim()) !== sdk.build.catalogSha256) throw new Error('SDK catalog identity mismatch.');
if ((await readFile(join(cubeSource, 'contracts/v1/catalog.json'), 'utf8')).trim() !== catalogJson.trim()) throw new Error('Example source catalog differs from the actual SDK.');
const sourceRevision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: cubeSource, encoding: 'utf8' });
if (sourceRevision.status !== 0 || sourceRevision.stdout.trim() !== sdk.build.coreRevision) throw new Error('Example source revision differs from the actual SDK.');
if (!development) {
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: cubeSource, encoding: 'utf8' });
  if (status.status !== 0 || status.stdout.trim()) throw new Error('Production tool examples require a clean reviewed Cube checkout.');
}
// Build-time identity only; browser execution stays on the public packaged SDK.
const wasm = await import(pathToFileURL(join(dirname(nodeEntry), 'wasm/cube_wasm.js')));
const identities = JSON.parse(wasm.catalog_snapshot_json()).contracts;
const identityFile = join(root, '.build/contract-identities.json');
await writeFile(identityFile, JSON.stringify(identities));
const catalog = JSON.parse(catalogJson);
if (catalog.engine_version !== sdk.build.sdkVersion) throw new Error('SDK and Core package versions differ.');

const output = join(root, 'dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(join(root, 'src'), output, { recursive: true });
const sdkFolder = `assets/cube-${sdk.build.sourceSha256.slice(0, 16)}`;
await cp(dirname(nodeEntry), join(output, sdkFolder), { recursive: true });
await cp(join(docs, 'assets/cubearc-logo.png'), join(output, 'assets/cubearc-logo.png'));
await cp(join(docs, 'assets/fonts'), join(output, 'assets/fonts'), { recursive: true });
await writeFile(join(output, 'catalog.json'), catalogJson);
run('python3', [join(docs, 'tools/playground_details.py'), '--catalog', join(output, 'catalog.json'), '--fixtures', join(cubeSource, 'crates/cube-core/src/operations/contracts/conformance.json'), '--identities', identityFile, '--output', join(output, 'tool-details')]);
run('python3', [join(root, 'scripts/presentation.py'), '--catalog', join(output, 'catalog.json'), '--output', join(output, 'presentation.json')]);
await writeFile(join(output, 'runtime-config.mjs'), `export const sdkRoot = ${JSON.stringify(`./${sdkFolder}/`)};\nexport const expectedBuild = ${JSON.stringify(sdk.build)};\n`);
await writeFile(join(output, 'build-report.json'), `${JSON.stringify({ formatVersion: 1, development, sdk: sdk.build, packageSha256, catalogOperations: catalog.operations.length, directExecutors: sdk.executors.length, pipelineAdapters: sdk.pipelineAdapters.length }, null, 2)}\n`);
console.log(`Playground staged locally with ${catalog.operations.length} canonical operations, ${sdk.executors.length} direct executors and ${sdk.pipelineAdapters.length} pipeline adapters.`);
