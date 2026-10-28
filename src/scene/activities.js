// What cats do. Each activity says where to go (a spot kind or a custom target),
// which pose to hold and for how long; optional hooks script multi-step gags.
// Hooks get (agent, act, t, dt); act.elapsed is the time since arrival.
//
// Speech is tied to the activity so it always fits: `startLines` are said on
// arrival, `lines` now and then while the activity lasts. Working cats talk shop
// (WORK_LINES per tool), thinking cats think out loud, sleeping cats only snore.

const PI = Math.PI;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export const WORK_LINES = {
  shell: [
    'ťuk ťuk ťuk', 'sudo mňau', 'npm install…', 'kompiluju', 'rm -rf? ne.', 'testy běží', 'zelená!',
    'proč to padá?', 'git push', 'ještě jeden build', 'funguje mi to lokálně', 'kdo smazal node_modules?',
    'pouštím testy', 'deploy v pátek? ne', 'chmod 777? radši ne', 'čekám na build', 'kdo rozbil main?',
    'jen jeden commit', 'lint je zelený', 'docker compose up', 'mergeuju', 'konflikt v gitu…',
    'rebase, drž se', 'kdo pustil cron?', 'logy, logy, logy', 'exit code 0!', 'ještě jednou npm test',
    'u mě to funguje', 'kdo pushnul na main?', 'sudo make me a sandwich', 'git blame… aha, to jsem [byl|byla] já',
    'vim? jak se odsud odchází?', 'ještě jeden --force', 'node_modules je těžší než já', 'it works! nevím proč',
    'kdo psal tenhle bash?', 'čekám na CI… zase', 'pipeline je červená', 'restart pomůže', 'zkusím to vypnout a zapnout',
    'segfault? v JavaScriptu?', 'kdo dal sleep 30?', 'grep -r tuňák', 'export KOCKA=1', 'yes | npm install',
  ],
  write: [
    'refaktoruju', 'ještě řádek', 'ctrl+s', 'tohle opravím', 'přejmenovávám', 'mažu mrtvý kód', 'píšu testy',
    'tabulátory!', 'čistý kód', 'tenhle if je zbytečný', 'extrahuju funkci', 'přidám typy',
    'tohle bude pěkné', 'komentář? zbytečný', 'odsazení!', 'přepisuju to celé', 'malý commit',
    'pojmenovat proměnnou je těžké', 'hotfix', 'smazat, napsat znovu',
    'tohle zjednoduším', 'magické číslo? konstanta!', 'odstraňuju TODO', 'přidám edge case',
    'to není bug, to je feature', 'TODO: opravit později (2019)', 'proměnná x2_final_FINAL', 'kdo potřebuje typy?',
    'mezery, ne tabulátory!', 'tabulátory, ne mezery!', 'tohle je dočasné řešení… navždy', 'přidám ještě jednu vrstvu abstrakce',
    'smazal jsem 300 řádků, cítím se skvěle', 'pojmenuju to data2', 'kopíruju ze Stack Overflow', 'regex, můj nepřítel',
    'tenhle soubor má 3000 řádků', 'jen malá změna… 47 souborů', 'komentář: tady jsou draci',
  ],
  read: [
    'hmm…', 'čtu dokumentaci', 'kde to jen je?', 'čmuchám v kódu', 'grepuju', 'aha, tady', 'kdo tohle psal?', 'zajímavé…',
    'čtu changelog', 'tohle je starý kód', 'kde se to volá?', 'sleduju stopu', 'tady je ta chyba!', 'kdo napsal tenhle regex?',
    'aha, proto to padá', 'čtu testy', 'hledám definici',
    'kdo to psal? aha, já', 'tohle nikdo nečetl od roku 2015', 'dokumentace lže', 'tady je komentář "nesahat"',
    'proč je to tak složité?', 'kód jako špagety', 'jeden soubor, tisíc importů', 'legacy, má láska',
  ],
  web: [
    'googlím', 'stack overflow', 'jen se podívám', 'čtu docs', 'mám otevřených 40 tabů', 'tohle už někdo řešil',
    'tenhle blog je z roku 2012', 'čtu issue na GitHubu', 'jen jeden článek', 'API dokumentace', 'tohle by mohlo fungovat',
    'odpověď je z roku 2009', 'release notes', 'tutoriál o kočkách? ne',
    'marked as duplicate', 'stejný problém, žádná odpověď', 'jen se podívám na jedno video…', 'kdo napsal tenhle návod?',
    'přijmout cookies? ne', 'ta odpověď má 3000 hlasů', 'čtu docs verze 1.0, mám 5.0',
  ],
  agent: [
    'koťata, makat!', 'deleguju', 'porada!', 'rozdělím úkoly', 'kdo to vezme?', 'koťata, hlášení!',
    'ty to prozkoumej', 'čekám na výsledky', 'dobrá práce, koťata', 'paralelně je to rychlejší',
    'každé kotě jeden úkol', 'kdo je hotový?',
    'koťata, žádné naschvály', 'kdo z vás snědl granule?', 'scrum master mňau', 'sprint planning!', 'deleguju delegování',
  ],
  mcp: [
    'restartuju server', 'volám kámoše', 'plug and pray', 'zkusím to znovu', 'kabel je v pořádku',
    'ping… pong', 'nástroj odpověděl', 'zkusím jiný endpoint', 'spojení navázáno',
    'timeout? zkusím znovu', 'server mňouká zpátky',
    '418: jsem konvice', 'API vrací kočku', 'rate limit… čekám', 'protokol? mňauTP',
  ],
  other: [
    'makám', 'dělám věci', 'skoro hotovo', 'ještě chvilku', 'pracuju na tom', 'ještě jedna věc', 'soustředím se', 'v proudu', 'neruš prosím',
    'hotovo za 5 minut (hodin)', 'odhad: 2 dny, realita: 2 týdny', 'tohle je jednoduchá změna, že?', 'kódím jako o život',
  ],
};

