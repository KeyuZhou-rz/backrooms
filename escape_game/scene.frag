#version 300 es
precision highp float;
in vec3 vPosition;
in vec3 vNormal;
in float vMaterial;
in vec2 vUV;
in vec4 vClip;
uniform vec3 uCamera;
uniform float uTime;
uniform bool uReflect;
uniform sampler2D uSigns;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
void main() {
   vec3 p=vPosition, n=normalize(vNormal);
   if (uReflect && p.y < 0.12) discard;
   float m=vMaterial;
   vec2 uv=abs(n.y)>.5 ? p.xz : (abs(n.x)>.5 ? p.zy : p.xy);
   vec3 color=vec3(.65,.60,.31);
   float grain=hash(floor(uv*60.0));
   if (m<1.5) {
      color=abs(n.y)>.5 ? vec3(.40,.35,.19) : vec3(.74,.67,.35);
      color*=.93+.07*step(.5,fract(uv.x*2.4));
      color*=.94+.08*grain;
   } else if (m<2.5) {
      color=vec3(.34,.29,.23)*(.9+.1*step(.08,fract(uv.y*3.)));
   } else if (m<3.5) {
      vec2 grid=min(fract(uv*2.),1.-fract(uv*2.));
      float grout=1.-smoothstep(.015,.035,min(grid.x,grid.y));
      color=mix(vec3(.65,.80,.75),vec3(.23,.36,.32),grout);
      if(p.y<-.4) color*=vec3(.4,.85,.82);
   } else if (m<4.5) {
      color=vec3(.26,.33,.32)*(.85+.15*step(.04,fract(uv.y*2.)));
   } else if (m<5.5) {
      vec2 grid=min(fract(uv),1.-fract(uv));
      color=mix(vec3(.67,.65,.53),vec3(.28),1.-smoothstep(.015,.03,min(grid.x,grid.y)));
   } else if (m<6.5) {
      float flicker=.975+.025*sin(uTime*9.0+floor(p.x)*3.0+floor(p.z));
      fragColor=vec4(vec3(.95,.94,.79)*flicker,1); return;
   } else if (m<7.5) {
      color=vec3(.025,.033,.03);
   } else if (m<8.5) {
      fragColor=vec4(.75,.22,.10,1); return;
   } else if (m<9.5) {
      if (!gl_FrontFacing) discard;
      fragColor=texture(uSigns,vUV); return;
   } else {
      fragColor=vec4(.25,.8,.55,1); return;
   }
   vec3 light=vec3(0);
   vec2 base=floor(p.xz/4.0)*4.0+2.;
   float ceiling=p.z>26.0 && p.x<18.0 ? 5.45 : 3.75;
   for(int x=-1;x<=1;x++) for(int z=-1;z<=1;z++) {
      vec3 delta=vec3(base+vec2(x,z)*4.0,ceiling).xzy-p;
      float d2=dot(delta,delta);
      light+=vec3(1.,.95,.79)*max(0.,dot(n,normalize(delta)))/ (1.+.22*d2)*.68;
   }
   float ao=.72+.28*smoothstep(0.,.7,p.y);
   if(n.y>.5) ao=.95;
   color*= (vec3(.19,.20,.17)+light)*ao;
   if(m>6.5 && m<7.5) color+=vec3(.018,.026,.021);
   float fog=1.-exp(-distance(uCamera,p)*.012);
   color=mix(color,vec3(.047,.057,.042),fog);
   fragColor=vec4(pow(color,vec3(1./2.2)),1);
}
