#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in float aMaterial;
layout(location=3) in vec2 aUV;
uniform vec3 uCamera;
uniform vec2 uLook;
uniform float uAspect;
uniform bool uReflect;
out vec3 vPosition;
out vec3 vNormal;
out float vMaterial;
out vec2 vUV;
out vec4 vClip;
void main() {
   vPosition = aPosition;
   vNormal = aNormal;
   vMaterial = aMaterial;
   vUV = aUV;
   vec3 p = aPosition;
   if (uReflect) p.y = -0.2 - p.y;
   vec3 q = p - uCamera;
   float yaw = uLook.x, pitch = uLook.y;
   vec3 forward = vec3(sin(yaw)*cos(pitch), sin(pitch), -cos(yaw)*cos(pitch));
   vec3 right = vec3(cos(yaw), 0, sin(yaw));
   vec3 up = cross(right, forward);
   float depth = dot(q, forward);
   vClip = vec4(dot(q, right) / (0.68*uAspect), dot(q, up) / 0.68, 1.001*depth - 0.10005, depth);
   gl_Position = vClip;
}
