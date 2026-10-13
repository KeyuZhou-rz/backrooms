import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';
import { Game } from '../simulation.js';

const config = {
   base: 'https://api.deepseek.com',
   model: 'deepseek-flash',
   key: 'test-only',
   disabled: false
};
async function withServer(settings, upstream, run) {
   const server = createServer(settings, upstream);
   await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
   try {
      await run(`http://127.0.0.1:${server.address().port}`);
   } finally {
      await new Promise((resolve) => server.close(resolve));
   }
}
const post = async (url, state = new Game().snapshot()) =>
   fetch(url + '/api/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state)
   });
test('server sends non-thinking tool request and returns a validated real-tool-shaped decision', async () => {
   await withServer(
      config,
      async (url, options) => {
         assert.equal(url, 'https://api.deepseek.com/chat/completions');
         const body = JSON.parse(options.body);
         assert.deepEqual(body.thinking, { type: 'disabled' });
         assert.equal(body.model, 'deepseek-flash');
         assert.equal(body.tools.length, 4);
         assert.equal(body.tool_choice, 'required');
         return {
            ok: true,
            json: async () => ({
               choices: [
                  {
                     message: {
                        tool_calls: [
                           {
                              function: {
                                 name: 'moveToRegion',
                                 arguments: JSON.stringify({ region: 'pool', line: '检查泳池。' })
                              }
                           }
                        ]
                     }
                  }
               ]
            })
         };
      },
      async (url) => {
         const response = await post(url);
         assert.equal(response.status, 200);
         const data = await response.json();
         assert.equal(data.source, 'llm');
         assert.equal(data.decision.region, 'pool');
         assert.ok(!JSON.stringify(data).includes('test-only'));
      }
   );
});
test('upstream failure returns a short fallback status without credential leakage', async () => {
   await withServer(
      config,
      async () => {
         throw new Error('secret test-only upstream details');
      },
      async (url) => {
         const response = await post(url);
         assert.equal(response.status, 502);
         assert.deepEqual(await response.json(), { error: 'AI 暂时离线 · 基础搜索' });
      }
   );
});
test('unknown tools and invented sound IDs are rejected', async () => {
   for (const [name, args] of [
      ['eval', { line: 'x' }],
      ['investigateSound', { soundId: 999, line: 'x' }]
   ]) {
      await withServer(
         config,
         async () => ({
            ok: true,
            json: async () => ({
               choices: [
                  { message: { tool_calls: [{ function: { name, arguments: JSON.stringify(args) } }] } }
               ]
            })
         }),
         async (url) => assert.equal((await post(url)).status, 502)
      );
   }
});
test('disabled AI stays playable and static server never exposes .env or backend', async () => {
   await withServer(
      { ...config, disabled: true },
      () => {
         throw new Error('must not call');
      },
      async (url) => {
         assert.equal((await post(url)).status, 503);
         for (const path of ['/.env', '/server.js', '/../server.js', '/tests/game.test.js'])
            assert.equal((await fetch(url + path)).status, 404);
         assert.equal((await fetch(url + '/')).status, 200);
         assert.equal((await fetch(url + '/api/status')).status, 200);
      }
   );
});
