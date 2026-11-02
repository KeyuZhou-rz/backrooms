
// TRACK THE USER'S CURSOR

let _r = canvas.getBoundingClientRect(), cursor = [0,0,0];
let setCursor = (e, z) => cursor = [ (e.clientX - _r.left) / canvas.width * 2 - 1,
                                     1 - (e.clientY - _r.top) / canvas.height * 2,
                                     z ?? cursor[2] ];
canvas.onmousedown = e => setCursor(e, 1);
canvas.onmousemove = e => setCursor(e,  );
canvas.onmouseup   = e => setCursor(e, 0);

// DEFINE A MATRIX OBJECT CLASS

let Matrix = function() {
   let m;
   let xyz = (x,y,z) => x === undefined ? [1,1,1] : Array.isArray(x) ? x : [x, y ?? x, z ?? x];
   let mxm = (a, b) => a.map((A,n) => a[n&3]*b[n&12] + a[n&3|4]*b[n&12|1] + a[n&3|8]*b[n&12|2] + a[n&3|12]*b[n&12|3]);
   let C = t => Math.cos(t), S = t => Math.sin(t);

   this.get = () => m;
   this.identity = ()    => m = [ 1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1 ];
   this.inverse = () => {
      let co = (c, r) => {
         let s = (i, j) => m[c+i & 3 | (r+j & 3) << 2];
         return (c+r & 1 ? -1 : 1) * ( (s(1,1) * (s(2,2) * s(3,3) - s(3,2) * s(2,3)))
                                     - (s(2,1) * (s(1,2) * s(3,3) - s(3,2) * s(1,3)))
                                     + (s(3,1) * (s(1,2) * s(2,3) - s(2,2) * s(1,3))) );
      }
      let d = [], e = 0;
      for (let n = 0 ; n < 16 ; n++) d.push(co(n >> 2, n & 3));
      for (let n = 0 ; n <  4 ; n++) e += m[n] * d[n << 2];
      for (let n = 0 ; n < 16 ; n++) m[n] = d[n] / e;
   }
   this.move  = (x,y,z)  => { [x,y,z] = xyz(x,y,z); m = mxm(m, [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]); }
   this.perspective = fl => m = mxm(m, [1,0,0,0, 0,1,0,0, 0,0,1,-1/fl, 0,0,0,1]);
   this.scale = (x,y,z)  => { [x,y,z] = xyz(x,y,z); m = mxm(m, [x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1]); }
   this.turnX = t        => m = mxm(m, [1,0,0,0, 0,C(t),S(t),0, 0,-S(t),C(t),0, 0,0,0,1]);
   this.turnY = t        => m = mxm(m, [C(t),0,-S(t),0, 0,1,0,0, S(t),0,C(t),0, 0,0,0,1]);
   this.turnZ = t        => m = mxm(m, [C(t),S(t),0,0, -S(t),C(t),0,0, 0,0,1,0, 0,0,0,1]);
}

// USEFUL MATH FUNCTIONS

let normalize = v => {
   let s = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
   return [ v[0] / s, v[1] / s, v[2] / s ];
}

