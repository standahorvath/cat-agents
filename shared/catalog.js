// Shop catalogue and placement rules, shared by the server (validation, saving)
// and the browser (building the room, edit mode).
//
// Every item has a footprint of w x d tiles at rotation 0 (front facing +z, the
// back against -z). `blocks` lists the local tiles cats cannot walk through; the
// rest of the footprint is an access area that keeps other furniture away.
// Items on the `floor` layer (rugs) only collide with other rugs.

export const START_COINS = 3500;
export const SELL_RATE = 0.5;
// Coins per second for one working cat and one working kitten (1 coin / 10 s).
export const EARN_CAT = 0.1;
export const EARN_KITTEN = 0.05;

export const ROOM_LEVELS = [
  { size: 10, price: 0 },
  { size: 13, price: 2500 },
  { size: 16, price: 8000 },
];

// The garden is a strip outside the south wall. Its first row is a hedge with a
// gap by the garden door; the rest is lawn for outdoor furniture.
export const GARDEN = { depth: 6, price: 4000, gap: [1, 2] };

// Looks for the whole room (walls, floor, windows, door, lights). Bought once,
// then the player switches between the ones they own. The look itself lives in
// the browser (src/scene/themes.js).
export const THEMES = {
  classic: { name: 'Útulná', price: 0, desc: 'Tapeta, dřevěná podlaha a červené závěsy. Jako doma.' },
  modern: { name: 'Moderní open space', price: 1500, desc: 'Světlé panely, betonová dlažba, černé rámy a žádné závěsy.' },
  cabin: { name: 'Horská chata', price: 1800, desc: 'Roubené stěny, tmavá prkna, kostkované závěsy a lyže na zdi.' },
  japan: { name: 'Japonský dojo', price: 2000, desc: 'Papírové posuvné stěny, tatami a červené lampiony.' },
  jungle: { name: 'Džungle', price: 2200, desc: 'Listy na stěnách, bambusová podlaha a liány od stropu.' },
  halloween: { name: 'Halloweenská', price: 2500, desc: 'Fialovo-oranžové stěny, dýně na parapetech a netopýři.' },
  haunted: { name: 'Strašidelný dům', price: 3000, desc: 'Oprýskané zdi, šedá prkna, pavučiny a zelené světlo.' },
  cyber: { name: 'Neonové město', price: 3500, desc: 'Tmavé stěny s neonovou mřížkou, svítící lišty a růžové světlo.' },
  space: { name: 'Vesmírná stanice', price: 4000, desc: 'Kovové panely s nýty, rošt pod tlapkami a blikající konzole.' },
};
export const DEFAULT_THEME = 'classic';

export const GROUPS = {
  work: 'Práce',
  food: 'Jídlo a pití',
  sleep: 'Spaní a odpočinek',
  fun: 'Zábava',
  decor: 'Dekorace',
  garden: 'Zahrada',
};

const back = (w) => Array.from({ length: w }, (_, i) => [i, 0]);

