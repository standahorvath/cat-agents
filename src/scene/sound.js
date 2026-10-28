// Music and sound effects, all synthesised with Web Audio (no samples).
// Three modes: 'all' (music + sounds), 'sfx' (sounds only) and 'off' (default).
//
// The music is composed song by song in music.js; the jukebox picks the style.
// Between songs there is a short break, so it never turns into one loop.

import { MUSIC_STYLES, MusicPlayer, generateTrack } from './music.js';

export { MUSIC_STYLES, generateTrack };

const STORAGE_KEY = 'cat-agents-sound';
const STYLE_KEY = 'cat-agents-music-style';
export const SOUND_MODES = ['all', 'sfx', 'off'];

function loadStyle() {
  try {
    const saved = localStorage.getItem(STYLE_KEY);
    return MUSIC_STYLES[saved] ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

function loadMode() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'on') return 'all';
    return SOUND_MODES.includes(saved) ? saved : 'off';
  } catch {
    return 'off';
  }
}

// Notes are scheduled this far ahead, so a throttled background tab keeps playing.
const LOOKAHEAD = 1.2;
const MUSIC_LEVEL = 0.07;

export class Sound {
  constructor() {
    this.mode = loadMode();
    this.style = loadStyle();
    this.ctx = null;
    this.lastPlay = {};
    this.onTrack = null;
  }

  get enabled() {
    return this.mode !== 'off';
  }

  ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // The music bus is glued together by a gentle compressor, then turned
    // down well under the sound effects.
    this.music = this.ctx.createGain();
    const glue = this.ctx.createDynamicsCompressor();
    glue.threshold.value = -20;
    glue.ratio.value = 3;
    glue.attack.value = 0.01;
    glue.release.value = 0.25;
    const level = this.ctx.createGain();
    level.gain.value = MUSIC_LEVEL;
    this.music.connect(glue).connect(level).connect(this.master);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 0.7;
    this.sfx.connect(this.master);
    this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  // Browsers only allow audio after a click, so this runs from the button or a click.
  setMode(mode) {
    this.mode = mode;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // private mode: just don't remember
    }
    if (mode === 'off') {
      this.stopMusic();
      this.ctx?.suspend();
      return;
    }
    this.ensure();
    this.ctx?.resume();
    if (mode === 'all') this.startMusic();
    else this.stopMusic();
  }

  // Building blocks

  tone(freq, start, dur, { type = 'triangle', vol = 0.2, to = null, out = this.sfx, attack = 0.01 } = {}) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, start + dur);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(vol, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(out);
    osc.start(start);
    osc.stop(start + dur + 0.02);
    return osc;
  }

  noise(start, dur, { vol = 0.3, filter = 'bandpass', freq = 1000, q = 1, out = this.sfx } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(gain).connect(out);
    src.start(start, Math.random() * 0.5);
    src.stop(start + dur + 0.02);
    return gain;
  }

  // Effects

  play(name, { throttle = 0 } = {}) {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (throttle && now - (this.lastPlay[name] ?? -1) < throttle) return;
    this.lastPlay[name] = now;
    EFFECTS[name]?.(this, now);
  }

  // Music

  // The jukebox: a style for the coming songs; the new one starts right away.
  setStyle(style) {
    if (!MUSIC_STYLES[style]) return;
    this.style = style;
    try {
      localStorage.setItem(STYLE_KEY, style);
    } catch {
      // private mode: just don't remember
    }
    this.nextTrack();
  }

  nextTrack() {
    if (!this.timer || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.player.stop(now, 0.6);
    this.begin(now + 0.5);
  }

  startMusic() {
    if (this.timer || !this.ctx) return;
    this.player ??= new MusicPlayer(this.ctx, this.music, this.noiseBuffer);
    this.begin(this.ctx.currentTime + 0.2);
    this.timer = setInterval(() => this.schedule(), 100);
  }

  stopMusic() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.ctx) this.player?.stop(this.ctx.currentTime, 0.4);
  }

  begin(at) {
    const track = generateTrack(this.style);
    this.player.play(track, at);
    this.onTrack?.(track);
    this.schedule();
  }

  schedule() {
    const player = this.player;
    player.schedule(this.ctx.currentTime + LOOKAHEAD);
    if (player.finished) {
      // A short break between songs, then something new.
      const [g0, g1] = player.track.gap;
      this.begin(player.endTime + g0 + Math.random() * (g1 - g0));
    }
  }

  get nowPlaying() {
    return this.timer ? (this.player?.track ?? null) : null;
  }
}

export const EFFECT_NAMES = () => Object.keys(EFFECTS);

