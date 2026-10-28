// Current weather for the windows, from Open-Meteo (free, no API key).
// Location: WEATHER_LAT / WEATHER_LON, Prague by default. WEATHER=off disables it.

const LAT = process.env.WEATHER_LAT || '50.0755';
const LON = process.env.WEATHER_LON || '14.4378';
const TTL_MS = 15 * 60_000;

let cached = { kind: 'clear', temp: null, fetchedAt: 0 };

// WMO weather codes to what the window shows.
function kindOf(code) {
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 2) return 'cloudy';
  return 'clear';
}

export async function weather() {
  if (process.env.WEATHER === 'off') return { kind: 'clear', temp: null };
  if (Date.now() - cached.fetchedAt < TTL_MS) return cached;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=weather_code,temperature_2m`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    cached = { kind: kindOf(data.current.weather_code), temp: data.current.temperature_2m, fetchedAt: Date.now() };
  } catch {
    cached = { ...cached, fetchedAt: Date.now() - TTL_MS + 60_000 }; // try again in a minute
  }
  return cached;
}
