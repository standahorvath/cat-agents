// Cat profiles: every project has its own cat that keeps its level, needs and
// wardrobe across sessions. Plus the cosmetics shop and achievements.

import { ITEMS, THEMES } from './catalog.js';

// Levels

// Seconds of work needed to reach a level: 5 min for level 2, 20 min for 3, 45 for 4, and so on
export const xpForLevel = (level) => 300 * (level - 1) ** 2;

export function levelOf(xp) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

// Needs

export const NEEDS = {
  food: { label: 'Hlad', items: ['bowls', 'fridge', 'coffee', 'pond', 'fountain', 'snackMachine'] },
  energy: { label: 'Energie', items: ['bed', 'couch', 'fireplace', 'hammock', 'heatpad', 'beanbag', 'box', 'catTree', 'gardenTree', 'deckchair', 'printer', 'catCondo', 'catHouse'] },
  fun: { label: 'Zábava', items: ['yarn', 'boombox', 'tunnel', 'aquarium', 'wheel', 'tv', 'piano', 'foosball', 'pinball', 'arcade', 'catTree', 'jukebox', 'flowerbed', 'birdbath', 'ballPit', 'trophyCase', 'gnome'] },
};

// Per second. Working drains energy and food, idling drains food and fun. Needs
// are refilled by what the cats actually do (eating, napping, playing), which the
// browser reports through `restore`. With nobody watching, the server refills
// idle cats on its own from the furniture the office has.
const DRAIN_WORK = { food: 3 / 60, energy: 4.5 / 60, fun: 1.8 / 60 };
const DRAIN_IDLE = { food: 1.5 / 60, energy: 0, fun: 3 / 60 };
// Faster than the idle drain, so cats left alone still recover.
const REFILL_UNWATCHED = { food: 6 / 60, energy: 4 / 60, fun: 5 / 60 };
const REFILL_TRICKLE = 0.3 / 60;

export function updateNeeds(cat, working, items, seconds, watched = true) {
  const owned = new Set(items.map((i) => i.type));
  for (const [need, def] of Object.entries(NEEDS)) {
    let v = cat.needs[need];
    if (working) v -= DRAIN_WORK[need] * seconds;
    else {
      v -= DRAIN_IDLE[need] * seconds;
      if (!watched) v += (def.items.some((t) => owned.has(t)) ? REFILL_UNWATCHED[need] : REFILL_TRICKLE) * seconds;
      else v += REFILL_TRICKLE * seconds;
    }
    cat.needs[need] = Math.max(0, Math.min(100, v));
  }
}

// What a cat gets from something it did (percent points, already summed up).
export function restoreNeeds(cat, gains) {
  for (const need of Object.keys(NEEDS)) {
    const g = Number(gains?.[need]);
    if (Number.isFinite(g) && g > 0) cat.needs[need] = Math.min(100, cat.needs[need] + Math.min(g, 100));
  }
}

export const mood = (cat) => (cat.needs.food + cat.needs.energy + cat.needs.fun) / 3;

// Happy cats earn up to 1.5x, miserable ones half.
export const earnMultiplier = (cat) => 0.5 + mood(cat) / 100;

export function newCatProfile() {
  return { xp: 0, earned: 0, needs: { food: 80, energy: 80, fun: 80 }, owned: [], wear: {}, fur: null, wins: 0 };
}

// What the player can do for a cat from its card. A treat costs coins.
export const PAMPER = {
  pet: { gains: { fun: 6 }, price: 0 },
  treat: { gains: { food: 15, fun: 2 }, price: 10 },
};

// Relationships

// How two cats get along, from -100 (rivals) to 100 (best friends), keyed by both
// projects in a stable order.
export const relationKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const FRIENDS = 40;
export const RIVALS = -30;

export function hashText(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}

// Every cat has a personality (from its project, so it never changes). It decides
// who it naturally gets along with and what it likes to do.
export const TRAITS = {
  calm: { m: 'kliďas', f: 'kliďaška', desc: 'Nic ho nerozhodí.' },
  grumpy: { m: 'bručoun', f: 'bručounka', desc: 'Všechno je špatně.' },
  gossip: { m: 'drbna', f: 'drbna', desc: 'Ví všechno o všech.' },
  gamer: { m: 'hráč', f: 'hráčka', desc: 'Musí vyhrát. Vždycky.' },
  cuddly: { m: 'mazel', f: 'mazlivka', desc: 'Miluje všechny.' },
  prankster: { m: 'rošťák', f: 'rošťačka', desc: 'Naschvály jsou umění.' },
  diva: { m: 'fešák', f: 'diva', desc: 'Středem pozornosti je jen jeden.' },
  nerd: { m: 'šprt', f: 'šprtka', desc: 'Raději kód než kočky.' },
};
const TRAIT_IDS = Object.keys(TRAITS);

