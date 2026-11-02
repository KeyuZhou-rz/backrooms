import {
   createWorld,
   regions,
   links,
   spawn,
   exit,
   powerSwitch,
   distance,
   move,
   canWalk,
   visible,
   locate,
   findPath,
   regionPoints,
   doorBox
} from './world.js';

const patrol = ['pool', 'storage', 'pump', 'yellow'];
export class Game {
   constructor() {
      this.reset();
   }
   reset() {
      this.world = createWorld();
      this.player = { ...spawn };
      this.monster = {
         x: 37,
         z: 5,
         yaw: Math.PI,
         mode: 'search',
         targetRegion: 'storage',
         path: [],
         lastKnown: null,
         lastSeen: -100,
         searchUntil: 6,
         nextPlan: 0,
         doorWait: 0
      };
      this.time = 0;
      this.powered = false;
      this.result = null;
      this.sounds = [];
      this.events = [];
      this.history = [];
      this.serial = 0;
      this.patrolIndex = 0;
      this.footTime = 0;
      this.sightTime = 0;
      this.locationId = 'storage';
      this.revision = 0;
      this.control = 'fallback';
      this.lastDecision = null;
   }
   event(type, detail = {}) {
      const event = { type, time: +this.time.toFixed(1), ...detail };
      this.events.push(event);
      this.history.push(event);
      this.history = this.history.slice(-8);
      if (['sound', 'lost', 'message', 'saw'].includes(type)) this.revision++;
   }
   start() {
      this.event('start');
   }
   noise(position, range, label) {
      const route = findPath(this.world, this.monster, position, true);
      if (!route.length) return;
      let length = distance(this.monster, route[0]);
      for (let i = 1; i < route.length; i++) length += distance(route[i - 1], route[i]);
      length += this.world.doors.filter((d) => !d.open && route.some((p) => distance(p, d) < 1)).length * 6;
      if (length > range) return;
      const sound = {
         id: ++this.serial,
         x: position.x,
         z: position.z,
         label,
         time: this.time,
         location: locate(this.world, position).text
      };
      this.sounds.push(sound);
      this.sounds = this.sounds.slice(-5);
      this.event('sound', { sound });
      if (this.monster.mode !== 'chase') {
         this.monster.reactAt = this.time + (label === 'Pump startup' ? 4 : 0.6);
         this.monster.heard = sound;
      }
   }
   setTarget(point, mode, targetRegion = null) {
      const m = this.monster,
         path = findPath(this.world, m, point, true);
      if (!path.length) return false;
      m.path = path;
      m.mode = mode;
      m.targetRegion = targetRegion;
      m.destination = { x: point.x, z: point.z };
      m.searchUntil = this.time + 7;
      return true;
   }
   applyDecision(decision) {
      const m = this.monster,
         { action, region, soundId } = decision;
      if (this.result || m.mode === 'chase' || (m.reactAt && this.time < m.reactAt)) return false;
      let point,
         mode = 'travel',
         targetRegion = region;
      if (action === 'moveToRegion' || action === 'searchRegion') {
         if (!regions[region]) return false;
         const points = regionPoints(this.world, region);
         if (action === 'searchRegion' && locate(this.world, m).region === region) {
            const far = points.filter((p) => distance(m, p) > 5);
            point = far[Math.floor(this.time * 7) % far.length] || points[0];
            mode = 'search';
         } else point = { x: regions[region].center[0], z: regions[region].center[1] };
      } else if (action === 'investigateSound') {
         point = this.sounds.find((s) => s.id === soundId && this.time - s.time < 40);
         if (!point) return false;
         mode = 'investigate';
         targetRegion = locate(this.world, point).region;
      } else if (action === 'guardExit' && this.powered) {
         point = { x: 3, z: 7 };
         mode = 'guard';
         targetRegion = 'yellow';
      } else return false;
      if (!this.setTarget(point, mode, targetRegion)) return false;
      this.control = 'llm';
      this.lastDecision = { ...decision, time: this.time };
      this.event('decision', { action, region: targetRegion });
      return true;
   }
   fallback() {
      const m = this.monster;
      if (m.heard && this.time >= m.reactAt) {
         const sound = m.heard;
         m.heard = null;
         m.reactAt = 0;
         this.setTarget(sound, 'investigate', locate(this.world, sound).region);
         return;
      }
      if (m.mode === 'chase' || m.path.length || this.time < m.searchUntil) return;
      if (m.mode === 'travel' || m.mode === 'investigate') {
         const region = locate(this.world, m).region;
         const points = regionPoints(this.world, region || m.targetRegion || 'storage');
         const choices = points.filter((p) => distance(m, p) > 5);
         const p = choices[Math.floor(this.time * 3) % choices.length] || points[0];
         this.setTarget(p, 'search', region);
         return;
      }
      const region = patrol[this.patrolIndex++ % patrol.length];
      this.setTarget({ x: regions[region].center[0], z: regions[region].center[1] }, 'travel', region);
      this.event('idle', { region });
   }
   perceive() {
      const m = this.monster,
         p = this.player;
      const d = distance(m, p),
         angle = Math.atan2(p.x - m.x, -(p.z - m.z));
      const facing = Math.cos(angle - m.yaw) > -0.15;
      if (d < 19 && (facing || d < 3.5) && visible(this.world, m, p)) {
         if (m.mode !== 'chase') {
            this.event('saw', { location: locate(this.world, p).text });
            m.path = [];
            m.nextPlan = 0;
         }
         m.mode = 'chase';
         m.lastSeen = this.time;
         m.lastKnown = { x: p.x, z: p.z, time: this.time, location: locate(this.world, p).text };
         m.heard = null;
         m.reactAt = 0;
      } else if (m.mode === 'chase' && this.time - m.lastSeen > 1.6) {
         this.setTarget(m.lastKnown, 'investigate', locate(this.world, m.lastKnown).region);
         this.event('lost', { lastKnown: m.lastKnown });
      }
   }
   step(dt, input = {}) {
      if (this.result) return;
      this.time += dt;
      const p = this.player,
         m = this.monster;
      const forward = input.forward || 0,
         right = input.right || 0,
         length = Math.hypot(forward, right);
      if (length) {
         const speed = input.sprint ? 4.4 : 3.1;
         move(
            this.world,
            p,
            ((Math.sin(p.yaw) * forward + Math.cos(p.yaw) * right) / length) * speed * dt,
            ((-Math.cos(p.yaw) * forward + Math.sin(p.yaw) * right) / length) * speed * dt
         );
         if (input.sprint && this.time > this.footTime) {
            this.footTime = this.time + 3;
            this.noise(p, 15, 'Running footsteps');
         }
      }
      if (this.time >= this.sightTime) {
         this.sightTime = this.time + 0.12;
         this.perceive();
      }
      this.fallback();
      let target = m.path[0];
      if (m.mode === 'chase' && m.lastKnown) {
         if (canWalk(this.world, m, m.lastKnown)) {
            target = m.lastKnown;
            m.path = [];
            m.nextPlan = 0;
         } else {
            if (this.time >= m.nextPlan) {
               m.path = findPath(this.world, m, m.lastKnown, true);
               m.nextPlan = this.time + 0.7;
            }
            target = m.path[0];
         }
      }
      const closed = this.world.doors.find(
         (d) =>
            !d.open &&
            distance(m, d) < 1.35 &&
            (m.path.some((p) => distance(p, d) < 0.6) || (target && distance(target, d) < 1.5))
      );
      if (closed) {
         m.doorWait += dt;
         if (m.doorWait >= 1.8) {
            closed.open = true;
            m.doorWait = 0;
            this.event('openedDoor', { door: closed.id });
         }
      } else if (target) {
         m.doorWait = 0;
         const d = distance(m, target),
            speed = m.mode === 'chase' ? 3.65 : 2.0;
         if (d < 0.14) {
            m.path.shift();
            if (!m.path.length) m.searchUntil = this.time + (m.mode === 'guard' ? 9 : 3);
         } else {
            m.yaw = Math.atan2(target.x - m.x, -(target.z - m.z));
            const step = Math.min(d, speed * dt);
            move(this.world, m, ((target.x - m.x) / d) * step, ((target.z - m.z) / d) * step);
         }
      } else {
         m.yaw += dt * 0.65;
      }
      const location = locate(this.world, m),
         id = location.region || location.link;
      if (id !== this.locationId) {
         this.locationId = id;
         this.event('entered', { location: location.text });
      }
      if (distance(p, m) < 0.66 && visible(this.world, p, m)) {
         this.result = 'lost';
         this.event('caught');
      }
   }
   interaction() {
      const p = this.player;
      const candidates = this.world.doors.map((door) => ({
         type: 'door',
         target: door,
         label: door.open ? 'Close corridor door' : 'Open corridor door'
      }));
      candidates.push(
         { type: 'power', target: powerSwitch, label: this.powered ? 'Power is on' : 'Restore exit power' },
         {
            type: 'exit', target: exit,
            label: this.powered ? 'Open exit · Escape' : 'Exit offline · Reach the Pump Room'
         }
      );
      return candidates
         .filter(
            (item) =>
               distance(p, item.target) < 2.0 &&
               visible(this.world, p, item.target, item.type === 'door' ? item.target.id : null)
         )
         .sort((a, b) => distance(p, a.target) - distance(p, b.target))[0];
   }
   interact() {
      if (this.result) return;
      const item = this.interaction();
      if (!item) return;
      if (item.type === 'door') {
         const door = item.target,
            box = doorBox(door);
         const inDoor = (actor) =>
            actor.x > box.x - 0.36 &&
            actor.x < box.x + box.w + 0.36 &&
            actor.z > box.z - 0.36 &&
            actor.z < box.z + box.d + 0.36;
         if (door.open && (inDoor(this.player) || inDoor(this.monster)))
            return 'Doorway occupied. Cannot close door.';
         door.open = !door.open;
         this.noise(door, 24, door.open ? 'Door opened' : 'Door closed');
      } else if (item.type === 'power' && !this.powered) {
         this.powered = true;
         this.noise(powerSwitch, 120, 'Pump startup');
         return 'Exit powered. Return to the Yellow Colonnade.';
      } else if (item.type === 'exit' && this.powered) {
         this.result = 'won';
         this.event('escaped');
      }
      return item.label;
   }
   message(text) {
      this.event('message', { text: text.slice(0, 240) });
   }
   snapshot() {
      const m = this.monster;
      return {
         map: Object.fromEntries(
            Object.entries(regions).map(([id, r]) => [
               id,
               {
                  name: r.name,
                  neighbors: links
                     .filter((l) => l.a === id || l.b === id)
                     .map((l) => (l.a === id ? l.b : l.a))
               }
            ])
         ),
         monster: { location: locate(this.world, m), action: m.mode, targetRegion: m.targetRegion },
         lastKnownPlayer: m.lastKnown,
         sounds: this.sounds.filter((s) => this.time - s.time < 40),
         doors: this.world.doors.map((d) => ({ connection: [d.link.a, d.link.b], open: d.open })),
         exitPowered: this.powered,
         history: this.history,
         time: +this.time.toFixed(1)
      };
   }
   broadcast() {
      const m = this.monster,
         location = locate(this.world, m);
      const states = {
         chase: 'Chasing', search: 'Searching', travel: 'Moving',
         investigate: 'Investigating', guard: 'Guarding exit'
      };
      const route = location.link && m.targetRegion ? ` → ${regions[m.targetRegion].name}` : '';
      return `Location: ${location.text}${route} · ${m.doorWait > 0 ? 'Opening door' : states[m.mode]}`;
   }
}