export const ITEMS = {
  desk: { name: 'Pracovní stůl', price: 200, w: 2, d: 2, blocks: [[0, 1], [1, 1]], group: 'work', desc: 'Stůl s CRT monitorem a židlí. Víc stolů, víc koček u práce.' },
  bookshelf: { name: 'Knihovna', price: 400, w: 2, d: 2, blocks: back(2), group: 'work', desc: 'Kočky si tu čtou dokumentaci.' },
  rack: { name: 'Serverový rack', price: 500, w: 1, d: 2, blocks: back(1), group: 'work', desc: 'Blikající LEDky a ladění MCP.' },
  whiteboard: { name: 'Tabule', price: 300, w: 1, d: 2, blocks: back(1), group: 'work', desc: 'Prezentace pro koťata.' },
  printer: { name: 'Tiskárna', price: 350, w: 1, d: 2, blocks: back(1), group: 'work', desc: 'Teplá jako vyhřívaná deka, občas zasekne papír.' },

  coffee: { name: 'Kuchyňka s kávovarem', price: 250, w: 2, d: 2, blocks: back(2), group: 'food', desc: 'Kafe a pauzy na kafe ve dvou.' },
  bowls: { name: 'Misky', price: 40, w: 1, d: 2, blocks: back(1), group: 'food', desc: 'Granule a voda.' },
  fridge: { name: 'Retro lednice', price: 150, w: 1, d: 1, group: 'food', desc: 'Avokádově zelená klasika.' },
  fountain: { name: 'Kočičí fontánka', price: 180, w: 1, d: 2, blocks: back(1), group: 'food', desc: 'Tekoucí voda chutná líp.' },
  snackMachine: { name: 'Automat na pamlsky', price: 650, w: 1, d: 2, blocks: back(1), group: 'food', desc: 'Pamlsky na zmáčknutí tlapky.' },

  bed: { name: 'Pelíšek', price: 150, w: 1, d: 1, blocks: [], group: 'sleep', desc: 'Hnětení a dlouhé šlofíky.' },
  couch: { name: 'Gauč', price: 600, w: 3, d: 2, blocks: back(3), group: 'sleep', desc: 'Šlofíky a tulení ve dvou.' },
  fireplace: { name: 'Krb', price: 1500, w: 2, d: 2, blocks: back(2), group: 'sleep', desc: 'Praskající oheň, hřání a spaní.' },
  hammock: { name: 'Houpací síť', price: 700, w: 2, d: 2, blocks: back(2), group: 'sleep', desc: 'Houpání a spaní ve výšce.' },
  heatpad: { name: 'Vyhřívaná deka', price: 250, w: 1, d: 1, blocks: [], group: 'sleep', desc: 'Teploučko na bříško.' },
  beanbag: { name: 'Sedací vak', price: 120, w: 1, d: 1, blocks: [], group: 'sleep', desc: 'Scrollování na telefonu, práce na notebooku.' },
  box: { name: 'Krabice', price: 20, w: 1, d: 1, blocks: [], group: 'sleep', desc: 'If it fits, I sits.' },
  catCondo: { name: 'Kočičí věž', price: 800, w: 2, d: 2, blocks: back(2), group: 'sleep', desc: 'Pelíšek ve výšce a krabice v přízemí.' },

  catTree: { name: 'Škrabadlo', price: 350, w: 2, d: 1, blocks: [[0, 0]], group: 'fun', desc: 'Broušení drápků a spaní nahoře.' },
  yarn: { name: 'Košík s klubíčky', price: 60, w: 1, d: 1, group: 'fun', desc: 'Klubíčko na honění a přihrávky.' },
  boombox: { name: 'Rádio', price: 250, w: 3, d: 2, blocks: [[1, 0]], group: 'fun', desc: 'Vibování a kočičí párty.' },
  tunnel: { name: 'Tunel', price: 300, w: 2, d: 1, blocks: [], group: 'fun', desc: 'Schovávání a přepadávání.' },
  aquarium: { name: 'Akvárium', price: 1200, w: 2, d: 2, blocks: back(2), group: 'fun', desc: 'Rybičky, na které se dá zírat hodiny.' },
  wheel: { name: 'Kočičí kolo', price: 1500, w: 1, d: 2, blocks: back(1), group: 'fun', desc: 'Kardio pro kočky.' },
  tv: { name: 'Retro TV s konzolí', price: 900, w: 2, d: 2, blocks: back(2), group: 'fun', desc: 'Hraní her, sólo i ve dvou.' },
  piano: { name: 'Piano', price: 1400, w: 2, d: 2, blocks: back(2), group: 'fun', desc: 'Koncert po klávesách tlapkami.' },
  foosball: { name: 'Fotbálek', price: 1100, w: 3, d: 1, blocks: [[1, 0]], group: 'fun', desc: 'Zápas jedna na jednu.' },
  pinball: { name: 'Pinball', price: 1800, w: 1, d: 2, blocks: back(1), group: 'fun', desc: 'Blikající světla a tilt.' },
  arcade: { name: 'Arkádový automat', price: 2500, w: 1, d: 2, blocks: back(1), group: 'fun', desc: 'MŇAU-MAN a souboje o rekord.' },
  ballPit: { name: 'Bazének s míčky', price: 550, w: 2, d: 2, blocks: back(2), group: 'fun', desc: 'Skákání do barevných míčků.' },
  jukebox: { name: 'Jukebox', price: 900, w: 1, d: 2, blocks: back(1), group: 'fun', desc: 'Blikající hrací skříň. Hudbu vybíráš tlačítkem Jukebox.' },

  plant: { name: 'Rostlina', price: 40, w: 1, d: 1, group: 'decor', desc: 'Trocha zeleně.' },
  lamp: { name: 'Stojací lampa', price: 80, w: 1, d: 1, group: 'decor', desc: 'Teplé světlo na večer.' },
  trophyCase: { name: 'Vitrína se sbírkou', price: 450, w: 2, d: 2, blocks: back(2), group: 'decor', desc: 'Vystaví, co kočky našly a ulovily.' },
  rug: { name: 'Koberec', price: 100, w: 3, d: 3, blocks: [], layer: 'floor', group: 'decor', desc: 'Retro vzor pod tlapky.' },

  flowerbed: { name: 'Záhon', price: 120, w: 2, d: 2, blocks: back(2), group: 'garden', outdoor: true, desc: 'Kytky a motýli na honění.' },
  birdbath: { name: 'Pítko pro ptáky', price: 350, w: 1, d: 2, blocks: back(1), group: 'garden', outdoor: true, desc: 'Ptáčci, na které se dá číhat.' },
  pond: { name: 'Jezírko', price: 900, w: 2, d: 2, blocks: back(2), group: 'garden', outdoor: true, desc: 'Rybičky a voda na pití.' },
  gardenTree: { name: 'Strom', price: 700, w: 2, d: 2, blocks: [[0, 0]], group: 'garden', outdoor: true, desc: 'Spaní ve větvích.' },
  deckchair: { name: 'Lehátko', price: 250, w: 1, d: 2, blocks: [], group: 'garden', outdoor: true, desc: 'Opalování na zahradě.' },
  catHouse: { name: 'Venkovní budka', price: 400, w: 2, d: 2, blocks: back(2), group: 'garden', outdoor: true, desc: 'Šlofík venku pod střechou.' },
  gnome: { name: 'Zahradní trpaslík', price: 60, w: 1, d: 2, blocks: back(1), group: 'garden', outdoor: true, desc: 'Kočky ho podezírají.' },
  lantern: { name: 'Zahradní lucerna', price: 90, w: 1, d: 1, group: 'garden', outdoor: true, desc: 'Svítí na zahradu v noci.' },
};

