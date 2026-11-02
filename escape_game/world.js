export const regions = {
   yellow: {
      name: 'Yellow Colonnade',
      code: '01 / COLONNADE',
      cells: [0, 8, 0, 7],
      center: [9, 9],
      color: '#c6b967'
   },
   storage: {
      name: 'Storage',
      code: '02 / STORAGE',
      cells: [13, 19, 0, 6],
      center: [33, 11],
      color: '#b39070'
   },
   pool: { name: 'Pool', code: '03 / POOL', cells: [0, 8, 13, 22], center: [3, 29], color: '#72bab3' },
   pump: { name: 'Pump Room', code: '04 / PUMP', cells: [14, 19, 15, 21], center: [37, 33], color: '#99a9a5' }
};
export const links = [
   { id: 'ys', a: 'yellow', b: 'storage', runs: [[9, 12, 3, 3]], door: [11, 3], axis: 'x' },
   { id: 'yp', a: 'yellow', b: 'pool', runs: [[3, 3, 8, 12]], door: [3, 10], axis: 'z' },
   {
      id: 'sp',
      a: 'storage',
      b: 'pool',
      runs: [
         [14, 14, 7, 9],
         [9, 13, 9, 9],
         [9, 9, 10, 14]
      ],
      door: [11, 9],
      axis: 'x'
   },
   { id: 'pp', a: 'pool', b: 'pump', runs: [[9, 13, 18, 18]], door: [11, 18], axis: 'x' },
   { id: 'sm', a: 'storage', b: 'pump', runs: [[17, 17, 7, 14]], door: [17, 11], axis: 'z' }
];
export const spawn = { x: 7, z: 5, yaw: Math.PI };
export const exit = { x: 1.1, z: 7, name: 'Exit' };
export const powerSwitch = { x: 38.6, z: 41, name: 'Pump power' };
export const basin = { x: 4, z: 30, w: 10, d: 12, h: 0.12, material: 3, pit: true };
const key = (x, z) => `${x},${z}`;
export const cellKey = (p) => key(Math.floor(p.x / 2), Math.floor(p.z / 2));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const center = (x, z) => ({ x: x * 2 + 1, z: z * 2 + 1 });

export function createWorld() {
   const cells = new Map(),
      solids = [];
   const fill = (bounds, area) => {
      const [left, right, top, bottom] = bounds;
      for (let z = top; z <= bottom; z++)
         for (let x = left; x <= right; x++) cells.set(key(x, z), { x, z, ...area });
   };
   for (const [region, room] of Object.entries(regions)) fill(room.cells, { region });
   for (const link of links) for (const run of link.runs) fill(run, { link: link.id });
   const material = (cell) =>
      cell.region === 'pool' ? 3 : cell.region === 'pump' ? 4 : cell.region === 'storage' ? 2 : 1;
   for (const cell of cells.values()) {
      const { x, z } = cell,
         m = material(cell);
      for (const [dx, dz] of [
         [-1, 0],
         [1, 0],
         [0, -1],
         [0, 1]
      ]) {
         if (cells.has(key(x + dx, z + dz))) continue;
         solids.push({
            x: x * 2 + (dx === 1 ? 1.9 : dx === -1 ? -0.1 : 0),
            z: z * 2 + (dz === 1 ? 1.9 : dz === -1 ? -0.1 : 0),
            w: dx ? 0.2 : 2,
            d: dz ? 0.2 : 2,
            h: cell.region === 'pool' ? 5.5 : 3.8,
            material: m
         });
      }
   }
   for (const x of [5, 9, 13])
      for (const z of [5, 11]) solids.push({ x: x - 0.6, z: z - 0.6, w: 1.2, d: 1.2, h: 3.8, material: 1 });
   for (const x of [28, 34]) solids.push({ x, z: 3, w: 1.4, d: 6.5, h: 2.8, material: 2, shelf: true });
   solids.push(basin);
   for (const z of [35, 39]) solids.push({ x: 30, z, w: 3, d: 2, h: 2.0, material: 4, machine: true });
   // The pool arches leave the perimeter walkway open at full player height.
   for (const z of [33, 41])
      for (const x of [1.2, 15.6]) solids.push({ x, z, w: 1.2, d: 0.65, h: 3.1, material: 3, arch: true });
   const doors = links.map((link) => {
      const p = center(...link.door);
      return { id: link.id, ...p, axis: link.axis, open: true, opening: 0, link };
   });
   return { cells, solids, doors };
}

