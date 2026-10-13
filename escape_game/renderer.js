import { basin, doorBox, powerSwitch, exit } from './world.js';

class Mesh {
   constructor() {
      this.data = [];
   }
   quad(
      points,
      normal,
      material,
      uv = [
         [0, 0],
         [1, 0],
         [1, 1],
         [0, 1]
      ]
   ) {
      for (const i of [0, 1, 2, 0, 2, 3]) this.data.push(...points[i], ...normal, material, ...uv[i]);
   }
   box(x, y, z, w, h, d, material) {
      const a = [x, y, z],
         b = [x + w, y + h, z + d];
      this.quad(
         [
            [a[0], a[1], a[2]],
            [a[0], b[1], a[2]],
            [a[0], b[1], b[2]],
            [a[0], a[1], b[2]]
         ],
         [-1, 0, 0],
         material
      );
      this.quad(
         [
            [b[0], a[1], b[2]],
            [b[0], b[1], b[2]],
            [b[0], b[1], a[2]],
            [b[0], a[1], a[2]]
         ],
         [1, 0, 0],
         material
      );
      this.quad(
         [
            [a[0], a[1], a[2]],
            [b[0], a[1], a[2]],
            [b[0], a[1], b[2]],
            [a[0], a[1], b[2]]
         ],
         [0, -1, 0],
         material
      );
      this.quad(
         [
            [a[0], b[1], b[2]],
            [b[0], b[1], b[2]],
            [b[0], b[1], a[2]],
            [a[0], b[1], a[2]]
         ],
         [0, 1, 0],
         material
      );
      this.quad(
         [
            [b[0], a[1], a[2]],
            [b[0], b[1], a[2]],
            [a[0], b[1], a[2]],
            [a[0], a[1], a[2]]
         ],
         [0, 0, -1],
         material
      );
      this.quad(
         [
            [a[0], a[1], b[2]],
            [a[0], b[1], b[2]],
            [b[0], b[1], b[2]],
            [b[0], a[1], b[2]]
         ],
         [0, 0, 1],
         material
      );
   }
   sign(x, y, z, direction, row, width = 1.8) {
      const dx = (Math.cos(direction) * width) / 2,
         dz = (Math.sin(direction) * width) / 2;
      this.quad(
         [
            [x - dx, y - 0.28, z - dz],
            [x + dx, y - 0.28, z + dz],
            [x + dx, y + 0.28, z + dz],
            [x - dx, y + 0.28, z - dz]
         ],
         [-Math.sin(direction), 0, Math.cos(direction)],
         9,
         [
            [0, (row + 1) / 16],
            [1, (row + 1) / 16],
            [1, row / 16],
            [0, row / 16]
         ]
      );
   }
}
export class Renderer {
   static async create(canvas, world) {
      const sources = await Promise.all(
         ['scene.vert', 'scene.frag', 'water.frag'].map((name) => fetch(name).then((r) => r.text()))
      );
      return new Renderer(canvas, world, sources);
   }
   constructor(canvas, world, sources) {
      this.canvas = canvas;
      const gl = (this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false }));
      if (!gl) throw new Error('浏览器不支持 WebGL2');
      const program = (fragment) => {
         const p = gl.createProgram();
         for (const [type, source] of [
            [gl.VERTEX_SHADER, sources[0]],
            [gl.FRAGMENT_SHADER, fragment]
         ]) {
            const s = gl.createShader(type);
            gl.shaderSource(s, source);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
            gl.attachShader(p, s);
            gl.deleteShader(s);
         }
         gl.linkProgram(p);
         if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
         return {
            p,
            uniforms: Object.fromEntries(
               ['uCamera', 'uLook', 'uAspect', 'uReflect', 'uTime', 'uSigns', 'uReflection'].map((name) => [
                  name,
                  gl.getUniformLocation(p, name)
               ])
            )
         };
      };
      this.scene = program(sources[1]);
      this.water = program(sources[2]);
      this.static = this.buffer();
      this.dynamic = this.buffer();
      this.waterMesh = this.buffer();
      this.signs = this.signTexture();
      this.reflection = gl.createTexture();
      this.framebuffer = gl.createFramebuffer();
      this.depth = gl.createRenderbuffer();
      this.build(world);
      const mesh = new Mesh();
      mesh.quad(
         [
            [4, -0.1, 30],
            [14, -0.1, 30],
            [14, -0.1, 42],
            [4, -0.1, 42]
         ],
         [0, 1, 0],
         3
      );
      this.upload(this.waterMesh, mesh);
      gl.enable(gl.DEPTH_TEST);
      gl.clearColor(0.035, 0.042, 0.028, 1);
   }
   buffer() {
      const gl = this.gl,
         vao = gl.createVertexArray(),
         buffer = gl.createBuffer();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      for (const [location, size, offset] of [
         [0, 3, 0],
         [1, 3, 3],
         [2, 1, 6],
         [3, 2, 7]
      ]) {
         gl.enableVertexAttribArray(location);
         gl.vertexAttribPointer(location, size, gl.FLOAT, false, 36, offset * 4);
      }
      return { vao, buffer, count: 0 };
   }
   upload(target, mesh, dynamic = false) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, target.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.data), dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      target.count = mesh.data.length / 9;
   }
   signTexture() {
      const gl = this.gl,
         canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');
      const labels = [
         '02  储物间 / STORAGE',
         '03  泳池 / POOL',
         '04  泵房 / PUMP',
         '01  柱廊 / COLONNADE',
         'EXIT / 出口 · 需供电',
         'POWER / 电源 [E]',
         'DEEP WATER / 请绕行',
         'FACILITY 037'
      ];
      labels.forEach((text, i) => {
         ctx.fillStyle = i === 4 ? '#263f2b' : '#28302a';
         ctx.fillRect(0, i * 64, 512, 64);
         ctx.strokeStyle = '#d6cd8e';
         ctx.lineWidth = 3;
         ctx.strokeRect(3, i * 64 + 3, 506, 58);
         ctx.fillStyle = '#e5dfa7';
         ctx.font = 'bold 25px sans-serif';
         ctx.textAlign = 'center';
         ctx.textBaseline = 'middle';
         ctx.fillText(text, 256, i * 64 + 32);
      });
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return texture;
   }
   build(world) {
      const mesh = new Mesh();
      for (const cell of world.cells.values()) {
         const x = cell.x * 2,
            z = cell.z * 2,
            pool = cell.region === 'pool';
         const inWater = x >= basin.x && x < basin.x + basin.w && z >= basin.z && z < basin.z + basin.d;
         mesh.box(
            x,
            inWater ? -1.45 : -0.12,
            z,
            2,
            0.12,
            2,
            pool ? 3 : cell.region === 'pump' ? 4 : cell.region === 'storage' ? 2 : 1
         );
         mesh.box(x, pool ? 5.5 : 3.8, z, 2, 0.1, 2, 5);
         if (cell.x % 2 === 0 && cell.z % 2 === 0)
            mesh.box(x + 0.3, pool ? 5.46 : 3.76, z + 0.7, 1.4, 0.025, 0.55, 6);
      }
      for (const box of world.solids) {
         if (box.pit) continue;
         mesh.box(box.x, 0, box.z, box.w, box.h, box.d, box.material);
         if (box.shelf)
            for (const y of [0.2, 1.2, 2.2]) mesh.box(box.x - 0.08, y, box.z, box.w + 0.16, 0.08, box.d, 4);
         if (box.machine) mesh.box(box.x + 0.2, box.h, box.z + 0.7, box.w - 0.4, 0.18, 0.3, 8);
      }
      for (const [x, z, w, d] of [
         [3.85, 30, 0.15, 12.15],
         [14, 30, 0.15, 12.15],
         [4, 29.85, 10, 0.15],
         [4, 42, 10, 0.15]
      ])
         mesh.box(x, -1.4, z, w, 1.4, d, 3);
      for (const z of [33, 41]) {
         for (let i = 0; i < 32; i++) {
            const a = (i * Math.PI) / 32,
               b = ((i + 1) * Math.PI) / 32;
            const points = [
               [9 + 6.6 * Math.cos(a), 3.1 + 2.35 * Math.sin(a), z],
               [9 + 6.6 * Math.cos(b), 3.1 + 2.35 * Math.sin(b), z],
               [9 + 6.6 * Math.cos(b), 3.1 + 2.35 * Math.sin(b), z + 0.65],
               [9 + 6.6 * Math.cos(a), 3.1 + 2.35 * Math.sin(a), z + 0.65]
            ];
            mesh.quad(points, [-Math.cos((a + b) / 2), -Math.sin((a + b) / 2), 0], 3);
            for (const zz of [z, z + 0.65])
               mesh.quad(
                  [
                     [points[0][0], points[0][1], zz],
                     [points[1][0], points[1][1], zz],
                     [points[1][0], 5.5, zz],
                     [points[0][0], 5.5, zz]
                  ],
                  [0, 0, 1],
                  3
               );
         }
      }
      const signs = [
         [17.75, 2.8, 7, Math.PI / 2, 0],
         [26.25, 2.8, 7, -Math.PI / 2, 3],
         [7, 2.8, 15.75, Math.PI, 1],
         [7, 2.8, 26.25, 0, 3],
         [29, 2.8, 13.75, Math.PI, 1],
         [17.75, 2.8, 29, Math.PI / 2, 0],
         [35, 2.8, 13.75, Math.PI, 2],
         [35, 2.8, 30.25, 0, 0],
         [17.75, 2.8, 37, Math.PI / 2, 2],
         [28.25, 2.8, 37, -Math.PI / 2, 1],
         [0.22, 2.6, 7, -Math.PI / 2, 4],
         [39.75, 2.6, 41, Math.PI / 2, 5],
         [9, 1.1, 29.84, Math.PI, 6]
      ];
      for (const sign of signs) mesh.sign(...sign);
      mesh.box(0.12, 0, 6, 0.12, 2.25, 2, 4);
      mesh.box(39.65, 1.0, 40.6, 0.22, 0.8, 0.8, 4);
      this.upload(this.static, mesh);
   }
   resize() {
      const gl = this.gl,
         c = this.canvas,
         scale = Math.min(1.4, devicePixelRatio, 1400 / innerWidth);
      const w = Math.floor(innerWidth * scale),
         h = Math.floor(innerHeight * scale);
      if (c.width === w && c.height === h) return;
      c.width = w;
      c.height = h;
      this.rw = Math.max(1, Math.floor(w * 0.6));
      this.rh = Math.max(1, Math.floor(h * 0.6));
      gl.bindTexture(gl.TEXTURE_2D, this.reflection);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.rw, this.rh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.rw, this.rh);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.reflection, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
         throw new Error('水面反射缓冲创建失败');
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
   }
   use(program, game, pitch, reflect = false) {
      const gl = this.gl,
         u = program.uniforms;
      gl.useProgram(program.p);
      gl.uniform3f(u.uCamera, game.player.x, 1.65, game.player.z);
      gl.uniform2f(u.uLook, game.player.yaw, pitch);
      gl.uniform1f(u.uAspect, this.canvas.width / this.canvas.height);
      gl.uniform1i(u.uReflect, reflect);
      gl.uniform1f(u.uTime, game.time);
   }
   draw(mesh) {
      const gl = this.gl;
      gl.bindVertexArray(mesh.vao);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
   }
   render(game, pitch) {
      this.resize();
      const gl = this.gl,
         mesh = new Mesh(),
         m = game.monster;
      for (const d of game.world.doors) {
         const b = doorBox(d);
         if (!d.open) mesh.box(b.x, 0, b.z, b.w, 3.2, b.d, 4);
         else mesh.box(b.x, 3.2, b.z, b.w, 0.18, b.d, 4);
      }
      const gait = Math.sin(game.time * (m.mode === 'chase' ? 10 : 6)) * 0.18;
      mesh.box(m.x - 0.25, 0.85, m.z - 0.17, 0.5, 1.45, 0.34, 7);
      mesh.box(m.x - 0.22, 2.3, m.z - 0.19, 0.44, 0.5, 0.38, 7);
      for (const side of [-1, 1]) {
         mesh.box(m.x + side * 0.18 - 0.07, 0, m.z - 0.09 + side * gait, 0.14, 1.0, 0.18, 7);
         mesh.box(m.x + side * 0.39 - 0.07, 0.65, m.z - 0.09 - side * gait, 0.14, 1.65, 0.18, 7);
         const ex = m.x + Math.sin(m.yaw) * 0.205 + Math.cos(m.yaw) * side * 0.1;
         const ez = m.z - Math.cos(m.yaw) * 0.205 + Math.sin(m.yaw) * side * 0.1;
         mesh.box(ex - 0.035, 2.57, ez - 0.035, 0.07, 0.055, 0.07, 8);
      }
      mesh.box(powerSwitch.x + 0.83, 1.35, powerSwitch.z - 0.15, 0.06, 0.25, 0.3, game.powered ? 10 : 8);
      mesh.box(exit.x - 0.86, 2.2, exit.z - 0.55, 0.08, 0.12, 1.1, game.powered ? 10 : 8);
      this.upload(this.dynamic, mesh, true);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.signs);
      this.use(this.scene, game, pitch, true);
      gl.uniform1i(this.scene.uniforms.uSigns, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      gl.viewport(0, 0, this.rw, this.rh);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      this.draw(this.static);
      this.draw(this.dynamic);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      this.use(this.scene, game, pitch);
      this.draw(this.static);
      this.draw(this.dynamic);
      this.use(this.water, game, pitch);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.reflection);
      gl.uniform1i(this.water.uniforms.uReflection, 1);
      this.draw(this.waterMesh);
   }
}
