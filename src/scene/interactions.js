// Things cats do together. A "pair" interaction pulls both cats out of what they
// were doing; a "visit" only moves cat A while cat B carries on (working, or being
// a kitten). The world starts interactions, waits until everyone has arrived,
// plays the script and then lets the cats go back to their own business.
//
// Each spec:
//   kind     'pair' | 'visit'
//   weight   how often it is picked
//   who(b)   extra condition on cat B (A is always an idle, awake cat)
//   place    (world, ix) -> { a: target, b: target } or null; targets are
//            { x, z, lift?, heading? ('camera' or radians) }
//   pose     { a, b }: pose name or (ix, e) -> name, e = seconds since start
//   script   [[seconds, role, lines]]; lines may be a function of ix
//   bubble   { a, b }: bubble kind or (ix, e) -> kind
//   tick     (ix, t, dt, world) for interactions that move around
//   dur      [min, max] seconds
//   rel      'friend' | 'rival': only between cats who get along (or don't)
//   delta    (ix, world) -> relation change, overrides RELATION_DELTA
//   stat     counter(s) for the achievements, or (ix) -> list
//   game     counts as a game played; `ix.winner` gets a win
//   finish   (ix, world) after the cats are let go

import { pick, rnd } from './activities.js';
import { FRIENDS, RIVALS } from '../../shared/cats.js';

const PI = Math.PI;

function meeting(world, a, b, dist) {
  const nav = world.office.nav;
  const [ci, cj] = nav.nearestFree(...nav.tileOf((a.pos.x + b.pos.x) / 2, (a.pos.z + b.pos.z) / 2));
  const c = { x: ci + 0.5, z: cj + 0.5 };
  const dirs = [
    [1, 0],
    [0, 1],
    [Math.SQRT1_2, Math.SQRT1_2],
    [Math.SQRT1_2, -Math.SQRT1_2],
  ].sort(() => Math.random() - 0.5);
  for (const [dx, dz] of dirs) {
    const pa = { x: c.x - (dx * dist) / 2, z: c.z - (dz * dist) / 2 };
    const pb = { x: c.x + (dx * dist) / 2, z: c.z + (dz * dist) / 2 };
    if (nav.free(...nav.tileOf(pa.x, pa.z)) && nav.free(...nav.tileOf(pb.x, pb.z))) return { a: pa, b: pb };
  }
  return { a: { x: c.x - dist / 2, z: c.z }, b: { x: c.x + dist / 2, z: c.z } };
}

// Two free spots of one kind, one for each cat.
function twoSpots(world, ix, kind) {
  const office = world.office;
  const sa = office.reserve(kind, ix.a);
  const sb = sa && office.reserve(kind, ix.b, { near: sa });
  if (!sa || !sb) {
    office.release(sa, ix.a);
    return null;
  }
  ix.spots.push([sa, ix.a], [sb, ix.b]);
  return { a: sa, b: sb };
}

// A point next to cat B, on A's side.
function besideB(ix, dist = 0.55) {
  const { a, b } = ix;
  const dx = a.pos.x - b.pos.x;
  const dz = a.pos.z - b.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: b.pos.x + (dx / len) * dist, z: b.pos.z + (dz / len) * dist };
}

const otherCat = (ix, world) => {
  const others = [...world.cats.values()].filter((c) => c !== ix.a && c !== ix.b);
  return others.length ? pick(others) : { name: 'Šéf', g: (m) => m };
};

const idleAwake = (b) => b.isInterruptible();
const working = (b) => b.mode?.startsWith('work') && b.act?.phase === 'do' && b.act.def.spot === 'desk';
const alternate = (first, second, period = 1.5) => (ix, e) => (Math.floor(e / period) % 2 === 0 ? first : second);
const asleep = (b) => !b.kitten && !b.visitor && !b.ix && b.mode === 'idle' && b.act?.def.sleep && b.act.phase === 'do' && b.act.elapsed > 6;
const face = (cat, p) => Math.atan2(p.x - cat.pos.x, p.z - cat.pos.z);
const friendly = (ix, w) => w.relation(ix.a, ix.b) >= FRIENDS;
const once = (ix, key, fn) => {
  if (ix.state[key]) return;
  ix.state[key] = true;
  fn();
};
const later = (cat, text, ms, partner) => setTimeout(() => !cat.gone && cat.caption(text, partner), ms);

// Insults for the rap battle between rivals.
const INSULTS = [
  'tvůj kód nemá ani README', 'máš víc bugů než fousů', 'tvůj PR visí od Vánoc', 'tvoje commity jsou fix, fix, fix',
  'testuješ v produkci', 'píšeš CSS s !important', 'tvůj oblíbený jazyk je PowerPoint', 'tvůj regex nikdo nepřečte',
  'máš 40 tabů a všechny jsou Stack Overflow', 'pořád používáš var', 'tvoje proměnné se jmenují a, b, c', 'tvoje srst je legacy',
  'mňoukáš falešně', 'spíš víc, než kompiluješ', 'tvůj deploy trvá déle než moje siesta', 'tvoje code review je jen LGTM',
  'máš merge konflikt sám se sebou', 'tvoje klubíčko je zamotané', 'jsi pomalejší než npm install', 'tvoje granule jsou ze slevy',
  'tvůj ocas je deprecated', 'tvoje dokumentace je jen TODO', 'formátuješ kód ručně', 'tvůj build je červenější než tvoje uši',
];

// Longer chats: lines alternate between A and B. [m|f] is the speaker, <m|f> the other cat.
export const CONVERSATIONS = {
  neutral: [
    ['víš, proč programátoři nemají rádi přírodu?', 'proč?', 'má moc bugů', '…jdu pryč'],
    ['kolik koček je potřeba na výměnu žárovky?', 'kolik?', 'žádná. kočky ji jen shodí ze stolu'],
    ['co děláš?', 'nic', 'a kdy budeš <hotový|hotová>?', 'to záleží, kdy začnu'],
    ['myslíš, že nás šéf vidí?', 'šéf je obrazovka', '…to dává smysl', 'zamávej mu'],
    ['mám nový nápad', 'zase?', 'kočičí blockchain', 'jdu spát'],
    ['proč je ten kód tak pomalý?', 'protože jsi ho <psal|psala> ty', 'touché'],
    ['kolik je hodin?', 'čas na svačinu', 'vždyť jsme jedli před hodinou', 'to bylo před hodinou'],
    ['[slyšel|slyšela] jsi o tom novém frameworku?', 'kterém? vychází jeden denně', 'tom zítřejším', 'ten už je zastaralý'],
    ['tohle je nejlepší krabice v kanceláři', 'to je krabice od pizzy', 'a?'],
    ['víš, co je rekurze?', 'ne', 'víš, co je rekurze?', '…aha'],
    ['mám 99 problémů', 'a bug je jeden z nich?', 'všech 99 jsou bugy'],
    ['proč kočky milují počítače?', 'protože hřejou?', 'protože mají myš'],
    ['jak to jde s projektem?', 'hotovo na 90 %', 'a zbytek?', 'dalších 90 %'],
    ['co je to cloud?', 'cizí počítač', 'a kde je?', 'někde, kde neprší'],
    ['proč máš na klávesnici chlupy?', 'to není chlup, to je feature', 'aha'],
  ],
  friend: [
    ['pamatuješ ten páteční deploy?', 'nemluv o tom', 'HAHAHA', 'HAHAHA'],
    ['jsi <můj nejlepší kamarád|moje nejlepší kamarádka>', 'ty taky', 'dáme si spolu tuňáka?', 'vždycky'],
    ['pomůžeš mi s bugem?', 'jasně, kde je?', 'všude', 'tak začneme kafem'],
    ['mám pro tebe tajemství', 'povídej', '[schoval|schovala] jsem granule pod gauč', 'to je geniální'],
    ['kdo je nejlepší tým?', 'my!', 'a kdo je nejhorší?', 'testy'],
    ['jsi jako dobrý kód', 'čitelný?', 'ne, bez chyb', 'prrr'],
    ['co budeme dělat o víkendu?', 'spát', 'a pak?', 'spát podruhé'],
    ['víš, že tě mám [rád|ráda]?', 'vím', 'a víš, že mi dlužíš rybičku?', 'to jsem [nevěděl|nevěděla]'],
    ['dneska jsi nějak <unavený|unavená>', 'noční deploy', 'příště tě kryju', 'díky, parťáku'],
    ['dáme pair programming?', 'ty píšeš, já mňoukám', 'jako vždycky', 'tým snů'],
    ['zase jsi mi <schoval|schovala> myšku?', 'možná', 'jsi nejlepší', 'já vím'],
  ],
  rival: [
    ['tvůj kód je špagety', 'aspoň nějaký kód mám', 'co tím myslíš?', 'že tvůj PR visí od pondělí'],
    ['zase jsi mi <vzal|vzala> místo', 'nevidím tam tvoje jméno', 'je tam můj chlup', 'tak si ho vezmi'],
    ['mezery jsou lepší než tabulátory', 'nejsou', 'jsou', 'NEJSOU!'],
    ['kdo rozbil build?', 'ty', 'ne, ty', 'git blame říká, že ty'],
    ['ty jsi <vypil|vypila> moje mlíko', 'dokaž to', 'máš ho na fousech', '…to je pěna'],
    ['[slyšel|slyšela] jsem, že ti padají testy', 'aspoň nějaké mám', 'au', 'chceš led?'],
    ['proč na mě zíráš?', 'nezírám', 'zíráš', 'teď už jo'],
    ['tvoje srst je dneska nějaká… zvláštní', 'tvoje taky', 'moje aspoň stála peníze', 'hsss'],
    ['šéf má radši mě', 'šéf je program', 'a ten program mě má radši', 'uvidíme na review'],
    ['můžeš mňoukat potichu?', 'nemůžu', 'tak mňoukej jinde', 'tohle je i moje kancelář'],
    ['tvoje commit message je jen fix', 'a tvoje asdf', 'aspoň je stručná'],
  ],
};