export function doorBox(door) {
   return {
      x: door.x - (door.axis === 'x' ? 0.12 : 1),
      z: door.z - (door.axis === 'z' ? 0.12 : 1),
      w: door.axis === 'x' ? 0.24 : 2,
      d: door.axis === 'z' ? 0.24 : 2,
      h: 3.2
   };
}
function overlaps(p, box, radius) {
   const x = Math.max(box.x, Math.min(p.x, box.x + box.w));
   const z = Math.max(box.z, Math.min(p.z, box.z + box.d));
   return Math.hypot(p.x - x, p.z - z) < radius;
}
export function canStand(world, p, radius = 0.28, ignoreDoors = false) {
   if (!world.cells.has(cellKey(p))) return false;
   if (world.solids.some((box) => overlaps(p, box, radius))) return false;
   return ignoreDoors || !world.doors.some((door) => !door.open && overlaps(p, doorBox(door), radius));
}
export function move(world, actor, dx, dz) {
   const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.08));
   for (let i = 0; i < steps; i++) {
      if (canStand(world, { x: actor.x + dx / steps, z: actor.z })) actor.x += dx / steps;
      if (canStand(world, { x: actor.x, z: actor.z + dz / steps })) actor.z += dz / steps;
   }
}
export function canWalk(world, a, b, ignoreDoors = false) {
   const steps = Math.max(1, Math.ceil(distance(a, b) / 0.08));
   for (let i = 0; i <= steps; i++) {
      const p = { x: a.x + ((b.x - a.x) * i) / steps, z: a.z + ((b.z - a.z) * i) / steps };
      if (!canStand(world, p, 0.28, ignoreDoors)) return false;
   }
   return true;
}
export function visible(world, a, b, ignoreDoor = null) {
   const steps = Math.ceil(distance(a, b) / 0.12);
   for (let i = 1; i < steps; i++) {
      const p = { x: a.x + ((b.x - a.x) * i) / steps, z: a.z + ((b.z - a.z) * i) / steps };
      if (!world.cells.has(cellKey(p))) return false;
      if (world.solids.some((box) => box.h > 1.5 && !box.pit && overlaps(p, box, 0.01))) return false;
      if (
         world.doors.some((door) => door.id !== ignoreDoor && !door.open && overlaps(p, doorBox(door), 0.01))
      )
         return false;
   }
   return true;
}
export function locate(world, p) {
   const cell = world.cells.get(cellKey(p));
   if (!cell) return { text: 'Boundary', region: null };
   if (cell.link) {
      const link = links.find((link) => link.id === cell.link);
      return {
         text: `${regions[link.a].name} ↔ ${regions[link.b].name} corridor`,
         link: link.id,
         region: null
      };
   }
   const room = regions[cell.region],
      [cx, cz] = room.center;
   const side =
      Math.abs(p.x - cx) > Math.abs(p.z - cz)
         ? (p.x < cx ? 'west side' : 'east side')
         : p.z < cz ? 'north side' : 'south side';
   return { text: `${room.name} · ${side}`, region: cell.region };
}
export function findPath(world, start, goal, openDoors = false) {
   const from = cellKey(start),
      to = cellKey(goal);
   if (!world.cells.has(to) || !canStand(world, goal, 0.28, openDoors)) return [];
   if (from === to) return canWalk(world, start, goal, openDoors) ? [goal] : [];
   const queue = [from],
      previous = new Map([[from, null]]);
   for (let i = 0; i < queue.length && !previous.has(to); i++) {
      const [x, z] = queue[i].split(',').map(Number),
         current = queue[i] === from ? start : center(x, z);
      for (const [dx, dz] of [
         [1, 0],
         [-1, 0],
         [0, 1],
         [0, -1]
      ]) {
         const next = key(x + dx, z + dz),
            p = next === to ? goal : center(x + dx, z + dz);
         if (!previous.has(next) && canWalk(world, current, p, openDoors)) {
            previous.set(next, queue[i]);
            queue.push(next);
         }
      }
   }
   if (!previous.has(to)) return [];
   const path = [goal];
   for (let at = previous.get(to); at !== from; at = previous.get(at))
      path.push(center(...at.split(',').map(Number)));
   return path.reverse();
}
export function regionPoints(world, id) {
   return [...world.cells.values()]
      .filter((cell) => cell.region === id)
      .map((cell) => center(cell.x, cell.z))
      .filter((p) => canStand(world, p, 0.3));
}
