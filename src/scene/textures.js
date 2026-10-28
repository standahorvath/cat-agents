// Tiny hand-painted pixel textures, sampled with nearest filtering.

import * as THREE from 'three';

function pixelTexture(w, h, paint, { repeat = [1, 1] } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  paint(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  return tex;
}

// Deterministic noise so the planks look the same on every reload.
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Floors, 16x16 pixels per tile in the look's pattern (see themes.js).
const FLOORS = {
  planks(ctx, f, r) {
    for (let row = 0; row < 4; row++) {
      ctx.fillStyle = f.tones[row];
      ctx.fillRect(0, row * 4, 16, 4);
      ctx.fillStyle = f.seam;
      ctx.fillRect(0, row * 4 + 3, 16, 1);
      const seam = Math.floor(r() * 16);
      ctx.fillRect(seam, row * 4, 1, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(Math.floor(r() * 14), row * 4 + 1, 2, 1);
    }
  },
  // Big concrete tiles, 2x2 per metre.
  tiles(ctx, f, r) {
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = f.tones[k];
      ctx.fillRect((k % 2) * 8, Math.floor(k / 2) * 8, 8, 8);
    }
    for (let k = 0; k < 10; k++) {
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      ctx.fillRect(Math.floor(r() * 16), Math.floor(r() * 16), 1, 1);
    }
    ctx.fillStyle = f.seam;
    ctx.fillRect(0, 7, 16, 1);
    ctx.fillRect(7, 0, 1, 16);
  },
  // Metal floor grating.
  grate(ctx, f) {
    ctx.fillStyle = f.tones[0];
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = f.seam;
    for (let k = 0; k < 16; k += 4) {
      ctx.fillRect(k, 0, 1, 16);
      ctx.fillRect(0, k, 16, 1);
    }
    ctx.fillStyle = f.tones[2];
    for (let k = 2; k < 16; k += 4) ctx.fillRect(k, k, 1, 1);
  },
  // Dark floor with a glowing grid.
  neon(ctx, f, r) {
    ctx.fillStyle = f.tones[0];
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = f.tones[3];
    for (let k = 0; k < 12; k++) ctx.fillRect(Math.floor(r() * 16), Math.floor(r() * 16), 1, 1);
    ctx.fillStyle = f.seam;
    ctx.fillRect(0, 0, 16, 1);
    ctx.fillRect(0, 0, 1, 16);
  },
  // Long bamboo strips with nodes.
  bamboo(ctx, f, r) {
    for (let col = 0; col < 4; col++) {
      ctx.fillStyle = f.tones[col];
      ctx.fillRect(col * 4, 0, 4, 16);
      ctx.fillStyle = f.seam;
      ctx.fillRect(col * 4 + 3, 0, 1, 16);
      ctx.fillRect(col * 4, Math.floor(r() * 14), 3, 1);
    }
  },
  // Tatami mats with dark borders.
  tatami(ctx, f) {
    ctx.fillStyle = f.tones[0];
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = f.tones[2];
    for (let y = 1; y < 16; y += 2) ctx.fillRect(1, y, 14, 1);
    ctx.fillStyle = f.seam;
    ctx.fillRect(0, 0, 16, 1);
    ctx.fillRect(0, 8, 16, 1);
    ctx.fillRect(0, 0, 1, 16);
  },
};

const CLASSIC_FLOOR = { pattern: 'planks', tones: ['#9A6A43', '#8E613D', '#A47249', '#936641'], seam: '#6E4729' };

export function floorTexture(w, d, floor = CLASSIC_FLOOR) {
  return pixelTexture(16, 16, (ctx) => (FLOORS[floor.pattern] ?? FLOORS.planks)(ctx, floor, rng(7)), { repeat: [w, d] });
}

// Wallpapers, 8x16 pixels per half metre of wall.
const WALLS = {
  stripes(ctx, c) {
    ctx.fillStyle = c.base;
    ctx.fillRect(0, 0, 8, 16);
    ctx.fillStyle = c.stripe;
    ctx.fillRect(0, 0, 3, 16);
    ctx.fillStyle = c.dot;
    ctx.fillRect(5, 3, 1, 1);
    ctx.fillRect(5, 11, 1, 1);
    ctx.fillStyle = c.accent;
    ctx.fillRect(4, 7, 3, 1);
  },
  // Smooth panels with thin joints.
  panels(ctx, c) {
    ctx.fillStyle = c.base;
    ctx.fillRect(0, 0, 8, 16);
    ctx.fillStyle = c.accent;
    ctx.fillRect(1, 1, 5, 6);
    ctx.fillStyle = c.stripe;
    ctx.fillRect(7, 0, 1, 16);
    ctx.fillRect(0, 9, 8, 1);
  },
  // Peeling, cracked plaster.
  cracks(ctx, c, r) {
    ctx.fillStyle = c.base;
    ctx.fillRect(0, 0, 8, 16);
    ctx.fillStyle = c.stripe;
    for (let k = 0; k < 4; k++) ctx.fillRect(Math.floor(r() * 6), Math.floor(r() * 14), 3, 2);
    ctx.fillStyle = c.accent;
    ctx.fillRect(Math.floor(r() * 5), Math.floor(r() * 12), 2, 3);
    ctx.fillStyle = c.dot;
    let x = Math.floor(r() * 8);
    for (let y = 2; y < 12; y++) {
      ctx.fillRect(x, y, 1, 1);
      if (r() < 0.4) x = Math.max(0, Math.min(7, x + (r() < 0.5 ? -1 : 1)));
    }
  },
  // Riveted metal plates.
  metal(ctx, c) {
    ctx.fillStyle = c.base;
    ctx.fillRect(0, 0, 8, 16);
    ctx.fillStyle = c.accent;
    ctx.fillRect(0, 0, 8, 1);
    ctx.fillStyle = c.stripe;
    ctx.fillRect(7, 0, 1, 16);
    ctx.fillRect(0, 15, 8, 1);
    ctx.fillStyle = c.dot;
    for (const [x, y] of [[1, 2], [5, 2], [1, 13], [5, 13]]) ctx.fillRect(x, y, 1, 1);
  },
  // Big tropical leaves and the odd flower.
  leaves(ctx, c, r) {
    ctx.fillStyle = c.base;
    ctx.fillRect(0, 0, 8, 16);
    for (let k = 0; k < 4; k++) {
      const x = Math.floor(r() * 6);
      const y = 1 + Math.floor(r() * 13);
      ctx.fillStyle = k % 2 ? c.stripe : c.dot;
      ctx.fillRect(x, y, 3, 1);
      ctx.fillRect(x + 1, y - 1, 1, 3);
    }
    ctx.fillStyle = c.accent;
    ctx.fillRect(Math.floor(r() * 7), Math.floor(r() * 15), 1, 1);
  },
  // Dark wall with a neon grid.
  grid(ctx, c) {
    ctx.fillStyle = c.base;
    ctx.fillRect(0, 0, 8, 16);
    ctx.fillStyle = c.stripe;
    ctx.fillRect(1, 1, 6, 6);
    ctx.fillStyle = c.dot;
    ctx.fillRect(0, 0, 1, 16);
    ctx.fillStyle = c.accent;
    ctx.fillRect(0, 8, 8, 1);
  },
  // Round logs stacked up.
  logs(ctx, c, r) {
    for (let row = 0; row < 4; row++) {
      ctx.fillStyle = c.base;
      ctx.fillRect(0, row * 4, 8, 4);
      ctx.fillStyle = c.accent;
      ctx.fillRect(0, row * 4, 8, 1);
      ctx.fillStyle = c.stripe;
      ctx.fillRect(0, row * 4 + 2, 8, 1);
      ctx.fillStyle = c.dot;
      ctx.fillRect(0, row * 4 + 3, 8, 1);
      ctx.fillRect(Math.floor(r() * 7), row * 4 + 1, 1, 1);
    }
  },
  // Paper screens in a wooden lattice.
  shoji(ctx, c) {
    ctx.fillStyle = c.base;
    ctx.fillRect(0, 0, 8, 16);
    ctx.fillStyle = c.dot;
    ctx.fillRect(1, 1, 3, 3);
    ctx.fillRect(5, 9, 2, 3);
    ctx.fillStyle = c.stripe;
    ctx.fillRect(0, 0, 1, 16);
    ctx.fillRect(4, 0, 1, 16);
    ctx.fillRect(0, 0, 8, 1);
    ctx.fillRect(0, 5, 8, 1);
    ctx.fillRect(0, 10, 8, 1);
  },
};

const CLASSIC_WALL = { pattern: 'stripes', base: '#D9B98A', stripe: '#CDA873', dot: '#B98B57', accent: '#E6CDA4' };

export function wallpaperTexture(len, h, wall = CLASSIC_WALL) {
  return pixelTexture(8, 16, (ctx) => (WALLS[wall.pattern] ?? WALLS.stripes)(ctx, wall, rng(13)), { repeat: [len * 2, h] });
}

export const WALL_PATTERNS = Object.keys(WALLS);
export const FLOOR_PATTERNS = Object.keys(FLOORS);

export function rugTexture() {
  return pixelTexture(32, 32, (ctx) => {
    ctx.fillStyle = '#B5502E';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#E39B3D';
    ctx.fillRect(2, 2, 28, 28);
    ctx.fillStyle = '#B5502E';
    ctx.fillRect(4, 4, 24, 24);
    ctx.fillStyle = '#F2D07A';
    for (let i = 0; i < 4; i++) ctx.fillRect(8 + i * 2, 8 + i * 2, 16 - i * 4, 16 - i * 4);
    ctx.fillStyle = '#7A2E22';
    ctx.fillRect(14, 14, 4, 4);
  });
}

// Scrolling screen contents, one texture per kind of work.
const SCREENS = {
  shell: { bg: '#0B1A0E', ink: ['#4CFF7A', '#2EBF55', '#A8FFBE'] },
  write: { bg: '#141A3A', ink: ['#F2F2F2', '#FF8FB1', '#8FD3FF', '#FFD86B'] },
  read: { bg: '#F2EBD8', ink: ['#5A4A3A', '#8A7A6A'] },
  web: { bg: '#F4F4F4', ink: ['#4A7BD8', '#E05A5A', '#7A7A7A', '#4CBF7A'] },
  agent: { bg: '#10261E', ink: ['#7FD8A6', '#F2F2F2'] },
  mcp: { bg: '#0E1B33', ink: ['#5E9CF0', '#BFD8FF'] },
  other: { bg: '#202020', ink: ['#D0D0D0', '#9A9A9A'] },
  think: { bg: '#05060F', ink: ['#FFFFFF', '#8888AA'] },
};

export function screenTexture(kind) {
  const spec = SCREENS[kind] ?? SCREENS.other;
  return pixelTexture(24, 48, (ctx) => {
    const r = rng(kind.length * 97);
    ctx.fillStyle = spec.bg;
    ctx.fillRect(0, 0, 24, 48);
    if (kind === 'think') {
      for (let i = 0; i < 18; i++) {
        ctx.fillStyle = spec.ink[i % 2];
        ctx.fillRect(Math.floor(r() * 24), Math.floor(r() * 48), 1, 1);
      }
      return;
    }
    if (kind === 'web') {
      for (let y = 1; y < 48; y += 8) {
        ctx.fillStyle = spec.ink[Math.floor(r() * 4)];
        ctx.fillRect(2, y, 8, 5);
        ctx.fillStyle = '#9A9A9A';
        ctx.fillRect(12, y + 1, 10, 1);
        ctx.fillRect(12, y + 3, 7, 1);
      }
      return;
    }
    for (let y = 1; y < 48; y += 2) {
      let x = 1 + Math.floor(r() * 3) * 2;
      while (x < 22 && r() > 0.18) {
        const len = 1 + Math.floor(r() * 5);
        ctx.fillStyle = spec.ink[Math.floor(r() * spec.ink.length)];
        ctx.fillRect(x, y, Math.min(len, 23 - x), 1);
        x += len + 1;
      }
    }
  });
}

export function arcadeTexture() {
  return pixelTexture(16, 32, (ctx) => {
    ctx.fillStyle = '#06061A';
    ctx.fillRect(0, 0, 16, 32);
    const r = rng(3);
    for (let y = 0; y < 32; y += 4) {
      ctx.fillStyle = ['#FF4FA3', '#4FE0FF', '#FFE14F'][y % 3];
      ctx.fillRect(Math.floor(r() * 12), y, 3, 2);
    }
    ctx.fillStyle = '#7CFF4F';
    ctx.fillRect(7, 28, 3, 2);
  });
}

export function textTexture(text, { color = '#FF5FA2', glow = '#FFC2DE', w = 64, h = 16 } = {}) {
  return pixelTexture(w, h, (ctx) => {
    ctx.clearRect(0, 0, w, h);
    ctx.font = `${h - 2}px "Jersey 10", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2 + 1);
    ctx.fillStyle = glow;
    ctx.fillText(text, w / 2, h / 2);
  });
}

export function posterTexture() {
  return pixelTexture(16, 20, (ctx) => {
    ctx.fillStyle = '#F2E6C9';
    ctx.fillRect(0, 0, 16, 20);
    ctx.fillStyle = '#6A8F3A';
    ctx.fillRect(2, 3, 12, 1);
    ctx.fillStyle = '#E8913A';
    ctx.fillRect(6, 4, 4, 2);
    ctx.fillRect(6, 6, 4, 5);
    ctx.fillStyle = '#2B2B33';
    ctx.fillRect(7, 7, 1, 1);
    ctx.fillRect(9, 7, 1, 1);
    ctx.fillStyle = '#B5502E';
    ctx.fillRect(2, 14, 12, 1);
    ctx.fillRect(3, 16, 10, 1);
  });
}

// A little platformer running on the retro TV.
export function tvGameTexture() {
  return pixelTexture(32, 24, (ctx) => {
    ctx.fillStyle = '#5C94FC';
    ctx.fillRect(0, 0, 32, 24);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(4, 4, 6, 2);
    ctx.fillRect(20, 6, 8, 2);
    ctx.fillStyle = '#C84C0C';
    ctx.fillRect(0, 19, 32, 5);
    ctx.fillStyle = '#00A800';
    ctx.fillRect(10, 15, 4, 4);
    ctx.fillRect(24, 13, 5, 6);
    ctx.fillStyle = '#E8913A';
    ctx.fillRect(16, 15, 3, 4);
    ctx.fillStyle = '#FCBC3C';
    ctx.fillRect(13, 9, 2, 2);
  });
}

// Weather on the window glass: rain streaks or snowflakes, scrolled over time.
export function weatherTexture(kind) {
  return pixelTexture(32, 32, (ctx) => {
    ctx.clearRect(0, 0, 32, 32);
    const r = rng(kind === 'snow' ? 11 : 5);
    if (kind === 'snow') {
      ctx.fillStyle = '#FFFFFF';
      for (let k = 0; k < 22; k++) ctx.fillRect(Math.floor(r() * 32), Math.floor(r() * 32), 1, 1);
      return;
    }
    ctx.fillStyle = 'rgba(200, 225, 255, 0.85)';
    for (let k = 0; k < 18; k++) {
      const x = Math.floor(r() * 32);
      const y = Math.floor(r() * 32);
      ctx.fillRect(x, y, 1, 3);
    }
  });
}

// Lawn for the garden: two greens with a few blades and flowers.
export function grassTexture(w, d) {
  return pixelTexture(
    16,
    16,
    (ctx) => {
      const r = rng(23);
      ctx.fillStyle = '#5E9B3E';
      ctx.fillRect(0, 0, 16, 16);
      for (let k = 0; k < 40; k++) {
        ctx.fillStyle = r() < 0.5 ? '#6FAE47' : '#4F8A35';
        ctx.fillRect(Math.floor(r() * 16), Math.floor(r() * 16), 1, 2);
      }
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = ['#F2E6C9', '#FFE14F', '#EE8B9C'][k];
        ctx.fillRect(Math.floor(r() * 16), Math.floor(r() * 16), 1, 1);
      }
    },
    { repeat: [w, d] },
  );
}

// Moon phase from the date: 0 new moon, 0.5 full moon.
export function moonPhase(date = new Date()) {
  const days = (date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86_400_000;
  return (((days / 29.530588853) % 1) + 1) % 1;
}

// Stars for the windows at night; one window also gets the moon in its real phase.
export function nightSkyTexture(seed, phase = null) {
  const tex = pixelTexture(34, 24, (ctx) => {
    ctx.clearRect(0, 0, 34, 24);
    const r = rng(seed);
    for (let k = 0; k < 14; k++) {
      ctx.fillStyle = r() < 0.25 ? '#FFE9A8' : '#FFFFFF';
      ctx.fillRect(Math.floor(r() * 34), Math.floor(r() * 24), 1, 1);
    }
    if (phase == null) return;
    const [mx, my, mr] = [24, 7, 4.5];
    ctx.fillStyle = '#F4EED8';
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    // The shadow slides off to the left while waxing and back from the right while waning.
    const dx = (phase < 0.5 ? -1 : 1) * (1 - Math.cos(phase * Math.PI * 2)) * mr;
    ctx.fillStyle = '#1B2350';
    ctx.beginPath();
    ctx.arc(mx + dx, my, mr + 0.3, 0, Math.PI * 2);
    ctx.fill();
  });
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