// Personalities like some interactions more than others (weight multipliers).
export const TRAIT_TASTE = {
  calm: { cuddleNap: 2, sunTogether: 2, yogaTogether: 2, chat: 1.5, makeUp: 2 },
  grumpy: { hissStandoff: 2, blameGame: 2, codeReview: 2, stealSpot: 2, passiveNote: 3, boop: 0.5 },
  gossip: { gossip: 3, whisperSecret: 3, chat: 2 },
  gamer: { chess: 2.5, tictactoe: 2, cards: 2, tvDuo: 2, arcadeDuel: 2, foosball: 2, raceToBowl: 2 },
  cuddly: { boop: 2, headRub: 2, groomFriend: 2, tailWrap: 2, cuddleNap: 2, makeUp: 3, wakeUp: 0.5 },
  prankster: { tunnelAmbush: 3, wakeUp: 3, tailPull: 3, stealFood: 2, knockRivalCup: 2, sabotage: 2 },
  diva: { selfie: 3, danceParty: 2, syncDance: 2, insultBattle: 2, stealSpot: 1.5 },
  nerd: { pairProgramming: 3, chess: 3, codeReview: 2, tictactoe: 1.5, whisperSecret: 0.5 },
};

const handshake = (ix, e) => (e < 0.8 ? 'sit' : e < 1.6 ? 'highFive' : e < 2.4 ? 'pawPat' : e < 3.4 ? 'boop' : e < 4.6 ? 'spin' : 'cheer');
const hunt = (ix, e) => (e < 5.5 ? 'crouch' : e < 7 ? 'bat' : 'cheer');
const sync = (ix, e) => ['vibe', 'crab', 'cheer', 'spin'][Math.floor(e / 2.5) % 4];

// A board or card game on the floor between two cats: moves, a winner, and now
// and then a sore loser who flips the whole thing.
function boardGame(prop, { moves, win, lose, tie, tieChance = 0.1, stat = null }) {
  return {
    kind: 'pair',
    weight: 1.5,
    game: true,
    dur: [12, 16],
    place(w, ix) {
      const m = meeting(w, ix.a, ix.b, 1.15);
      ix.state.mid = { x: (m.a.x + m.b.x) / 2, z: (m.a.z + m.b.z) / 2, rot: Math.atan2(m.b.x - m.a.x, m.b.z - m.a.z) };
      return m;
    },
    start(ix, w) {
      const { mid } = ix.state;
      ix.state.prop = w.office.spawnProp(prop, mid.x, mid.z, { rot: mid.rot });
      // Gamers win more often.
      const edge = (cat) => (cat.trait === 'gamer' ? 0.2 : cat.trait === 'nerd' && prop === 'chess' ? 0.15 : 0);
      const chanceA = 0.5 + edge(ix.a) - edge(ix.b);
      ix.state.result = Math.random() < tieChance ? 'tie' : Math.random() < chanceA ? 'a' : 'b';
      ix.state.nextMove = 0.4;
      ix.state.turn = 0;
    },
    pose: {
      a: (ix, e) => gamePose(ix, 'a', e),
      b: (ix, e) => gamePose(ix, 'b', e),
    },
    bubble: {
      a: (ix) => (ix.state.flipper === 'a' ? 'hiss' : ix.state.over && ix.state.result === 'a' ? 'crown' : null),
      b: (ix) => (ix.state.flipper === 'b' ? 'hiss' : ix.state.over && ix.state.result === 'b' ? 'crown' : null),
    },
    tick(ix, t, dt, w) {
      const e = ix.elapsed;
      const end = ix.until - ix.started - 3.5;
      if (!ix.state.over && e > ix.state.nextMove && e < end) {
        ix.state.nextMove = e + rnd(1.5, 2.2);
        const who = ix.state.turn++ % 2 ? ix.b : ix.a;
        if (Math.random() < 0.7) who.caption(pick(moves));
        w.sound.play('bleep', { throttle: 0.5 });
      }
      if (!ix.state.over && e >= end) {
        ix.state.over = true;
        const r = ix.state.result;
        if (r === 'tie') {
          ix.a.caption(pick(tie));
          later(ix.b, pick(['tak nerozhodně', 'odveta?', 'remíza, no']), 1000, ix.a);
          return;
        }
        const winner = ix[r];
        const loserRole = r === 'a' ? 'b' : 'a';
        const loser = ix[loserRole];
        ix.winner = winner;
        winner.caption(pick(win));
        w.sound.play('cheer');
        // Rivals and sore gamers sometimes flip the board.
        const sore = w.relation(ix.a, ix.b) <= RIVALS || loser.trait === 'gamer' || loser.trait === 'grumpy';
        if (sore && Math.random() < 0.4) {
          ix.state.flipper = loserRole;
          ix.state.flipAt = t + 0.9;
          later(loser, pick(['PŘEVRACÍM STŮL!', 'TOHLE NEHRAJU!', 'hra je rozbitá!', 'podvod!']), 800);
        } else later(loser, pick(lose), 1100, winner);
      }
      // The flipped board flies up and lands upside down.
      const prop = ix.state.prop;
      if (ix.state.flipAt && t > ix.state.flipAt) {
        const k = t - ix.state.flipAt;
        if (!ix.state.flipped) {
          ix.state.flipped = true;
          w.sound.play('crash');
          for (let n = 0; n < 12; n++) w.office.spawnParticle('dust', prop.position.x, 0.1, prop.position.z);
        }
        if (k < 0.7) {
          prop.position.y = Math.sin((k / 0.7) * Math.PI) * 0.6;
          prop.rotation.x = (k / 0.7) * Math.PI;
        } else {
          prop.position.y = 0.03;
          prop.rotation.x = Math.PI;
        }
      }
    },
    finish(ix, w) {
      w.office.removeMesh(ix.state.prop);
    },
    stat: (ix) => [ix.state.flipped && 'tableFlips', stat && ix.winner && stat],
    delta(ix, w) {
      const r = w.relation(ix.a, ix.b);
      if (ix.state.flipped) return -8;
      if (r >= FRIENDS) return 2;
      if (r <= RIVALS) return -4;
      return ix.state.result === 'tie' ? 1 : 0;
    },
  };
}

function gamePose(ix, role, e) {
  const st = ix.state;
  if (st.flipper === role) return e - (st.flipAt - ix.started) < 1.5 ? 'wrestle' : 'hiss';
  if (st.over) return st.result === 'tie' ? 'sit' : st.result === role ? 'cheer' : st.flipper ? 'startle' : 'facepalm';
  // Whose turn it is thinks, the other one moves a piece.
  return (st.turn % 2 === 0) === (role === 'a') ? 'pawPat' : 'think';
}

