import { useState } from 'react';
import { ACHIEVEMENTS, COLLECTIBLES, RARE_FURS, TRAITS } from '../shared/cats.js';

// Achievements, the collection of finds with the rare furs they unlock, and the
// leaderboard of games won.
export function Achievements({ unlocked, collection, furs, leaderboard = [], stats, onClose }) {
  const [tab, setTab] = useState('achievements');
  const done = Object.keys(unlocked ?? {}).length;
  const found = Object.keys(COLLECTIBLES).filter((id) => collection?.[id]).length;
  return (
    <aside className="achievements panel" aria-label="Úspěchy, sbírka a žebříček">
      <header className="cat-card-head">
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'achievements'} onClick={() => setTab('achievements')}>
            Úspěchy {done}/{Object.keys(ACHIEVEMENTS).length}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'collection'} onClick={() => setTab('collection')}>
            Sbírka {found}/{Object.keys(COLLECTIBLES).length}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'leaderboard'} onClick={() => setTab('leaderboard')}>
            Žebříček
          </button>
        </div>
        <button type="button" className="close" onClick={onClose} aria-label="Zavřít">
          ×
        </button>
      </header>
      {tab === 'achievements' && (
        <ul>
          {Object.entries(ACHIEVEMENTS).map(([id, a]) => {
            const got = !!unlocked?.[id];
            // Secret ones stay a mystery until unlocked.
            const hidden = a.secret && !got;
            return (
              <li key={id} className={got ? 'got' : undefined}>
                <strong>{hidden ? '???' : a.name}</strong>
                <span className="reward">
                  <span className="coin" aria-hidden="true" />
                  {a.reward}
                </span>
                <p>{hidden ? 'Tajný úspěch. Kdo ví, co ho odemkne…' : a.desc}</p>
              </li>
            );
          })}
        </ul>
      )}
      {tab === 'collection' && (
        <>
          <ul>
            {Object.entries(COLLECTIBLES).map(([id, c]) => (
              <li key={id} className={collection?.[id] ? 'got' : undefined}>
                <strong>{collection?.[id] ? c.name : '???'}</strong>
                <span className="reward">×{collection?.[id] ?? 0}</span>
                <p>{c.desc}</p>
              </li>
            ))}
          </ul>
          <h3 className="section-title">Vzácné srsti</h3>
          <ul>
            {Object.entries(RARE_FURS).map(([id, f]) => (
              <li key={id} className={furs?.includes(id) ? 'got' : undefined}>
                <strong>{f.name}</strong>
                <span className="reward">{furs?.includes(id) ? 'odemčeno' : 'zamčeno'}</span>
                <p>{f.hint}</p>
              </li>
            ))}
          </ul>
        </>
      )}
      {tab === 'leaderboard' && (
        <>
          {leaderboard.length ? (
            <ul className="leaderboard">
              {leaderboard.map((row, k) => (
                <li key={row.key} className={k === 0 ? 'got' : undefined}>
                  <strong>
                    <span className="rank">{k + 1}.</span>
                    {row.name}
                  </strong>
                  <span className="reward">{row.wins}× výhra</span>
                  <p>
                    {row.project}, úroveň {row.level}, {TRAITS[row.trait]?.[row.gender === 'f' ? 'f' : 'm']}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dim">Zatím nikdo nic nevyhrál. Kočky hrají šachy, piškvorky, karty, fotbal, přetahovanou a turnaje.</p>
          )}
          <h3 className="section-title">Statistiky</h3>
          <ul>
            {[
              ['Odehrané hry', stats?.games],
              ['Turnaje', stats?.tournaments],
              ['Góly', stats?.goals],
              ['Loupeže granulí', stats?.heists],
              ['Převrácené hry', stats?.tableFlips],
              ['Žárlivé scény', stats?.jealousy],
              ['Usmíření', stats?.reconciles],
              ['Kočičí memy', stats?.memes],
            ].map(([label, value]) => (
              <li key={label}>
                <strong>{label}</strong>
                <span className="reward">{value ?? 0}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