export const THINK_LINES = [
  'hmm…', 'jak na to?', 'mám nápad!', 'počkej…', 'promýšlím to', 'a co když…', 'to by šlo', 'kde je chyba?',
  'dává to smysl?', 'nakreslím si to', 'jednodušší řešení…', 'zkusím to obráceně', 'kde jsem to [viděl|viděla]?', 'logicky vzato…', 'počkat, ne',
  'rozložím to na kroky', 'co by udělal senior?', 'hmm, edge case',
  'zeptám se kachničky', 'je to vůbec potřeba?', 'nejdřív test, pak kód', 'tohle bude vtipné vysvětlovat',
  'kde je ten off-by-one?', 'jsou dvě těžké věci…', 'co kdyby to byl cache?', 'je to DNS. vždycky je to DNS',
  'překombinovávám to?', 'nakreslím si to na tabuli', 'proč to vůbec funguje?', 'myslím, tedy mňoukám',
];
export const SLEEP_LINES = [
  'zzz…', 'chrrr', 'mňam… tuňák…', 'jen pět minut', 'mrrr…', 'zzz… refaktor…', 'myš… myšička…', 'chrrr… psssst', 'mňau… mňau…', 'zzz… deploy…', 'mrr… klubíčko…',
  'zzz… merge conflict…', 'chrrr… ne, v pátek ne…', 'mrr… zelené testy…', 'zzz… ještě pět commitů…',
];
export const ALERT_LINES = [
  'potřebuju tě', 'schválíš to?', 'mňááu!', 'můžu pokračovat?', 'čekám na tebe', 'haló, jsi tam?',
  'potřebuju povolení', 'klikni na mě', 'čekám tu už dlouho', 'jen jedno ano', 'mám otázku', 'pustíš mě dál?',
  'enter, prosím', 'jen jeden klik', 'mňau! MŇAU!', 'zase čekám na člověka', 'povolíš mi rm -rf? dělám si srandu',
];

// Said now and then while slacking at something without its own lines.
export const IDLE_LINES = [
  'kdo snědl můj tuňák?', 'mňau-driven development', 'jsem senior kočka', '404: motivace nenalezena', 'pauza je taky práce',
  'dneska jsem [udělal|udělala] hodně… spánku', 'kde je šéf?', 'mám nápad na startup: granule jako služba', 'pátek už?',
  'kafe? kafe.', 'tohle je moje pracovní pozice', 'práce počká, já ne', 'kočky nepracují, kočky dohlíží',
  'moje KPI je spánek', 'agilní flákání', 'na standupu řeknu, že jsem [ladil|ladila]', 'nemám bug, mám feature', 'tady je to jako v open space',
  'slyšeli jste ty drby?', 'mám hlad. zase', 'prý budou nové granule', 'kdo zase nechal otevřenou lednici?', 'čekám, až se něco stane',
];

// Lines typical for each personality.
export const TRAIT_LINES = {
  calm: ['v klidu', 'hlavně pohoda', 'nic nespěchá', 'dýchej, mňau', 'všechno dobře dopadne'],
  grumpy: ['všechno je špatně', 'kdo tu zase mňouká?', 'nesnáším pondělí. a úterý', 'tohle se mi nelíbí', 'za mých časů…', 'hmpf'],
  gossip: ['slyšeli jste to?', 'mám drby!', 'to vám musím říct', 'víte, kdo s kým…?', 'ode mě to nemáte'],
  gamer: ['kdo si dá partii?', 'jsem [nejlepší hráč|nejlepší hráčka]', 'ještě jedno kolo', 'gg ez', 'odveta kdykoliv'],
  cuddly: ['mám vás všechny [rád|ráda]', 'kdo se chce mazlit?', 'objímačka?', 'prrr', 'jste nejlepší'],
  prankster: ['hehe', 'mám plán', 'někdo dostane okurku', 'nikdo nic neviděl', 'to jsem [nebyl já|nebyla já]'],
  diva: ['jsem dneska krásná', 'kde je moje světlo?', 'fotky jen z levé strany', 'potlesk, prosím', 'tahle srst nebyla levná'],
  nerd: ['víte, že…?', '[přečetl|přečetla] jsem celou dokumentaci', 'technicky vzato…', 'to je O(n²)', 'mám na to RFC'],
};
// Favourite pastimes of each personality (weight multipliers).
const TRAIT_ACTS = {
  calm: { sunbathe: 1.5, loafFloor: 1.5, watchFish: 1.5 },
  grumpy: { stare: 2, boxSit: 2, catExe: 1.5 },
  gossip: { phoneIdle: 2, windowWatch: 1.5, coffee: 1.5 },
  gamer: { arcade: 2, pinballPlay: 2, playTV: 2, ballPitPlay: 1.5 },
  cuddly: { yarn: 1.5, sleepBed: 1.3, groom: 1.5 },
  prankster: { knockCup: 2.5, cucumberScare: 1.5, zoomies: 1.5, tunnelHide: 1.5 },
  diva: { groom: 3, crabDance: 2, oiiaSpin: 1.5, vibe: 1.5 },
  nerd: { duckDebug: 3, admireTrophies: 1.5, matrixDodge: 1.5 },
};

// Lines that fit the day and the hour (Friday deploys, Monday mornings, lunch).
export function timeLines(date) {
  const day = date.getDay();
  const h = date.getHours() + date.getMinutes() / 60;
  if (h < 4) return ['spát? kdo potřebuje spát', 'noční směna', 'ještě jeden bug a jdu spát', 'v noci je kód čistší', '3 ráno, ideální čas na refaktor', 'proč jsme ještě vzhůru?'];
  if (day === 5 && h >= 13) return ['v pátek se nedeployuje', 'už je skoro víkend', 'žádné velké změny, je pátek', 'jen malý hotfix… v pátek?', 'kdo deployuje v pátek, deployuje i v sobotu', 'páteční odpoledne, mozek vypnutý'];
  if (day === 0 || day === 6) return ['proč pracujeme o víkendu?', 'víkendová směna', 'nikdo tu není', 'víkend je na spaní', 'o víkendu se nedeployuje taky'];
  if (day === 1 && h < 12) return ['pondělí…', 'kafe. hodně kafe', 'kdo vymyslel pondělí?', 'víkend byl moc krátký', 'pondělní standup…', 'v pondělí nic nefunguje'];
  if (h >= 7.5 && h < 9.5) return ['dobré ráno', 'první kafe', 'kde mám mozek?', 'nejdřív kafe, pak kód', 'ranní standup'];
  if (h >= 11.5 && h < 13) return ['oběd?', 'kdo jde na oběd?', 'mám hlad jako vlk', 'polední pauza!', 'dneska je tuňák'];
  if (h >= 14.5 && h < 16.5) return ['odpolední krize', 'potřebuju cukr', 'tenhle meeting mohl být e-mail', 'ještě dvě hodiny'];
  if (h >= 21) return ['už bych [měl|měla] jít domů', 'přesčas', 'ještě jeden commit a končím'];
  return null;
}

const deskFilter = (agent) => (s) => s.desk === agent.deskIndex;

function desk(pose, screen) {
  return { spot: 'desk', filter: deskFilter, pose, screen, work: true };
}

