import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWeather, clothingAdvice, weatherLabel, validCity, popularCities, getWeather, searchCities } from '../src/weather.ts';

const response = {
  current: { temperature_2m: 20.5, apparent_temperature: 18, weather_code: 3, time: '2026-10-18T15:00' },
  daily: { time: ['2026-10-18'], temperature_2m_min: [12], temperature_2m_max: [23], precipitation_probability_max: [70] },
};

test('forecast decoding handles zero temperatures and unavailable rain without inventing values', () => {
  const decoded = parseWeather(response);
  assert.equal(decoded.rain, 70);
  assert.equal(decoded.temperature, 20.5);
  assert.equal(parseWeather({ ...response, current: { ...response.current, temperature_2m: 0 } }).temperature, 0);
  assert.equal(parseWeather({ ...response, daily: { ...response.daily, precipitation_probability_max: [null] } }).rain, null);
  assert.throws(() => parseWeather({ ...response, current: { ...response.current, temperature_2m: null } }), /数据不完整/);
  assert.throws(() => parseWeather(null), /数据不完整/);
});

test('clothing advice distinguishes cold, warm, rain and snow', () => {
  const weather = parseWeather(response);
  assert.match(clothingAdvice(weather), /温差/);
  assert.match(clothingAdvice(weather), /带伞/);
  assert.match(clothingAdvice({ ...weather, feelsLike: -3, code: 75, rain: 0 }), /厚外套/);
  assert.match(clothingAdvice({ ...weather, feelsLike: -3, code: 75, rain: 0 }), /防滑/);
  assert.match(clothingAdvice({ ...weather, feelsLike: 30 }), /透气/);
  assert.equal(weatherLabel(0), '晴');
  assert.equal(weatherLabel(95), '雷雨');
  assert.equal(weatherLabel(999), '天气变化中');
});

test('stored city validation rejects corrupted or impossible coordinates', () => {
  assert.ok(popularCities.every(validCity));
  assert.equal(validCity(null), false);
  assert.equal(validCity({ ...popularCities[0], latitude: 100 }), false);
  assert.equal(validCity({ ...popularCities[0], longitude: '116' }), false);
});

test('API integration uses local timezone, correct variables and encoded city query', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async url => {
      assert.equal(url.searchParams.get('timezone'), 'auto');
      assert.equal(url.searchParams.get('forecast_days'), '1');
      assert.match(url.searchParams.get('current'), /apparent_temperature/);
      return { ok: true, json: async () => response };
    };
    assert.equal((await getWeather(popularCities[0], new AbortController().signal)).temperature, 20.5);
    globalThis.fetch = async url => {
      assert.equal(url.searchParams.get('name'), '成都');
      return { ok: true, json: async () => ({ results: [{ name: '成都', latitude: 30.67, longitude: 104.07, country: '中国' }] }) };
    };
    assert.equal((await searchCities(' 成都 ', new AbortController().signal))[0].name, '成都');
    globalThis.fetch = async () => ({ ok: false });
    await assert.rejects(getWeather(popularCities[0], new AbortController().signal), /天气服务/);
  } finally { globalThis.fetch = original; }
});

test('cancelled requests do not resolve with data from the previous city', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
    const controller = new AbortController();
    const pending = getWeather(popularCities[0], controller.signal);
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
  } finally { globalThis.fetch = original; }
});
