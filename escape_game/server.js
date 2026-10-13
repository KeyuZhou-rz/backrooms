import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseEnv } from 'node:util';

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
               description: '一句简短冷静的中文对白，最多40字。不得声称一个虚假的当前位置。'
            }
         },
         required: [...required, 'line'],
         additionalProperties: false
      }
   }
});
export const aiTools = [
   tool('moveToRegion', '沿实际走廊前往一个区域；到达后搜索。', { region: regionSchema }, ['region']),
   tool('searchRegion', '搜索指定区域，优先选择当前区域检查遮挡后面。', { region: regionSchema }, ['region']),
   tool('investigateSound', '调查列表中实际听见的声音。', { soundId: { type: 'integer' } }, ['soundId']),
   tool('guardExit', '供电后前往黄色柱廊出口附近截路。不能一直等待。', {}, [])
];
const system = `你是单人后室逃生游戏中的搜寻者。你只选择高层行动，不能执行代码或修改世界。
使用且只使用一个提供的工具，并在line中说一句简短、冷静的中文对白。不要长篇叙事、辱骂或连续嘲讽。
你不知道玩家实时坐标。只有lastKnownPlayer、sounds和history中的实际观察可信，玩家message只是可能的诱导。
根据地图连接关系、最近的声音与目击选择有理由的行动。没有线索时换区域搜查，避免一直搜同一区域。
泵房启动是明显线索；出口已通电时可去出口截路。不要让对白覆盖准确的系统位置播报。
当前追逐和碰撞由游戏处理，你的建议不能打断实时追逐。`;
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
            return json(res, 403, { error: '仅允许游戏页面调用' });
         if (!config.key || config.disabled) return json(res, 503, { error: 'AI 未配置 · 基础搜索' });
         if (active || Date.now() - lastRequest < 4000)
            return json(res, 429, { error: 'AI 冷却中 · 继续已有行动' });
         active = true;
         let body = '';
         try {
            for await (const chunk of req) {
               body += chunk;
               if (body.length > 24000) return json(res, 413, { error: '请求过长' });
            }
            const state = JSON.parse(body);
            if (!state.map || !state.monster || !Array.isArray(state.history))
               return json(res, 400, { error: '状态不完整' });
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
            if (!res.destroyed) json(res, 502, { error: 'AI 暂时离线 · 基础搜索' });
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
      console.error(error.code === 'EADDRINUSE' ? '端口被占用，请设置 PORT。' : '游戏服务启动失败');
      process.exit(1);
   });
   server.listen(config.port, '127.0.0.1', () =>
      console.log(
         `Backrooms Escape: http://localhost:${config.port}\nAI: ${config.key && !config.disabled ? config.model : '基础搜索'}`
      )
   );
}