export const ACTIVITIES = {
  // Work
  deskShell: desk('typingFast', 'shell'),
  deskWrite: desk('typing', 'write'),
  deskOther: desk('typing', 'other'),
  deskWeb: desk('typing', 'web'),
  deskRead: desk('read', 'read'),
  deskAgent: desk('typing', 'agent'),
  deskThink: { ...desk('think', 'think'), work: false, think: true, dur: [6, 12], bubble: '?' },

  phone: { spot: 'beanbag', fallback: 'couch', pose: 'phone', work: true, label: 'web' },
  laptopWork: { spot: 'beanbag', fallback: 'couch', pose: 'typing', work: true, laptop: true },

  readShelf: {
    spot: 'shelf',
    work: true,
    label: 'read',
    pose: (a, act) => (act.elapsed < 1.4 ? 'fiddle' : 'read'),
    heading: (a, act) => (act.elapsed < 1.4 ? PI : act.spot.heading),
  },

  fixServer: {
    spot: 'rack',
    work: true,
    label: 'mcp',
    pose: 'fiddle',
    tick(a, act, t, dt) {
      if (Math.random() < dt * 2.5) {
        const p = act.spot.fx;
        for (let k = 0; k < 3; k++) a.office.spawnParticle('spark', p.x + rnd(-0.2, 0.2), p.y + rnd(-0.3, 0.3), p.z);
      }
    },
  },

  present: { spot: 'board', work: true, label: 'agent', pose: 'present' },

  // Thinking
  pace: {
    think: true,
    bubble: '?',
    dur: [7, 11],
    target: (a) => a.nearPoint(2),
    tick(a) {
      if (a.moving) return;
      const p = a.nearPoint(2);
      a.goTo(p.x, p.z);
    },
    pose: 'stand',
  },
  windowThink: { think: true, spot: 'sill', pose: 'lookWindow', dur: [7, 12], bubble: '?' },
  tailChase: {
    think: true,
    meme: 'spins',
    dur: [2.5, 4],
    startLines: ['točím se', 'kde mám ocas?', 'točení pomáhá myslet', 'motá se mi hlava'],
    pose: 'run',
    tick(a, act, t, dt) {
      a.heading += dt * 9;
      a.phase += dt * 15;
    },
  },

  // Slacking
  sleepBed: {
    spot: 'bed',
    dur: [15, 35],
    sleep: true,
    asleepAfter: 3.5,
    startLines: ['jdu si lehnout', 'dobrou', 'hnětu pelíšek', 'čas na šlofíka', 'nebudit!'],
    pose: (a, act) => (act.elapsed < 3.5 ? 'knead' : 'sleepCurl'),
    bubble: (a, act) => (act.elapsed > 3.5 ? 'z' : null),
  },
  couchNap: {
    spot: 'couch',
    dur: [18, 45],
    sleep: true,
    asleepAfter: 2,
    startLines: ['gauč je můj', 'pohodička', 'jen si na chvíli lehnu', 'nejlepší místo v kanclu'],
    start: (a, act) => (act.state.pose = pick(['sleepCurl', 'lieSide', 'loaf'])),
    pose: (a, act) => act.state.pose,
    bubble: (a, act) => (act.state.pose === 'loaf' ? null : 'z'),
  },
  fireWarm: {
    spot: 'fire',
    dur: [15, 40],
    sleep: true,
    asleepAfter: 6,
    startLines: ['teploučko', 'krb je život', 'ohříju si bříško', 'u krbu je nejlíp', 'praská to tak hezky'],
    pose: (a, act) => (act.elapsed < 6 ? 'warmFire' : 'lieSide'),
    bubble: (a, act) => (act.elapsed > 6 ? 'z' : null),
  },
  treeNap: {
    spot: 'treeTop',
    dur: [15, 35],
    sleep: true,
    asleepAfter: 5,
    startLines: ['[král|královna] stromu', 'odsud vidím všechno', 'nahoře je klid'],
    pose: (a, act) => (act.elapsed < 5 ? 'loaf' : 'sleepCurl'),
    bubble: (a, act) => (act.elapsed > 5 ? 'z' : null),
  },
  sleepDesk: {
    spot: 'deskTop',
    dur: [15, 35],
    sleep: true,
    asleepAfter: 4,
    startLines: ['klávesnice hřeje', 'tady je teplo', 'qwertzuiop', 'nejteplejší místo v kanclu'],
    pose: (a, act) => (act.elapsed < 4 ? 'loaf' : 'sleepCurl'),
    bubble: (a, act) => (act.elapsed > 4 ? 'z' : null),
  },
  boxSit: { spot: 'box', pose: 'loaf', dur: [10, 25], startLines: ['if it fits, I sits', 'moje krabice', 'krabice!'], lines: ['krabice > pelíšek', 'krabice je život', 'nikdo mě nevidí'] },
  sunbathe: {
    spot: 'sun',
    dur: [15, 40],
    sleep: true,
    asleepAfter: 4,
    startLines: ['sluníčko!', 'opalovačka', 'sluníčko hřeje', 'bříško na slunce'],
    pose: (a, act) => (act.elapsed < 4 ? 'lieSide' : 'bellyUp'),
  },

  coffee: {
    spot: 'coffee',
    sound: 'coffee',
    dur: [11, 16],
    startLines: ['kafíčko', 'bez kafe ani ránu', 'espresso!', 'dvojité, prosím'],
    lines: ['ještě jedno', 'tohle je dobré', 'srk', 'kofein!', 'tohle mě nakopne', 'bez cukru'],
    pose: (a, act) => (act.elapsed < 3.2 ? 'coffeeMake' : 'mug'),
    heading: (a, act) => (act.elapsed < 3.2 ? PI : a.cameraHeading()),
    tick(a, act, t, dt) {
      if (act.elapsed < 3.2 && Math.random() < dt * 8) {
        const p = act.spot.spout;
        a.office.spawnParticle('steam', p.x + rnd(-0.03, 0.03), p.y, p.z);
      }
    },
  },

  yarn: {
    dur: [12, 20],
    startLines: ['klubíčko!', 'moje!', 'kutálí se!'],
    lines: ['chyť ho!', 'pac pac', 'utíká mi', '[zamotal|zamotala] jsem se', 'jééé'],
    needs: 'yarn',
    target: (a) => ({ x: a.office.yarn.x + 0.35, z: a.office.yarn.z }),
    run: true,
    pose: (a, act) => (act.state.near ? 'bat' : 'stand'),
    tick(a, act, t) {
      const ball = a.office.yarn;
      const d = Math.hypot(ball.x - a.pos.x, ball.z - a.pos.z);
      act.state.near = d < 0.5;
      if (act.state.near) {
        a.stop();
        a.faceTowards(ball.x, ball.z);
        if (t > (act.state.kickAt ?? 0)) {
          act.state.kickAt = t + rnd(0.9, 1.6);
          a.office.kickYarn(ball.x - a.pos.x + rnd(-0.6, 0.6), ball.z - a.pos.z + rnd(-0.6, 0.6), rnd(1.2, 2.2));
        }
      } else if (!a.moving || t > (act.state.repath ?? 0)) {
        act.state.repath = t + 0.8;
        a.goTo(ball.x - Math.sign(ball.vx || 1) * 0.3, ball.z, { run: true });
      }
    },
  },

  eat: { spot: 'food', pose: 'drink', dur: [5, 8], startLines: ['mňam', 'granule!', 'kde je tuňák?', 'konečně jídlo', 'zase granule?'] },
  drink: { spot: 'water', pose: 'drink', dur: [4, 7], startLines: ['chlemst', 'žízeň', 'osvěžení', 'voda je mokrá'] },
  scratchPost: { spot: 'scratch', pose: 'scratch', dur: [4, 7], startLines: ['škrab škrab', 'brousím drápky', 'drápky jako břitva', 'lepší než gauč'] },
  groom: { pose: 'groom', dur: [6, 10], startLines: ['musím být [krásný|krásná]', 'olíznout a hotovo', 'čistota půl zdraví', 'tady je chlup'] },
  yawnStretch: { pose: (a, act) => (act.elapsed < 2.5 ? 'stretch' : 'yawn'), dur: [4.5, 5.5], startLines: ['áááách', 'protáhnout', 'jsem [nějaký unavený|nějaká unavená]', 'zívání je nakažlivé'] },
  windowWatch: { spot: 'sill', pose: 'lookWindow', dur: [10, 20], startLines: ['ptáček!', 'venku je svět', 'chci ven'], lines: ['kakakaka', 'holub!', 'jednou ho chytím', 'tam letí moucha', 'venku prší?'] },
  vibe: { spot: 'vibe', pose: 'vibe', dur: [12, 25], vibing: true, bubble: 'note', startLines: ['to je pecka', 'pusť to nahlas', 'tenhle beat!'], lines: ['bum bum bum', 'vibuju', 'tohle je moje písnička', 'tancuju', 'hlasitěji!'] },
  arcade: { spot: 'arcade', pose: 'arcade', sound: 'bleep', dur: [10, 20], startLines: ['ještě jedno kolo', 'insert coin', 'pac-mňau!'], lines: ['high score!', 'game over?!', 'skoro!', 'tenhle level je těžký', 'další život!'] },
  phoneIdle: { spot: 'beanbag', fallback: 'couch', pose: 'phone', dur: [10, 20], startLines: ['scrolluju memy', 'kočičí videa'], lines: ['haha kočky', 'ještě jedno video', 'tohle musíš vidět', 'lajkuju', 'tohle sdílím'] },

  knockCup: {
    meme: true,
    spot: 'knock',
    filter: (a) => (s) => a.office.cupOnDesk(s.desk),
    dur: [5, 6],
    pose: (a, act) => (act.elapsed < 1.8 ? 'knock' : 'stare'),
    heading: (a, act) => (act.elapsed < 1.8 ? PI : a.cameraHeading()),
    tick(a, act) {
      if (act.elapsed > 1.8 && !act.state.done) {
        act.state.done = true;
        a.office.knockCup(act.spot.desk);
        a.caption(pick(['ups', 'gravitace funguje', 'to já ne', 'nikdo nic neviděl', 'stejně byl ošklivý']));
      }
    },
  },

  zoomies: {
    startLines: ['zoomies!', 'brrrm', 'jóóó', 'neudržím se', 'vrrrm'],
    pose: 'stand',
    target: (a) => a.randomPoint(),
    run: true,
    tick(a, act) {
      if (a.moving) return;
      act.state.legs = (act.state.legs ?? 0) + 1;
      if (act.state.legs > 5) act.done = true;
      else {
        const p = a.randomPoint();
        a.goTo(p.x, p.z, { run: true });
      }
    },
  },

  laser: {
    startLines: ['laser!!', 'červená tečka!'],
    lines: ['kde je?!', 'mám tě!', 'zase utekla', 'tentokrát ji chytím', 'kde se bere?'],
    dur: [9, 12],
    start: (a) => a.office.startLaser(12),
    target: (a) => ({ x: a.office.laser.x, z: a.office.laser.z }),
    run: true,
    pose: (a, act) => (act.state.close ? 'crouch' : 'stand'),
    tick(a, act, t) {
      const l = a.office.laser;
      const d = Math.hypot(l.x - a.pos.x, l.z - a.pos.z);
      act.state.close = d < 0.45;
      if (act.state.close) {
        a.stop();
        a.faceTowards(l.x, l.z);
      } else if (!a.moving || t > (act.state.repath ?? 0)) {
        act.state.repath = t + 0.5;
        a.goTo(l.x, l.z, { run: true });
      }
    },
  },

  stare: { pose: 'stare', dur: [5, 8], facesCamera: true, startLines: ['…', 'vidím tě', 'hmm…', 'dívám se'] },
  meow: { pose: 'meow', sound: 'meow', dur: [3, 5], facesCamera: true, startLines: ['mňau', 'mňááu', 'krmení?', 'mňau?', 'pozornost, prosím'] },
  loafFloor: { target: (a) => a.randomPoint('lounge'), pose: 'loaf', dur: [10, 25], startLines: ['bochníček', 'jsem chleba', '[kulatý a spokojený|kulatá a spokojená]'] },
  wander: { target: (a) => a.randomPoint(), pose: 'sit', dur: [3, 6], startLines: ['procházka', 'co je nového?', 'kontrola kanceláře', 'jen se protáhnu'] },

  // Furniture from the shop
  watchFish: {
    spot: 'aquarium',
    dur: [10, 20],
    pose: (a, act) => (Math.floor(act.elapsed / 3) % 3 === 2 ? 'pawPat' : 'stare'),
    startLines: ['rybičky!', 'tamta je moje', 'kolik jich tam je?'],
    lines: ['ťuk ťuk na sklo', 'ta oranžová mě provokuje', 'jednou vás dostanu', 'hypnotické…'],
  },
  wheelRun: {
    spot: 'wheel',
    dur: [8, 16],
    pose: 'run',
    tick(a, act, t, dt) {
      a.phase += dt * 16;
    },
    startLines: ['kardio!', 'jdu si zaběhat'],
    lines: ['běžím, ale nikam', 'ještě kolečko', 'cítím ten pump', 'uf uf uf'],
  },
  hammockNap: {
    spot: 'hammock',
    dur: [18, 40],
    sleep: true,
    asleepAfter: 3,
    startLines: ['houpy houp', 'jako na dovolené'],
    pose: (a, act) => (act.elapsed < 3 ? 'loaf' : 'lieSide'),
    bubble: (a, act) => (act.elapsed > 3 ? 'z' : null),
  },
  heatNap: {
    spot: 'heatpad',
    dur: [18, 40],
    sleep: true,
    asleepAfter: 3,
    startLines: ['vyhřívaná deka!', 'tohle je ráj', 'teploučko na bříško'],
    pose: (a, act) => (act.elapsed < 3 ? 'knead' : 'sleepCurl'),
    bubble: (a, act) => (act.elapsed > 3 ? 'z' : null),
  },
  playTV: {
    spot: 'tv',
    dur: [12, 22],
    pose: 'gamepad',
    startLines: ['jedna hra', 'zapínám konzoli', 'kde je ovladač?'],
    lines: ['skok!', 'tenhle boss je těžký', 'uložit hru', 'ještě level'],
  },
  pinballPlay: {
    spot: 'pinball',
    sound: 'bleep',
    dur: [10, 18],
    pose: 'arcade',
    startLines: ['pinball!', 'pustím kuličku'],
    lines: ['tilt!', 'multiball!', 'ještě jednu kuličku', 'bonus!'],
  },
  pianoWalk: {
    spot: 'piano',
    dur: [8, 14],
    bubble: 'note',
    pose: 'walk',
    tick(a, act, t, dt) {
      // Stroll up and down the keys.
      const s = act.spot;
      const along = Math.sin(act.elapsed * 0.9) * 0.55;
      a.pos.set(s.x + Math.sin(s.heading) * along, 0, s.z + Math.cos(s.heading) * along);
      a.heading = s.heading + (Math.cos(act.elapsed * 0.9) > 0 ? 0 : Math.PI);
      a.phase += dt * 8;
    },
    startLines: ['koncert!', 'zahraju vám něco', 'Mňauzart, opus 1'],
    lines: ['plink plonk', 'tohle je jazz', 'improvizuju'],
  },
  tunnelHide: {
    spot: 'tunnel',
    dur: [8, 16],
    pose: 'loaf',
    startLines: ['schovka!', 'nikdo mě nenajde'],
    lines: ['psst', 'čekám na oběť', 'tady jsem v bezpečí'],
  },

  // Night
  stargaze: {
    spot: 'sill',
    pose: 'lookWindow',
    dur: [12, 22],
    startLines: ['hvězdy!', 'měsíc!', 'kolik je tam hvězd?', 'noc je krásná'],
    lines: ['támhle je Velký vůz', 'mňau na měsíc', 'padá hvězda?', 'přání: tuňák', 'je tma jako v pytli'],
  },

  // Garden
  butterflyChase: {
    spot: 'butterfly',
    outdoor: true,
    dur: [8, 14],
    pose: (a, act) => (Math.floor(act.elapsed / 1.4) % 2 ? 'bat' : 'crouch'),
    startLines: ['motýl!', 'chyť ho!', 'třepetá se!'],
    lines: ['skoro jsem ho [měl|měla]', 'pac!', 'ulétá mi', 'zase on!'],
  },
  birdWatch: {
    spot: 'bird',
    outdoor: true,
    dur: [10, 18],
    pose: (a, act) => (act.elapsed < 6 ? 'crouch' : 'stare'),
    startLines: ['ptáček…', 'psst, ani hnout', 'číhám'],
    lines: ['kakakaka', 'ještě kousek', 'uletěl!', 'příště ho mám'],
  },
  rollGrass: {
    target: (a) => a.randomPoint('garden'),
    outdoor: true,
    dur: [6, 10],
    pose: (a, act) => (Math.floor(act.elapsed / 1.2) % 2 ? 'bellyUp' : 'lieSide'),
    startLines: ['tráva!', 'válím se', 'to je měkké'],
    lines: ['šimrá to', 'jsem [celý zelený|celá zelená]', 'prrr'],
  },
  sniffFlowers: {
    target: (a) => a.randomPoint('garden'),
    outdoor: true,
    dur: [4, 7],
    pose: 'sniff',
    startLines: ['co to voní?', 'kytičky', 'čuch čuch'],
  },

  // New furniture
  printerNap: {
    spot: 'printer',
    dur: [18, 40],
    sleep: true,
    asleepAfter: 3,
    startLines: ['tiskárna hřeje', 'teplé papíry', 'tady se spí nejlíp'],
    pose: (a, act) => (act.elapsed < 3 ? 'knead' : 'sleepCurl'),
    bubble: (a, act) => (act.elapsed > 3 ? 'z' : null),
  },
  ballPitPlay: {
    spot: 'ballPit',
    dur: [8, 15],
    pose: (a, act) => (Math.floor(act.elapsed / 1.1) % 2 ? 'bat' : 'bellyUp'),
    startLines: ['míčky!', 'skok do míčků!', 'jupí!'],
    lines: ['kde jsem?', 'utopil jsem se v míčcích', 'ten modrý je můj', 'boing'],
  },
  catHouseNap: {
    spot: 'catHouse',
    outdoor: true,
    dur: [18, 40],
    sleep: true,
    asleepAfter: 3,
    startLines: ['moje budka', 'venku pod střechou', 'čerstvý vzduch'],
    pose: (a, act) => (act.elapsed < 3 ? 'loaf' : 'sleepCurl'),
    bubble: (a, act) => (act.elapsed > 3 ? 'z' : null),
  },
  admireTrophies: {
    spot: 'trophy',
    dur: [6, 10],
    pose: 'stare',
    startLines: ['naše sbírka', 'ta myš je moje', 'hezky se třpytí'],
    lines: ['ještě chybí pár kousků', 'to klubíčko je zlaté!', 'jsme dobří'],
  },
  gnomeStare: {
    spot: 'gnome',
    outdoor: true,
    dur: [6, 10],
    pose: (a, act) => (act.elapsed > 4 && act.elapsed < 5.5 ? 'hiss' : 'stare'),
    startLines: ['kdo jsi?', 'nehýbe se…', 'podezřelé'],
    lines: ['mrkl na mě!', 'hssss', 'já tě vidím', 'zase tu stojí'],
  },

  // Memes
  // `meme` counts the gag for the achievements (a string also counts its own stat).
  oiiaSpin: {
    meme: 'spins',
    dur: [3.5, 5],
    target: (a) => a.nearPoint(1),
    pose: 'spin',
    startLines: ['OIIA OIIA', 'oiiaiioiiiai', 'točím se!', 'iiiiaaa'],
    tick(a, act, t, dt) {
      a.heading += dt * (act.elapsed < 0.5 ? 5 : 20);
      if (act.elapsed > 3 && !act.state.said) {
        act.state.said = true;
        a.caption(pick(['motá se mi hlava', 'zase rovně', 'kde je sever?', 'to bylo dobré']));
      }
    },
  },
  cucumberScare: {
    meme: 'cucumbers',
    dur: [5.5, 6.5],
    target: (a) => a.nearPoint(2),
    start(a, act) {
      // An innocent cucumber appears behind the cat.
      const back = a.heading + PI;
      act.state.back = back;
      act.state.cuke = a.office.spawnProp('cucumber', a.pos.x + Math.sin(back) * 0.42, a.pos.z + Math.cos(back) * 0.42, { rot: back + PI / 2 });
    },
    pose: (a, act) => (act.elapsed < 2.2 ? 'sit' : act.elapsed < 3.2 ? 'startle' : 'hiss'),
    tick(a, act) {
      if (act.elapsed > 2.2 && !act.state.jumped) {
        act.state.jumped = true;
        a.targetLift = 0.55;
        a.world.sound?.play('boing');
        a.caption(pick(['AAAA! OKURKA!', 'HAD!', 'CO TO JE?!', 'zelené nebezpečí!', 'kdo to sem dal?!']));
      }
      if (act.elapsed > 2.2) a.heading = act.state.back;
      if (act.elapsed > 2.8) a.targetLift = 0;
      if (act.elapsed > 4.2 && !act.state.said) {
        act.state.said = true;
        a.caption(pick(['to nebylo vtipné', 'vůbec jsem se [nelekl|nelekla]', 'okurky nesnáším', 'kdo z vás to byl?']));
      }
    },
    end(a, act) {
      a.office.removeMesh(act.state.cuke);
      a.targetLift = 0;
    },
  },
  catExe: {
    meme: 'freezes',
    dur: [5.5, 6.5],
    target: (a) => a.nearPoint(2),
    pose: (a, act) => (act.elapsed < 3.8 ? 'frozen' : act.elapsed < 4.6 ? 'shake' : 'stand'),
    start(a) {
      a.caption(`${a.name}.exe neodpovídá`);
      a.world.sound?.play('glitch');
    },
    tick(a, act, t, dt) {
      if (act.elapsed < 3.8 && Math.random() < dt * 4) a.office.spawnParticle('spark', a.pos.x + rnd(-0.2, 0.2), a.lift + rnd(0.2, 0.6), a.pos.z + rnd(-0.2, 0.2));
      if (act.elapsed > 3.8 && !act.state.reboot) {
        act.state.reboot = true;
        a.world.sound?.play('powerUp');
        a.caption(pick(['restartuju…', 'ctrl+alt+mňau', 'zase běžím', 'aktualizace dokončena', 'kde jsem to [byl|byla]?']));
      }
    },
  },
  thisIsFine: {
    meme: true,
    spot: 'fire',
    dur: [8, 12],
    pose: 'mug',
    facesCamera: true,
    startLines: ['this is fine', 'všechno je v pořádku', 'v klidu'],
    lines: ['this is fine', 'nic nehoří', 'produkce je v pohodě', 'klid, mám kafe', 'testy? jaké testy?'],
    tick(a, act, t, dt) {
      if (Math.random() < dt * 9) a.office.spawnParticle('spark', a.pos.x + rnd(-0.45, 0.45), rnd(0.05, 0.5), a.pos.z + rnd(-0.45, 0.45));
    },
  },
  tinyBox: {
    meme: true,
    dur: [8, 12],
    target: (a) => a.randomPoint('room'),
    start(a, act) {
      act.state.box = a.office.spawnProp('tinyBox', a.pos.x, a.pos.z, { rot: a.heading });
    },
    pose: 'loaf',
    startLines: ['if I fits…', 'vejdu se!', 'krabička!', 'ta je přesně pro mě'],
    lines: ['…I sits', 'pohodlné', 'nevejdu se, ale sedím', 'přesně na míru', 'krabice je krabice'],
    tick(a) {
      a.targetLift = 0.07;
    },
    end(a, act) {
      a.office.removeMesh(act.state.box);
      a.targetLift = 0;
    },
  },
  matrixDodge: {
    meme: true,
    dur: [5.5, 6.5],
    target: (a) => a.nearPoint(2),
    pose: (a, act) => (act.elapsed > 0.8 && act.elapsed < 4.4 ? 'matrix' : 'stand'),
    startLines: ['tohle je Matrix', 'zpomalený záběr', 'uhýbám kulkám'],
    tick(a, act, t, dt) {
      // Something whooshes past, very slowly.
      if (act.elapsed > 1 && act.elapsed < 4 && Math.random() < dt * 10) {
        const side = a.heading + PI / 2;
        const k = (act.elapsed - 1) / 3 - 0.5;
        a.office.spawnParticle('puff', a.pos.x + Math.sin(side) * k * 2, 0.45, a.pos.z + Math.cos(side) * k * 2);
      }
      if (act.elapsed > 4.5 && !act.state.said) {
        act.state.said = true;
        a.caption(pick(['nikdo mě netrefí', 'jsem [vyvolený|vyvolená]', 'modrou pilulku, prosím', 'není žádná lžička']));
      }
    },
  },
  duckDebug: {
    meme: 'duckDebug',
    dur: [10, 13],
    target: (a) => a.nearPoint(2),
    start(a, act) {
      const h = a.heading;
      act.state.duck = a.office.spawnProp('duck', a.pos.x + Math.sin(h) * 0.4, a.pos.z + Math.cos(h) * 0.4, { rot: h + PI });
    },
    pose: (a, act) => (act.elapsed > 8 ? 'cheer' : act.elapsed % 3 < 1.6 ? 'present' : 'think'),
    startLines: ['takže, kachničko…', 'vysvětlím ti to', 'poslouchej, kachno'],
    tick(a, act) {
      const say = (at, lines) => {
        if (act.elapsed > at && !act.state[at]) {
          act.state[at] = true;
          a.caption(pick(lines));
        }
      };
      say(2.5, ['tady volám funkci…', 'tahle proměnná je null…', 'a pak to jde do cyklu…', 'tady načtu config…']);
      say(5.5, ['…a ten vrací…', '…a proč to…', '…a pak se to…', 'počkej…']);
      say(8, ['AHA! už to vidím!', 'díky, kachničko!', 'to je ono!', 'kachno, jsi génius']);
    },
    end(a, act) {
      a.office.removeMesh(act.state.duck);
    },
  },
  crabDance: {
    meme: true,
    dur: [9, 12],
    target: (a) => a.nearPoint(1),
    pose: 'crab',
    bubble: 'note',
    vibing: true,
    facesCamera: true,
    startLines: ['KRABÍ RAVE', 'tuc tuc tuc', 'krabí tanec!'],
    lines: ['klepy klep', 'bokem, bokem', 'tuc tuc', 'všichni krabi sem!'],
    start(a, act) {
      act.state.origin = { x: a.pos.x, z: a.pos.z };
      a.world.recruitDancers?.(a);
    },
    tick(a, act) {
      const o = act.state.origin;
      if (!o) return;
      const side = a.cameraHeading() + PI / 2;
      const k = Math.sin(act.elapsed * 2.2) * 0.22;
      a.pos.set(o.x + Math.sin(side) * k, 0, o.z + Math.cos(side) * k);
    },
  },

  // Events
  rideVacuum: {
    pose: 'loaf',
    start(a) {
      a.targetLift = 0.13;
    },
    startLines: ['jedu!', 'taxi!', 'brrrm', 'tohle je můj kůň'],
    lines: ['wííí', 'zatoč doleva!', 'mávám', 'kapitán vysavače hlásí'],
    tick(a, act) {
      const v = a.world.event?.vacuum;
      if (!v) {
        act.done = true;
        a.targetLift = 0;
        return;
      }
      a.pos.set(v.x, 0, v.z);
      a.heading = v.heading;
      a.targetLift = 0.13;
    },
  },
  chaseMouse: {
    dur: [10, 14],
    run: true,
    target: (a) => a.world.event?.mouse ?? a.randomPoint(),
    pose: (a, act) => (act.state.close ? 'crouch' : 'stand'),
    startLines: ['MYŠ!', 'tamhle!', 'moje!', 'kořist!'],
    tick(a, act, t) {
      const m = a.world.event?.mouse;
      if (!m) {
        act.done = true;
        return;
      }
      const d = Math.hypot(m.x - a.pos.x, m.z - a.pos.z);
      act.state.close = d < 0.5;
      if (!a.moving || t > (act.state.repath ?? 0)) {
        act.state.repath = t + 0.4;
        a.goTo(m.x, m.z, { run: true });
      }
    },
  },
  eatPizza: {
    dur: [7, 11],
    run: true,
    target: (a) => {
      const p = a.world.event?.pizza ?? a.randomPoint();
      const angle = Math.random() * PI * 2;
      return { x: p.x + Math.sin(angle) * 0.45, z: p.z + Math.cos(angle) * 0.45 };
    },
    heading: (a) => {
      const p = a.world.event?.pizza;
      return p ? Math.atan2(p.x - a.pos.x, p.z - a.pos.z) : null;
    },
    pose: 'drink',
    startLines: ['PIZZA!', 'kousek pro mě!', 'je tam tuňák?', 'mňam mňam'],
    lines: ['nejlepší den', 'ještě kousek', 'sýr!', 'kdo to platí?'],
  },

  // Work without furniture: a laptop on the floor always does.
  laptopFloor: { target: (a) => a.nearPoint(2), pose: 'typing', work: true, laptop: true },
  kittenFloor: {
    target: (a) => (a.parent ? { x: a.parent.pos.x + 0.6, z: a.parent.pos.z + 0.4 } : a.randomPoint()),
    run: true,
    pose: (a) => (a.category === 'think' ? 'think' : 'typing'),
    laptop: true,
  },

  // States
  alert: {
    spot: 'front',
    run: true,
    pose: 'alert',
    facesCamera: true,
    bubble: '!',
    sound: 'meow',
    start: (a) => a.caption('haló?!'),
    tick(a, act, t) {
      if (t > (act.state.next ?? act.t0 + 8)) {
        act.state.next = t + 8;
        a.caption(pick(ALERT_LINES));
      }
    },
  },

  leave: {
    target: (a) => a.office.spotsOf('door')[0],
    gait: 'walk',
    pose: 'stand',
    start(a) {
      a.office.openDoor(2.5);
      a.goTo(a.pos.x, -0.5, { direct: true });
      a.exiting = true;
    },
  },

  kittenWork: {
    spot: 'kitten',
    filter: (a) => (s) => s.desk === a.parent?.deskIndex,
    fallback: 'kitten',
    run: true,
    pose: (a) => (a.category === 'think' ? 'think' : 'typing'),
    laptop: true,
  },
};