export const INTERACTIONS = {
  boop: {
    sound: 'purr',
    kind: 'pair',
    weight: 3,
    dur: [3, 4.5],
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.5),
    pose: { a: 'boop', b: 'boop' },
    bubble: { a: 'heart', b: 'heart' },
    script: [
      [0.5, 'a', ['boop!', 'ťuk čumáčkem', 'pip!']],
      [1.6, 'b', ['bííp', 'hihi', 'boop zpátky!', 'studený čumák!']],
    ],
  },

  groomFriend: {
    sound: 'purr',
    kind: 'pair',
    weight: 2,
    dur: [6, 9],
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.5),
    pose: { a: 'groom', b: 'purr' },
    bubble: { b: 'heart' },
    script: [
      [0.6, 'a', ['olíznu ti ouško', 'máš tam smítko', 'drž, učešu tě', 'jsi <celý rozcuchaný|celá rozcuchaná>']],
      [2.5, 'b', ['prrr', 'to je příjemné', 'ještě za uchem', 'tam ne, to lechtá']],
    ],
  },

  chase: {
    kind: 'pair',
    weight: 2,
    dur: [6, 9],
    gait: 'run',
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.9),
    pose: { a: 'crouch', b: 'crouch' },
    script: [
      [0.2, 'b', ['chyť mě!', 'nechytíš!']],
      [4.5, 'a', ['mám tě!', 'už tě skoro mám']],
      [6, 'b', ['teď honíš ty!', 'uf, už nemůžu']],
    ],
    tick(ix, t) {
      const { a, b } = ix;
      if (!b.moving) {
        const p = b.randomPoint();
        b.goTo(p.x, p.z, { run: true });
      }
      if (t > (ix.state.repath ?? 0)) {
        ix.state.repath = t + 0.35;
        a.goTo(b.pos.x, b.pos.z, { run: true });
      }
    },
  },

  wrestle: {
    kind: 'pair',
    weight: 2,
    dur: [4, 6],
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.45),
    pose: { a: alternate('wrestle', 'crouch', 1.2), b: alternate('crouch', 'wrestle', 1.2) },
    bubble: { a: 'hiss' },
    script: [
      [0.3, 'a', ['pac pac!', 'souboj!', 'jen tak z legrace']],
      [1.5, 'b', ['hssss!', 'to si vypiješ', 'au, drápky!']],
      [3.5, 'b', ['vzdávám se!', 'remíza?', 'odveta zítra']],
    ],
  },

  // A real cartoon brawl: face-off, a spinning dust cloud full of PAC! and BUM!,
  // then the loser runs off.
  fight: {
    kind: 'pair',
    weight: 1.5,
    dur: [9, 9],
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.7),
    start(ix) {
      ix.state.loser = Math.random() < 0.5 ? 'a' : 'b';
      ix.state.center = { x: (ix.a.pos.x + ix.b.pos.x) / 2, z: (ix.a.pos.z + ix.b.pos.z) / 2 };
    },
    pose: {
      a: (ix, e) => (e < 1.4 ? 'hiss' : e < 5.5 ? 'wrestle' : ix.state.loser === 'a' ? 'stand' : 'groom'),
      b: (ix, e) => (e < 1.4 ? 'hiss' : e < 5.5 ? 'wrestle' : ix.state.loser === 'b' ? 'stand' : 'groom'),
    },
    heading: {
      a: (ix, e) => (e >= 1.4 && e < 5.5 ? ix.state.spin : null),
      b: (ix, e) => (e >= 1.4 && e < 5.5 ? ix.state.spin + PI : null),
    },
    bubble: { a: (ix, e) => (e < 1.4 ? 'hiss' : null), b: (ix, e) => (e < 1.4 ? 'hiss' : null) },
    script: [
      [0.2, 'a', ['co čumíš?', 'to je můj pelíšek!', 'tys mi <snědl|snědla> granule!', 'to bylo moje klubíčko!']],
      [0.9, 'b', ['hssss!', 'pojď na mě!', 'tak to ne!', 'chceš to schytat?']],
    ],
    tick(ix, t, dt, w) {
      const e = ix.elapsed;
      const c = ix.state.center;
      if (e >= 1.4 && !ix.state.hissed) {
        ix.state.hissed = true;
        w.sound.play('hiss');
      }
      if (e >= 1.4 && e < 5.5) {
        // Both cats tumble around one spot inside a cloud of dust.
        ix.state.spin = (ix.state.spin ?? 0) + dt * 14;
        const r = 0.12;
        ix.a.pos.set(c.x + Math.cos(ix.state.spin) * r, 0, c.z + Math.sin(ix.state.spin) * r);
        ix.b.pos.set(c.x - Math.cos(ix.state.spin) * r, 0, c.z - Math.sin(ix.state.spin) * r);
        for (let k = 0; k < 3; k++) if (Math.random() < dt * 30) w.office.spawnParticle('dust', c.x + rnd(-0.3, 0.3), rnd(0.05, 0.55), c.z + rnd(-0.3, 0.3));
        if (Math.random() < dt * 6) w.office.spawnParticle('spark', c.x, 0.4, c.z);
        if (t > (ix.state.nextWord ?? 0)) {
          ix.state.nextWord = t + 0.55;
          const who = (ix.state.words = (ix.state.words ?? 0) + 1) % 2 ? ix.a : ix.b;
          who.caption(pick(['pac!', 'bum!', 'mňau!', 'hsss!', 'au!', 'prásk!', 'kchh!', 'drápy!']));
        }
      } else if (e >= 5.5 && !ix.state.ended) {
        ix.state.ended = true;
        const loser = ix.state.loser === 'a' ? ix.a : ix.b;
        const winner = ix.state.loser === 'a' ? ix.b : ix.a;
        loser.caption(pick(['to si ještě vyřídíme!', 'mamííí!', 'já jen [zakopl|zakopla]', 'příště tě dostanu']));
        setTimeout(() => winner.caption(pick(['a je to!', 'kdo je tady šéf?', 'ani chlup mi <nezkřivil|nezkřivila>', 'vítězství!'])), 900);
        const p = loser.randomPoint();
        loser.goTo(p.x, p.z, { run: true });
      }
    },
  },

  cuddleNap: {
    sound: 'purr',
    kind: 'pair',
    weight: 2,
    dur: [25, 50],
    place(w, ix) {
      const kinds = ['fire', 'couch'].filter((k) => w.office.has(k));
      return kinds.length ? twoSpots(w, ix, pick(kinds)) : null;
    },
    pose: { a: (ix, e) => (e < 2.5 ? 'knead' : 'sleepCurl'), b: (ix, e) => (e < 2.5 ? 'knead' : 'sleepCurl') },
    bubble: { a: (ix, e) => (e > 2.5 ? 'z' : 'heart'), b: (ix, e) => (e > 2.5 ? 'z' : 'heart') },
    script: [
      [0.3, 'a', ['přitulíme se?', 'je mi zima', 'udělej mi místo']],
      [1.4, 'b', ['jo, pojď', 'jen neříkej ostatním', 'ale nekopej']],
      [12, 'a', ['zzz…', 'chrrr']],
    ],
  },

  gossip: {
    kind: 'pair',
    weight: 3,
    dur: [7, 10],
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.65),
    pose: { a: alternate('meow', 'sit'), b: alternate('sit', 'meow') },
    script: [
      [0.3, 'a', ['slyšelas to?', 'víš, co se stalo?']],
      [1.8, 'b', ['neříkej!', 'povídej!']],
      [3.3, 'a', [
        (ix) => `${ix.other.name} zase spí na klávesnici`,
        (ix) => `${ix.other.name} prý ${ix.other.g('shodil', 'shodila')} hrnek`,
        (ix) => `${ix.other.name} ${ix.other.g('mňoukal', 'mňoukala')} ze spaní`,
        (ix) => `${ix.other.name} ${ix.other.g('pushnul', 'pushnula')} do mainu`,
        () => 'granule jsou prý dražší',
        () => 'prý budou nové pelíšky',
        () => 'šéf koupil novou krabici',
      ]],
      [4.8, 'b', ['fakt?!', 'to je skandál', 'já to [věděl|věděla]', 'neříkej, že jo!', 'to je drb roku']],
      [6.3, 'a', ['ale nikomu ani mňau', 'víc nevím', 'ode mě to nemáš']],
    ],
  },

  stareContest: {
    kind: 'pair',
    weight: 1,
    dur: [6, 7],
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.75),
    start(ix) {
      ix.state.loser = Math.random() < 0.5 ? 'a' : 'b';
      ix.state.blinkAt = rnd(2.5, 4.5);
    },
    pose: {
      a: (ix, e) => (ix.state.loser === 'a' && e > ix.state.blinkAt ? 'purr' : 'stare'),
      b: (ix, e) => (ix.state.loser === 'b' && e > ix.state.blinkAt ? 'purr' : 'stare'),
    },
    script: [[0.3, 'a', ['kdo dřív mrkne', 'souboj pohledů', 'nemrkat!']]],
    tick(ix) {
      if (!ix.state.said && ix.elapsed > ix.state.blinkAt + 0.3) {
        ix.state.said = true;
        const winner = ix.state.loser === 'a' ? ix.b : ix.a;
        const loser = ix.state.loser === 'a' ? ix.a : ix.b;
        winner.caption(pick(['<mrkl|mrkla> jsi!', '[vyhrál|vyhrála] jsem!']));
        setTimeout(() => loser.caption(pick(['to se nepočítá', 'oko mi slzelo'])), 1100);
      }
    },
  },

  sniff: {
    kind: 'pair',
    weight: 2,
    dur: [4, 5],
    place(w, ix) {
      const m = meeting(w, ix.a, ix.b, 0.45);
      // B looks away from A, so A sniffs from behind
      m.b.heading = Math.atan2(m.b.x - m.a.x, m.b.z - m.a.z);
      return m;
    },
    pose: { a: 'sniff', b: (ix, e) => (e > 2.5 ? 'hiss' : 'sit') },
    script: [
      [0.8, 'a', ['hmm, tuňák?', 'čuch čuch', 'kde jsi <byl|byla>?', 'voníš jako kafe']],
      [2.6, 'b', ['hej!', 'osobní prostor!', 'nečuchej!']],
    ],
  },

  headRub: {
    sound: 'purr',
    kind: 'pair',
    weight: 2,
    dur: [4, 6],
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.42),
    pose: { a: 'headRub', b: 'purr' },
    bubble: { a: 'heart', b: 'heart' },
    script: [
      [0.4, 'a', ['mazlíme', 'mám tě [rád|ráda]', 'ťuk hlavičkou']],
      [1.8, 'b', ['prrr', 'ty jsi ale mazel', 'ještě']],
    ],
  },

  danceParty: {
    kind: 'pair',
    weight: 2,
    dur: [12, 20],
    place: (w, ix) => twoSpots(w, ix, 'vibe'),
    start(ix) {
      ix.a.isVibing = true;
      ix.b.isVibing = true;
    },
    pose: { a: 'vibe', b: 'vibe' },
    bubble: { a: 'note', b: 'note' },
    script: [
      [0.4, 'a', ['párty!', 'pusť to nahlas', 'disko!']],
      [2, 'b', ['tohle je hit', 'tanec!', 'umíš moonwalk?']],
      [8, 'a', ['ještě jednu', 'bum bum', 'kočičí disko!']],
    ],
  },

  coffeeBreak: {
    kind: 'pair',
    weight: 2,
    dur: [12, 16],
    place(w, ix) {
      const spots = twoSpots(w, ix, 'coffee');
      return spots && { a: { ...spots.a, heading: undefined }, b: { ...spots.b, heading: undefined } };
    },
    pose: { a: (ix, e) => (e < 3 ? 'coffeeMake' : 'mug'), b: (ix, e) => (e < 3 ? 'coffeeMake' : 'mug') },
    heading: { a: (ix, e) => (e < 3 ? PI : null), b: (ix, e) => (e < 3 ? PI : null) },
    script: [
      [0.3, 'a', ['dáme kafe?', 'pauza na kafe']],
      [1.5, 'b', ['jasně', 'bez kafe nejsem [kocour|kočka]']],
      [4.5, 'a', ['jak to jde s projektem?', 'co děláš?', 'stíháš deadline?']],
      [6.5, 'b', ['ani se neptej', 'refaktoruju legacy', 'čekám na schválení', 'ladím testy', 'píšu dokumentaci']],
      [9, 'a', ['to znám', 'hlavně v klidu', 'to dáš']],
    ],
    tick(ix, t, dt, w) {
      if (ix.elapsed < 3 && Math.random() < dt * 8) {
        const p = ix.spots[0][0].spout;
        w.office.spawnParticle('steam', p.x, p.y, p.z);
      }
    },
  },

  hissStandoff: {
    sound: 'hiss',
    kind: 'pair',
    weight: 1,
    dur: [3.5, 5],
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.85),
    pose: { a: 'hiss', b: 'hiss' },
    bubble: { a: 'hiss', b: 'hiss' },
    script: [
      [0.2, 'a', ['tohle je moje místo!', 'hssss!', 'co tu chceš?']],
      [1.4, 'b', ['fff!', 'to sotva!', '[byl|byla] jsem tu první']],
      [3, 'a', ['tak jo, mír', 'dobře, půjdu', 'příště ne']],
    ],
  },

  followLeader: {
    kind: 'pair',
    weight: 1,
    dur: [10, 14],
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.6),
    pose: { a: 'stand', b: 'stand' },
    script: [
      [0.2, 'a', ['za mnou!', 'ukážu ti něco', 'prohlídka kanclu']],
      [1.5, 'b', ['kam jdeme?', 'jdu, jdu', 'počkej na mě']],
    ],
    tick(ix, t) {
      const { a, b } = ix;
      if (!a.moving) {
        ix.state.legs = (ix.state.legs ?? 0) + 1;
        if (ix.state.legs > 3) {
          ix.done = true;
          return;
        }
        const p = a.randomPoint();
        a.goTo(p.x, p.z, { gait: 'trot' });
      }
      if (t > (ix.state.repath ?? 0)) {
        ix.state.repath = t + 0.5;
        const dx = Math.sin(a.heading) * 0.55;
        const dz = Math.cos(a.heading) * 0.55;
        b.goTo(a.pos.x - dx, a.pos.z - dz, { gait: 'trot' });
      }
    },
  },

  yarnShare: {
    kind: 'pair',
    weight: 2,
    dur: [10, 15],
    place(w) {
      const y = w.office.yarn;
      if (!y) return null;
      return { a: { x: y.x - 0.45, z: y.z }, b: { x: y.x + 0.45, z: y.z } };
    },
    pose: {
      a: (ix) => (ix.state.near?.a ? 'bat' : 'crouch'),
      b: (ix) => (ix.state.near?.b ? 'bat' : 'crouch'),
    },
    heading: {
      a: (ix, e, w) => Math.atan2(w.office.yarn.x - ix.a.pos.x, w.office.yarn.z - ix.a.pos.z),
      b: (ix, e, w) => Math.atan2(w.office.yarn.x - ix.b.pos.x, w.office.yarn.z - ix.b.pos.z),
    },
    script: [
      [0.3, 'a', ['tvoje!', 'chytej!', 'přihrávka!']],
      [2, 'b', ['moje!', 'vracím', 'pozor, falšovaná!']],
      [6, 'a', ['góól!', 'to bylo těsné', 'jsi <dobrý|dobrá>']],
    ],
    tick(ix, t, dt, w) {
      const ball = w.office.yarn;
      ix.state.near = {};
      for (const role of ['a', 'b']) {
        const cat = ix[role];
        const other = role === 'a' ? ix.b : ix.a;
        const d = Math.hypot(ball.x - cat.pos.x, ball.z - cat.pos.z);
        ix.state.near[role] = d < 0.55;
        if (ix.state.near[role] && t > (ix.state[`kick${role}`] ?? 0)) {
          ix.state[`kick${role}`] = t + 1.4;
          w.office.kickYarn(other.pos.x - ball.x, other.pos.z - ball.z, 1.5);
        } else if (d > 1.4 && !cat.moving) {
          cat.goTo(ball.x + (role === 'a' ? -0.4 : 0.4), ball.z, { run: true });
        }
      }
    },
  },

  highFive: {
    kind: 'pair',
    weight: 2,
    dur: [3, 4],
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.5),
    pose: { a: (ix, e) => (e > 0.8 ? 'highFive' : 'sit'), b: (ix, e) => (e > 0.8 ? 'highFive' : 'sit') },
    script: [
      [0.2, 'a', ['plácnem si!', 'tlapku!', 'povedlo se!']],
      [1.2, 'b', ['jo!', 'tým!', 'jsme dobrý tým']],
    ],
  },

  tailWrap: {
    sound: 'purr',
    kind: 'pair',
    weight: 1,
    dur: [8, 12],
    place(w, ix) {
      const m = meeting(w, ix.a, ix.b, 0.42);
      m.a.heading = 'camera';
      m.b.heading = 'camera';
      return m;
    },
    pose: { a: 'purr', b: 'purr' },
    bubble: { a: 'heart', b: 'heart' },
    script: [
      [0.5, 'a', ['kámoši', 'jsme tým']],
      [2, 'b', ['navždy', 'prrr']],
    ],
  },

  giftMouse: {
    kind: 'pair',
    weight: 1,
    dur: [5, 6],
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.7),
    start(ix, w) {
      const x = (ix.a.pos.x * 0.4 + ix.b.pos.x * 0.6);
      const z = (ix.a.pos.z * 0.4 + ix.b.pos.z * 0.6);
      w.office.spawnToy(x, z);
    },
    pose: { a: (ix, e) => (e < 1.2 ? 'sniff' : 'sit'), b: (ix, e) => (e < 2 ? 'stare' : 'sniff') },
    script: [
      [0.5, 'a', ['dárek pro tebe', '[ulovil|ulovila] jsem myš', 'to je pro tebe']],
      [2.2, 'b', ['fuj… díky', 'to je… plyšová?', 'jsi <zlatý|zlatá>', 'dám si ji do pelíšku']],
    ],
  },

  arcadeDuel: {
    sound: 'bleep',
    kind: 'pair',
    weight: 1,
    dur: [10, 14],
    place(w, ix) {
      const spot = w.office.reserve('arcade', ix.a);
      if (!spot) return null;
      ix.spots.push([spot, ix.a]);
      return { a: spot, b: { x: spot.x + 0.15, z: spot.z + 0.65, heading: PI } };
    },
    pose: { a: 'arcade', b: 'cheer' },
    script: [
      [0.4, 'b', ['jeď jeď jeď!', 'doleva!', 'skoč!']],
      [2.5, 'a', ['neruš!', 'soustředím se', '<viděl|viděla> jsi to?']],
      [6, 'b', ['nový rekord!', 'game over', 'teď já!', 'to byl skok!']],
    ],
  },

  sunTogether: {
    kind: 'pair',
    weight: 1,
    who: (b, w) => (w.office.daylight ?? 0) > 0.3 && idleAwake(b),
    dur: [15, 30],
    place: (w, ix) => twoSpots(w, ix, 'sun'),
    pose: { a: (ix, e) => (e < 3 ? 'lieSide' : 'bellyUp'), b: 'lieSide' },
    script: [
      [0.4, 'a', ['sluníčko pro dva', 'posuň se']],
      [2, 'b', ['hřeje to', 'tady je místa dost']],
    ],
  },

  tvDuo: {
    sound: 'bleep',
    kind: 'pair',
    weight: 2,
    dur: [14, 22],
    place: (w, ix) => twoSpots(w, ix, 'tv'),
    pose: { a: 'gamepad', b: (ix, e) => (e > 9 && e < 11 ? 'cheer' : 'gamepad') },
    heading: { a: () => null, b: () => null },
    script: [
      [0.5, 'a', ['dáme hru?', 'hraju za červenou', 'player two, připrav se']],
      [1.8, 'b', ['jasně!', 'tentokrát vyhraju', 'beru modrou']],
      [6, 'a', ['podvádíš!', 'to byl můj power-up', 'nemačkej mi tlačítka']],
      [9, 'b', ['[vyhrál|vyhrála] jsem!', 'game over pro tebe', 'jsem šampion']],
      [11.5, 'a', ['odveta!', 'ještě jednu', 'to byl lag']],
    ],
  },

  foosball: {
    kind: 'pair',
    weight: 2,
    dur: [10, 15],
    place: (w, ix) => twoSpots(w, ix, 'foosball'),
    pose: { a: 'fiddle', b: 'fiddle' },
    heading: { a: () => null, b: () => null },
    script: [
      [0.4, 'a', ['zápas!', 'hraju za červené']],
      [2, 'b', ['góóól!', 'to byla rána']],
      [5, 'a', ['vyrovnáno', 'točit tyčí se nesmí!']],
      [8, 'b', ['vítěz bere klubíčko', 'poslední gól rozhoduje']],
    ],
  },

  tunnelAmbush: {
    kind: 'pair',
    weight: 1.5,
    dur: [6, 7],
    place(w, ix) {
      const spot = w.office.reserve('tunnel', ix.a);
      if (!spot) return null;
      ix.spots.push([spot, ix.a]);
      const out = { x: spot.x + Math.sin(spot.heading) * 1.3, z: spot.z + Math.cos(spot.heading) * 1.3 };
      return { a: spot, b: out };
    },
    pose: {
      a: (ix, e) => (e < 2.2 ? 'loaf' : e < 3 ? 'crouch' : e < 4.6 ? 'wrestle' : 'sit'),
      b: (ix, e) => (e < 2.5 ? 'stand' : e < 4.6 ? 'wrestle' : 'stare'),
    },
    bubble: { b: (ix, e) => (e > 2.4 && e < 3.4 ? '!' : null) },
    script: [
      [0.3, 'a', ['psst…', 'teď!']],
      [2.4, 'a', ['BAF!', 'mám tě!']],
      [2.7, 'b', ['aaa!', '[lekl|lekla] jsem se!', 'ty jedna!']],
      [5, 'b', ['to nebylo vtipné', 'počkej, já ti to vrátím']],
    ],
    tick(ix) {
      if (ix.elapsed > 2.2 && !ix.state.jumped) {
        ix.state.jumped = true;
        ix.a.goTo(ix.b.pos.x, ix.b.pos.z, { run: true });
      }
    },
  },

  selfie: {
    kind: 'pair',
    weight: 1.5,
    dur: [5, 6],
    place(w, ix) {
      const m = meeting(w, ix.a, ix.b, 0.42);
      m.a.heading = 'camera';
      m.b.heading = 'camera';
      return m;
    },
    pose: { a: (ix, e) => (e < 1.5 ? 'sit' : 'cheer'), b: (ix, e) => (e < 1.5 ? 'sit' : 'boop') },
    script: [
      [0.3, 'a', ['selfie!', 'úsměv!', 'řekni sýr']],
      [1.6, 'b', ['sýýýr', 'mňau!', 'tohle dám na Instagram']],
      [3.5, 'a', ['to je super fotka', 'ještě jednu?', 'jsi tam rozmazaný']],
    ],
    tick(ix, t, dt, w) {
      if (ix.elapsed > 2.2 && !ix.state.flash) {
        ix.state.flash = true;
        w.sound.play('bleep');
        const x = (ix.a.pos.x + ix.b.pos.x) / 2;
        const z = (ix.a.pos.z + ix.b.pos.z) / 2;
        for (let k = 0; k < 8; k++) w.office.spawnParticle('puff', x, 0.9, z);
      }
    },
  },

  pawShake: {
    kind: 'pair',
    weight: 2,
    dur: [3, 4],
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.5),
    pose: { a: (ix, e) => (e > 0.6 ? 'pawPat' : 'sit'), b: (ix, e) => (e > 0.9 ? 'pawPat' : 'sit') },
    script: [
      [0.2, 'a', ['tlapku?', 'dohoda!', 'platí']],
      [1.3, 'b', ['platí!', 'ruku na to', 'tlapka na to']],
    ],
  },

  shareFish: {
    kind: 'pair',
    weight: 1.5,
    dur: [6, 8],
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.5),
    pose: { a: (ix, e) => (e < 2 ? 'sit' : 'drink'), b: (ix, e) => (e < 2.5 ? 'stare' : 'drink') },
    bubble: { b: (ix, e) => (e < 2.5 ? 'heart' : null) },
    script: [
      [0.3, 'a', ['mám rybičku', 'půlku pro tebe', '[schoval|schovala] jsem sardinku']],
      [1.8, 'b', ['pro mě?!', 'jsi poklad', 'mňam, díky']],
      [4.5, 'a', ['kamarádi se dělí', 'příště platíš ty']],
    ],
  },

  yogaTogether: {
    kind: 'pair',
    weight: 1,
    dur: [7, 9],
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.7),
    pose: { a: (ix, e) => (e < 3 ? 'stretch' : e < 5 ? 'sit' : 'stretch'), b: (ix, e) => (e < 3.4 ? 'stretch' : e < 5.4 ? 'sit' : 'stretch') },
    script: [
      [0.3, 'a', ['kočičí jóga', 'pozice kočka', 'nádech…']],
      [2.2, 'b', ['…výdech', 'tohle mi jde', 'au, záda']],
      [5.5, 'a', ['namaste', 'hotovo, jsem nový']],
    ],
  },


  // Best friends
  secretHandshake: {
    kind: 'pair',
    rel: 'friend',
    weight: 2,
    stat: 'handshakes',
    dur: [6, 6],
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.48),
    pose: { a: handshake, b: handshake },
    heading: { a: (ix, e) => (e > 3.4 && e < 4.6 ? ix.state.spin : null), b: (ix, e) => (e > 3.4 && e < 4.6 ? -ix.state.spin : null) },
    script: [
      [0.2, 'a', ['tajný pozdrav!', 'naše věc!', 'víš co?']],
      [5, 'b', ['nejlepší kámoši', 'nikdo jiný to neumí', 'jsme tým']],
    ],
    tick(ix, t, dt) {
      if (ix.elapsed > 3.4 && ix.elapsed < 4.6) ix.state.spin = (ix.state.spin ?? 0) + dt * 12;
    },
  },

  huntTogether: {
    kind: 'pair',
    rel: 'friend',
    weight: 1.5,
    dur: [9, 10],
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.5),
    start(ix, w) {
      // A toy mouse a little way off; they stalk it together.
      const nav = w.office.nav;
      const [i, j] = nav.nearestFree(...nav.tileOf(ix.a.pos.x + rnd(-2, 2), ix.a.pos.z + rnd(-2, 2)));
      ix.state.prey = { x: i + 0.5, z: j + 0.5 };
      w.office.spawnToy(ix.state.prey.x, ix.state.prey.z);
    },
    pose: { a: hunt, b: hunt },
    heading: { a: (ix) => face(ix.a, ix.state.prey), b: (ix) => face(ix.b, ix.state.prey) },
    script: [
      [0.3, 'a', ['psst… myš', 'vidíš ji?', 'lov!']],
      [1.5, 'b', ['jdu zleva', 'kryju tě', 'na tři…']],
      [5.6, 'a', ['TEĎ!', 'skok!']],
      [7.2, 'b', ['máme ji!', 'tým lovců!', 'ulovená!']],
    ],
    tick(ix) {
      const p = ix.state.prey;
      if (ix.elapsed > 2.5 && !ix.state.sneaking) {
        ix.state.sneaking = true;
        ix.a.goTo(p.x - 0.35, p.z, { gait: 'sneak' });
        ix.b.goTo(p.x + 0.35, p.z, { gait: 'sneak' });
      }
    },
  },

  syncDance: {
    kind: 'pair',
    rel: 'friend',
    weight: 1.5,
    dur: [10, 12],
    place(w, ix) {
      const m = meeting(w, ix.a, ix.b, 0.6);
      m.a.heading = 'camera';
      m.b.heading = 'camera';
      return m;
    },
    start(ix) {
      ix.a.isVibing = true;
      ix.b.isVibing = true;
    },
    pose: { a: sync, b: sync },
    heading: { a: (ix, e) => (sync(ix, e) === 'spin' ? ix.state.spin : null), b: (ix, e) => (sync(ix, e) === 'spin' ? ix.state.spin : null) },
    bubble: { a: 'note', b: 'note' },
    script: [
      [0.3, 'a', ['synchronizace!', 'a teď spolu!', 'raz, dva, tři']],
      [3, 'b', ['teď kraba!', 'jsme hvězdy TikToku', 'krok vlevo!']],
      [8, 'a', ['a otočka!', 'finále!', 'potlesk, prosím']],
    ],
    tick(ix, t, dt) {
      ix.state.spin = (ix.state.spin ?? 0) + dt * 10;
    },
  },

  insideJoke: {
    sound: 'meow',
    kind: 'pair',
    rel: 'friend',
    weight: 2,
    dur: [6, 7],
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.55),
    pose: { a: (ix, e) => (e < 2.6 ? 'meow' : 'laugh'), b: (ix, e) => (e < 1.3 ? 'sit' : e < 2.6 ? 'meow' : 'laugh') },
    script: [
      [0.3, 'a', ['pamatuješ…', 'jak tenkrát…', 'víš, co řekl šéf?']],
      [1.4, 'b', ['…ten páteční deploy?', '…tu kachnu v serverovně?', '…to je jen malá změna?', '…rm -rf v produkci?', '…tu okurku?']],
      [2.7, 'a', ['HAHAHA', 'HAHA, přesně!', 'to bylo epické']],
      [3.8, 'b', ['HAHAHA', 'už nemůžu', 'teče mi mlíko z nosu']],
    ],
    tick(ix, t, dt, w) {
      if (ix.elapsed > 2.7) once(ix, 'laugh', () => w.sound.play('laugh'));
    },
  },

  whisperSecret: {
    kind: 'pair',
    rel: 'friend',
    weight: 1.5,
    dur: [6, 7],
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.36),
    pose: { a: (ix, e) => (e < 3.4 ? 'whisper' : 'sit'), b: (ix, e) => (e < 3.2 ? 'sit' : e < 4.4 ? 'alert' : 'laugh') },
    script: [
      [0.3, 'a', ['psst…', 'pojď blíž', 'něco ti řeknu']],
      [1.5, 'a', [
        (ix) => `…${ix.other.name} spí na serveru`,
        (ix) => `…${ix.other.name} ${ix.other.g('smazal', 'smazala')} produkci`,
        () => '…v lednici je tajný tuňák',
        () => '…šéf je taky kočka',
        (ix) => `…${ix.other.name} ${ix.other.g('má rád', 'má ráda')} okurky`,
      ]],
      [3.3, 'b', ['COŽE?!', 'neeee!', 'to není možné!']],
      [4.8, 'a', ['ale nikomu ani mňau', 'ššš!', 'zůstane to mezi námi']],
    ],
  },

  stargazeTogether: {
    kind: 'pair',
    rel: 'friend',
    weight: 1.5,
    who: (b, w) => (w.office.daylight ?? 1) < 0.15 && idleAwake(b),
    dur: [12, 18],
    place: (w, ix) => (w.office.daylight ?? 1) < 0.15 && twoSpots(w, ix, 'sill'),
    pose: { a: 'lookWindow', b: 'lookWindow' },
    script: [
      [0.5, 'a', ['podívej, hvězdy', 'tamta svítí nejvíc', 'je krásná noc']],
      [2.5, 'b', ['tamta je naše', 'ta jasná je moje', 'Velký vůz!']],
      [6, 'a', ['přej si něco', 'chci tuňáka. navždy', 'jsem [rád|ráda], že jsi tu']],
      [9, 'b', ['já taky', 'prrr', 'ať nám nespadne server']],
    ],
  },

  tandemZoomies: {
    kind: 'pair',
    rel: 'friend',
    weight: 1.2,
    dur: [7, 9],
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.6),
    pose: { a: 'stand', b: 'stand' },
    script: [
      [0.2, 'a', ['závod!', 'zoomies ve dvou!', 'za mnou!']],
      [1.5, 'b', ['počkej na mě!', 'brrrm!', 'jééé']],
    ],
    tick(ix, t) {
      const { a, b } = ix;
      if (!a.moving) {
        const p = a.randomPoint();
        a.goTo(p.x, p.z, { run: true });
      }
      if (t > (ix.state.repath ?? 0)) {
        ix.state.repath = t + 0.4;
        b.goTo(a.pos.x - Math.sin(a.heading) * 0.5, a.pos.z - Math.cos(a.heading) * 0.5, { run: true });
      }
    },
  },

  // Rivals
  insultBattle: {
    sound: 'hiss',
    kind: 'pair',
    rel: 'rival',
    weight: 2,
    stat: 'insultBattles',
    dur: [11, 11],
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.75),
    start(ix) {
      ix.state.winner = Math.random() < 0.5 ? 'a' : 'b';
    },
    pose: {
      a: (ix, e) => (e > 9 ? (ix.state.winner === 'a' ? 'cheer' : 'hiss') : Math.floor((e - 0.3) / 1.8) % 2 ? 'stare' : 'meow'),
      b: (ix, e) => (e > 9 ? (ix.state.winner === 'b' ? 'cheer' : 'hiss') : Math.floor((e - 0.3) / 1.8) % 2 ? 'meow' : 'stare'),
    },
    script: [[0.1, 'a', ['rap battle!', 'jdeme na to', 'mikrofon je můj']]],
    tick(ix) {
      const round = Math.floor((ix.elapsed - 0.8) / 1.8);
      if (round >= 0 && round < 5 && ix.state.round !== round) {
        ix.state.round = round;
        (round % 2 ? ix.b : ix.a).caption(pick(INSULTS));
      }
      if (ix.elapsed > 9.3) {
        once(ix, 'end', () => {
          const winner = ix[ix.state.winner];
          const loser = ix.state.winner === 'a' ? ix.b : ix.a;
          winner.caption(pick(['mikrofon padá', 'konec debaty', 'zapiš si to', 'drop the mic']));
          later(loser, pick(['…hsss', 'to si vyřídíme', 'počkej na odvetu', 'to bylo pod pás']), 900);
        });
      }
    },
  },

  boxWar: {
    kind: 'pair',
    rel: 'rival',
    weight: 1.5,
    gait: 'run',
    dur: [8, 10],
    place(w, ix) {
      const spot = w.office.reserve('box', ix.a);
      if (!spot) return null;
      ix.spots.push([spot, ix.a]);
      const nav = w.office.nav;
      const [i, j] = nav.nearestFree(...nav.tileOf(spot.x + Math.sin(spot.heading) * 0.8, spot.z + Math.cos(spot.heading) * 0.8));
      return { a: spot, b: { x: i + 0.5, z: j + 0.5 } };
    },
    pose: { a: 'loaf', b: (ix, e) => (e < 3 ? 'stare' : 'hiss') },
    bubble: { b: (ix, e) => (e > 3 ? 'hiss' : null) },
    script: [
      [0.3, 'b', ['to je MOJE krabice!', 'krabice je moje!', 'vylez!']],
      [1.6, 'a', ['kdo dřív přijde…', 'sedím, tedy vlastním', 'if I fits, I sits']],
      [4, 'b', ['hsss!', 'tohle si zapamatuju', 'jednou tam budu sedět já']],
      [6, 'a', ['krabice je moje navždy', 'mňau mňau', 'tady se mi líbí']],
    ],
  },

  codeReview: {
    kind: 'pair',
    rel: 'rival',
    weight: 1.5,
    dur: [8, 9],
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.7),
    pose: { a: alternate('meow', 'hiss', 1.6), b: alternate('hiss', 'meow', 1.6) },
    script: [
      [0.2, 'a', ['code review!', 'mám k tvému PR pár poznámek', 'tohle neprojde']],
      [1.6, 'b', ['jakých poznámek?', 'co je na tom špatně?', 'zase ty?']],
      [3.2, 'a', ['tabulátory!', 'tenhle název je hrozný', 'kde jsou testy?', 'proč to má 500 řádků?']],
      [4.8, 'b', ['to je styl!', 'testy jsou pro slabé', 'funguje to, ne?', 'u mě to funguje']],
      [6.4, 'a', ['REQUEST CHANGES', 'zamítnuto', 'LGTM… dělám si srandu']],
      [7.6, 'b', ['hsss', 'tak si to <napiš sám|napiš sama>', 'eskaluju to']],
    ],
  },

  raceToBowl: {
    kind: 'pair',
    rel: 'rival',
    weight: 1.5,
    gait: 'run',
    dur: [7, 8],
    place(w, ix) {
      const spot = w.office.reserve('food', ix.a);
      if (!spot) return null;
      ix.spots.push([spot, ix.a]);
      const nav = w.office.nav;
      const [i, j] = nav.nearestFree(...nav.tileOf(spot.x + 0.7, spot.z + 0.7));
      return { a: spot, b: { x: i + 0.5, z: j + 0.5 } };
    },
    pose: { a: 'drink', b: (ix, e) => (e < 2 ? 'stare' : 'hiss') },
    script: [
      [0.1, 'a', ['moje!', 'kdo dřív přijde!', 'první!']],
      [1, 'b', ['to je MOJE miska!', 'nech mi něco!', 'podvod!']],
      [3, 'a', ['mňam mňam', 'nic nezbylo', 'smůla']],
      [5, 'b', ['tohle ti nezapomenu', 'hsss', 'příště budu rychlejší']],
    ],
  },

  tailPull: {
    kind: 'pair',
    rel: 'rival',
    weight: 1.2,
    dur: [7, 8],
    place(w, ix) {
      const m = meeting(w, ix.a, ix.b, 0.45);
      m.b.heading = Math.atan2(m.b.x - m.a.x, m.b.z - m.a.z);
      return m;
    },
    pose: {
      a: (ix, e) => (e < 1.5 ? 'crouch' : e < 2.5 ? 'bat' : 'stand'),
      b: (ix, e) => (e < 1.8 ? 'sit' : e < 2.8 ? 'startle' : 'hiss'),
    },
    bubble: { b: (ix, e) => (e > 1.8 && e < 3 ? '!' : null) },
    script: [
      [0.4, 'a', ['hehe…', 'psst', 'teď…']],
      [1.8, 'b', ['AU!', 'MŮJ OCAS!', 'KDO TO BYL?!']],
      [3, 'a', ['nikdo!', 'to vítr', 'chyť mě!']],
      [4.2, 'b', ['počkej, až tě chytím!', 'stůj!']],
    ],
    tick(ix, t, dt, w) {
      const { a, b } = ix;
      if (ix.elapsed > 1.8 && ix.elapsed < 2.4) b.targetLift = 0.35;
      else if (ix.elapsed >= 2.4) b.targetLift = 0;
      if (ix.elapsed > 1.8) once(ix, 'boing', () => w.sound.play('boing'));
      if (ix.elapsed > 3.2) {
        if (!a.moving) {
          const p = a.randomPoint();
          a.goTo(p.x, p.z, { run: true });
        }
        if (t > (ix.state.repath ?? 0)) {
          ix.state.repath = t + 0.4;
          b.goTo(a.pos.x, a.pos.z, { run: true });
        }
      }
    },
  },

  // Rivals sometimes make up, if the other one lets them.
  makeUp: {
    kind: 'pair',
    rel: 'rival',
    weight: 0.8,
    dur: [8, 9],
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.6),
    start(ix, w) {
      const chance = ix.b.trait === 'cuddly' || ix.b.trait === 'calm' ? 0.85 : ix.b.trait === 'grumpy' ? 0.4 : 0.65;
      ix.state.accepted = Math.random() < chance;
      w.office.spawnToy((ix.a.pos.x + ix.b.pos.x) / 2, (ix.a.pos.z + ix.b.pos.z) / 2);
    },
    pose: {
      a: (ix, e) => (e < 2 ? 'sit' : e < 4.3 ? 'pawPat' : ix.state.accepted ? 'purr' : 'facepalm'),
      b: (ix, e) => (e < 4.3 ? 'stare' : ix.state.accepted ? 'purr' : 'hiss'),
    },
    bubble: { a: (ix, e) => (e > 4.3 && ix.state.accepted ? 'heart' : null), b: (ix, e) => (e > 4.3 ? (ix.state.accepted ? 'heart' : 'hiss') : null) },
    script: [
      [0.3, 'a', ['hele…', 'můžeme si promluvit?', 'víš…']],
      [1.7, 'a', ['promiň mi to', '[přinesl|přinesla] jsem ti myšku', 'mír?', 'už se nezlob']],
      [3.2, 'b', ['…', 'hmm…', 'myšku?']],
      [4.4, 'b', [(ix) => pick(ix.state.accepted ? ['tak jo. mír', 'dobře, odpouštím', 'ale jen tentokrát', 'kamarádi?'] : ['nech si ji', 'na to zapomeň', 'hsss', 'ani náhodou'])]],
      [6, 'a', [(ix) => pick(ix.state.accepted ? ['kamarádi!', 'prrr', 'konečně'] : ['tak nic', 'škoda', 'zkusím to zítra'])]],
    ],
    stat: (ix) => (ix.state.accepted ? ['reconciles'] : []),
    delta: (ix) => (ix.state.accepted ? 28 : -3),
  },

  // Little grudges, between anyone
  blameGame: {
    kind: 'pair',
    weight: 1,
    stat: 'grudges',
    dur: [6.5, 7],
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.7),
    pose: { a: alternate('meow', 'hiss', 1.2), b: alternate('hiss', 'meow', 1.2) },
    script: [
      [0.2, 'a', ['kdo rozbil build?', 'kdo smazal tu tabulku?', 'kdo snědl poslední granule?', 'kdo zase pushnul na main?']],
      [1.4, 'b', ['ty!', 'já ne!', 'na mě se nedívej']],
      [2.6, 'a', ['ne, ty!', 'já mám alibi', 'já [spal|spala]!']],
      [3.8, 'b', ['git blame říká, že ty', 'mám to na kameře', 'svědci to viděli']],
      [5, 'a', ['…dobře, já', 'to byla kachnička', 'to byl šéf', 'to byl vítr']],
    ],
  },

  chat: {
    kind: 'pair',
    weight: 3,
    dur: [8, 8],
    place: (w, ix) => meeting(w, ix.a, ix.b, 0.6),
    start(ix, w) {
      const r = w.relation(ix.a, ix.b);
      const mood = r >= FRIENDS && Math.random() < 0.75 ? 'friend' : r <= RIVALS && Math.random() < 0.75 ? 'rival' : 'neutral';
      ix.state.mood = mood;
      ix.state.lines = pick(CONVERSATIONS[mood]);
      ix.until = w.time + ix.state.lines.length * 2.2 + 1.2;
    },
    pose: { a: (ix, e) => chatPose(ix, 'a', e), b: (ix, e) => chatPose(ix, 'b', e) },
    bubble: {
      a: (ix, e) => chatBubble(ix, e),
      b: (ix, e) => chatBubble(ix, e),
    },
    tick(ix, t, dt, w) {
      const k = Math.floor((ix.elapsed - 0.3) / 2.2);
      const lines = ix.state.lines;
      if (k >= 0 && k < lines.length && ix.state.said !== k) {
        ix.state.said = k;
        (k % 2 ? ix.b : ix.a).caption(lines[k]);
        if (/HAHA/.test(lines[k])) w.sound.play('laugh', { throttle: 1 });
      }
    },
    delta: (ix) => ({ friend: 3, rival: -4, neutral: 1 })[ix.state.mood] ?? 0,
  },

  // Board games
  chess: boardGame('chess', {
    moves: ['e4', 'jezdec na f3', 'hmm…', 'šach!', 'tvůj tah', 'bereš věž?', 'tohle je past', 'rošáda', 'dáma do útoku', 'en passant!', 'tahle pozice je zajímavá'],
    win: ['šach mat!', 'mat!', 'gg', '[vyhrál|vyhrála] jsem!'],
    lose: ['to byla nehoda', 'gg wp', 'odveta!', '[nechal|nechala] jsem tě vyhrát'],
    tie: ['pat!', 'remíza?', 'věčný šach'],
    stat: 'chessWins',
  }),
  tictactoe: boardGame('tictactoe', {
    moves: ['křížek!', 'kolečko!', 'do rohu', 'doprostřed', 'blokuju!', 'hmm…'],
    win: ['tři v řadě!', 'piškvorky!', 'jsem [šampion|šampionka] piškvorek'],
    lose: ['zase?', 'to nebylo fér', 'další kolo!'],
    tie: ['remíza. zase', 'nikdo nevyhrál', 'jako vždycky'],
    tieChance: 0.4,
  }),
  cards: boardGame('cards', {
    moves: ['prší!', 'beru dvě', 'měním na srdce', 'eso!', 'stojím', 'beru čtyři?!', 'mám poslední kartu', 'poker face'],
    win: ['makao!', 'jsem venku!', '[vyhrál|vyhrála] jsem!', 'karty mě milujou'],
    lose: ['podvádíš!', 'máš karty v rukávu', 'ještě jednu', 'rozdávám já'],
    tie: ['nikdo nevyhrál', 'balíček došel'],
  }),

  // Visits: B keeps doing its own thing
  pairProgramming: {
    kind: 'visit',
    weight: 3,
    who: working,
    stillValid: (ix) => working(ix.b),
    dur: [10, 15],
    place(w, ix) {
      const spot = w.office.reserve('kitten', ix.a, { filter: (s) => s.desk === ix.b.deskIndex });
      if (!spot) return null;
      ix.spots.push([spot, ix.a]);
      return { a: { x: spot.x, z: spot.z } };
    },
    pose: { a: 'sit' },
    script: [
      [0.5, 'a', ['tady chybí středník', 'jsi si <jistý|jistá>?', 'ukaž, co píšeš', 'to je hezké řešení']],
      [2.5, 'b', ['neruš', 'vím, co dělám', 'díky, opravím', 'dívej a uč se']],
      [6, 'a', ['to bych udělala jinak', 'pěkný refaktor', 'napiš na to test', 'tady by se hodil test']],
      [8, 'b', ['dobrý nápad', 'pair programming, co?', 'příště píšeš ty']],
    ],
  },

  bringCoffee: {
    kind: 'visit',
    weight: 2,
    who: working,
    stillValid: (ix) => working(ix.b),
    dur: [40, 40],
    place(w, ix) {
      const spot = w.office.reserve('coffee', ix.a);
      if (!spot) return null;
      ix.spots.push([spot, ix.a]);
      return { a: { x: spot.x, z: spot.z, heading: PI } };
    },
    pose: { a: (ix) => (ix.state.stage === 'serve' ? 'mug' : ix.state.stage === 'walk' ? 'stand' : 'coffeeMake') },
    heading: { a: (ix) => (ix.state.stage ? null : PI) },
    script: [[0.3, 'a', ['udělám kafe <kolegovi|kolegyni>', 'jedno kafe pro dříče']]],
    tick(ix, t, dt, w) {
      const { a, b } = ix;
      if (!ix.state.stage) {
        const sp = ix.spots[0][0].spout;
        if (Math.random() < dt * 8) w.office.spawnParticle('steam', sp.x, sp.y, sp.z);
        if (ix.elapsed > 2.8) {
          ix.state.stage = 'walk';
          const p = besideB(ix, 0.6);
          a.goTo(p.x, p.z, { gait: 'walk' });
        }
      } else if (ix.state.stage === 'walk' && !a.moving) {
        ix.state.stage = 'serve';
        a.caption(pick(['tady máš kafe', 'kafíčko pro tebe']));
        setTimeout(() => b.caption(pick(['díky!', '<zachránil|zachránila> jsi mě', 'jsi poklad']), a), 1200);
        ix.until = t + 4;
      }
    },
  },

  deskHijack: {
    kind: 'visit',
    weight: 2,
    who: working,
    stillValid: (ix) => working(ix.b),
    dur: [9, 14],
    place(w, ix) {
      const spot = w.office.reserve('deskTop', ix.a, { filter: (s) => s.desk === ix.b.deskIndex });
      if (!spot) return null;
      ix.spots.push([spot, ix.a]);
      return { a: spot };
    },
    pose: { a: 'loaf' },
    script: [
      [0.5, 'a', ['tady je teplo', 'lehnu si sem', 'tvůj monitor hřeje']],
      [2, 'b', ['uhni z klávesnice!', 'vidím jen kočku', 'jjjjjjjjjjj', 'teď jsi <napsal|napsala> commit']],
      [6, 'a', ['nehnu se', 'pohlaď mě', 'práce počká']],
    ],
  },

  sabotage: {
    kind: 'visit',
    rel: 'rival',
    weight: 1.5,
    who: working,
    stillValid: (ix) => working(ix.b),
    dur: [9, 11],
    place(w, ix) {
      const spot = w.office.reserve('deskTop', ix.a, { filter: (s) => s.desk === ix.b.deskIndex });
      if (!spot) return null;
      ix.spots.push([spot, ix.a]);
      return { a: spot };
    },
    pose: { a: (ix, e) => (e < 4.5 ? 'knead' : 'stare') },
    script: [
      [0.5, 'a', ['jé, klávesnice', 'hnětu ti klávesnici', 'to je ale teplé']],
      [1.8, 'b', ['jjjjjjjjjjjjj', 'UHNI!', 'ctrl+z! ctrl+z!', '<smazal|smazala> jsi mi soubor!']],
      [5, 'a', ['ups', 'to já ne', 'klávesnice si začala']],
      [7, 'b', ['to si zapamatuju', 'hsss', 'tohle půjde na retro']],
    ],
  },

  passiveNote: {
    kind: 'visit',
    rel: 'rival',
    weight: 1.2,
    who: (b) => !b.kitten && !b.visitor && !b.leaving && !b.ix,
    dur: [5, 6],
    place: (w, ix) => ({ a: besideB(ix, 0.6) }),
    start(ix, w) {
      const x = (ix.a.pos.x + ix.b.pos.x) / 2;
      const z = (ix.a.pos.z + ix.b.pos.z) / 2;
      w.office.spawnProp('note', x, z, { seconds: 25 });
    },
    pose: { a: (ix, e) => (e < 2.5 ? 'fiddle' : 'stare') },
    script: [
      [0.4, 'a', ['lísteček: KDO MI SNĚDL TUŇÁKA?', 'lísteček: MYJTE SI MISKY!', 'lísteček: tohle je MOJE místo', 'lísteček: mňoukejte potichu', 'lísteček: kdo nechal chlupy na klávesnici?', 'lísteček: díky za nic :)']],
      [2.8, 'b', ['…', 'vážně?', 'pasivní agrese level 100', 'to je od tebe?']],
    ],
  },

  stealSpot: {
    kind: 'visit',
    weight: 1.5,
    stat: 'grudges',
    who: asleep,
    stillValid: (ix) => ix.state.taken || ix.b.act?.def.sleep,
    dur: [6, 6],
    place: (w, ix) => ({ a: besideB(ix, 0.5) }),
    pose: { a: (ix, e) => (e < 2.6 ? 'stare' : 'hiss') },
    script: [
      [0.4, 'a', ['uhni', 'to je moje místo', 'posuň se', 'vstávej, to je můj pelíšek']],
      [1.8, 'b', ['co?!', 'spím!', 'ani náhodou']],
      [2.9, 'a', ['UHNI!', 'hsss!', 'hned!']],
    ],
    tick(ix) {
      if (ix.elapsed > 3.5 && !ix.state.taken) {
        ix.state.taken = ix.b.act?.name;
        ix.b.endActivity();
        ix.b.startActivity('wander');
        ix.b.caption(pick(['tohle si zapamatuju', 'zloděj!', 'hmpf', '[stejně jsem odcházel|stejně jsem odcházela]']));
        ix.done = true;
      }
    },
    finish(ix) {
      if (ix.state.taken && !ix.a.leaving) ix.a.startActivity(ix.state.taken);
    },
  },

  stealFood: {
    kind: 'visit',
    weight: 1.2,
    stat: 'grudges',
    who: (b) => b.act?.name === 'eat' && b.act.phase === 'do' && !b.ix,
    stillValid: (ix) => ix.b.act?.name === 'eat',
    dur: [5, 6],
    place: (w, ix) => ({ a: besideB(ix, 0.42) }),
    pose: { a: (ix, e) => (e < 1.2 ? 'sniff' : 'drink') },
    script: [
      [0.4, 'a', ['ty máš lepší granule', 'jen ochutnám', 'mňam, to vypadá dobře']],
      [1.6, 'b', ['TO JE MOJE!', 'hej!', 'vlastní misku nemáš?']],
      [3.2, 'a', ['sdílení je péče', 'hmm, nic moc', 'díky!']],
    ],
    tick(ix, t) {
      if (ix.elapsed > 1.6) once(ix, 'angry', () => (ix.b.reaction = { kind: 'angry', until: t + 2.5 }));
    },
  },

  wakeUp: {
    kind: 'visit',
    weight: 2,
    who: asleep,
    stillValid: (ix) => ix.state.woken || ix.b.act?.def.sleep,
    dur: [4, 4],
    place: (w, ix) => ({ a: besideB(ix, 0.5) }),
    start(ix, w) {
      ix.state.nice = friendly(ix, w) || ix.a.trait === 'cuddly';
    },
    pose: { a: (ix, e) => (e < 1.4 ? 'sniff' : 'boop') },
    script: [[0.4, 'a', [(ix) => pick(ix.state.nice ? ['vstávej, jdeme si hrát!', 'haló, spáči', 'boop! jsi vzhůru?', 'pojď ven!'] : ['BAF!', 'VSTÁVEJ, JE DEPLOY!', 'hoří! dělám si srandu', 'šéf jde!'])]]],
    tick(ix, t, dt, w) {
      if (ix.elapsed > 1.6 && !ix.state.woken) {
        ix.state.woken = true;
        const b = ix.b;
        b.endActivity();
        if (ix.state.nice) {
          b.startActivity('yawnStretch');
          b.caption(pick(['áááh, tak jo', 'už jdu', 'ještě pět minut…', 'ty jsi ale otrava']));
        } else {
          b.startActivity('wander');
          b.reaction = { kind: 'angry', until: t + 2.5 };
          b.caption(pick(['SPAL JSEM!', 'proč?!', 'tohle ti nezapomenu', 'hsss, nech mě']));
          w.sound.play('hiss');
        }
      }
    },
    stat: (ix) => (ix.state.nice ? [] : ['grudges']),
    delta: (ix) => (ix.state.nice ? 1 : -4),
  },

  knockRivalCup: {
    kind: 'visit',
    rel: 'rival',
    weight: 1.2,
    who: (b, w) => working(b) && w.office.cupOnDesk(b.deskIndex),
    stillValid: (ix) => working(ix.b),
    dur: [5, 6],
    place(w, ix) {
      const spot = w.office.reserve('knock', ix.a, { filter: (s) => s.desk === ix.b.deskIndex });
      if (!spot) return null;
      ix.spots.push([spot, ix.a]);
      return { a: spot };
    },
    pose: { a: (ix, e) => (e < 1.8 ? 'knock' : 'stare') },
    heading: { a: (ix, e) => (e < 1.8 ? PI : 'camera') },
    script: [[2.6, 'b', ['TO BYLO SCHVÁLNĚ!', 'můj hrnek!', 'tohle si vyřídíme', 'hsss!']]],
    tick(ix, t, dt, w) {
      if (ix.elapsed > 1.8) {
        once(ix, 'knock', () => {
          w.office.knockCup(ix.b.deskIndex);
          ix.a.caption(pick(['ups', 'gravitace', 'to já ne', 'nikdo nic neviděl']));
        });
      }
    },
  },

  kittenPat: {
    sound: 'purr',
    kind: 'visit',
    weight: 2,
    who: (b) => b.kitten && b.act?.phase === 'do',
    dur: [5, 7],
    place: (w, ix) => ({ a: besideB(ix, 0.55) }),
    pose: { a: 'pawPat' },
    bubble: { a: 'heart' },
    script: [
      [0.5, 'a', ['šikovné kotě', 'jen tak dál, malé']],
      [2, 'b', ['mňauky!', 'díky, <strejdo|teto>!']],
    ],
  },

  storyTime: {
    kind: 'visit',
    weight: 1.5,
    who: (b) => b.kitten && b.act?.phase === 'do',
    dur: [7, 9],
    place: (w, ix) => ({ a: besideB(ix, 0.55) }),
    pose: { a: alternate('meow', 'sit', 1.2) },
    script: [
      [0.4, 'a', ['bylo nebylo…', 'za devatero servery…', 'víš, jak vznikl git?']],
      [2.5, 'a', ['…a pak spadla produkce', '…a kocour v botách to deploynul', '…a žili šťastně až do merge']],
      [5, 'b', ['ještě jednu!', 'to se fakt stalo?', 'zzz…']],
    ],
  },

  greet: {
    sound: 'meow',
    kind: 'visit',
    weight: 0, // started explicitly when a new cat arrives
    dur: [4, 5],
    place: (w, ix) => ({ a: besideB(ix, 0.6) }),
    pose: { a: 'boop' },
    bubble: { a: 'heart' },
    script: [
      [0.3, 'a', ['ahoj nováčku!', 'vítej v kanceláři', 'čau, já jsem tady [šéf|šéfová]', 'kafe je vlevo']],
      [1.8, 'b', ['čau!', 'kde je kafe?', 'ahoj, mňau', 'kde budu sedět?']],
    ],
  },
};

