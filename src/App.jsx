import { useEffect, useRef, useState } from 'react';
import { ITEMS, SELL_RATE } from '../shared/catalog.js';
import { createOfficeApi } from './officeApi.js';
import { Shop } from './Shop.jsx';
import { CatCard } from './CatCard.jsx';
import { Achievements } from './Achievements.jsx';
import { ACHIEVEMENTS, relationOf, traitOf } from '../shared/cats.js';
import { SOUND_MODES } from './scene/sound.js';
import { Jukebox } from './Jukebox.jsx';
import { startDemo } from './demo.js';
import { World, sessionKey } from './scene/World.js';

// "z" or "ze" before a number, as it is read aloud: ze tří, ze sedmi, z pěti.
function fromPrep(n) {
  const lead = n < 20 ? n : n < 100 ? Math.floor(n / 10) * 10 : 100;
  return [3, 4, 6, 7, 13, 14, 16, 17, 30, 40, 60, 70, 100].includes(lead) ? 'ze' : 'z';
}

function headline(sessions) {
  const total = sessions.length;
  const busy = sessions.filter((s) => s.status === 'busy').length;
  if (!total) return 'Kancelář je prázdná';
  if (total === 1) return busy ? 'Kočka maká' : 'Kočka se fláká';
  if (!busy) return total <= 4 ? `Všechny ${total} kočky se flákají` : `Všech ${total} koček se fláká`;
  const verb = busy >= 2 && busy <= 4 ? 'Makají' : 'Maká';
  return `${verb} ${busy} ${fromPrep(total)} ${total} koček`;
}

function kittenLine(n) {
  if (n === 1) return 'a pomáhá jim 1 kotě';
  if (n <= 4) return `a pomáhají jim ${n} koťata`;
  return `a pomáhá jim ${n} koťat`;
}

const SOUND_LABELS = { all: 'Hudba + zvuky', sfx: 'Jen zvuky', off: 'Ticho' };

function toolText(session) {
  if (session.status === 'idle') return 'Čeká na zadání';
  if (session.status !== 'busy') return `Čeká na tebe (${session.status})`;
  const a = session.activity;
  if (!a || a.category === 'think') return 'Přemýšlí';
  return a.detail ? `${a.name}: ${a.detail}` : a.name;
}

