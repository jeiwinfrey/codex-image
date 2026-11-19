#!/usr/bin/env node
import { lstat, link, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { generate } from '../lib/codex.mjs';

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const help = `Usage: codex-image [--output FILE.png] "image description"
       codex-image [--output FILE.png] - < prompt.txt

  -o, --output FILE.png  Destination (default: image.png)
  -h, --help             Show help
  -v, --version          Show version

Uses your existing Codex ChatGPT sign-in. Run codex login to sign in.
Prints the absolute path on success. Existing files are preserved.`;

async function assertAvailable(path) {
  try {
    await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`Output already exists: ${path}`);
}

async function publishImage(image, path) {
  const directory = await mkdtemp(join(dirname(path), '.codex-image-'));
  const temporaryPath = join(directory, 'image.png');
  try {
    await writeFile(temporaryPath, image, { flag: 'wx' });
    // An atomic link fails if another process created the destination.
    await link(temporaryPath, path);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Output already exists: ${path}`);
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      output: { type: 'string', short: 'o', default: 'image.png' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });

  if (values.help) return console.log(help);
  if (values.version) return console.log(version);
  if (positionals.length !== 1) {
    throw new Error('Provide one quoted image description or pass - to read stdin. See --help.');
  }
  const [input] = positionals;
  if (input === '-' && process.stdin.isTTY) {
    throw new Error('Pipe a description to stdin when using -.');
  }
  const prompt = (input === '-' ? await readFileFromStdin() : input).trim();
  if (!prompt) throw new Error('The image description is empty.');
  if (extname(values.output).toLowerCase() !== '.png') {
    throw new Error('The output filename must end in .png.');
  }

  const output = resolve(values.output);
  await assertAvailable(output);
  await mkdir(dirname(output), { recursive: true });

  const scratch = await mkdtemp(join(tmpdir(), 'codex-image-'));
  try {
    const image = await generate(prompt, scratch, version);
    await publishImage(image, output);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
  console.log(output);
}

async function readFileFromStdin() {
  process.stdin.setEncoding('utf8');
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

try {
  await main();
} catch (error) {
  console.error(`codex-image: ${error.message}`);
  process.exitCode = error.exitCode ?? 1;
}