export const traitOf = (key) => TRAIT_IDS[hashText(`${key}:trait`) % TRAIT_IDS.length];

// How well two personalities get along on their own (symmetric, unlisted = 0).
const COMPAT = {
  'calm|calm': 10, 'calm|cuddly': 15, 'calm|nerd': 10, 'calm|prankster': -15, 'calm|grumpy': 5,
  'grumpy|grumpy': -10, 'grumpy|gossip': -15, 'grumpy|gamer': -10, 'grumpy|cuddly': -20, 'grumpy|prankster': -30, 'grumpy|diva': -20, 'grumpy|nerd': 5,
  'gossip|gossip': 20, 'gossip|cuddly': 10, 'gossip|prankster': 10, 'gossip|diva': 15, 'gossip|nerd': -20,
  'gamer|gamer': -25, 'gamer|diva': -10, 'gamer|nerd': 10, 'gamer|prankster': 5,
  'cuddly|cuddly': 20, 'cuddly|prankster': 5,
  'prankster|prankster': 20, 'prankster|diva': -25, 'prankster|nerd': -15,
  'diva|diva': -30, 'diva|nerd': -10,
  'nerd|nerd': 20,
};
const compat = (a, b) => COMPAT[`${a}|${b}`] ?? COMPAT[`${b}|${a}`] ?? 0;

// The natural chemistry of two cats: personalities plus a bit of luck. Relations
// always drift back towards it, so a third or so of all pairs never get along.
export function relationBase(a, b) {
  const luck = (hashText(relationKey(a, b)) % 81) - 32;
  return Math.max(-70, Math.min(70, compat(traitOf(a), traitOf(b)) + luck));
}

export const relationOf = (relations, a, b) => relations?.[relationKey(a, b)] ?? relationBase(a, b);

// Cats who don't click take nice things with a pinch of salt and nasty ones to
// heart; good chemistry works the other way round.
export function chemistryDelta(a, b, delta) {
  const base = relationBase(a, b);
  if (base < 0) return delta > 0 ? delta * 0.4 : delta * 1.5;
  if (base > 25) return delta > 0 ? delta * 1.2 : delta * 0.7;
  return delta;
}

// Diminishing returns: the closer to 100 (or -100), the less one more nice (or nasty) thing counts.
export function applyRelation(value, delta) {
  const room = delta > 0 ? (100 - value) / 100 : (100 + value) / 100;
  return Math.max(-100, Math.min(100, value + delta * Math.min(1, room)));
}

// Feelings fade back to the natural chemistry, half way in about 45 minutes.
export function driftRelations(relations, seconds) {
  const k = 1 - Math.exp(-seconds / 3900);
  for (const [key, value] of Object.entries(relations)) {
    const [a, b] = key.split('|');
    relations[key] = value + (relationBase(a, b) - value) * k;
  }
}

// Counters the browser reports from games and gags (see the `record` action).
export const GAME_STATS = [
  'games', 'chessWins', 'hideSeek', 'tournaments', 'heists', 'goals', 'tableFlips', 'nightGames',
  'jealousy', 'reconciles', 'handshakes', 'grudges', 'insultBattles',
  'memes', 'duckDebug', 'crabRave', 'cucumbers', 'spins', 'freezes',
];

const friendsOf = (s, key) => Object.entries(s.relations ?? {}).filter(([k, v]) => v >= FRIENDS && k.split('|').includes(key)).length;

// Collection

// Things the cats find or win. Events bring the first four; the rest turn up
// rarely during ordinary activities.
export const COLLECTIBLES = {
  mouse: { name: 'Ulovená myš', desc: 'Za myš, kterou kočky chytily v kanceláři.' },
  fuse: { name: 'Spálená pojistka', desc: 'Památka na výpadek proudu.' },
  pizzaBox: { name: 'Krabice od pizzy', desc: 'Kurýr přinesl pizzu a kočky ji snědly.' },
  feather: { name: 'Pírko od návštěvy', desc: 'Nechala tu ho toulavá kočka.' },
  goldenYarn: { name: 'Zlaté klubíčko', desc: 'Vzácně se najde při hraní s klubíčkem.' },
  shootingStar: { name: 'Padající hvězda', desc: 'Kočka ji uviděla v noci z okna.' },
  fishBone: { name: 'Rybí kost', desc: 'Vzácný nález v misce.' },
  oldFloppy: { name: 'Stará disketa', desc: 'Vypadla z knihovny při čtení dokumentace.' },
  fourLeaf: { name: 'Čtyřlístek', desc: 'Roste jen na zahradě a jen pro štěstí.' },
  dustBunny: { name: 'Chomáč prachu', desc: 'Zbyl po robotickém vysavači.' },
  lostSock: { name: 'Ztracená ponožka', desc: 'Kdo ví, jak se dostala do krabice.' },
  rubberDuck: { name: 'Gumová kachnička', desc: 'Plavala v jezírku nebo v akváriu.' },
};