// Needs an activity refills, in percent points per second spent on it. Reported to
// the server when the activity ends. Everything not listed here refills nothing.
const NAP = { energy: 0.8 };
export const RESTORES = {
  eat: { food: 4 },
  drink: { food: 2.5 },
  coffee: { food: 1.2, energy: 0.4 },
  sleepBed: NAP,
  couchNap: NAP,
  fireWarm: NAP,
  hammockNap: NAP,
  heatNap: NAP,
  treeNap: { energy: 0.7, fun: 0.2 },
  sleepDesk: { energy: 0.6 },
  sunbathe: { energy: 0.6 },
  boxSit: { energy: 0.3, fun: 0.2 },
  loafFloor: { energy: 0.3 },
  yarn: { fun: 1 },
  vibe: { fun: 1 },
  arcade: { fun: 1 },
  watchFish: { fun: 0.9 },
  wheelRun: { fun: 1 },
  playTV: { fun: 1 },
  pinballPlay: { fun: 1 },
  pianoWalk: { fun: 1 },
  tunnelHide: { fun: 0.8 },
  laser: { fun: 1.2 },
  stargaze: { fun: 0.5, energy: 0.2 },
  butterflyChase: { fun: 1 },
  birdWatch: { fun: 0.8 },
  rollGrass: { fun: 0.6, energy: 0.2 },
  sniffFlowers: { fun: 0.4 },
  chaseMouse: { fun: 1.2 },
  eatPizza: { food: 3, fun: 0.5 },
  printerNap: { energy: 0.8 },
  ballPitPlay: { fun: 1.1 },
  catHouseNap: { energy: 0.8 },
  admireTrophies: { fun: 0.4 },
  gnomeStare: { fun: 0.4 },
  rideVacuum: { fun: 1 },
  zoomies: { fun: 1.2 },
  scratchPost: { fun: 0.4 },
  phoneIdle: { fun: 0.5 },
  knockCup: { fun: 0.5 },
  windowWatch: { fun: 0.4 },
  oiiaSpin: { fun: 1.2 },
  tinyBox: { fun: 0.6, energy: 0.2 },
  duckDebug: { fun: 0.6 },
  crabDance: { fun: 1.2 },
  thisIsFine: { fun: 0.5, energy: 0.3 },
  matrixDodge: { fun: 0.8 },
  catExe: { fun: 0.4 },
  cucumberScare: { fun: 0.3 },
  tailChase: { fun: 0.8 },
};

