// 2D layer above the 3D view: name tags, pixel-art bubbles, meme captions,
// the highlight arrow and the hover card. Drawn at full resolution in blocks of
// the 3D pixel size so it matches the chunky look.

const FONT = '"Jersey 10", monospace';
const PAL = {
  d: '#1B1420',
  w: '#FFFFFF',
  r: '#E8303A',
  g: '#2EBF55',
  y: '#F2C14E',
  p: '#EE8B9C',
  k: '#3A2A20',
  b: '#3A6FD0',
  c: '#8FD3F5',
  o: '#E8913A',
};

const ICONS = {
  '!': ['..r..', '..r..', '..r..', '.....', '..r..'],
  '?': ['.ddd.', 'd...d', '...d.', '.....', '..d..'],
  shell: ['g....', '.g...', 'g....', '.....', '..ggg'],
  write: ['...pk', '..yy.', '.yy..', 'yy...', 'k....'],
  read: ['.....', 'bb.bb', 'bwbwb', 'bwbwb', 'bbbbb'],
  web: ['.ccc.', 'cbcbc', 'ccccc', 'cbcbc', '.ccc.'],
  agent: ['y.y.y', 'yyyyy', 'yryry', 'yyyyy', '.....'],
  mcp: ['.d.d.', '.d.d.', 'ddddd', '.ddd.', '..d..'],
  other: ['.....', '.d.d.', '.....', 'd...d', '.ddd.'],
  think: ['.ddd.', 'd...d', '...d.', '.....', '..d..'],
  heart: ['.r.r.', 'rrrrr', 'rrrrr', '.rrr.', '..r..'],
  hungry: ['.....', 'bbb.b', 'bbbbb', 'bbb.b', '.....'],
  tired: ['ddd..', '..d..', '.d...', 'ddd..', '.....'],
  bored: ['.....', '.d.d.', '.....', '.ddd.', 'd...d'],
  hiss: ['r.r.r', '.rrr.', 'rr.rr', '.rrr.', 'r.r.r'],
  // Jealousy: a cracked heart. Winners get a crown.
  broken: ['.r.r.', 'rr.rr', 'r.rrr', '.rr..', '..r..'],
  crown: ['y.y.y', 'yyyyy', 'yryby', 'yyyyy', '.....'],
};
const NOTE = ['..dd', '..d.', '..d.', 'dd..', 'dd..'];
const ARROW = ['yyyyyyy', '.yyyyy.', '..yyy..', '...y...'];
const COIN = ['.ddd.', 'dyyyd', 'dyoyd', 'dyyyd', '.ddd.'];

function grid(ctx, rows, x, y, u, override) {
  rows.forEach((row, j) => {
    [...row].forEach((ch, i) => {
      if (ch === '.') return;
      ctx.fillStyle = override ?? PAL[ch];
      ctx.fillRect(Math.round(x + i * u), Math.round(y + j * u), Math.ceil(u), Math.ceil(u));
    });
  });
}

function bubble(ctx, icon, x, y, u) {
  // 9x8 speech bubble with a tail, icon centred inside.
  const left = x - 4.5 * u;
  const top = y - 9 * u;
  ctx.fillStyle = PAL.d;
  ctx.fillRect(left + u, top, 7 * u, 8 * u);
  ctx.fillRect(left, top + u, 9 * u, 6 * u);
  ctx.fillRect(x - u, top + 8 * u, 2 * u, u);
  ctx.fillStyle = PAL.w;
  ctx.fillRect(left + u, top + u, 7 * u, 6 * u);
  ctx.fillRect(x - u * 0.5 - u * 0.5, top + 7 * u, u, u);
  grid(ctx, ICONS[icon] ?? ICONS.other, left + 2 * u, top + 1.5 * u, u);
}

function outlinedText(ctx, text, x, y, size, fill = '#FFFFFF', weight = 400) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.28);
  ctx.strokeStyle = '#120E18';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