// Rare furs

// Fur patterns any cat can switch to once unlocked. The look lives in the browser
// (identity.js); here is only the name and the condition.
export const RARE_FURS = {
  silver: { name: 'Stříbrná', hint: 'Kočka dosáhne 5. úrovně.', check: (s) => Object.values(s.cats).some((c) => levelOf(c.xp) >= 5) },
  gold: { name: 'Zlatá', hint: 'Najdi zlaté klubíčko.', check: (s) => (s.collection?.goldenYarn ?? 0) >= 1 },
  galaxy: { name: 'Vesmírná', hint: 'Kočka uvidí padající hvězdu.', check: (s) => (s.collection?.shootingStar ?? 0) >= 1 },
  neon: { name: 'Neonová', hint: 'Přečkej 2 výpadky proudu.', check: (s) => (s.collection?.fuse ?? 0) >= 2 },
  leopard: { name: 'Leopardí', hint: 'Kočky chytí 3 myši.', check: (s) => (s.collection?.mouse ?? 0) >= 3 },
  ghost: { name: 'Strašidelná', hint: 'Přečkej 3 úklidy robotickým vysavačem.', check: (s) => (s.collection?.dustBunny ?? 0) >= 3 },
  rainbow: { name: 'Duhová', hint: 'Kompletní sbírka.', check: (s) => Object.keys(COLLECTIBLES).every((id) => (s.collection?.[id] ?? 0) >= 1) },
};

export const unlockedFurs = (state) => Object.keys(RARE_FURS).filter((id) => RARE_FURS[id].check(state));

// Cosmetics

export const SLOTS = { head: 'Hlava', eyes: 'Oči', neck: 'Krk' };

export const COSMETICS = {
  partyHat: { name: 'Párty klobouček', slot: 'head', price: 100, level: 1 },
  beanie: { name: 'Kulich', slot: 'head', price: 150, level: 1 },
  cap: { name: 'Kšiltovka', slot: 'head', price: 200, level: 2 },
  bow: { name: 'Mašle', slot: 'head', price: 120, level: 1 },
  tophat: { name: 'Cylindr', slot: 'head', price: 500, level: 4 },
  crown: { name: 'Korunka', slot: 'head', price: 1500, level: 8 },
  nerdGlasses: { name: 'Brýle na kód', slot: 'eyes', price: 150, level: 1 },
  sunglasses: { name: 'Sluneční brýle', slot: 'eyes', price: 300, level: 3 },
  monocle: { name: 'Monokl', slot: 'eyes', price: 450, level: 5 },
  bellCollar: { name: 'Obojek s rolničkou', slot: 'neck', price: 100, level: 1 },
  scarf: { name: 'Šála', slot: 'neck', price: 200, level: 2 },
  bowtie: { name: 'Motýlek', slot: 'neck', price: 250, level: 3 },
  bandana: { name: 'Šátek', slot: 'neck', price: 150, level: 1 },
  goldChain: { name: 'Zlatý řetěz', slot: 'neck', price: 1200, level: 7 },
  headphones: { name: 'Sluchátka', slot: 'head', price: 250, level: 2 },
  wizardHat: { name: 'Čarodějný klobouk', slot: 'head', price: 700, level: 5 },
  pixelShades: { name: 'Pixelové brýle', slot: 'eyes', price: 600, level: 4 },
  tie: { name: 'Kravata', slot: 'neck', price: 180, level: 2 },
  cape: { name: 'Hrdinský plášť', slot: 'neck', price: 900, level: 6 },
};

// Achievements