// Rare finds for the collection: [item, chance] when the activity ends after a while.
export const FINDS = {
  yarn: ['goldenYarn', 0.05],
  eat: ['fishBone', 0.04],
  stargaze: ['shootingStar', 0.15],
  readShelf: ['oldFloppy', 0.04],
  sniffFlowers: ['fourLeaf', 0.08],
  rollGrass: ['fourLeaf', 0.04],
  boxSit: ['lostSock', 0.05],
  watchFish: ['rubberDuck', 0.04],
};

// Something fitting to say now and then during the current activity, or null.
export function ambientLine(agent, act) {
  const def = act.def;
  if (def.sleep) return act.elapsed > (def.asleepAfter ?? 3) ? pick(SLEEP_LINES) : null;
  // Now and then something about the day or the hour.
  const now = agent.office?.now?.() ?? new Date();
  const timely = timeLines(now);
  if (timely && Math.random() < 0.25) return pick(timely);
  if (def.work) return pick(WORK_LINES[agent.category] ?? WORK_LINES.other);
  if (agent.trait && TRAIT_LINES[agent.trait] && Math.random() < 0.2) return pick(TRAIT_LINES[agent.trait]);
  if (def.think) return pick(THINK_LINES);
  if (def.lines && Math.random() < 0.75) return pick(def.lines);
  return pick(IDLE_LINES);
}