export function drawOverlay(ctx, world, project, t) {
  const u = world.pipeline.pixelSize;
  const nameSize = Math.max(16, Math.round(u * 7));
  const projectSize = Math.round(nameSize * 0.72);

  // Lay out name tags first: lower ones keep their place, higher ones that would
  // overlap move up so every name stays readable.
  const tags = [];
  for (const agent of world.allAgents()) {
    if (agent.appear < 0.3) continue;
    const head = project(agent.headPosition(world.tmp));
    if (!head) continue;
    const tag = { agent, x: Math.round(head.x), y: Math.round(head.y), w: 0, h: 0 };
    if (!agent.kitten) {
      ctx.font = `400 ${nameSize}px ${FONT}`;
      tag.w = ctx.measureText(agent.name).width + 8 * u;
      tag.h = nameSize + projectSize + u;
    }
    tags.push(tag);
  }
  const placed = [];
  for (const tag of [...tags].sort((a, b) => b.y - a.y)) {
    if (!tag.h) continue;
    for (let k = 0; k < 8; k++) {
      const hit = placed.find((p) => Math.abs(p.x - tag.x) < (p.w + tag.w) / 2 && Math.abs(p.y - tag.y) < (p.h + tag.h) / 2);
      if (!hit) break;
      tag.y = hit.y - (hit.h + tag.h) / 2 - u;
    }
    placed.push(tag);
  }

  for (const { agent, x, y: tagY } of tags) {
    let y = Math.round(tagY);

    // Name tag with the project underneath and a level badge (cats only)
    if (!agent.kitten) {
      const project = agent.session?.project;
      if (project) {
        outlinedText(ctx, project, x, y, projectSize, '#B9ADD6', 400);
        y -= projectSize;
      }
      outlinedText(ctx, agent.name, x, y, nameSize, agent.mode === 'alert' ? '#FF8A8A' : '#F2E6C9', 400);
      const level = agent.profile()?.level;
      if (level) {
        ctx.font = `400 ${nameSize}px ${FONT}`;
        const bx = Math.round(x + ctx.measureText(agent.name).width / 2 + 2 * u);
        const by = Math.round(y - nameSize * 0.72);
        const label = String(level);
        ctx.font = `400 ${Math.round(nameSize * 0.7)}px ${FONT}`;
        const bw = Math.max(nameSize * 0.6, ctx.measureText(label).width + 2 * u);
        ctx.fillStyle = PAL.d;
        ctx.fillRect(bx - u, by - u, bw + 2 * u, nameSize * 0.7 + 2 * u);
        ctx.fillStyle = PAL.y;
        ctx.fillRect(bx, by, bw, nameSize * 0.7);
        ctx.fillStyle = PAL.d;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + bw / 2, by + nameSize * 0.36);
      }
      y -= nameSize + u;
    }

    // Bubble
    const b = agent.bubble();
    if (b === 'z') {
      for (let k = 0; k < 3; k++) {
        const p = (t * 0.5 + k / 3 + agent.seed) % 1;
        const size = Math.round(nameSize * (0.6 + p * 0.6));
        ctx.globalAlpha = Math.sin(p * Math.PI);
        outlinedText(ctx, 'z', x + 8 * u * p, y - p * 12 * u, size, '#DCE6FF');
        ctx.globalAlpha = 1;
      }
    } else if (b === 'note') {
      for (let k = 0; k < 2; k++) {
        const p = (t * 0.6 + k / 2 + agent.seed) % 1;
        ctx.globalAlpha = Math.sin(p * Math.PI);
        grid(ctx, NOTE, x - 2 * u + Math.sin((p + k) * 6) * 4 * u, y - 4 * u - p * 14 * u, u, k ? '#FFB0D8' : '#F2E6C9');
        ctx.globalAlpha = 1;
      }
    } else if (b) {
      const icon = b.startsWith('tool:') ? b.slice(5) : b;
      const bob = b === '!' ? Math.round(Math.abs(Math.sin(t * 6)) * 2) * u : 0;
      if (!b.startsWith('tool:') || !agent.kitten) bubble(ctx, icon, x, y - bob, agent.kitten ? u * 0.8 : u);
      y -= 10 * u;
    }

    // Coins earned by working cats
    if (agent.coinPops?.length) {
      agent.coinPops = agent.coinPops.filter((t0) => t - t0 < 1.4);
      for (const t0 of agent.coinPops) {
        const age = (t - t0) / 1.4;
        ctx.globalAlpha = Math.min(1, (1 - age) * 2.5);
        const cy = y - 4 * u - age * 9 * u;
        grid(ctx, COIN, x - 9 * u, cy - 4 * u, u * 0.8);
        outlinedText(ctx, '+1', x + 2 * u, cy, Math.round(nameSize * 0.9), '#F2C14E');
        ctx.globalAlpha = 1;
      }
    }

    // Meme captions rising above the cat
    agent.captions = agent.captions.filter((c) => t - c.t0 < 2.2);
    for (const c of agent.captions) {
      const age = (t - c.t0) / 2.2;
      ctx.globalAlpha = Math.min(1, (1 - age) * 3);
      const pop = Math.min(1, age * 10);
      outlinedText(ctx, c.text, x + c.dx, y - 6 * u - age * 10 * u, Math.round(nameSize * (1.1 + 0.15 * pop)));
      ctx.globalAlpha = 1;
    }

    // Highlight from the side list
    if (world.highlight && (agent.id === world.highlight || agent.parent?.id === world.highlight) && !agent.kitten) {
      const bounce = Math.round(Math.abs(Math.sin(t * 5)) * 3) * u;
      grid(ctx, ARROW, x - 3.5 * u, y - 16 * u - bounce, u);
    }
  }

  // Hover card
  const hovered = world.hovered;
  if (hovered && !hovered.gone) {
    const head = project(hovered.headPosition(world.tmp));
    if (head) {
      const lines = hovered.kitten
        ? [hovered.session?.description || 'Kotě']
        : hovered.visitor
          ? [hovered.name, 'na návštěvě']
          : [`${hovered.name}, ${hovered.session?.project ?? ''}`];
      ctx.font = `400 ${nameSize}px ${FONT}`;
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 6 * u;
      const h = lines.length * (nameSize + u) + 3 * u;
      const bx = Math.round(Math.min(ctx.canvas.clientWidth - w - 8, Math.max(8, head.x + 12 * u)));
      const by = Math.round(Math.max(8, head.y - h - 4 * u));
      ctx.fillStyle = '#120E18';
      ctx.fillRect(bx - u, by - u, w + 2 * u, h + 2 * u);
      ctx.fillStyle = '#2B2236';
      ctx.fillRect(bx, by, w, h);
      ctx.fillStyle = '#F2C14E';
      ctx.fillRect(bx, by, w, u);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      lines.forEach((line, i) => {
        ctx.fillStyle = i ? '#C9BFE0' : '#F2E6C9';
        ctx.fillText(line, bx + 3 * u, by + 2 * u + i * (nameSize + u));
      });
    }
  }
}
