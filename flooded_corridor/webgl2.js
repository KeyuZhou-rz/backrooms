function gl_start(canvas, scene) {
   let defineNoise = fs => {           // KP: DEFINE NOISE FUNCTION WITHIN A FRAGMENT SHADER.
      let i = fs.indexOf(';') + 1;
      return fs.substring(0,i)+'vec3 _s(vec3 i){return cos(5.*(i+5.*cos(5.*(i.yzx+5.*cos(5.*(i.zxy+5.*cos(5.*i)))))));}float _t(vec3 i,vec3 u,vec3 a){return dot(normalize(_s(i+a)),u-a);}float noise(vec3 p){vec3 i=floor(p),u=p-i,v=2.*mix(u*u,u*(2.-u)-.5,step(.5,u));return mix(mix(mix(_t(i,u,vec3(0)),_t(i,u,vec3(1,0,0)),v.x),mix(_t(i,u,vec3(0,1,0)),_t(i,u,vec3(1,1,0)),v.x),v.y),mix(mix(_t(i,u,vec3(0,0,1)),_t(i,u,vec3(1,0,1)),v.x),mix(_t(i,u,vec3(0,1,1)),_t(i,u,vec3(1)),v.x),v.y),v.z);}'+fs.substring(i);
   }
   setTimeout(function() {
      window.gl = canvas.getContext('webgl2');
      gl.program = gl.createProgram();
      let addshader = (type, src) => {
         let shader = gl.createShader(type);
         gl.shaderSource(shader, src);
         gl.compileShader(shader);
         if (! gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            console.log('Cannot compile shader:', gl.getShaderInfoLog(shader));
         gl.attachShader(gl.program, shader);
      };
      addshader(gl.VERTEX_SHADER  , scene.vertexShader);
      addshader(gl.FRAGMENT_SHADER, defineNoise(scene.fragmentShader));
      gl.linkProgram(gl.program);
      if (! gl.getProgramParameter(gl.program, gl.LINK_STATUS))
         console.log('Could not link the shader program!');
      gl.useProgram(gl.program);

      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());

      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthFunc(gl.LEQUAL);

      let bpe = Float32Array.BYTES_PER_ELEMENT;

      let setVertexAttribute = (name, size, position) => {
         let location = gl.getAttribLocation(gl.program, name);
         gl.enableVertexAttribArray(location);
         gl.vertexAttribPointer(location, size, gl.FLOAT, false, scene.vertexSize * bpe, position * bpe);
      }

      for (let name in scene.vertexAttributes) {
         let attribute = scene.vertexAttributes[name];
         setVertexAttribute(name, attribute.size, attribute.position);
      }

      for (let n = 0 ; n < scene.shapes.length ; n++)
         scene.shapes[n].mesh = new Float32Array(scene.shapes[n].vertices);

 /*     setInterval(function() {
         if (scene.update)
            scene.update();
         for (let n = 0 ; n < scene.shapes.length ; n++) {
            // put vertex data of nth object into GPU array buffer
            gl.bufferData(gl.ARRAY_BUFFER, scene.shapes[n].mesh, gl.STATIC_DRAW);
            // draw
            gl.drawArrays(gl.TRIANGLES, 0, scene.shapes[n].mesh.length / scene.vertexSize);
         }
      }, 30);*/

         setInterval(function(){
            if (scene.update)
               scene.update();
            for (let n = 0; n < scene.shapes.length; n++){
               // here is code handling transformation respectively
               let m = scene.shapes[n].matrix;
               if (m){
                  setUniform('Matrix4fv', 'uMF', false, m.get());
                  m.inverse();
                  setUniform('Matrix4fv','uMI',false, m.get());
               }
               
               let mat = scene.shapes[n].material;
               if (mat){
                  setUniform('3fv', 'AMBIENT', mat.ambient);
                  setUniform('3fv', 'DIFFUSE', mat.diffuse);
                  setUniform('4fv','SPEC', mat.specular);
                  setUniform('1f', 'ROUGHNESS', mat.roughness ?? 1.0);
                  setUniform('1f', 'OPACITY', mat.opacity ?? 0.0);
                  setUniform('1f', 'uWave', mat.wave ?? 0.0);
               }


            gl.bufferData(gl.ARRAY_BUFFER, scene.shapes[n].mesh, gl.STATIC_DRAW);
            gl.drawArrays(gl.TRIANGLES, 0, scene.shapes[n].mesh.length / scene.vertexSize);
               
            }
         }, 30);
   }, 100);
}
let setUniform = (type,name,a,b,c) => (gl['uniform'+type])(gl.getUniformLocation(gl.program,name), a,b,c);
