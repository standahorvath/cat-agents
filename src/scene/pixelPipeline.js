// Renders a scene at low resolution and upscales it with hard pixels. The final pass
// adds depth-based outlines, a limited colour depth with ordered dithering and a
// faint warm tint for the retro look.

import * as THREE from 'three';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 resolution;
  uniform float levels;
  uniform float edge;
  varying vec2 vUv;

  float bayer4(vec2 p) {
    int x = int(mod(p.x, 4.0));
    int y = int(mod(p.y, 4.0));
    int i = x + y * 4;
    float m[16];
    m[0] = 0.0;  m[1] = 8.0;  m[2] = 2.0;  m[3] = 10.0;
    m[4] = 12.0; m[5] = 4.0;  m[6] = 14.0; m[7] = 6.0;
    m[8] = 3.0;  m[9] = 11.0; m[10] = 1.0; m[11] = 9.0;
    m[12] = 15.0; m[13] = 7.0; m[14] = 13.0; m[15] = 5.0;
    for (int k = 0; k < 16; k++) if (k == i) return m[k] / 16.0;
    return 0.0;
  }

  vec3 toSRGB(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }

  void main() {
    vec2 texel = 1.0 / resolution;
    vec4 color = texture2D(tColor, vUv);
    float d = texture2D(tDepth, vUv).r;
    float dl = texture2D(tDepth, vUv - vec2(texel.x, 0.0)).r;
    float dr = texture2D(tDepth, vUv + vec2(texel.x, 0.0)).r;
    float du = texture2D(tDepth, vUv + vec2(0.0, texel.y)).r;
    float dd = texture2D(tDepth, vUv - vec2(0.0, texel.y)).r;
    float diff = max(max(dl - d, dr - d), max(du - d, dd - d));

    vec3 c = toSRGB(color.rgb);
    if (diff > edge && d < 0.999) c *= 0.42;

    // warm retro grade
    c = mix(c, c * vec3(1.06, 0.98, 0.9), 0.5);

    vec2 pixel = floor(vUv * resolution);
    float threshold = bayer4(pixel) - 0.5;
    c = floor(c * levels + threshold + 0.5) / levels;
    gl_FragColor = vec4(c, 1.0);
  }
`;

export class PixelPipeline {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    const depthTexture = new THREE.DepthTexture(1, 1);
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.HalfFloatType,
      depthTexture,
    });

    this.post = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: depthTexture },
        resolution: { value: new THREE.Vector2(1, 1) },
        levels: { value: 24 },
        edge: { value: 0.002 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.postScene = new THREE.Scene();
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post));
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.pixelSize = 3;
  }

  setSize(width, height, pixelSize, depthRange) {
    this.pixelSize = pixelSize;
    this.width = width;
    this.height = height;
    this.lowW = Math.max(1, Math.ceil(width / pixelSize));
    this.lowH = Math.max(1, Math.ceil(height / pixelSize));
    this.renderer.setSize(width, height, false);
    this.target.setSize(this.lowW, this.lowH);
    this.post.uniforms.resolution.value.set(this.lowW, this.lowH);
    // Outline when neighbouring depth jumps by roughly 0.12 world units.
    if (depthRange) this.post.uniforms.edge.value = 0.12 / depthRange;
  }

  render(scene, camera) {
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCamera);
  }

  dispose() {
    this.target.dispose();
    this.renderer.dispose();
  }
}
