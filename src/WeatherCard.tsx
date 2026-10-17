import { useEffect, useState } from "react";
import { CloudSun, MapPin, RefreshCw } from "lucide-react";
import { clothingAdvice, getWeather, popularCities, searchCities, validCity, weatherLabel, type City, type Weather } from "./weather";

const cityKey = "yixu-weather-city-v1";
function initialCity(): City | null {
  try { const city: unknown = JSON.parse(localStorage.getItem(cityKey) || "null"); return validCity(city) ? city : null; } catch { return null; }
}

export function WeatherCard() {
  const [city, setCity] = useState(initialCity);
  const [choosing, setChoosing] = useState(!city);
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchRevision, setSearchRevision] = useState(0);
  const [cities, setCities] = useState<City[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [weather, setWeather] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!city) return;
    const controller = new AbortController();
    setLoading(true); setWeather(null); setError("");
    void getWeather(city, controller.signal).then(data => {
      if (!controller.signal.aborted) setWeather(data);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "天气加载失败，请重试。");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    // Refresh while the page remains open, including after midnight.
    const timer = window.setInterval(() => setRevision(n => n + 1), 15 * 60 * 1000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [city, revision]);

  useEffect(() => {
    if (!searchTerm) return;
    const controller = new AbortController();
    setSearching(true); setSearchError(""); setCities([]);
    void searchCities(searchTerm, controller.signal).then(results => {
      if (!controller.signal.aborted) {
        setCities(results);
        if (!results.length) setSearchError("没找到这个城市，可尝试城市拼音或下方常用城市。");
      }
    }).catch(cause => {
      if (!controller.signal.aborted) setSearchError(cause instanceof Error ? cause.message : "城市搜索失败，请重试。");
    }).finally(() => { if (!controller.signal.aborted) setSearching(false); });
    return () => controller.abort();
  }, [searchTerm, searchRevision]);

  function choose(next: City) {
    setCity(next); setChoosing(false); setSearchTerm(""); setQuery(""); setCities([]); setSearchError(""); setSearching(false);
    try { localStorage.setItem(cityKey, JSON.stringify(next)); } catch { /* Keep selection for this visit. */ }
  }

  return <section className="weather-card" aria-label="今日天气与穿衣参考">
    <div className="weather-heading">
      <div><span className="weather-eyebrow">DRESS FOR YOUR DAY</span><h2><CloudSun size={22} />今日穿衣参考</h2></div>
      {city && <div className="weather-actions"><button className="ghost" onClick={() => setChoosing(!choosing)} aria-expanded={choosing}><MapPin size={15} />{city.name} · 切换</button><button className="ghost" onClick={() => setRevision(n => n + 1)} disabled={loading} aria-label="刷新天气"><RefreshCw size={16} className={loading ? "spin" : ""} /></button></div>}
    </div>
    {choosing && <div className="weather-picker">
      <p>选择你所在的城市，看看今天适合怎么穿。</p>
      <form onSubmit={event => { event.preventDefault(); const text = query.trim(); if (text.length < 2) { setSearchError("请输入至少两个字的城市名或拼音。"); return; } setSearchTerm(text); setSearchRevision(n => n + 1); }}>
        <input aria-label="搜索城市" placeholder="输入城市名或拼音，如：成都" value={query} onChange={event => setQuery(event.target.value)} maxLength={80} /><button className="secondary" disabled={searching}>{searching ? "搜索中…" : "搜索"}</button>
      </form>
      <div className="weather-cities">{cities.map(result => <button className="weather-city" key={`${result.latitude},${result.longitude}`} onClick={() => choose(result)}>{result.name}<small>{result.region}</small></button>)}</div>
      {searchError && <p role="status">{searchError}</p>}
      <div className="weather-cities" aria-label="常用城市">{popularCities.map(result => <button className="weather-city" key={result.name} onClick={() => choose(result)}>{result.name}</button>)}</div>
    </div>}
    <div aria-live="polite">
      {loading && <p className="weather-status">正在获取{city?.name}的天气…</p>}
      {error && <div className="weather-status"><p>{error}</p><button className="secondary" onClick={() => setRevision(n => n + 1)}>重新获取</button></div>}
      {weather && !loading && <div className="weather-body">
        <div className="weather-now"><strong>{Math.round(weather.temperature)}<small>°C</small></strong><span>{weatherLabel(weather.code)} · 体感 {Math.round(weather.feelsLike)}°C</span></div>
        <div className="weather-detail"><span>今日 {Math.round(weather.low)}°～{Math.round(weather.high)}°C</span><span>{weather.rain === null ? "降雨概率暂无数据" : `今日最高降雨概率 ${Math.round(weather.rain)}%`}</span><small>{weather.date} · 当地时间 {weather.time.slice(11, 16)}</small></div>
        <p className="weather-advice">{clothingAdvice(weather)}<small>穿衣建议仅作参考，请结合个人怕冷程度与出行安排。</small></p>
      </div>}
    </div>
    <div className="weather-source">天气数据：<a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · 根据天气生成穿衣参考</div>
  </section>;
}