// Short, soft sounds; nothing melodic, so they don't fight with the music.
const EFFECTS = {
  meow(s, t) {
    const osc = s.tone(620, t, 0.5, { type: 'sawtooth', vol: 0.1 });
    osc.frequency.linearRampToValueAtTime(860, t + 0.18);
    osc.frequency.linearRampToValueAtTime(520, t + 0.5);
  },
  purr(s, t) {
    for (let k = 0; k < 14; k++) s.noise(t + k * 0.09, 0.08, { vol: 0.1, filter: 'lowpass', freq: 180 });
  },
  hiss(s, t) {
    s.noise(t, 0.6, { vol: 0.18, filter: 'highpass', freq: 3500 });
  },
  key(s, t) {
    s.noise(t, 0.02, { vol: 0.06, filter: 'highpass', freq: 2500 });
  },
  crackle(s, t) {
    s.noise(t, 0.03, { vol: 0.05, filter: 'bandpass', freq: 1200 + Math.random() * 1500, q: 4 });
  },
  coffee(s, t) {
    s.noise(t, 1.4, { vol: 0.1, filter: 'bandpass', freq: 700, q: 0.7 });
  },
  bleep(s, t) {
    s.tone(1200, t, 0.05, { type: 'sine', vol: 0.03 });
  },
  coin(s, t) {
    s.tone(2093, t, 0.18, { type: 'sine', vol: 0.05 });
  },
  cheer(s, t) {
    s.tone(700, t, 0.07, { type: 'sine', vol: 0.08, to: 1100 });
    s.tone(900, t + 0.09, 0.08, { type: 'sine', vol: 0.08, to: 1400 });
  },
  fail(s, t) {
    s.tone(170, t, 0.28, { type: 'sine', vol: 0.18, to: 90 });
    s.noise(t, 0.12, { vol: 0.08, filter: 'lowpass', freq: 300 });
  },
  shake(s, t) {
    for (let k = 0; k < 9; k++) s.noise(t + k * 0.08, 0.06, { vol: 0.09, filter: 'bandpass', freq: 900 + (k % 3) * 400, q: 1.5 });
  },
  vacuum(s, t) {
    s.noise(t, 1.2, { vol: 0.06, filter: 'bandpass', freq: 400, q: 0.6 });
    s.tone(140, t, 1.2, { type: 'sawtooth', vol: 0.02 });
  },
  squeak(s, t) {
    s.tone(2600, t, 0.07, { type: 'sine', vol: 0.05, to: 3400 });
    s.tone(2900, t + 0.09, 0.05, { type: 'sine', vol: 0.04, to: 3600 });
  },
  doorbell(s, t) {
    s.tone(988, t, 0.5, { type: 'sine', vol: 0.09 });
    s.tone(784, t + 0.35, 0.7, { type: 'sine', vol: 0.09 });
  },
  powerDown(s, t) {
    s.tone(220, t, 0.7, { type: 'sawtooth', vol: 0.06, to: 40 });
  },
  powerUp(s, t) {
    s.tone(60, t, 0.5, { type: 'sawtooth', vol: 0.05, to: 240 });
  },
  find(s, t) {
    [1319, 1568, 2093].forEach((f, k) => s.tone(f, t + k * 0.07, 0.25, { type: 'sine', vol: 0.05 }));
  },
  fanfare(s, t) {
    [1568, 2093].forEach((f, k) => s.tone(f, t + k * 0.09, 0.7, { type: 'sine', vol: 0.05 }));
  },
  // A cartoon jump (the cucumber).
  boing(s, t) {
    s.tone(180, t, 0.35, { type: 'square', vol: 0.05, to: 720 });
    s.tone(720, t + 0.3, 0.2, { type: 'sine', vol: 0.04, to: 300 });
  },
  // Referee: game on, goal, game over.
  whistle(s, t) {
    s.tone(2400, t, 0.12, { type: 'sine', vol: 0.05 });
    s.tone(2400, t + 0.16, 0.35, { type: 'sine', vol: 0.05, to: 2600 });
  },
  glitch(s, t) {
    for (let k = 0; k < 6; k++) s.tone(200 + Math.random() * 1600, t + k * 0.05, 0.04, { type: 'square', vol: 0.03 });
  },
  laugh(s, t) {
    for (let k = 0; k < 4; k++) s.tone(760 - k * 40, t + k * 0.13, 0.09, { type: 'triangle', vol: 0.05, to: 600 - k * 40 });
  },
  crash(s, t) {
    s.noise(t, 0.4, { vol: 0.14, filter: 'lowpass', freq: 900 });
    for (let k = 0; k < 4; k++) s.tone(1800 + Math.random() * 1500, t + 0.05 + k * 0.05, 0.05, { type: 'sine', vol: 0.03 });
  },
};
