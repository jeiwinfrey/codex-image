import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { createInterface } from 'node:readline';

const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
const instructions = [
  'You are an image-generation assistant. Treat the user message as an image description.',
  'Use the built-in image_gen tool to generate exactly one still PNG.',
  'Use no other tools, including shell commands, web tools, plugins, and external scripts.',
  'Once generation completes, stop. If it fails, report the cause without retrying.',
].join(' ');

export async function generate(prompt, cwd, version) {
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  delete env.CODEX_API_KEY;

  const server = spawn('codex', [
    'app-server', '--listen', 'stdio://',
    '-c', 'model_provider="openai"',
    '-c', 'web_search="disabled"',
    '-c', 'skills.include_instructions=false',
    '--enable', 'image_generation',
    '--disable', 'hooks',
    '--disable', 'plugins',
    '--disable', 'apps',
    '--disable', 'shell_tool',
    '--disable', 'unified_exec',
  ], { cwd, env, stdio: ['pipe', 'pipe', 'ignore'] });

  const lines = createInterface({ input: server.stdout, crlfDelay: Infinity });
  const pending = new Map();
  let nextId = 0;
  let threadId;
  let image;
  let agentMessage;
  const finished = Promise.withResolvers();
  const failure = Promise.withResolvers();
  const closed = new Promise((resolve) => server.once('close', resolve));

  function send(message) {
    server.stdin.write(`${JSON.stringify(message)}\n`);
  }

  function request(method, params) {
    const id = nextId++;
    const response = Promise.withResolvers();
    pending.set(id, { ...response, method });
    send({ id, method, params });
    return response.promise;
  }

  lines.on('line', (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      failure.reject(new Error('Codex App Server returned malformed JSON.'));
      return;
    }

    if (message.method && message.id !== undefined) {
      send({ id: message.id, error: { code: -32601, message: 'Interactive requests are disabled.' } });
      return;
    }
    const response = pending.get(message.id);
    if (response) {
      pending.delete(message.id);
      if (message.error) {
        response.reject(new Error(`${response.method} failed: ${message.error.message}`));
      } else {
        response.resolve(message.result);
      }
      return;
    }

    const { params } = message;
    if (!threadId || params?.threadId !== threadId) return;
    if (message.method === 'item/completed') {
      if (params.item.type === 'imageGeneration' && image?.status !== 'completed') {
        image = params.item;
      }
      if (params.item.type === 'agentMessage') agentMessage = params.item.text;
    }
    if (message.method === 'turn/completed') finished.resolve(params.turn);
  });

  server.on('error', (error) => failure.reject(error.code === 'ENOENT'
    ? new Error('Codex CLI was not found. Install it and run codex login.')
    : error));
  server.stdin.on('error', () => failure.reject(new Error('Lost connection to Codex App Server.')));
  server.on('close', (code, signal) => {
    failure.reject(new Error(`Codex App Server exited before completing (${signal ?? code}).`));
  });

  const timeout = setTimeout(() => {
    failure.reject(new Error('Codex image generation timed out after 10 minutes.'));
  }, 10 * 60 * 1000);
  const interrupt = () => failure.reject(Object.assign(new Error('Interrupted.'), { exitCode: 130 }));
  const terminate = () => failure.reject(Object.assign(new Error('Terminated.'), { exitCode: 143 }));
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);

  async function runTurn() {
    await request('initialize', { clientInfo: { name: 'codex_image', title: 'codex-image', version } });
    send({ method: 'initialized' });
    const { account } = await request('account/read', { refreshToken: false });
    if (account?.type !== 'chatgpt') {
      throw new Error('Sign into Codex with ChatGPT using codex login.');
    }

    const { data: models } = await request('model/list', { includeHidden: false });
    const model = models.find((entry) => entry.isDefault) ?? models[0];
    if (!model) throw new Error('Codex reported no models available for this ChatGPT account.');
    const { thread } = await request('thread/start', {
      cwd,
      model: model.model,
      ephemeral: true,
      sandbox: 'read-only',
      approvalPolicy: 'never',
      developerInstructions: instructions,
    });
    threadId = thread.id;
    const { turn: started } = await request('turn/start', {
      threadId,
      serviceTierForTurn: 'default',
      input: [{ type: 'text', text: prompt }],
    });
    const turn = await finished.promise;
    if (turn.id !== started.id || turn.status !== 'completed') {
      throw new Error(turn.error?.message ?? 'The Codex turn did not complete.');
    }
    if (image?.status !== 'completed') {
      const detail = image?.failure?.type === 'usageLimitExceeded'
        ? 'The ChatGPT image-generation usage limit was reached.'
        : agentMessage?.trim().slice(0, 600) || 'Check whether image generation is available to your ChatGPT account.';
      throw new Error(`Codex did not return a completed image. ${detail}`);
    }

    const bytes = image.result && Buffer.from(image.result, 'base64');
    if (bytes && isPng(bytes)) return bytes;
    if (typeof image.savedPath === 'string' && isAbsolute(image.savedPath)) {
      const saved = await readFile(image.savedPath);
      if (isPng(saved)) return saved;
    }
    throw new Error('Codex returned an image without readable PNG data.');
  }

  try {
    return await Promise.race([runTurn(), failure.promise]);
  } finally {
    clearTimeout(timeout);
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
    lines.close();
    server.stdin.destroy();
    server.kill();
    const killTimer = setTimeout(() => server.kill('SIGKILL'), 2000);
    try {
      await closed;
    } finally {
      clearTimeout(killTimer);
    }
  }
}

function isPng(bytes) {
  return bytes.subarray(0, pngSignature.length).equals(pngSignature);
}