// Which activity a working cat does for each kind of tool.
export function workActivity(category) {
  switch (category) {
    case 'shell':
      return 'deskShell';
    case 'write':
      return 'deskWrite';
    case 'web':
      return Math.random() < 0.6 ? 'phone' : 'deskWeb';
    case 'read':
      return Math.random() < 0.6 ? 'readShelf' : 'deskRead';
    case 'mcp':
      return 'fixServer';
    case 'agent':
      return Math.random() < 0.5 ? 'present' : 'deskAgent';
    default:
      return 'deskOther';
  }
}

export function thinkActivity(office) {
  const weights = { deskThink: 3, pace: 2, windowThink: 2, tailChase: 1, duckDebug: 0.8 };
  if (!office.has('desk')) delete weights.deskThink;
  return pickWeighted(weights);
}

// Whether the office has what an activity needs (furniture can be sold).
export function available(name, office) {
  const def = ACTIVITIES[name];
  if (def.needs === 'yarn' && !office.yarn) return false;
  if (def.outdoor && !(office.garden && office.outdoorOk)) return false;
  if (def.spot && !office.has(def.spot) && !(def.fallback && office.has(def.fallback))) return false;
  return true;
}

// Weights for slacking; the longer nothing happens, the sleepier the cats.
export function idleActivity(idleMinutes, daylight, office, needs, trait = null) {
  const phase = idleMinutes < 3 ? 0 : idleMinutes < 15 ? 1 : 2;
  const w = (early, mid, late) => [early, mid, late][phase];
  const weights = {
    watchFish: w(3, 2, 1),
    wheelRun: w(2, 1.5, 1),
    hammockNap: w(0.5, 1.5, 3),
    heatNap: w(0.5, 1.5, 3),
    playTV: w(3, 2, 1),
    pinballPlay: w(2, 2, 1),
    pianoWalk: w(2, 1, 0.5),
    tunnelHide: w(2, 2, 1),
    sleepBed: w(0.5, 2, 4),
    couchNap: w(0.5, 1.5, 3),
    fireWarm: w(0.5, 1.5, 3),
    treeNap: w(0.5, 1, 2),
    sleepDesk: w(0.5, 1, 2),
    boxSit: w(2, 2, 1),
    sunbathe: w(1, 1.5, 1.5) * (0.3 + daylight),
    coffee: w(3, 2, 1),
    yarn: w(3, 2, 1),
    eat: w(2, 1, 1),
    drink: w(2, 1, 1),
    scratchPost: w(2, 1, 0.5),
    groom: w(2, 2, 1),
    yawnStretch: w(1, 1, 1),
    windowWatch: w(2, 2, 1),
    vibe: w(3, 2, 1),
    arcade: w(3, 2, 1),
    phoneIdle: w(2, 2, 1),
    knockCup: w(2, 1.5, 1),
    zoomies: w(2, 1.5, 1),
    laser: w(2, 1, 0.3),
    stare: w(1, 1, 0.5),
    meow: w(1, 1, 0.3),
    loafFloor: w(1, 1.5, 1.5),
    wander: w(2, 2, 1),
    stargaze: 0,
    butterflyChase: w(2, 1, 0.5),
    birdWatch: w(2, 2, 1),
    rollGrass: w(1.5, 1, 0.5),
    sniffFlowers: w(2, 1, 0.5),
    printerNap: w(0.5, 1, 2),
    ballPitPlay: w(3, 2, 1),
    catHouseNap: w(0.5, 1, 2),
    admireTrophies: w(1, 1, 0.5),
    gnomeStare: w(1.5, 1, 0.3),
    // Memes
    tailChase: w(1.2, 1, 0.6),
    oiiaSpin: w(1.2, 1, 0.6),
    cucumberScare: w(0.8, 0.8, 0.5),
    catExe: w(0.7, 0.7, 0.5),
    thisIsFine: w(0.8, 0.8, 0.6),
    tinyBox: w(1, 1, 0.8),
    matrixDodge: w(0.8, 0.8, 0.4),
    duckDebug: w(0.8, 0.8, 0.5),
    crabDance: w(1, 1, 0.5),
  };
  // At night cats mostly sleep, watch the stars and leave the garden alone.
  if (daylight < 0.15) {
    const scale = (names, factor) => names.forEach((n) => (weights[n] *= factor));
    scale(['sleepBed', 'couchNap', 'fireWarm', 'treeNap', 'sleepDesk', 'hammockNap', 'heatNap', 'loafFloor', 'boxSit', 'printerNap'], 2.5);
    scale(['vibe', 'arcade', 'playTV', 'pinballPlay', 'pianoWalk', 'wheelRun', 'phoneIdle', 'ballPitPlay', 'crabDance', 'oiiaSpin'], 0.5);
    scale(['butterflyChase', 'birdWatch', 'rollGrass', 'sniffFlowers', 'catHouseNap', 'gnomeStare'], 0.25);
    weights.stargaze = w(3, 2, 1);
    weights.windowWatch *= 0.2;
  }
  // Needs pull the cat towards what it is missing.
  if (needs) {
    const boost = (names, factor) => names.forEach((n) => weights[n] && (weights[n] *= factor));
    if (needs.food < 40) boost(['eat', 'drink', 'coffee'], 8);
    const naps = ['sleepBed', 'couchNap', 'fireWarm', 'treeNap', 'sleepDesk', 'hammockNap', 'heatNap', 'sunbathe', 'printerNap', 'catHouseNap'];
    // Rested cats would rather play than nap.
    if (needs.energy < 40) boost(naps, 4);
    else if (needs.energy > 60) boost(naps, 0.35);
    if (needs.fun < 40) boost(['yarn', 'vibe', 'arcade', 'watchFish', 'wheelRun', 'playTV', 'pinballPlay', 'pianoWalk', 'tunnelHide', 'laser', 'zoomies', 'ballPitPlay', 'butterflyChase'], 3);
  }
  for (const [name, f] of Object.entries(TRAIT_ACTS[trait] ?? {})) if (weights[name]) weights[name] *= f;
  for (const name of Object.keys(weights)) if (!available(name, office)) delete weights[name];
  return pickWeighted(weights);
}

// Weights as an object or a Map (for picking among objects, e.g. cats).
export function pickWeighted(weights) {
  const entries = (weights instanceof Map ? [...weights] : Object.entries(weights)).filter(([, v]) => v > 0);
  let r = Math.random() * entries.reduce((s, [, v]) => s + v, 0);
  for (const [k, v] of entries) {
    r -= v;
    if (r <= 0) return k;
  }
  return entries[0][0];
}

export { rnd, pick };
