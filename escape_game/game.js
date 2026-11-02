import { Game } from './simulation.js';
import { Renderer } from './renderer.js';
import { Director } from './ai.js';
import { regions, links, locate } from './world.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scene'),
   keys = new Set();
const testing = new URLSearchParams(location.search).has('test');
let game = new Game(),
   renderer,
   director,
   pitch = -0.025,
   active = false,
   chatting = false,
   started = false;
let lastTime = performance.now(),
   toastUntil = 0,
   hudTime = 0,
   shownResult = null;
let frameAverage = 16.7;
function say(text, player = false) {
   const p = document.createElement('p'),
      label = document.createElement('small');
   label.textContent = player ? 'YOU / UNVERIFIED MESSAGE' : 'SEEKER / DIALOGUE';
   p.append(label, document.createTextNode(text));
   if (player) p.className = 'player';
   $('messages').append(p);
   while ($('messages').children.length > 6) $('messages').firstChild.remove();
   $('messages').scrollTop = $('messages').scrollHeight;
}
function toast(text) {
   $('toast').textContent = text;
   toastUntil = performance.now() + 3500;
}
function showCard(kind) {
   keys.clear();
   active = false;
   chatting = false;
   $('chat-form').hidden = true;
   document.exitPointerLock?.();
   $('overlay').hidden = false;
   const won = kind === 'won',
      lost = kind === 'lost',
      ended = won || lost;
   document.body.classList.toggle('ended', ended);
   document.body.classList.toggle('lost', lost);
   $('card-kicker').textContent = won
      ? 'FACILITY 037 / EXIT FOUND'
      : lost
        ? 'FACILITY 037 / SIGNAL LOST'
        : 'FACILITY 037 / PAUSED';
   $('card-title').textContent = won ? 'You escaped the facility.' : lost ? 'It found you.' : 'Take a moment.';
   $('card-copy').textContent = won
      ? `Escaped in ${Math.floor(game.time)} seconds. Exit power restored.`
      : lost
        ? 'Break its line of sight, close a door, and take another corridor.'
        : 'Paused. Restore power in the Pump Room, then return to the exit.';
   $('briefing').hidden = true;
   $('begin').textContent = ended ? 'Restart →' : 'Resume →';
   $('card-note').textContent = 'WASD Move · Shift Run · E Interact · T Chat';
}
async function capture() {
   if (game.result) return;
   active = true;
   started = true;
   $('overlay').hidden = true;
   keys.clear();
   try {
      await canvas.requestPointerLock();
   } catch (error) {
      if (testing) canvas.dataset.pointerError = error.name + ': ' + error.message;
      toast('Mouse capture unavailable: drag the scene to look; use WASD to move.');
   }
}
function restart() {
   game = new Game();
   director.reset(game);
   director.status();
   pitch = -0.025;
   shownResult = null;
   chatting = false;
   started = false;
   active = false;
   $('messages').replaceChildren();
   $('message').value = '';
   $('toast').textContent = '';
   $('chat-form').hidden = true;
   keys.clear();
   document.body.classList.remove('ended', 'lost', 'danger');
   game.start();
   capture();
}
function openChat() {
   if (!started || game.result) return;
   chatting = !chatting;
   keys.clear();
   $('chat-form').hidden = !chatting;
   if (chatting) {
      active = true;
      document.exitPointerLock?.();
      $('overlay').hidden = true;
      $('message').focus();
   } else {
      $('message').blur();
      capture();
   }
}
function drawMap() {
   const ctx = $('map').getContext('2d');
   ctx.clearRect(0, 0, 240, 180);
   const points = { yellow: [46, 35], storage: [190, 35], pool: [46, 132], pump: [190, 132] };
   ctx.strokeStyle = '#a7b19b66';
   ctx.lineWidth = 2;
   for (const l of links) {
      ctx.beginPath();
      ctx.moveTo(...points[l.a]);
      ctx.lineTo(...points[l.b]);
      ctx.stroke();
   }
   for (const [id, [x, z]] of Object.entries(points)) {
      ctx.fillStyle = '#182119';
      ctx.fillRect(x - 32, z - 18, 64, 36);
      ctx.strokeStyle = regions[id].color;
      ctx.strokeRect(x - 32, z - 18, 64, 36);
      ctx.fillStyle = regions[id].color;
      ctx.textAlign = 'center';
      ctx.font = '10px sans-serif';
      ctx.fillText(regions[id].code.split(' / ')[1], x, z + 4);
   }
   const loc = locate(game.world, game.player);
   let point = points[loc.region];
   if (!point && loc.link) {
      const l = links.find((l) => l.id === loc.link),
         a = points[l.a],
         b = points[l.b];
      point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
   }
   if (point) {
      ctx.fillStyle = '#f3ecaf';
      ctx.beginPath();
      ctx.arc(point[0] + 25, point[1] - 11, 3, 0, Math.PI * 2);
      ctx.fill();
   }
   ctx.font = '9px sans-serif';
   ctx.fillStyle = game.powered ? '#82d3a3' : '#aaa48a';
   ctx.textAlign = 'left';
   ctx.fillText(game.powered ? 'Exit powered' : 'Exit / offline', 14, 69);
   ctx.fillText('Power switch', 166, 166);
}
function hud() {
   $('position').textContent = game.broadcast();
   $('area').textContent = locate(game.world, game.player).text;
   $('objective').querySelector('small').textContent = game.powered ? 'OBJECTIVE / 02' : 'OBJECTIVE / 01';
   $('objective').querySelector('p').textContent = game.powered
      ? 'Return to the Colonnade. Open the exit.'
      : 'Reach the Pump Room. Restore exit power.';
   const item = game.interaction();
   $('prompt').textContent = active && !chatting && item ? `[E] ${item.label}` : '';
   document.body.classList.toggle('danger', game.monster.mode === 'chase' && !game.result);
   if (performance.now() > toastUntil) $('toast').textContent = '';
   if (!$('map-panel').hidden) drawMap();
   if (testing)
      canvas.dataset.inspection = JSON.stringify({
         player: game.player,
         monster: game.monster,
         powered: game.powered,
         result: game.result,
         time: game.time,
         active,
         chatting,
         locked: document.pointerLockElement === canvas,
         focused: document.hasFocus(),
         fps: Math.round(1000 / frameAverage),
         glError: renderer.gl.getError()
      });
}
let audio;
function ambience() {
   if (audio) return;
   try {
      audio = new AudioContext();
      const hum = audio.createOscillator(),
         gain = audio.createGain();
      hum.frequency.value = 60;
      gain.gain.value = 0.016;
      hum.connect(gain).connect(audio.destination);
      hum.start();
   } catch {
      /* Audio is optional. */
   }
}
function sound(frequency = 140, duration = 0.18) {
   if (!audio) return;
   const osc = audio.createOscillator(),
      gain = audio.createGain();
   osc.type = 'sine';
   osc.frequency.value = frequency;
   gain.gain.setValueAtTime(0.035, audio.currentTime);
   gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
   osc.connect(gain).connect(audio.destination);
   osc.start();
   osc.stop(audio.currentTime + duration);
}
document.addEventListener('keydown', (event) => {
   if (event.target instanceof HTMLInputElement) {
      if (event.code === 'Escape') {
         event.preventDefault();
         openChat();
      }
      return;
   }
   if (event.repeat && ['KeyE', 'KeyT', 'KeyM'].includes(event.code)) return;
   if (event.code === 'KeyT') {
      event.preventDefault();
      openChat();
      return;
   }
   if (event.code === 'KeyM') {
      $('map-panel').hidden = !$('map-panel').hidden;
      return;
   }
   if (!active || chatting) return;
   if (event.code === 'KeyE') {
      const item = game.interaction(),
         message = game.interact();
      if (message) toast(message);
      if (item) sound(item.type === 'power' ? 75 : 160, item.type === 'power' ? 0.8 : 0.15);
   }
   if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
      event.preventDefault();
      keys.add(event.code);
   }
   if (event.code === 'Escape' && !document.pointerLockElement) showCard('pause');
});
document.addEventListener('keyup', (event) => keys.delete(event.code));
document.addEventListener('mousemove', (event) => {
   if (active && !chatting && document.pointerLockElement === canvas) {
      game.player.yaw += event.movementX * 0.002;
      pitch = Math.max(-1.35, Math.min(1.35, pitch - event.movementY * 0.002));
   }
});
let drag = null;
canvas.addEventListener('pointerdown', (event) => {
   if (!active || game.result) return;
   if (document.pointerLockElement !== canvas) {
      drag = [event.clientX, event.clientY];
      canvas.setPointerCapture(event.pointerId);
   }
});
canvas.addEventListener('pointermove', (event) => {
   if (!drag || document.pointerLockElement === canvas) return;
   game.player.yaw += (event.clientX - drag[0]) * 0.003;
   pitch = Math.max(-1.35, Math.min(1.35, pitch - (event.clientY - drag[1]) * 0.003));
   drag = [event.clientX, event.clientY];
});
canvas.addEventListener('pointerup', () => (drag = null));
canvas.addEventListener('click', () => {
   if (active && !chatting && !game.result) capture();
});
document.addEventListener('pointerlockchange', () => {
   keys.clear();
   drag = null;
   if (!document.pointerLockElement && started && !chatting && !game.result && !document.hidden)
      showCard('pause');
});
window.addEventListener('blur', () => {
   keys.clear();
   if (active && !game.result) showCard('pause');
});
document.addEventListener('visibilitychange', () => {
   if (document.hidden && active) showCard('pause');
});
$('begin').onclick = () => {
   ambience();
   audio?.resume();
   if (game.result) restart();
   else {
      if (!started) game.start();
      capture();
   }
};
$('restart').onclick = restart;
$('chat-toggle').onclick = openChat;
$('chat-form').onsubmit = (event) => {
   event.preventDefault();
   const text = $('message').value.trim();
   if (!text) return;
   say(text, true);
   director.message(text);
   $('message').value = '';
   $('message').focus();
};
function frame(now) {
   frameAverage = frameAverage * 0.95 + (now - lastTime) * 0.05;
   const dt = Math.min(0.05, (now - lastTime) / 1000);
   lastTime = now;
   if (active && !game.result) {
      const down = (key) => Number(keys.has(key));
      game.step(
         dt,
         chatting
            ? {}
            : {
                 forward: down('KeyW') - down('KeyS'),
                 right: down('KeyD') - down('KeyA'),
                 sprint: keys.has('ShiftLeft') || keys.has('ShiftRight')
              }
      );
      director.tick();
   }
   renderer.render(game, pitch);
   if (now > hudTime) {
      hud();
      hudTime = now + 80;
   }
   if (game.result && shownResult !== game.result) {
      shownResult = game.result;
      director.stop();
      sound(game.result === 'won' ? 440 : 55, 0.7);
      showCard(game.result);
   }
   requestAnimationFrame(frame);
}
try {
   renderer = await Renderer.create(canvas, game.world);
   director = new Director(
      game,
      (text, source) => {
         $('ai-status').textContent = `${source === 'llm' ? 'LLM control' : 'Basic behavior'} / ${text}`;
      },
      say
   );
   await director.status();
   hud();
   requestAnimationFrame(frame);
} catch (error) {
   $('card-title').textContent = 'Unable to start rendering';
   $('card-copy').textContent = error.message;
   $('begin').hidden = true;
   $('briefing').hidden = true;
   console.error(error);
}
