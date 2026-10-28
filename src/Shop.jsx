import { useState } from 'react';
import { GROUPS, ITEMS, THEMES } from '../shared/catalog.js';
import { renderThumbnails } from './scene/thumbnails.js';
import { THEME_LOOKS } from './scene/themes.js';

// A few colour chips that give an idea of a look: walls, floor, wood and accents.
function Swatch({ id }) {
  const look = THEME_LOOKS[id];
  const colors = [look.wall.base, look.wall.stripe, look.floor.tones[0], look.trim, look.curtain ?? look.neon.color];
  return (
    <span className="theme-swatch" aria-hidden="true">
      {colors.map((c, k) => (
        <span key={k} style={{ background: c }} />
      ))}
    </span>
  );
}

// The furniture shop shown in edit mode.
export function Shop({ office, placing, preview, onPick, onExpand, onBuyGarden, onBuyTheme, onSetTheme, onPreviewTheme }) {
  const [thumbs] = useState(renderThumbnails);
  const owned = {};
  for (const item of office.items) owned[item.type] = (owned[item.type] ?? 0) + 1;
  const next = office.nextLevel;

  return (
    <aside className="shop panel" aria-label="Obchod">
      <h2>Obchod</h2>
      {Object.entries(GROUPS).map(([group, title]) => (
        <section key={group}>
          <h3>{title}</h3>
          <ul>
            {Object.entries(ITEMS)
              .filter(([, def]) => def.group === group)
              .map(([type, def]) => {
                const tooExpensive = office.coins < def.price;
                const noGarden = def.outdoor && !office.garden;
                return (
                  <li key={type}>
                    <button
                      type="button"
                      className={placing === type ? 'shop-item active' : 'shop-item'}
                      disabled={tooExpensive || noGarden}
                      onClick={() => onPick(type)}
                      title={noGarden ? 'Nejdřív kup zahradu (dole v obchodě)' : tooExpensive ? `Chybí ${def.price - office.coins} mincí` : def.desc}
                    >
                      <img className="shop-thumb" src={thumbs[type]} alt="" width="64" height="64" />
                      <span className="shop-name">
                        {def.name}
                        {owned[type] ? <span className="owned"> ×{owned[type]}</span> : null}
                      </span>
                      <span className="shop-price">
                        <span className="coin" aria-hidden="true" />
                        {def.price}
                      </span>
                      <span className="shop-desc">
                        {def.w}×{def.d}, {def.desc}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
      <section>
        <h3>Vzhled kanceláře</h3>
        <ul className="themes">
          {Object.entries(THEMES).map(([id, def]) => {
            const owned = office.themes?.includes(id);
            const active = office.theme === id;
            const trying = preview === id;
            return (
              <li key={id} className={active ? 'theme active' : trying ? 'theme trying' : 'theme'}>
                <Swatch id={id} />
                <span className="shop-name">{def.name}</span>
                {!owned && (
                  <span className="shop-price">
                    <span className="coin" aria-hidden="true" />
                    {def.price}
                  </span>
                )}
                <span className="shop-desc">{def.desc}</span>
                <span className="theme-actions">
                  {owned ? (
                    <button type="button" disabled={active} onClick={() => onSetTheme(id)}>
                      {active ? 'Používá se' : 'Použít'}
                    </button>
                  ) : (
                    <>
                      <button type="button" disabled={office.coins < def.price} title={office.coins < def.price ? `Chybí ${def.price - office.coins} mincí` : undefined} onClick={() => onBuyTheme(id)}>
                        Koupit
                      </button>
                      <button type="button" aria-pressed={trying} onClick={() => onPreviewTheme(trying ? null : id)}>
                        {trying ? 'Zpět' : 'Vyzkoušet'}
                      </button>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h3>Prostory</h3>
        {office.garden ? (
          <p className="shop-desc">Zahrada je za jižní zdí, vchod je vlevo vpředu.</p>
        ) : (
          <button type="button" className="shop-item" disabled={office.coins < office.gardenPrice} onClick={onBuyGarden}>
            <span className="shop-name">Zahrada</span>
            <span className="shop-price">
              <span className="coin" aria-hidden="true" />
              {office.gardenPrice}
            </span>
            <span className="shop-desc">Trávník za kanceláří: motýli, ptáčci, slunce. Při dešti a sněhu zůstanou kočky uvnitř.</span>
          </button>
        )}
        {next ? (
          <button type="button" className="shop-item" disabled={office.coins < next.price} onClick={onExpand}>
            <span className="shop-name">
              Větší kancelář {next.size}×{next.size}
            </span>
            <span className="shop-price">
              <span className="coin" aria-hidden="true" />
              {next.price}
            </span>
            <span className="shop-desc">Teď je {office.size}×{office.size}. Nábytek zůstane, kde je.</span>
          </button>
        ) : (
          <p className="shop-desc">Kancelář už je největší.</p>
        )}
      </section>
    </aside>
  );
}