function since(ms, now) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 10) return 'teď';
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export default function App() {
  const stageRef = useRef(null);
  const overlayRef = useRef(null);
  const worldRef = useRef(null);
  const apiRef = useRef(null);
  const [sessions, setSessions] = useState([]);
  const [office, setOffice] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [catId, setCatId] = useState(null);
  const [followId, setFollowId] = useState(null);
  const [themePreview, setThemePreview] = useState(null);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showJukebox, setShowJukebox] = useState(false);
  const [soundMode, setSoundMode] = useState('off');
  const [musicStyle, setMusicStyle] = useState('auto');
  const [playing, setPlaying] = useState(null);
  const seenAchievements = useRef(null);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [ghost, setGhost] = useState(null);
  const [toast, setToast] = useState(null);
  const [now, setNow] = useState(Date.now());
  const demo = new URLSearchParams(window.location.search).get('demo');

  const showToast = (text) => {
    setToast({ text, id: Date.now() });
  };

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    const applyOffice = (state) => {
      setOffice(state);
      worldRef.current?.setOfficeState(state);
    };
    const api = createOfficeApi({ demo: demo !== null, onState: applyOffice });
    apiRef.current = api;
    const world = new World(stageRef.current, overlayRef.current, {
      onCommit: (action, payload) => api.act(action, payload),
      onMessage: showToast,
      onSelect: setSelected,
      onGhost: setGhost,
      onFollow: setFollowId,
      onCatClick: (id) => {
        setCatId(id);
        setShowAchievements(false);
        setShowJukebox(false);
      },
    });
    world.sound.onTrack = (track) => setPlaying({ title: track.title, style: track.style, key: track.key, bpm: track.bpm });
    setSoundMode(world.sound.mode);
    setMusicStyle(world.sound.style);
    worldRef.current = world;
    if (import.meta.env.DEV) window.__world = world;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(id);
      api.dispose();
      world.destroy();
    };
  }, []);

  useEffect(() => {
    if (demo !== null) {
      setConnection('open');
      return startDemo(setSessions, demo);
    }
    const source = new EventSource('/api/events');
    source.onopen = () => setConnection('open');
    source.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setSessions(data.sessions);
      if (data.office) {
        setOffice(data.office);
        worldRef.current?.setOfficeState(data.office);
      }
      setConnection('open');
    };
    source.onerror = () => setConnection('lost');
    return () => source.close();
  }, []);

  useEffect(() => {
    worldRef.current?.setSessions(sessions);
    apiRef.current?.setSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    worldRef.current?.setEditMode(editing);
    if (editing) {
      setCatId(null);
      setShowAchievements(false);
      setShowJukebox(false);
    } else setThemePreview(null);
  }, [editing]);

  // New achievements: a toast and a fanfare (not for the ones already earned on load).
  useEffect(() => {
    if (!office?.achievements) return;
    const ids = Object.keys(office.achievements);
    if (seenAchievements.current) {
      for (const id of ids) {
        if (seenAchievements.current.has(id) || !ACHIEVEMENTS[id]) continue;
        showToast(`Úspěch: ${ACHIEVEMENTS[id].name} (+${ACHIEVEMENTS[id].reward} mincí)`);
        worldRef.current?.sound.play('fanfare');
      }
    }
    seenAchievements.current = new Set(ids);
  }, [office?.achievements]);

  useEffect(() => {
    if (!catId) return undefined;
    const onKey = (e) => e.key === 'Escape' && setCatId(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [catId]);

  // Cycles through music + sounds, sounds only and silence.
  const cycleSound = () => setMode(SOUND_MODES[(SOUND_MODES.indexOf(soundMode) + 1) % SOUND_MODES.length]);
  const setMode = (mode) => {
    worldRef.current?.sound.setMode(mode);
    setSoundMode(mode);
  };
  const cardSession = catId && sessions.find((s) => sessionKey(s) === catId);
  const cardAgent = catId && worldRef.current?.cats.get(catId);
  // How the open cat gets along with the others in the office now.
  const cardRelations = cardSession
    ? [...(worldRef.current?.cats.values() ?? [])]
        .filter((c) => c.session && c.session.cwd !== cardSession.cwd && !c.leaving)
        .map((c) => ({ key: c.id, name: c.name, value: Math.round(relationOf(office?.relations, cardSession.cwd, c.session.cwd)) }))
        .sort((a, b) => b.value - a.value)
    : [];
  // Who won the most games, for the leaderboard.
  const present = new Map([...(worldRef.current?.cats.values() ?? [])].filter((c) => c.session).map((c) => [c.session.cwd, c]));
  const project = (key) => key.split('/').filter(Boolean).at(-1) ?? key;
  const leaderboard = Object.entries(office?.cats ?? {})
    .filter(([, p]) => p.wins > 0)
    .map(([key, p]) => ({ key, name: present.get(key)?.name ?? project(key), gender: present.get(key)?.gender, project: project(key), wins: p.wins, level: p.level, trait: traitOf(key) }))
    .sort((a, b) => b.wins - a.wins);
  const act = async (action, payload) => {
    const result = await apiRef.current.act(action, payload);
    if (!result.ok) showToast(result.error);
    return result;
  };
  const kittens = sessions.reduce((sum, s) => sum + s.subagents.length, 0);
  const selectedDef = selected && ITEMS[selected.type];

  return (
    <div className="app">
      <main className={editing ? 'stage editing' : 'stage'} ref={stageRef}>
        <canvas className="scene" aria-label="Izometrická kancelář s kočkami" />
        <canvas className="overlay" ref={overlayRef} aria-hidden="true" />
        <div className="crt" aria-hidden="true" />

        <header className="summary">
          <h1>{headline(sessions)}</h1>
          {kittens > 0 && <p>{kittenLine(kittens)}</p>}
          {connection === 'lost' && <p className="warning">Spojení se serverem se přerušilo. Zkontroluj, že běží npm run dev.</p>}
        </header>

        <div className="topbar">
          {office && (
            <span className="coins" title={`Celkem vyděláno ${office.earned} mincí`}>
              <span className="coin" aria-hidden="true" />
              {office.coins}
            </span>
          )}
          <button type="button" className="sound-toggle" onClick={cycleSound} title="Přepnout zvuk: hudba + zvuky, jen zvuky, ticho">
            {SOUND_LABELS[soundMode]}
          </button>
          {!editing && (
            <button
              type="button"
              aria-pressed={showJukebox}
              onClick={() => {
                setShowJukebox((on) => !on);
                setShowAchievements(false);
              }}
            >
              Jukebox
            </button>
          )}
          {!editing && (
            <button
              type="button"
              aria-pressed={showAchievements}
              onClick={() => {
                setShowAchievements((on) => !on);
                setShowJukebox(false);
              }}
            >
              Úspěchy
            </button>
          )}
          <button type="button" aria-pressed={editing} onClick={() => setEditing((on) => !on)}>
            {editing ? 'Hotovo' : 'Upravit'}
          </button>
        </div>

        {connection === 'open' && sessions.length === 0 && !editing && (
          <p className="empty">Spusť claude v terminálu nebo ve VS Code a dveřmi přijde kočka.</p>
        )}

        {followId && !editing && (
          <div className="follow-pill" role="status">
            <span>Kamera sleduje: {worldRef.current?.cats.get(followId)?.name ?? 'kočku'}</span>
            <button type="button" onClick={() => worldRef.current?.follow(null)}>
              Zrušit
            </button>
          </div>
        )}

        <div className="controls">
          <button type="button" onClick={() => worldRef.current?.rotate(-1)} title="Otočit doleva (Q)">
            ⟲
          </button>
          <button type="button" onClick={() => worldRef.current?.rotate(1)} title="Otočit doprava (E)">
            ⟳
          </button>
          <button type="button" onClick={() => worldRef.current?.zoomBy(1 / 1.2)} title="Oddálit (−)">
            −
          </button>
          <button type="button" onClick={() => worldRef.current?.zoomBy(1.2)} title="Přiblížit (+)">
            +
          </button>
        </div>

        {editing && office && (
          <Shop
            office={office}
            placing={ghost && !ghost.item.uid ? ghost.item.type : null}
            onPick={(type) => worldRef.current?.startPlacing(type)}
            onExpand={() => act('expand')}
            onBuyGarden={() => act('buyGarden')}
            preview={themePreview}
            onPreviewTheme={(id) => {
              worldRef.current?.previewTheme(id);
              setThemePreview(id);
            }}
            onBuyTheme={async (id) => {
              const result = await act('buyTheme', { id });
              if (result.ok) {
                worldRef.current?.previewTheme(null);
                setThemePreview(null);
              }
            }}
            onSetTheme={(id) => {
              worldRef.current?.previewTheme(null);
              setThemePreview(null);
              act('setTheme', { id });
            }}
          />
        )}

        {editing && (
          <div className="edit-hint panel">
            {ghost
              ? ghost.problem
                ? `Sem to nejde: ${ghost.problem}`
                : 'Klikni pro položení · R otočí · Esc zruší'
              : 'Vyber věc v obchodě, nebo klikni na předmět v kanceláři. Tažením ho přesuneš.'}
          </div>
        )}

        {editing && selected && selectedDef && !ghost && (
          <div className="selection panel" role="dialog" aria-label={selectedDef.name}>
            <strong>{selectedDef.name}</strong>
            <p>{selectedDef.desc}</p>
            <div className="selection-actions">
              <button type="button" onClick={() => worldRef.current?.rotateItem()}>
                Otočit
              </button>
              <button type="button" onClick={() => worldRef.current?.startMoving(selected)}>
                Přesunout
              </button>
              <button
                type="button"
                className="danger"
                onClick={async () => {
                  const result = await act('sell', { uid: selected.uid });
                  if (result.ok) worldRef.current?.select(null);
                }}
              >
                Prodat za {Math.floor(selectedDef.price * SELL_RATE)}
              </button>
            </div>
          </div>
        )}

        {toast && (
          <p className="toast" role="status" key={toast.id}>
            {toast.text}
          </p>
        )}

        {!editing && showAchievements && (
          <Achievements
            unlocked={office?.achievements}
            collection={office?.collection}
            furs={office?.furs}
            leaderboard={leaderboard}
            stats={office?.stats}
            onClose={() => setShowAchievements(false)}
          />
        )}

        {!editing && showJukebox && (
          <Jukebox
            style={musicStyle}
            soundMode={soundMode}
            playing={playing}
            onStyle={(style) => {
              worldRef.current?.sound.setStyle(style);
              setMusicStyle(style);
            }}
            onNext={() => worldRef.current?.sound.nextTrack()}
            onMusicOn={() => setMode('all')}
            onClose={() => setShowJukebox(false)}
          />
        )}

        {!editing && !showAchievements && !showJukebox && cardSession && (
          <CatCard
            session={cardSession}
            agent={cardAgent}
            profile={office?.cats?.[cardSession.cwd]}
            coins={office?.coins ?? 0}
            status={`${toolText(cardSession)}, ${since(cardSession.statusSince, now)}`}
            relations={cardRelations}
            furs={office?.furs ?? []}
            onBuy={(id) => act('buyCosmetic', { cat: cardSession.cwd, id })}
            onWear={(slot, id) => act('wear', { cat: cardSession.cwd, slot, id })}
            onPamper={(kind) => worldRef.current?.pamper(catId, kind)}
            onFur={(fur) => act('setFur', { cat: cardSession.cwd, fur })}
            following={followId === catId}
            onFollow={() => worldRef.current?.follow(followId === catId ? null : catId)}
            onClose={() => setCatId(null)}
          />
        )}
      </main>
    </div>
  );
}
