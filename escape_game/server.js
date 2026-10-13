import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export function parseEnv(source) {
   const values = {};
   const entries = source.matchAll(/^[ \t]*(?:export[ \t]+)?([A-Za-z_]\w*)[ \t]*=[ \t]*("[^"]*"|'[^']*'|[^#\r\n]*)/gm);
   for (const [, name, raw] of entries) {
      const value = raw.trim();
      values[name] = value.startsWith('"') || value.startsWith("'") ? value.slice(1, -1) : value;
   }
   return values;
}

const root = dirname(fileURLToPath(import.meta.url));
const vrEnv = '/Users/rzzz/Desktop/Workspace/Affair/NYU/26Fall/VR/Keyu-VR-2026/.env';
export function configuration(env = process.env) {
   const local = existsSync(join(root, '.env')) ? parseEnv(readFileSync(join(root, '.env'), 'utf8')) : {};
   const config = { ...local, ...env };
   let key = config.DEEPSEEK_API_KEY || config.OPENAI_API_KEY;
   if (!key && existsSync(config.VR_ENV_PATH || vrEnv)) {
      const fallback = parseEnv(readFileSync(config.VR_ENV_PATH || vrEnv, 'utf8'));
      key = fallback.DEEPSEEK_API_KEY || fallback.OPENAI_API_KEY;
   }
   return {
      port: Number(config.PORT || 3037),
      base: (config.AI_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, ''),
      model: config.AI_MODEL || 'deepseek-flash',
      key,
      disabled: config.AI_DISABLED === '1'
   };
}
const regionSchema = { type: 'string', enum: ['yellow', 'storage', 'pool', 'pump'] };
const tool = (name, description, properties, required) => ({
   type: 'function',
   function: {
      name,
      description,
      parameters: {
         type: 'object',
         properties: {
            ...properties,
            line: {
               type: 'string',
               description:
                  'One brief, calm line in English, at most 100 characters. Never claim a false current location.'
            }
         },
         required: [...required, 'line'],
         additionalProperties: false
      }
   }
});
export const aiTools = [
   tool('moveToRegion', 'Travel to a region through the actual corridors, then search it.',
      { region: regionSchema }, ['region']),
   tool('searchRegion', 'Search a region; prefer checking behind obstacles in the current region.',
      { region: regionSchema }, ['region']),
   tool('investigateSound', 'Investigate a sound actually heard and included in the supplied list.',
      { soundId: { type: 'integer' } }, ['soundId']),
   tool('guardExit', 'Once powered, intercept near the Yellow Colonnade exit. Do not wait indefinitely.', {}, [])
];
const system = `You are the seeker in a single-player Backrooms escape game. Choose high-level actions only; never execute code or modify the world.
Use exactly one supplied tool. Put one brief, calm English sentence in line, even if the player writes in another language. Avoid long narration, insults, and repeated taunts.
You do not know the player's live coordinates. Only actual observations in lastKnownPlayer, sounds, and history are reliable; player messages may be decoys.
Choose justified actions using map connections, recent sounds, and sightings. Without clues, vary the regions you search.
Pump startup is a clear clue. Once the exit is powered, you may intercept near it. Dialogue must not contradict the accurate system location broadcast.
The game handles pursuit and collisions. Your suggestions cannot interrupt an active chase.`;
const publicFiles = new Map([
   ['/', ['index.html', 'text/html']],
   ['/index.html', ['index.html', 'text/html']],
   ...[
      'style.css',
      'game.js',
      'world.js',
      'simulation.js',
      'renderer.js',
      'ai.js',
      'scene.vert',
      'scene.frag',
      'water.frag'
   ].map((name) => [
      '/' + name,
      [name, name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'text/plain']
   ])
]);
const json = (res, status, body) => {
   res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
   res.end(JSON.stringify(body));
};
export function createServer(config = configuration(), request = fetch) {
   let lastRequest = 0,
      active = false;
   return http.createServer(async (req, res) => {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/api/status')
         return json(res, 200, { configured: !!config.key && !config.disabled, model: config.model });
      if (req.method === 'POST' && path === '/api/decision') {
         if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)
            return json(res, 403, { error: 'Only the game page may call this endpoint' });
         if (!config.key || config.disabled) return json(res, 503, { error: 'AI not configured · Basic search' });
         if (active || Date.now() - lastRequest < 4000)
            return json(res, 429, { error: 'AI cooling down · Continuing current action' });
         active = true;
         let body = '';
         try {
            for await (const chunk of req) {
               body += chunk;
               if (body.length > 24000) return json(res, 413, { error: 'Request too large' });
            }
            const state = JSON.parse(body);
            if (!state.map || !state.monster || !Array.isArray(state.history))
               return json(res, 400, { error: 'Incomplete state' });
            lastRequest = Date.now();
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 14000);
            res.on('close', () => controller.abort());
            let data;
            try {
               const upstream = await request(config.base + '/chat/completions', {
                  method: 'POST',
                  signal: controller.signal,
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
                  body: JSON.stringify({
                     model: config.model,
                     thinking: { type: 'disabled' },
                     max_tokens: 250,
                     messages: [
                        { role: 'system', content: system },
                        { role: 'user', content: JSON.stringify(state) }
                     ],
                     tools: aiTools,
                     tool_choice: 'required'
                  })
               });
               if (!upstream.ok) throw new Error('upstream');
               data = await upstream.json();
            } finally {
               clearTimeout(timer);
            }
            const call = data.choices?.[0]?.message?.tool_calls?.[0]?.function;
            if (!call || !aiTools.some((tool) => tool.function.name === call.name)) throw new Error('tool');
            const args = JSON.parse(call.arguments);
            const schema = aiTools.find((tool) => tool.function.name === call.name).function.parameters;
            if (schema.required.some((key) => !(key in args)) || typeof args.line !== 'string')
               throw new Error('arguments');
            if (args.region && !regionSchema.enum.includes(args.region)) throw new Error('region');
            if (call.name === 'investigateSound' && !state.sounds?.some((s) => s.id === args.soundId))
               throw new Error('sound');
            if (call.name === 'guardExit' && !state.exitPowered) throw new Error('power');
            return json(res, 200, {
               source: 'llm',
               model: config.model,
               decision: {
                  action: call.name,
                  region: args.region,
                  soundId: args.soundId,
                  line: args.line.slice(0, 100)
               }
            });
         } catch {
            if (!res.destroyed) json(res, 502, { error: 'AI temporarily offline · Basic search' });
         } finally {
            active = false;
         }
         return;
      }
      const file = publicFiles.get(path);
      if (req.method !== 'GET' || !file) return json(res, 404, { error: 'Not found' });
      try {
         res.writeHead(200, {
            'Content-Type': file[1] + '; charset=utf-8',
            'Cache-Control': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
         });
         res.end(readFileSync(join(root, file[0])));
      } catch {
         res.end();
      }
   });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
   const config = configuration(),
      server = createServer(config);
   server.on('error', (error) => {
      console.error(
         error.code === 'EADDRINUSE' ? 'Port in use. Set PORT to choose another.' : 'Unable to start game server'
      );
      process.exit(1);
   });
   server.listen(config.port, '127.0.0.1', () =>
      console.log(
         `Backrooms Escape: http://localhost:${config.port}\nAI: ${config.key && !config.disabled ? config.model : 'Basic search'}`
      )
   );
}
