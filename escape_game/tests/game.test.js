import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../simulation.js';
import { Director } from '../ai.js';
import { regions, links, findPath, canStand, distance, move, visible, locate } from '../world.js';

function walk(game, goal, sprint = true) {
   const path = findPath(game.world, game.player, goal);
   assert.ok(path.length, 'route exists');
   for (const point of path) {
      let frames = 0;
      while (distance(game.player, point) > 0.08 && !game.result) {
         assert.ok(frames++ < 1000, 'route does not get stuck');
         game.player.yaw = Math.atan2(point.x - game.player.x, -(point.z - game.player.z));
         game.step(Math.min(0.02, distance(game.player, point) / (sprint ? 4.4 : 3.1)), {
            forward: 1,
            sprint
         });
         assert.ok(canStand(game.world, game.player), 'player remains in free geometry');
         assert.ok(canStand(game.world, game.monster), 'monster remains in free geometry');
      }
   }
}
test('five physical connections have exactly the intended endpoints; each is traversable', () => {
   const game = new Game();
   for (const link of links) {
      const endpoints = new Set();
      for (const cell of game.world.cells.values()) {
         if (cell.link !== link.id) continue;
         for (const [dx, dz] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1]
         ]) {
            const neighbor = game.world.cells.get(`${cell.x + dx},${cell.z + dz}`);
            if (neighbor?.region) endpoints.add(neighbor.region);
            if (neighbor?.link) assert.equal(neighbor.link, link.id, 'no unintended corridor junction');
         }
      }
      assert.deepEqual([...endpoints].sort(), [link.a, link.b].sort());
      const corridor = [...game.world.cells.values()].filter((c) => c.link === link.id);
      for (const c of corridor) assert.ok(canStand(game.world, { x: c.x * 2 + 1, z: c.z * 2 + 1 }));
   }
   for (const a of Object.values(regions))
      for (const b of Object.values(regions)) {
         assert.ok(
            findPath(game.world, { x: a.center[0], z: a.center[1] }, { x: b.center[0], z: b.center[1] })
               .length
         );
      }
});
test('walls, columns, pool edge and closed doors block movement and doors block sight', () => {
   const g = new Game(),
      p = { x: 1, z: 1 };
   move(g.world, p, -5, 0);
   assert.ok(p.x > 0.35);
   const column = { x: 7, z: 5 };
   move(g.world, column, 5, 0);
   assert.ok(column.x < 8.2);
   const pool = { x: 3, z: 37 };
   move(g.world, pool, 5, 0);
   assert.ok(pool.x < 3.75);
   const door = g.world.doors.find((d) => d.id === 'ys');
   door.open = false;
   const before = { x: 21.5, z: 7 },
      after = { x: 24.5, z: 7 };
   assert.equal(visible(g.world, before, after), false);
   move(g.world, before, 5, 0);
   assert.ok(before.x < 22.61);
   g.player = { x: 21.8, z: 7, yaw: Math.PI / 2 };
   assert.equal(g.interaction()?.type, 'door');
   g.interact();
   assert.equal(door.open, true);
   assert.equal(visible(g.world, { x: 21.5, z: 7 }, after), true);
});
test('power and return route wins with a live searching/chasing monster and no teleport', () => {
   const g = new Game();
   g.start();
   for (const point of [
      [7, 29],
      [17, 37],
      [29, 37],
      [37, 41]
   ])
      walk(g, { x: point[0], z: point[1] });
   assert.equal(g.result, null);
   g.interact();
   assert.equal(g.powered, true);
   assert.ok(g.sounds.some((s) => s.label === 'Pump startup'));
   for (const point of [
      [35, 31],
      [35, 11],
      [27, 7],
      [17, 7],
      [1.7, 7]
   ])
      walk(g, { x: point[0], z: point[1] });
   assert.equal(g.result, null);
   g.interact();
   assert.equal(g.result, 'won');
});
test('monster sees, chases and catches, but cannot track an unseen player', () => {
   const g = new Game();
   g.player = { x: 7, z: 9, yaw: 0 };
   Object.assign(g.monster, { x: 7, z: 13, yaw: 0 });
   g.step(0.02);
   assert.equal(g.monster.mode, 'chase');
   const known = { ...g.monster.lastKnown };
   g.player = { x: 37, z: 41, yaw: 0 };
   for (let i = 0; i < 100; i++) g.step(0.02);
   assert.deepEqual(g.monster.lastKnown, known);
   assert.notEqual(g.monster.mode, 'chase');
   assert.equal('player' in g.snapshot(), false);
   const capture = new Game();
   capture.player = { x: 7, z: 9, yaw: 0 };
   Object.assign(capture.monster, { x: 7, z: 11, yaw: 0 });
   for (let i = 0; i < 200 && !capture.result; i++) capture.step(0.02);
   assert.equal(capture.result, 'lost');
});
test('monster opens a shut door with a delay and crosses without stepping through it', () => {
   const g = new Game();
   g.player = { x: 3, z: 29, yaw: 0 };
   Object.assign(g.monster, { x: 21, z: 7 });
   const door = g.world.doors.find((d) => d.id === 'ys');
   door.open = false;
   g.setTarget({ x: 25, z: 7 }, 'travel', 'storage');
   let previous = { ...g.monster },
      openTime;
   for (let i = 0; i < 200; i++) {
      g.step(0.02);
      assert.ok(distance(previous, g.monster) <= 3.65 * 0.02 + 0.001, 'no teleport');
      if (!door.open) assert.ok(g.monster.x < door.x - 0.35);
      else if (openTime === undefined) openTime = g.time;
      previous = { ...g.monster };
   }
   assert.ok(openTime >= 1.8);
   assert.ok(g.monster.x > 23.5);
});
test('sound has a finite path range, pump response has a head start, invalid AI tools do nothing', () => {
   const g = new Game();
   g.noise(g.player, 2, 'Running footsteps');
   assert.equal(g.sounds.length, 0);
   g.noise({ x: 37, z: 41 }, 120, 'Pump startup');
   assert.equal(g.sounds.length, 1);
   assert.equal(g.monster.reactAt, 4);
   assert.equal(g.applyDecision({ action: 'moveToRegion', region: 'outside' }), false);
   assert.equal(g.applyDecision({ action: 'investigateSound', soundId: 999 }), false);
   assert.equal(g.applyDecision({ action: 'guardExit' }), false);
   for (let i = 0; i < 205; i++) g.step(0.02);
   assert.equal(g.monster.mode, 'investigate');
});
test('broadcast is derived from actual location; reset restores all round state', () => {
   const g = new Game();
   for (const region of Object.values(regions)) {
      Object.assign(g.monster, { x: region.center[0], z: region.center[1] });
      assert.ok(g.broadcast().includes(locate(g.world, g.monster).text));
   }
   g.powered = true;
   g.world.doors[0].open = false;
   g.result = 'lost';
   g.message('I\'m at the pool');
   g.reset();
   assert.equal(g.powered, false);
   assert.equal(g.result, null);
   assert.equal(g.history.length, 0);
   assert.ok(g.world.doors.every((d) => d.open));
   assert.equal(g.monster.lastKnown, null);
});
test('an old AI reply cannot affect a new round', async () => {
   const originalFetch = globalThis.fetch;
   let resolve;
   globalThis.fetch = () => new Promise((r) => (resolve = r));
   const first = new Game(),
      second = new Game(),
      lines = [];
   const director = new Director(
      first,
      () => {},
      (text) => lines.push(text)
   );
   const pending = director.request();
   director.reset(second);
   resolve({
      ok: true,
      json: async () => ({
         model: 'test',
         decision: { action: 'moveToRegion', region: 'yellow', line: 'Old reply' }
      })
   });
   await pending;
   globalThis.fetch = originalFetch;
   assert.equal(second.control, 'fallback');
   assert.equal(second.lastDecision, null);
   assert.deepEqual(lines, []);
});