// How an interaction changes what two cats think of each other.
export const RELATION_DELTA = {
  boop: 3, groomFriend: 4, chase: 2, wrestle: 1, fight: -8, cuddleNap: 5, gossip: 2, stareContest: 0, sniff: -1,
  headRub: 4, danceParty: 3, coffeeBreak: 3, hissStandoff: -5, followLeader: 2, yarnShare: 3, highFive: 3,
  tailWrap: 5, giftMouse: 4, arcadeDuel: 1, sunTogether: 3, tvDuo: 2, foosball: 2, tunnelAmbush: -1,
  selfie: 3, pawShake: 2, shareFish: 4, yogaTogether: 3,
  pairProgramming: 2, bringCoffee: 4, deskHijack: -1, kittenPat: 0, storyTime: 0, greet: 2,
  secretHandshake: 3, huntTogether: 4, syncDance: 3, insideJoke: 3, whisperSecret: 2, stargazeTogether: 4, tandemZoomies: 2,
  insultBattle: -4, boxWar: -5, codeReview: -4, raceToBowl: -4, tailPull: -3, makeUp: 28,
  blameGame: -2, chat: 1, chess: 0, tictactoe: 0, cards: 0,
  sabotage: -6, passiveNote: -3, stealSpot: -6, stealFood: -5, wakeUp: -4, knockRivalCup: -7,
};

export function resolve(value, ix, e, world, role) {
  return typeof value === 'function' ? value(ix, e, world, role) : value;
}

// A value from a per-role table, falling back to the entry for everyone.
export const forRole = (table, role) => table?.[role] ?? table?.all;

function chatPose(ix, role, e) {
  const lines = ix.state.lines ?? [];
  const k = Math.floor((e - 0.3) / 2.2);
  if (k >= lines.length) return ix.state.mood === 'rival' ? 'hiss' : ix.state.mood === 'friend' ? 'purr' : 'sit';
  if (/HAHA/.test(lines[k] ?? '')) return 'laugh';
  return (k % 2 === 1) === (role === 'b') ? 'meow' : 'sit';
}

function chatBubble(ix, e) {
  const k = Math.floor((e - 0.3) / 2.2);
  if (k < (ix.state.lines?.length ?? 0)) return null;
  return { friend: 'heart', rival: 'hiss' }[ix.state.mood] ?? null;
}

export function prepareInteraction(name, a, b, world) {
  const spec = INTERACTIONS[name];
  const ix = { name, spec, a, b, state: {}, ready: {}, spots: [], fired: new Set(), started: null, t0: world.time };
  ix.other = otherCat(ix, world);
  return ix;
}

export { idleAwake, working };
