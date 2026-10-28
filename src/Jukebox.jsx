import { MUSIC_STYLES } from './scene/sound.js';

// Pick the music style; the generated songs follow it.
export function Jukebox({ style, soundMode, playing, onStyle, onNext, onMusicOn, onClose }) {
  return (
    <aside className="jukebox panel" aria-label="Jukebox">
      <header className="cat-card-head">
        <h2>Jukebox</h2>
        <button type="button" className="close" onClick={onClose} aria-label="Zavřít">
          ×
        </button>
      </header>
      {soundMode !== 'all' && (
        <p className="cat-meta">
          Hudba je vypnutá.{' '}
          <button type="button" className="link" onClick={onMusicOn}>
            Zapnout hudbu
          </button>
        </p>
      )}
      {soundMode === 'all' && playing && (
        <p className="now-playing">
          <span className="cat-meta">Právě hraje</span>
          <strong>{playing.title}</strong>
          <span className="cat-meta">
            {MUSIC_STYLES[playing.style]?.name} · {playing.key} · {playing.bpm} BPM
          </span>
        </p>
      )}
      <ul className="styles">
        {Object.entries(MUSIC_STYLES).map(([id, s]) => (
          <li key={id}>
            <button type="button" className={style === id ? 'shop-item active' : 'shop-item'} aria-pressed={style === id} onClick={() => onStyle(id)}>
              <span className="shop-name">{s.name}</span>
              <span className="shop-desc">{s.desc}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onNext} disabled={soundMode !== 'all'}>
        Další skladba
      </button>
    </aside>
  );
}