// The basic office every game starts with.
export const DEFAULT_ITEMS = [
  { type: 'desk', x: 4, z: 2, rot: 0 },
  { type: 'desk', x: 7, z: 2, rot: 0 },
  { type: 'desk', x: 4, z: 5, rot: 0 },
  { type: 'coffee', x: 1, z: 0, rot: 0 },
  { type: 'bowls', x: 0, z: 0, rot: 0 },
  { type: 'bed', x: 1, z: 8, rot: 0 },
];

export function footprintSize(item) {
  const def = ITEMS[item.type];
  return item.rot % 2 ? { w: def.d, d: def.w } : { w: def.w, d: def.d };
}

// Local tile (i, j) of an item to world tile.
export function localToWorldTile(item, i, j) {
  const def = ITEMS[item.type];
  const { w, d } = footprintSize(item);
  const lx = -def.w / 2 + i + 0.5;
  const lz = -def.d / 2 + j + 0.5;
  const a = (item.rot * Math.PI) / 2;
  const wx = item.x + w / 2 + lx * Math.cos(a) + lz * Math.sin(a);
  const wz = item.z + d / 2 - lx * Math.sin(a) + lz * Math.cos(a);
  return [Math.floor(wx), Math.floor(wz)];
}

export function footprintTiles(item) {
  const def = ITEMS[item.type];
  const tiles = [];
  for (let j = 0; j < def.d; j++) for (let i = 0; i < def.w; i++) tiles.push(localToWorldTile(item, i, j));
  return tiles;
}

