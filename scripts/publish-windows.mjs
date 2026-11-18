import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const repo = process.env.GITHUB_REPOSITORY;
const directory = 'incoming-release';
const manifest = JSON.parse(readFileSync(join(directory, 'latest.json'), 'utf8'));
const version = manifest.version;
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
  throw Error('Expected a stable major.minor.patch version.');
}
const tag = 'v' + version;
const installer = 'rasd-' + version + '-windows-x64-setup.exe';
const signature = installer + '.sig';
const files = ['latest.json', installer, signature];
const paths = files.map((name) => join(directory, name));
const platform = manifest.platforms?.['windows-x86_64'];
const detachedSignature = readFileSync(paths[2], 'utf8').trim();
const expectedUrl = 'https://github.com/' + repo + '/releases/download/' + tag + '/' + installer;

if (readdirSync(directory).sort().join('\n') !== files.slice().sort().join('\n')
    || Object.keys(manifest.platforms ?? {}).length !== 1 || platform?.url !== expectedUrl
    || !detachedSignature || platform.signature !== detachedSignature) {
  throw Error('The staged files do not match the update manifest.');
}

function gh(args) {
  execFileSync('gh', args, { stdio: 'inherit' });
}

function getRelease(suffix) {
  const response = spawnSync('gh', ['api', 'repos/' + repo + '/releases/' + suffix], { encoding: 'utf8' });
  if (response.error) throw response.error;
  if (response.status === 0) return JSON.parse(response.stdout);
  if (response.stderr.includes('(HTTP 404)')) return null;
  throw Error(response.stderr.trim() || 'Reading the current release failed.');
}

function compareTags(a, b) {
  const parts = (value) => value.replace(/^v/, '').split('.').map(BigInt);
  const left = parts(a);
  const right = parts(b);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
  }
  return 0;
}

function publish() {
  const existing = getRelease('tags/' + tag);
  if (existing && !existing.draft) {
    for (const name of files) {
      const hash = createHash('sha256').update(readFileSync(join(directory, name))).digest('hex');
      if (existing.assets.find((asset) => asset.name === name)?.digest !== 'sha256:' + hash) {
        throw Error('The published ' + tag + ' has different content.');
      }
    }
    console.log(tag + ' is already published with these exact assets.');
    return;
  }
  const latest = getRelease('latest');
  if (latest && compareTags(tag, latest.tag_name) <= 0) {
    throw Error(tag + ' must be newer than ' + latest.tag_name + '.');
  }
  const repoArgs = ['--repo', repo];
  if (!existing) {
    gh(['release', 'create', tag, ...repoArgs, '--target', 'main', '--draft',
      '--title', 'RASD ' + version, '--notes', 'Signed Windows x64 update for RASD.']);
  }
  gh(['release', 'upload', tag, ...repoArgs, '--clobber', ...paths]);
  gh(['release', 'edit', tag, ...repoArgs, '--draft=false', '--latest']);
}

if (process.argv[2] === 'verify') {
  execFileSync('cargo', ['run', '--locked', '--quiet', '--manifest-path', 'tools/verify/Cargo.toml',
    '--', paths[2], paths[1]], { stdio: 'inherit' });
} else if (process.argv[2] === 'publish') {
  publish();
} else {
  throw Error('Expected verify or publish.');
}
