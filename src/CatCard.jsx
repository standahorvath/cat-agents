import { COSMETICS, FRIENDS, NEEDS, PAMPER, RARE_FURS, RIVALS, SLOTS, TRAITS, traitOf } from '../shared/cats.js';

const NEED_LABEL = { food: 'Jídlo', energy: 'Energie', fun: 'Zábava' };

function Bar({ value, max = 100, color }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <span className="bar" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%`, background: color }} />
    </span>
  );
}

function relationLabel(v) {
  if (v >= 80) return 'nerozluční';
  if (v >= FRIENDS) return 'kamarádi';
  if (v <= -60) return 'úhlavní nepřátelé';
  if (v <= RIVALS) return 'rivalové';
  if (v <= -12) return 'nemusí se';
  if (v >= 15) return 'kámoši';
  return 'známí';
}

const tokens = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} M` : `${Math.round(n / 1000)}k`);

// The context bar goes from green through yellow to red.
function contextColor(fill) {
  if (fill > 0.75) return '#FF6B5B';
  if (fill > 0.45) return '#F2C14E';
  return '#8FB8FF';
}

function needColor(v) {
  if (v < 25) return '#FF6B5B';
  if (v < 50) return '#F2C14E';
  return '#7CD87A';
}

// Everything about one cat: what it does, how it feels, its level and wardrobe.
export function CatCard({ session, agent, profile, coins, status, relations = [], furs = [], following = false, onBuy, onWear, onPamper, onFur, onFollow, onClose }) {
  const level = profile?.level ?? 1;
  const xpInLevel = profile ? profile.xp - profile.levelXp : 0;
  const xpNeeded = profile ? profile.nextXp - profile.levelXp : 1;
  const wear = profile?.wear ?? {};
  const owned = profile?.owned ?? [];
  const trait = TRAITS[traitOf(session.cwd || session.id)];

  return (
    <aside className="cat-card panel" aria-label={`Kočka ${agent?.name ?? ''}`}>
      <header className="cat-card-head">
        <div>
          <strong>{agent?.name}</strong> <span className="level">{level}</span>
          <p className="cat-project" title={session.cwd}>
            {session.project}
          </p>
        </div>
        <button type="button" className="close" onClick={onClose} aria-label="Zavřít">
          ×
        </button>
      </header>

      <p className="cat-status">{status}</p>
      {trait && (
        <p className="cat-trait">
          Povaha: <strong>{agent?.gender === 'f' ? trait.f : trait.m}</strong> <span className="dim">{trait.desc}</span>
        </p>
      )}

      {profile && (
        <div className="pamper">
          <button type="button" onClick={() => onPamper('pet')} title="Doplní zábavu">
            Pohladit
          </button>
          <button type="button" onClick={() => onPamper('treat')} disabled={coins < PAMPER.treat.price} title="Doplní jídlo">
            Pamlsek <span className="chip-price">{PAMPER.treat.price}</span>
          </button>
          <button type="button" onClick={() => onPamper('toy')} title="Laserové ukazovátko, jen když se kočka fláká">
            Laser
          </button>
        </div>
      )}

      {agent && !agent.leaving && (
        <button type="button" className={following ? 'follow on' : 'follow'} aria-pressed={following} onClick={onFollow}>
          {following ? 'Přestat sledovat' : 'Sledovat kamerou'}
        </button>
      )}

      {profile && (
        <>
          <div className="cat-row">
            <span>Úroveň {level}</span>
            <Bar value={xpInLevel} max={xpNeeded} color="#F2C14E" />
          </div>
          {Object.keys(NEEDS).map((need) => (
            <div className="cat-row" key={need}>
              <span>{NEED_LABEL[need]}</span>
              <Bar value={profile.needs[need]} color={needColor(profile.needs[need])} />
            </div>
          ))}
          {session.context && (
            <div className="cat-row" title={`${tokens(session.context.tokens)} z ${tokens(session.context.window)} tokenů`}>
              <span>Kontext</span>
              <Bar value={session.context.fill * 100} color={contextColor(session.context.fill)} />
            </div>
          )}
          <p className="cat-meta">
            {session.context && `Kontext ${tokens(session.context.tokens)} z ${tokens(session.context.window)} (${Math.round(session.context.fill * 100)} %), čím plnější, tím baculatější kočka. `}
            Nálada {profile.mood} %, vydělává ×{String(profile.multiplier).replace('.', ',')}. Celkem {agent?.g('vydělal', 'vydělala') ?? 'vydělala'} {profile.earned} mincí
            {profile.wins > 0 ? ` a ${profile.wins}× ${agent?.g('vyhrál', 'vyhrála') ?? 'vyhrála'} hru` : ''}.
          </p>
        </>
      )}

      {session.subagents.length > 0 && (
        <section>
          <h3>Koťata</h3>
          <ul className="cat-list">
            {session.subagents.map((sub) => (
              <li key={sub.id}>
                {sub.description || sub.type} <span className="dim">{sub.activity.name ?? 'přemýšlí'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}


      {relations.length > 0 && (
        <section>
          <h3>Vztahy</h3>
          <ul className="cat-list relations">
            {relations.map((r) => (
              <li key={r.key}>
                {r.name}
                <span className={r.value >= FRIENDS ? 'rel good' : r.value <= RIVALS ? 'rel bad' : r.value <= -12 ? 'rel meh' : 'rel'}>
                  {relationLabel(r.value)} {r.value > 0 ? `+${r.value}` : r.value}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {profile && (
        <section>
          <h3>Srst</h3>
          <div className="wardrobe-items">
            <button type="button" className={!profile.fur ? 'chip on' : 'chip'} onClick={() => onFur(null)}>
              Vlastní
            </button>
            {Object.entries(RARE_FURS).map(([id, def]) => {
              const open = furs.includes(id);
              return (
                <button
                  type="button"
                  key={id}
                  className={profile.fur === id ? 'chip on' : 'chip'}
                  disabled={!open}
                  title={open ? undefined : def.hint}
                  onClick={() => onFur(profile.fur === id ? null : id)}
                >
                  {def.name}
                  {!open && <span className="chip-price">zamčeno</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {profile && (
        <section>
          <h3>Šatník</h3>
          {Object.entries(SLOTS).map(([slot, title]) => (
            <div key={slot} className="wardrobe-slot">
              <span className="dim">{title}</span>
              <div className="wardrobe-items">
                {Object.entries(COSMETICS)
                  .filter(([, def]) => def.slot === slot)
                  .map(([id, def]) => {
                    const has = owned.includes(id);
                    const on = wear[slot] === id;
                    const locked = level < def.level;
                    return (
                      <button
                        type="button"
                        key={id}
                        className={on ? 'chip on' : 'chip'}
                        disabled={!has && (locked || coins < def.price)}
                        title={locked && !has ? `Od ${def.level}. úrovně` : undefined}
                        onClick={() => (has ? onWear(slot, on ? null : id) : onBuy(id))}
                      >
                        {def.name}
                        {!has && <span className="chip-price">{locked ? `úr. ${def.level}` : def.price}</span>}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </section>
      )}
    </aside>
  );
}
