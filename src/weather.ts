export type City = { name: string; region: string; latitude: number; longitude: number };
export type Weather = { temperature: number; feelsLike: number; code: number; low: number; high: number; rain: number | null; date: string; time: string };
export const popularCities: City[] = [
  { name: "北京", region: "中国", latitude: 39.9042, longitude: 116.4074 },
  { name: "上海", region: "中国", latitude: 31.2304, longitude: 121.4737 },
  { name: "广州", region: "广东", latitude: 23.1291, longitude: 113.2644 },
  { name: "深圳", region: "广东", latitude: 22.5431, longitude: 114.0579 },
  { name: "杭州", region: "浙江", latitude: 30.2741, longitude: 120.1551 },
  { name: "长沙", region: "湖南", latitude: 28.2282, longitude: 112.9388 },
];

export function validCity(value: unknown): value is City {
  if (!value || typeof value !== "object") return false;
  const city = value as City;
  return typeof city.name === "string" && city.name.length > 0 && city.name.length <= 100
    && typeof city.region === "string" && Number.isFinite(city.latitude) && Math.abs(city.latitude) <= 90
    && Number.isFinite(city.longitude) && Math.abs(city.longitude) <= 180;
}

async function request(url: URL, signal: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) controller.abort();
  const timer = setTimeout(abort, 12000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error("天气服务暂时不可用，请稍后重试。");
    return await response.json();
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error("暂时连接不上天气服务，请检查网络后重试。");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

export async function searchCities(query: string, signal: AbortSignal): Promise<City[]> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.search = new URLSearchParams({ name: query.trim(), count: "6", language: "zh", format: "json" }).toString();
  const data = await request(url, signal) as { results?: Array<{ name: string; admin1?: string; country?: string; latitude: number; longitude: number }> };
  if (!data || typeof data !== "object") throw new Error("城市信息暂时不可用，请重试。");
  return (Array.isArray(data.results) ? data.results : []).map(city => ({
    name: city.name, region: [city.admin1, city.country].filter(Boolean).join(" · "),
    latitude: city.latitude, longitude: city.longitude,
  })).filter(validCity);
}

export function parseWeather(value: unknown): Weather {
  const data = value as { current?: Record<string, unknown>; daily?: Record<string, unknown[]> } | null;
  const current = data?.current;
  const daily = data?.daily;
  const numbers = [current?.temperature_2m, current?.apparent_temperature, current?.weather_code, daily?.temperature_2m_min?.[0], daily?.temperature_2m_max?.[0]];
  if (!numbers.every(n => typeof n === "number" && Number.isFinite(n)) || typeof current?.time !== "string" || typeof daily?.time?.[0] !== "string") {
    throw new Error("天气数据不完整，请重试。");
  }
  const rain = daily?.precipitation_probability_max?.[0];
  return { temperature: numbers[0] as number, feelsLike: numbers[1] as number, code: numbers[2] as number,
    low: numbers[3] as number, high: numbers[4] as number,
    rain: typeof rain === "number" && rain >= 0 && rain <= 100 ? rain : null,
    date: daily!.time[0] as string, time: current.time };
}

export async function getWeather(city: City, signal: AbortSignal): Promise<Weather> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({ latitude: String(city.latitude), longitude: String(city.longitude),
    current: "temperature_2m,apparent_temperature,weather_code",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max", timezone: "auto", forecast_days: "1" }).toString();
  return parseWeather(await request(url, signal));
}

export function weatherLabel(code: number): string {
  if (code === 0) return "晴";
  if ([1, 2].includes(code)) return "晴间多云";
  if (code === 3) return "阴";
  if ([45, 48].includes(code)) return "雾";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "降雪";
  if ([95, 96, 99].includes(code)) return "雷雨";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "降雨";
  return "天气变化中";
}

export function clothingAdvice(weather: Weather): string {
  const t = weather.feelsLike;
  let text = t < 5 ? "体感偏冷，可考虑厚外套与保暖内搭。" : t < 15 ? "体感较凉，可考虑外套搭配长裤。"
    : t < 23 ? "体感温和，可考虑长袖或轻薄叠穿。" : "体感偏热，可考虑轻薄、透气的衣物。";
  if (weather.high - weather.low >= 8) text += "早晚温差较大，可备一件方便穿脱的外套。";
  if ((weather.rain ?? 0) >= 50 || [51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(weather.code)) text += "有降雨可能，出门记得带伞，可选耐水鞋履。";
  if ([71,73,75,77,85,86].includes(weather.code)) text += "有降雪，注意保暖并选择防滑鞋履。";
  return text;
}