// Each check reads the saved state; `reward` coins are paid once on unlock.
export const ACHIEVEMENTS = {
  firstCat: { name: 'První kočka', desc: 'Do kanceláře přišla první kočka.', reward: 50, check: (s) => s.stats.maxCats >= 1 },
  pack: { name: 'Smečka', desc: '5 koček v kanceláři najednou.', reward: 300, check: (s) => s.stats.maxCats >= 5 },
  nursery: { name: 'Školka', desc: '3 koťata najednou.', reward: 150, check: (s) => s.stats.maxKittens >= 3 },
  nightShift: { name: 'Noční směna', desc: 'Kočka pracovala mezi půlnocí a pátou ranní.', reward: 200, check: (s) => s.stats.nightWork >= 60 },
  coins100: { name: 'Kapesné', desc: 'Kočky vydělaly 100 mincí.', reward: 50, check: (s) => s.earned >= 100 },
  coins1000: { name: 'Prasátko', desc: 'Kočky vydělaly 1 000 mincí.', reward: 200, check: (s) => s.earned >= 1000 },
  coins10000: { name: 'Kočičí banka', desc: 'Kočky vydělaly 10 000 mincí.', reward: 1000, check: (s) => s.earned >= 10000 },
  firstCommit: { name: 'První commit', desc: 'Kočka commitla.', reward: 50, check: (s) => s.stats.commits >= 1 },
  commits50: { name: 'Commitovací stroj', desc: '50 commitů.', reward: 300, check: (s) => s.stats.commits >= 50 },
  merged: { name: 'MERGED!', desc: 'Kočka mergla změny.', reward: 200, check: (s) => s.stats.merges >= 1 },
  green10: { name: 'Zelená je dobrá', desc: '10× prošly testy.', reward: 150, check: (s) => s.stats.testsPass >= 10 },
  red10: { name: 'Rudý poplach', desc: '10× spadly testy. Hlavu vzhůru.', reward: 50, check: (s) => s.stats.testsFail >= 10 },
  furnished: { name: 'Zabydleno', desc: '15 předmětů v kanceláři.', reward: 200, check: (s) => s.items.length >= 15 },
  allGroups: { name: 'Od všeho trochu', desc: 'Předmět z každé skupiny obchodu.', reward: 150, check: (s) => new Set(s.items.map((i) => ITEMS[i.type]?.group)).size >= 5 },
  bigBoss: { name: 'Velký šéf', desc: 'Rozšířená kancelář.', reward: 300, check: (s) => s.level >= 1 },
  level5: { name: 'Zkušená kočka', desc: 'Kočka dosáhla 5. úrovně.', reward: 300, check: (s) => Object.values(s.cats).some((c) => levelOf(c.xp) >= 5) },
  level10: { name: 'Kočičí legenda', desc: 'Kočka dosáhla 10. úrovně.', reward: 1000, check: (s) => Object.values(s.cats).some((c) => levelOf(c.xp) >= 10) },
  fashion: { name: 'Módní ikona', desc: 'Kočka má 5 kousků oblečení.', reward: 200, check: (s) => Object.values(s.cats).some((c) => c.owned.length >= 5) },
  happy: { name: 'Šťastná kočka', desc: 'Všechny potřeby kočky nad 90 %.', reward: 150, check: (s) => Object.values(s.cats).some((c) => Object.values(c.needs).every((v) => v >= 90)) },
  cuddler: { name: 'Mazel', desc: '25× pohlazená kočka.', reward: 100, check: (s) => s.stats.pets >= 25 },
  chef: { name: 'Kuchař', desc: '10 pamlsků.', reward: 100, check: (s) => s.stats.treats >= 10 },
  bestFriends: { name: 'Nejlepší kamarádi', desc: 'Dvě kočky jsou nerozlučné kamarádky.', reward: 200, check: (s) => Object.values(s.relations ?? {}).some((v) => v >= 80) },
  nemesis: { name: 'Úhlavní nepřátelé', desc: 'Dvě kočky se nemůžou vystát.', reward: 100, check: (s) => Object.values(s.relations ?? {}).some((v) => v <= -60) },
  mouseHunter: { name: 'Lovec myší', desc: 'Kočky chytily 5 myší.', reward: 200, check: (s) => (s.collection?.mouse ?? 0) >= 5 },
  collector: { name: 'Sběratel', desc: 'Od každé věci ze sbírky aspoň jeden kus.', reward: 500, check: (s) => Object.keys(COLLECTIBLES).every((id) => (s.collection?.[id] ?? 0) >= 1) },
  gardener: { name: 'Zahradník', desc: 'Kancelář má zahradu.', reward: 300, check: (s) => !!s.garden },
  pizzaParty: { name: 'Pizza párty', desc: 'Kurýr přinesl pizzu 3×.', reward: 150, check: (s) => (s.collection?.pizzaBox ?? 0) >= 3 },
  darkness: { name: 'Tma jako v pytli', desc: 'Kancelář přečkala 5 výpadků proudu.', reward: 150, check: (s) => (s.collection?.fuse ?? 0) >= 5 },
  hospitality: { name: 'Pohostinnost', desc: 'Přišly 3 návštěvy.', reward: 150, check: (s) => (s.collection?.feather ?? 0) >= 3 },
  architect: { name: 'Bytový architekt', desc: '30 předmětů v kanceláři a na zahradě.', reward: 400, check: (s) => s.items.length >= 30 },
  bigFamily: { name: 'Velká rodina', desc: 'Kancelář zná 5 různých koček.', reward: 200, check: (s) => Object.keys(s.cats).length >= 5 },
  petLover: { name: 'Nejmazlivější', desc: '100× pohlazená kočka.', reward: 300, check: (s) => s.stats.pets >= 100 },
  greenThumb: { name: 'Zelený palec', desc: '6 předmětů na zahradě.', reward: 250, check: (s) => s.items.filter((i) => ITEMS[i.type]?.outdoor).length >= 6 },
  chonk: { name: 'Pořádný macek', desc: 'Kontext agenta zaplněný ze 75 %.', reward: 150, check: (s) => s.stats.maxFill >= 0.75 },
  diet: { name: 'Dieta', desc: '3× kompaktovaný kontext: kočka se oklepala a zhubla.', reward: 200, check: (s) => s.stats.compacts >= 3 },
  rareFur: { name: 'Vzácný kožich', desc: 'Kočka nosí vzácnou srst.', reward: 150, check: (s) => Object.values(s.cats).some((c) => c.fur) },

  // Relationships
  telenovela: { name: 'Telenovela', desc: 'Kočka 3× žárlila na kamarádovu novou kamarádku.', reward: 200, check: (s) => s.stats.jealousy >= 3 },
  archEnemy: { name: 'Arcinepřítel', desc: 'Vztah dvou koček klesl pod −85.', reward: 250, check: (s) => Object.values(s.relations ?? {}).some((v) => v <= -85) },
  makeUp: { name: 'Usmíření', desc: 'Dva rivalové se usmířili.', reward: 200, check: (s) => s.stats.reconciles >= 1 },
  inseparable: { name: 'Nerozluční', desc: '10× tajný kamarádský pozdrav.', reward: 200, check: (s) => s.stats.handshakes >= 10 },
  officeDrama: { name: 'Drama v kanceláři', desc: 'Tři dvojice rivalů najednou.', reward: 200, check: (s) => Object.values(s.relations ?? {}).filter((v) => v <= RIVALS).length >= 3 },
  socialButterfly: { name: 'Společenský tvor', desc: 'Kočka má 3 kamarády.', reward: 200, check: (s) => Object.keys(s.cats).some((k) => friendsOf(s, k) >= 3) },

  // Games
  grandmaster: { name: 'Velmistr', desc: '10 vyhraných partií šachů.', reward: 300, check: (s) => s.stats.chessWins >= 10 },
  hideMaster: { name: 'Mistr schovávané', desc: 'Kočky si 5× zahrály schovávanou.', reward: 200, check: (s) => s.stats.hideSeek >= 5 },
  champion: { name: 'Šampion', desc: 'Kočka vyhrála turnaj.', reward: 250, check: (s) => s.stats.tournaments >= 1 },
  perfectHeist: { name: 'Dokonalá loupež', desc: 'Kočky ukradly granule a nikdo je nechytil.', reward: 300, check: (s) => s.stats.heists >= 1 },
  striker: { name: 'Kanonýr', desc: '10 gólů v kočičím fotbale.', reward: 200, check: (s) => s.stats.goals >= 10 },
  arcadeHall: { name: 'Herní doupě', desc: 'Kočky si spolu zahrály 50 her.', reward: 300, check: (s) => s.stats.games >= 50 },

  // Developer jokes
  fridayDeploy: { name: 'Páteční deploy', desc: 'Push nebo deploy v pátek po 15:00. Odvážné.', reward: 150, check: (s) => s.stats.fridayPush >= 1 },
  midnightHacker: { name: 'Půlnoční hacker', desc: 'Commit mezi 23:00 a 4:00.', reward: 150, check: (s) => s.stats.nightCommits >= 1 },
  rubberDuck: { name: 'Gumová kachnička', desc: 'Kočka 5× vysvětlovala kód kachničce.', reward: 150, check: (s) => s.stats.duckDebug >= 5 },
  crabRave: { name: 'Krabí rave', desc: 'Tři kočky tančí krabí tanec najednou.', reward: 200, check: (s) => s.stats.crabRave >= 1 },
  worksOnMyMachine: { name: 'U mě to funguje', desc: 'Testy spadly a do 10 minut zase prošly.', reward: 150, check: (s) => s.stats.fixedTests >= 1 },
  comedian: { name: 'Bavič', desc: 'Kočky předvedly 50 kočičích memů.', reward: 250, check: (s) => s.stats.memes >= 50 },

  // Secret ones show up only once unlocked.
  cucumber: { name: 'Okurkový šok', desc: 'Kočka se lekla okurky.', reward: 150, secret: true, check: (s) => s.stats.cucumbers >= 1 },
  oiia: { name: 'OIIA OIIA', desc: 'Kočky se 10× zatočily jako ve videu.', reward: 150, secret: true, check: (s) => s.stats.spins >= 10 },
  catExe: { name: 'Kočka.exe neodpovídá', desc: 'Kočka 3× zamrzla.', reward: 150, secret: true, check: (s) => s.stats.freezes >= 3 },
  tableFlip: { name: 'Převrácená šachovnice', desc: 'Poražená kočka převrátila hru.', reward: 150, secret: true, check: (s) => s.stats.tableFlips >= 1 },
  nightGames: { name: 'Noční turnaj', desc: 'Kočky hrály hry mezi půlnocí a pátou.', reward: 150, secret: true, check: (s) => s.stats.nightGames >= 1 },
  mondayBlues: { name: 'Pondělí', desc: 'Testy spadly v pondělí dopoledne.', reward: 100, secret: true, check: (s) => s.stats.mondayFail >= 1 },

  // More work
  commits200: { name: 'Commitový maratonec', desc: '200 commitů.', reward: 500, check: (s) => s.stats.commits >= 200 },
  commits1000: { name: 'Tisíc commitů', desc: '1 000 commitů. Git už tě zná jménem.', reward: 2000, check: (s) => s.stats.commits >= 1000 },
  pushes50: { name: 'Pushovač', desc: '50× push.', reward: 300, check: (s) => s.stats.pushes >= 50 },
  merges10: { name: 'Mistr mergování', desc: '10 mergů.', reward: 400, check: (s) => s.stats.merges >= 10 },
  firstDeploy: { name: 'Do produkce!', desc: 'První deploy.', reward: 150, check: (s) => s.stats.deploys >= 1 },
  deploys25: { name: 'Kontinuální nasazování', desc: '25 deployů.', reward: 600, check: (s) => s.stats.deploys >= 25 },
  green100: { name: 'Zelená stovka', desc: '100× prošly testy.', reward: 500, check: (s) => s.stats.testsPass >= 100 },
  builds10: { name: 'Stavitel', desc: '10 úspěšných buildů.', reward: 200, check: (s) => s.stats.builds >= 10 },
  buildFails5: { name: 'Kompilátor mě nemá rád', desc: '5× spadl build.', reward: 100, check: (s) => s.stats.buildFails >= 5 },
  installs20: { name: 'Černá díra node_modules', desc: '20× instalace balíčků.', reward: 150, check: (s) => s.stats.installs >= 20 },
  reverts3: { name: 'Ctrl+Z', desc: '3× vrácená změna v gitu.', reward: 100, check: (s) => s.stats.reverts >= 3 },
  slows5: { name: 'Čas na kafe', desc: '5 příkazů běželo přes 2 minuty.', reward: 100, check: (s) => s.stats.slows >= 5 },
  nightOwl: { name: 'Sova', desc: '3 hodiny práce mezi půlnocí a pátou.', reward: 400, check: (s) => s.stats.nightWork >= 3 * 3600 },
  fixed10: { name: 'Hasič', desc: '10× opravené testy do 10 minut.', reward: 400, check: (s) => s.stats.fixedTests >= 10 },

  // Cats and coins
  level15: { name: 'Kočičí guru', desc: 'Kočka dosáhla 15. úrovně.', reward: 2000, check: (s) => Object.values(s.cats).some((c) => levelOf(c.xp) >= 15) },
  level20: { name: 'Nesmrtelná kočka', desc: 'Kočka dosáhla 20. úrovně.', reward: 5000, check: (s) => Object.values(s.cats).some((c) => levelOf(c.xp) >= 20) },
  team5: { name: 'Zkušený tým', desc: 'Tři kočky na 5. úrovni.', reward: 600, check: (s) => Object.values(s.cats).filter((c) => levelOf(c.xp) >= 5).length >= 3 },
  coins50000: { name: 'Zlatý důl', desc: 'Kočky vydělaly 50 000 mincí.', reward: 3000, check: (s) => s.earned >= 50000 },
  coins100000: { name: 'Kočičí impérium', desc: 'Kočky vydělaly 100 000 mincí.', reward: 5000, check: (s) => s.earned >= 100000 },
  bigCompany: { name: 'Velká firma', desc: '10 koček v kanceláři najednou.', reward: 800, check: (s) => s.stats.maxCats >= 10 },
  kittens6: { name: 'Mateřská školka', desc: '6 koťat najednou.', reward: 400, check: (s) => s.stats.maxKittens >= 6 },
  hardWorker: { name: 'Dříč', desc: 'Jedna kočka vydělala 2 000 mincí.', reward: 500, check: (s) => Object.values(s.cats).some((c) => c.earned >= 2000) },
  happyOffice: { name: 'Spokojená kancelář', desc: 'Aspoň tři kočky a všechny mají náladu nad 80 %.', reward: 400, check: (s) => Object.values(s.cats).length >= 3 && Object.values(s.cats).every((c) => mood(c) >= 80) },

  // Wardrobe
  wardrobe10: { name: 'Šatna', desc: 'Kočka má 10 kousků oblečení.', reward: 500, check: (s) => Object.values(s.cats).some((c) => c.owned.length >= 10) },
  fashionHouse: { name: 'Módní dům', desc: 'Kočky mají dohromady každý kousek oblečení.', reward: 1500, check: (s) => Object.keys(COSMETICS).every((id) => Object.values(s.cats).some((c) => c.owned.includes(id))) },
  fullOutfit: { name: 'Celý outfit', desc: 'Kočka má něco na hlavě, na očích i na krku.', reward: 200, check: (s) => Object.values(s.cats).some((c) => c.wear.head && c.wear.eyes && c.wear.neck) },
  allFurs: { name: 'Sběratel srstí', desc: 'Všechny vzácné srsti odemčené.', reward: 1500, check: (s) => Object.values(RARE_FURS).every((f) => f.check(s)) },
  royal: { name: 'Královský majestát', desc: 'Kočka nosí korunku.', reward: 300, check: (s) => Object.values(s.cats).some((c) => c.wear.head === 'crown') },

  // The office
  items40: { name: 'Plná kancelář', desc: '40 předmětů v kanceláři a na zahradě.', reward: 600, check: (s) => s.items.length >= 40 },
  skyscraper: { name: 'Mrakodrap', desc: 'Největší kancelář 16×16.', reward: 800, check: (s) => s.level >= 2 },
  newLook: { name: 'Nový kabát', desc: 'Koupený nový vzhled kanceláře.', reward: 200, check: (s) => (s.themes?.length ?? 1) >= 2 },
  designer: { name: 'Bytový designér', desc: '5 vzhledů kanceláře.', reward: 800, check: (s) => (s.themes?.length ?? 1) >= 5 },
  allThemes: { name: 'Všechny tváře kanceláře', desc: 'Všechny vzhledy kanceláře.', reward: 2500, check: (s) => Object.keys(THEMES).every((id) => s.themes?.includes(id)) },
  spookyOffice: { name: 'Strašidelný podnik', desc: 'Kancelář v halloweenském nebo strašidelném vzhledu.', reward: 200, check: (s) => s.theme === 'halloween' || s.theme === 'haunted' },
  botanic: { name: 'Botanická zahrada', desc: 'Od každého zahradního předmětu aspoň jeden.', reward: 800, check: (s) => Object.keys(ITEMS).filter((t) => ITEMS[t].outdoor).every((t) => s.items.some((i) => i.type === t)) },
  everything: { name: 'Mám všechno', desc: 'Od každého předmětu z obchodu aspoň jeden.', reward: 3000, check: (s) => Object.keys(ITEMS).every((t) => s.items.some((i) => i.type === t)) },

  // Friends and foes
  friends5: { name: 'Kamarádská kancelář', desc: '5 dvojic kamarádů.', reward: 500, check: (s) => Object.values(s.relations ?? {}).filter((v) => v >= FRIENDS).length >= 5 },
  soulmates: { name: 'Spřízněné duše', desc: 'Vztah dvou koček nad 90.', reward: 600, check: (s) => Object.values(s.relations ?? {}).some((v) => v >= 90) },
  peace: { name: 'Mír v kanceláři', desc: 'Aspoň 6 vztahů a ani jedni rivalové.', reward: 500, check: (s) => Object.keys(s.relations ?? {}).length >= 6 && Object.values(s.relations).every((v) => v > RIVALS) },
  dramaQueen: { name: 'Drama queen', desc: '10 žárlivých scén.', reward: 400, check: (s) => s.stats.jealousy >= 10 },
  diplomat: { name: 'Diplomat', desc: '5 usmíření.', reward: 500, check: (s) => s.stats.reconciles >= 5 },
  secretSociety: { name: 'Tajný spolek', desc: '50 tajných pozdravů.', reward: 500, check: (s) => s.stats.handshakes >= 50 },
  grudges25: { name: 'Kniha křivd', desc: '25 drobných křivd (zabraný pelíšek, ukradené granule…).', reward: 300, check: (s) => s.stats.grudges >= 25 },
  rapLegend: { name: 'Rapová legenda', desc: '10 rap battlů.', reward: 300, check: (s) => s.stats.insultBattles >= 10 },

  // Games
  esports: { name: 'E-sport', desc: '200 odehraných her.', reward: 1000, check: (s) => s.stats.games >= 200 },
  chessMachine: { name: 'Šachový počítač', desc: '50 vyhraných šachů.', reward: 1000, check: (s) => s.stats.chessWins >= 50 },
  trophies: { name: 'Pohárová sbírka', desc: '5 vyhraných turnajů.', reward: 600, check: (s) => s.stats.tournaments >= 5 },
  mafia: { name: 'Organizovaný zločin', desc: '5 úspěšných loupeží granulí.', reward: 800, check: (s) => s.stats.heists >= 5 },
  unbeatable: { name: 'Neporazitelná', desc: 'Kočka vyhrála 25 her.', reward: 800, check: (s) => Object.values(s.cats).some((c) => (c.wins ?? 0) >= 25) },
  rageQuit: { name: 'Vztekloun', desc: '5 převrácených her.', reward: 200, check: (s) => s.stats.tableFlips >= 5 },

  // Memes
  viral: { name: 'Virální', desc: '200 kočičích memů.', reward: 800, check: (s) => s.stats.memes >= 200 },
  cucumberSeason: { name: 'Okurková sezóna', desc: '10 lekaček z okurky.', reward: 300, check: (s) => s.stats.cucumbers >= 10 },
  duckConsultant: { name: 'Kachní konzultant', desc: '25 ladění s gumovou kachničkou.', reward: 500, check: (s) => s.stats.duckDebug >= 25 },
  crabFest: { name: 'Krabí festival', desc: '5 krabích rave.', reward: 500, check: (s) => s.stats.crabRave >= 5 },
  yoyo: { name: 'Jojo efekt', desc: '20× zkompaktovaný kontext.', reward: 500, check: (s) => s.stats.compacts >= 20 },
  chonkiest: { name: 'Tlouštík roku', desc: 'Kontext zaplněný z 95 %.', reward: 400, check: (s) => s.stats.maxFill >= 0.95 },

  // Collection
  mice20: { name: 'Postrach myší', desc: '20 ulovených myší.', reward: 600, check: (s) => (s.collection?.mouse ?? 0) >= 20 },
  astronomer: { name: 'Astronom', desc: '5 padajících hvězd.', reward: 500, check: (s) => (s.collection?.shootingStar ?? 0) >= 5 },
  hoard: { name: 'Hromádka pokladů', desc: '50 věcí ve sbírce.', reward: 800, check: (s) => Object.values(s.collection ?? {}).reduce((a, b) => a + b, 0) >= 50 },
  goldRush: { name: 'Zlatá horečka', desc: '3 zlatá klubíčka.', reward: 600, check: (s) => (s.collection?.goldenYarn ?? 0) >= 3 },

  // Achievements for achievements, and more secrets
  hunter50: { name: 'Lovec úspěchů', desc: '50 odemčených úspěchů.', reward: 1000, check: (s) => Object.keys(s.achievements).length >= 50 },
  hallOfFame: { name: 'Síň slávy', desc: '100 odemčených úspěchů.', reward: 5000, check: (s) => Object.keys(s.achievements).length >= 100 },
  sockDemon: { name: 'Ponožkový démon', desc: '5 ztracených ponožek.', reward: 300, secret: true, check: (s) => (s.collection?.lostSock ?? 0) >= 5 },
  ghostHouse: { name: 'Duch v domě', desc: 'Strašidelná kočka ve strašidelném domě.', reward: 400, secret: true, check: (s) => s.theme === 'haunted' && Object.values(s.cats).some((c) => c.fur === 'ghost') },
  spaceMission: { name: 'Vesmírná mise', desc: 'Vesmírná kočka na vesmírné stanici.', reward: 400, secret: true, check: (s) => s.theme === 'space' && Object.values(s.cats).some((c) => c.fur === 'galaxy') },
  cyberCat: { name: 'Kyberkočka', desc: 'Neonová kočka v neonovém městě.', reward: 400, secret: true, check: (s) => s.theme === 'cyber' && Object.values(s.cats).some((c) => c.fur === 'neon') },
};
