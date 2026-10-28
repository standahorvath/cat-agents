// Stable name and fur for every session, unique while there are any left.

export const FURS = [
  { id: 'zrzek', base: '#E8913A', stripe: '#A9561B', belly: '#F7D6A8', eye: '#6FBF5A' },
  { id: 'mourek', base: '#9AA0AE', stripe: '#5A606E', belly: '#DDE0E6', eye: '#E8C547' },
  { id: 'cerna', base: '#2E2B38', belly: '#3E3A4C', eye: '#F2C94C', colorEyes: true },
  { id: 'bila', base: '#F1EEE9', belly: '#FFFFFF', ear: '#F3C0C0', eye: '#6EB5E8', colorEyes: true },
  { id: 'siamka', base: '#EADBC2', points: '#4E3A2C', belly: '#F5ECDD', eye: '#5FA8F0', colorEyes: true },
  { id: 'tribarevna', base: '#F4EEE4', patches: ['#E58B3A', '#34313C'], belly: '#FFFFFF', eye: '#8BC34A' },
  { id: 'smoking', base: '#2E2B38', belly: '#F4F2EE', tuxedo: true, eye: '#A6D86B', colorEyes: true },
  { id: 'hnedy', base: '#8A6A4A', stripe: '#4A3626', belly: '#C9A983', eye: '#E0B347' },
  { id: 'modra', base: '#7A8698', belly: '#9AA4B4', eye: '#7FCB5A', colorEyes: true },
  { id: 'kremova', base: '#F2D9A8', stripe: '#D9B07A', belly: '#FBEBD0', eye: '#E8913A' },
];

// Rare furs the player unlocks (see RARE_FURS in shared/cats.js). `stripes` gives
// every stripe its own colour, `specks` sprinkles dots, `glow` makes the stripes
// and eyes light up in the dark.
export const RARE_LOOKS = {
  silver: { id: 'silver', base: '#C9CED6', stripe: '#7E8590', belly: '#EEF0F4', eye: '#5FA8F0', colorEyes: true },
  gold: { id: 'gold', base: '#E8C547', stripe: '#B8912A', belly: '#F7E7A0', eye: '#3A6FD0', colorEyes: true },
  galaxy: { id: 'galaxy', base: '#2A2550', stripe: '#4E3F9A', belly: '#3B3570', eye: '#FFE14F', colorEyes: true, specks: '#FFFFFF' },
  neon: { id: 'neon', base: '#2B2140', stripes: ['#FF3D9A', '#4FE0FF', '#FF3D9A', '#4FE0FF'], belly: '#3A2E55', eye: '#4FE0FF', colorEyes: true, glow: true },
  leopard: { id: 'leopard', base: '#E3B25A', belly: '#F7E2B4', eye: '#6FBF5A', specks: '#4A3020' },
  ghost: { id: 'ghost', base: '#E4E9F2', belly: '#F7F9FC', ear: '#C9D2E0', eye: '#7CFFB0', colorEyes: true, glow: true },
  rainbow: { id: 'rainbow', base: '#F4F2EE', stripes: ['#FF4F4F', '#FFB347', '#7CD87A', '#5FA8F0'], belly: '#FFFFFF', eye: '#B05AFF', colorEyes: true },
};

// Grammatical gender of each name, so the cats talk about themselves correctly.
const FEMALE = new Set(['Micka', 'Tlapka', 'Líza', 'Bublina', 'Mína', 'Kulička', 'Sněhurka', 'Rozárka']);
export const genderOf = (name) => (FEMALE.has(name) ? 'f' : 'm');

// "[m|f]" picks by the speaker's gender, "<m|f>" by the gender of the cat spoken to.
export function genderize(text, speaker, partner) {
  const pickBy = (gender, m, f) => (gender === 'f' ? f : m);
  return text
    .replace(/\[([^|\]]*)\|([^\]]*)\]/g, (_, m, f) => pickBy(speaker?.gender, m, f))
    .replace(/<([^|>]*)\|([^>]*)>/g, (_, m, f) => pickBy(partner?.gender, m, f));
}

const NAMES = [
  'Mourek', 'Micka', 'Šmudla', 'Tlapka', 'Fousek', 'Mikeš', 'Líza', 'Bublina',
  'Pepík', 'Zrzek', 'Mína', 'Čenda', 'Bertík', 'Kulička', 'Sněhurka', 'Rambo',
  'Tygřík', 'Bonifác', 'Rozárka',
];

export function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// Kittens may wear any fur, old or new.
export const furFor = (id) => FURS[hash(id) % FURS.length];

const identities = new Map();

// How long the lists were before new names and furs were added. Picking within
// the original part first keeps every existing cat's name and fur.
const LEGACY_NAMES = 16;
const LEGACY_FURS = 8;

function firstFree(list, start, taken, legacy = list.length) {
  for (let i = 0; i < legacy; i++) {
    const candidate = list[(start + i) % legacy];
    if (!taken.has(candidate)) return candidate;
  }
  for (const candidate of list.slice(legacy)) if (!taken.has(candidate)) return candidate;
  return list[start % legacy];
}

function identityFor(id) {
  if (!identities.has(id)) {
    const all = [...identities.values()];
    identities.set(id, {
      name: firstFree(NAMES, hash(`${id}:name`), new Set(all.map((i) => i.name)), LEGACY_NAMES),
      fur: firstFree(FURS, hash(id), new Set(all.map((i) => i.fur)), LEGACY_FURS),
    });
  }
  return identities.get(id);
}

export const catName = (id) => identityFor(id).name;
export const catFur = (id) => identityFor(id).fur;
