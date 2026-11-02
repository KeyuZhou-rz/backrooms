#version 300 es
precision highp float;
in vec3 vPosition;
in vec3 vNormal;
in float vMaterial;
in vec2 vUV;
in vec4 vClip;
uniform vec3 uCamera;
uniform float uTime;
uniform sampler2D uReflection;
out vec4 fragColor;
float waves(vec2 p) { return .018*sin(p.x*3.1+uTime*1.1)+.012*sin(p.y*4.7-uTime*.8); }
vec3 waterNormal(vec2 p) {
   float e=.04;
   return normalize(vec3(-(waves(p+vec2(e,0))-waves(p-vec2(e,0)))/(2.*e),1.,
      -(waves(p+vec2(0,e))-waves(p-vec2(0,e)))/(2.*e)));
}
void main() {
   vec3 p=vPosition, n=waterNormal(p.xz), ray=normalize(p-uCamera);
   vec2 screen=vClip.xy/vClip.w*.5+.5;
   vec3 reflected=texture(uReflection,clamp(screen+n.xz*.025,vec2(.002),vec2(.998))).rgb;
   vec3 refracted=refract(ray,n,1./1.333);
   float travel=1.3/max(.12,-refracted.y);
   vec2 floorPoint=p.xz+refracted.xz*travel;
   vec2 edge=min(fract(floorPoint*2.),1.-fract(floorPoint*2.));
   float grout=1.-smoothstep(.02,.04,min(edge.x,edge.y));
   vec3 bottom=mix(vec3(.53,.72,.66),vec3(.19,.33,.29),grout);
   float pattern=sin(floorPoint.x*3.+sin(floorPoint.y*2.+uTime))+sin(floorPoint.y*3.2-uTime*.7);
   bottom+=.07*exp(-abs(pattern)*8.);
   vec3 transmission=exp(-vec3(.35,.075,.055)*travel);
   vec3 water=bottom*transmission+vec3(.035,.27,.25)*(1.-transmission);
   float fresnel=.02+.98*pow(1.-max(0.,dot(-ray,n)),5.);
   fragColor=vec4(mix(water,reflected,clamp(fresnel,.06,.96)),1);
}