export function blockedTiles(item) {
  const def = ITEMS[item.type];
  const local = def.blocks ?? Array.from({ length: def.w * def.d }, (_, k) => [k % def.w, Math.floor(k / def.w)]);
  return local.map(([i, j]) => localToWorldTile(item, i, j));
}

export const doorTile = (size) => [size - 2, 0];

// The walkable area: the square room, plus the garden behind the south wall.
export function layoutOf(room, garden = false) {
  return { room, w: room, d: room + (garden ? GARDEN.depth : 0), garden };
}

const asLayout = (layout) => (typeof layout === 'number' ? layoutOf(layout) : layout);

// The hedge between the room and the lawn, except for the garden door.
export function hedgeTiles(layout) {
  const L = asLayout(layout);
  if (!L.garden) return [];
  const tiles = [];
  for (let i = 0; i < L.w; i++) if (!GARDEN.gap.includes(i)) tiles.push([i, L.room]);
  return tiles;
}

export const inGarden = (layout, j) => asLayout(layout).garden && j >= asLayout(layout).room;

// Why an item cannot go here, or null when it can.
export function placementProblem(items, item, layout, ignoreUid = null) {
  const L = asLayout(layout);
  const size = L.room;
  const def = ITEMS[item.type];
  if (!def) return 'Neznámý předmět';
  const tiles = footprintTiles(item);
  if (tiles.some(([i, j]) => i < 0 || j < 0 || i >= L.w || j >= L.d)) return L.garden ? 'Mimo kancelář a zahradu' : 'Mimo místnost';
  if (def.outdoor && tiles.some(([, j]) => j < size + 1)) return L.garden ? 'Patří na trávník v zahradě' : 'Nejdřív kup zahradu';
  if (!def.outdoor && tiles.some(([, j]) => j >= size)) return 'Patří dovnitř';
  const [di, dj] = doorTile(size);
  if (def.layer !== 'floor' && tiles.some(([i, j]) => (i === di && j <= 1) || (i === di + 1 && j === 0))) return 'Blokuje dveře';
  const mine = new Set(tiles.map(([i, j]) => `${i},${j}`));
  for (const other of items) {
    if (other.uid === ignoreUid) continue;
    const odef = ITEMS[other.type];
    if (!odef || (odef.layer === 'floor') !== (def.layer === 'floor')) continue;
    if (footprintTiles(other).some(([i, j]) => mine.has(`${i},${j}`))) return 'Překáží jinému předmětu';
  }
  return null;
}

// Every free tile must stay reachable from the door, so nothing gets walled in.
export function blocksPaths(items, layout) {
  const L = asLayout(layout);
  const blocked = new Set(hedgeTiles(L).map(([i, j]) => `${i},${j}`));
  for (const item of items) for (const [i, j] of blockedTiles(item)) blocked.add(`${i},${j}`);
  const [di, dj] = doorTile(L.room);
  const seen = new Set([`${di},${dj}`]);
  const queue = [[di, dj]];
  while (queue.length) {
    const [i, j] = queue.shift();
    for (const [ni, nj] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
      const key = `${ni},${nj}`;
      if (ni < 0 || nj < 0 || ni >= L.w || nj >= L.d || blocked.has(key) || seen.has(key)) continue;
      seen.add(key);
      queue.push([ni, nj]);
    }
  }
  let inside = 0;
  for (const key of blocked) {
    const [i, j] = key.split(',').map(Number);
    if (i >= 0 && j >= 0 && i < L.w && j < L.d) inside++;
  }
  return seen.size < L.w * L.d - inside;
}
