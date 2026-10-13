export class Director {
   constructor(game, report, say) {
      this.game = game;
      this.report = report;
      this.say = say;
      this.generation = 0;
      this.pending = null;
      this.nextCall = 0;
      this.queued = false;
      this.enabled = true;
      this.dialogue = [];
   }
   reset(game) {
      this.generation++;
      this.pending?.abort();
      this.pending = null;
      this.game = game;
      this.queued = false;
      this.nextCall = 0;
      this.dialogue = [];
      this.report('等待连接', 'fallback');
   }
   async status() {
      try {
         const data = await (await fetch('/api/status')).json();
         this.enabled = data.configured;
         this.report(data.configured ? `${data.model} · 等待决策` : '未配置 · 基础搜索', 'fallback');
      } catch {
         this.enabled = false;
         this.report('离线 · 基础搜索', 'fallback');
      }
   }
   tick() {
      const events = this.game.events.splice(0);
      if (events.some((e) => ['start', 'entered', 'sound', 'lost', 'message', 'idle'].includes(e.type)))
         this.queued = true;
      if (
         this.game.result ||
         this.game.monster.mode === 'chase' ||
         !this.enabled ||
         !this.queued ||
         this.pending ||
         performance.now() < this.nextCall
      )
         return;
      this.request();
   }
   async request() {
      this.queued = false;
      const generation = this.generation,
         game = this.game,
         revision = game.revision;
      const controller = new AbortController();
      this.pending = controller;
      this.report('请求中 · 继续已有行动', game.control);
      this.nextCall = performance.now() + 10000;
      const timeout = setTimeout(() => controller.abort(), 16000);
      try {
         const state = { ...game.snapshot(), dialogue: this.dialogue.slice(-6) };
         const response = await fetch('/api/decision', {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state)
         });
         const data = await response.json();
         if (generation !== this.generation || game.result) return;
         if (!response.ok) throw new Error(data.error || 'AI 离线 · 基础搜索');
         const applied = revision === game.revision && game.applyDecision(data.decision);
         this.report(applied ? `${data.model} · 决策已执行` : `${data.model} · 新观察优先`, game.control);
         if (applied && data.decision.line) {
            this.say(data.decision.line);
            this.dialogue.push({ speaker: 'monster', text: data.decision.line });
         }
         if (!applied) this.queued = true;
      } catch (error) {
         if (generation !== this.generation || game.result) return;
         game.control = 'fallback';
         this.report(error.name === 'AbortError' ? '请求超时 · 基础搜索' : error.message, 'fallback');
         this.nextCall = performance.now() + 20000;
      } finally {
         clearTimeout(timeout);
         if (generation === this.generation) this.pending = null;
      }
   }
   message(text) {
      this.dialogue.push({ speaker: 'player', text });
      this.game.message(text);
      this.queued = true;
   }
   stop() {
      this.generation++;
      this.pending?.abort();
      this.pending = null;
      this.queued = false;
   }
}
