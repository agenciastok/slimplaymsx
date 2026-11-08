// src/core/config.ts
var AppConfig = {
  version: "1.0.0",
  appName: "SLIM PLAY",
  defaultWebPage: "https://slimplay.app",
  defaultApiBase: "https://slimplaypanel.vercel.app/api",
  userAgent: "SlimPlay/1.0 (Tizen)",
  pageSize: 40,
  pingPath: "/devices/ping",
  activatePath: "/devices/activate",
  pinPath: "/devices/pin",
  deleteListPath: "/devices/lists/delete",
  invalidAccess: "Dados de acesso incorretos"
};

// src/core/device-key.ts
function deviceKeyFromId(id) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619) >>> 0;
    hash &= 2147483647;
  }
  const text = String(hash % 1e6);
  return text.length >= 6 ? text : `000000${text}`.slice(-6);
}

// src/core/json.ts
function jString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (text === "" || text === "null") return null;
  return text;
}
function jInt(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}
function jIntOrNull(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}
function jBool(value) {
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (text === "true") return true;
  if (text === "false") return false;
  return null;
}
function jMap(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return null;
}

// src/core/format.ts
function parseExpiry(raw) {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (text === "" || text === "0" || text === "null") return null;
  const unix = Number(text);
  if (Number.isInteger(unix) && String(unix) === text) {
    const millis = unix > 1e11 ? unix : unix * 1e3;
    return new Date(millis);
  }
  const normalized = text.includes(" ") && !text.includes("T") ? text.replace(" ", "T") : text;
  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}
function toIso(date) {
  return date ? date.toISOString() : null;
}
function parseDuration(raw) {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
  const text = String(raw).trim();
  if (text === "" || text === "null") return null;
  if (text.includes(":")) {
    const parts = text.split(":").map((part) => Number.parseInt(part, 10));
    if (parts.length === 3 && parts.every((part) => Number.isInteger(part))) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2 && parts.every((part) => Number.isInteger(part))) {
      return parts[0] * 60 + parts[1];
    }
  }
  const parsed = Number.parseInt(text.split(".")[0] ?? "", 10);
  return Number.isNaN(parsed) ? null : parsed;
}
function fromIso(value) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

// src/core/license.ts
var trialMs = 7 * 24 * 60 * 60 * 1e3;
function licenseFromPayload(json) {
  const hasFacts = "is_activated" in json || "created_at" in json || "dns_id" in json;
  if (!hasFacts) return null;
  return evaluateAppLicense({
    isActivated: jBool(json.is_activated),
    expiresAt: toIso(parseExpiry(json.expires_at)),
    createdAt: toIso(parseExpiry(json.created_at)),
    dnsId: jIntOrNull(json.dns_id),
    dnsStatus: jBool(json.dns_status),
    dnsExpiresAt: toIso(parseExpiry(json.dns_expires_at)),
    partnerCode: jString(json.partner_code)
  });
}
function evaluateAppLicense(input) {
  const clock = input.now ?? /* @__PURE__ */ new Date();
  if (input.dnsId != null) {
    const dnsExpires = fromIso(input.dnsExpiresAt);
    const dnsExpired = dnsExpires != null && clock.getTime() > dnsExpires.getTime();
    if (input.dnsStatus !== true || dnsExpired) return expiredLicense();
    if ((input.partnerCode ?? "").trim()) return { kind: "partner", daysRemaining: null, validUntil: null };
  }
  const expiresAt = fromIso(input.expiresAt);
  if (input.isActivated === true && expiresAt && clock.getTime() <= expiresAt.getTime()) {
    return { kind: "activated", daysRemaining: null, validUntil: expiresAt.toISOString() };
  }
  const createdAt = fromIso(input.createdAt);
  if (createdAt && clock.getTime() - createdAt.getTime() <= trialMs) {
    return {
      kind: "trial",
      daysRemaining: trialDaysRemaining(createdAt, clock),
      validUntil: null
    };
  }
  return expiredLicense();
}
function trialDaysRemaining(createdAt, now) {
  const left = createdAt.getTime() + trialMs - now.getTime();
  if (left <= 0) return 0;
  const day = 24 * 60 * 60 * 1e3;
  const whole = Math.floor(left / day);
  if (left === whole * day) return whole;
  return whole + 1;
}
function expiredLicense() {
  return { kind: "expired", daysRemaining: null, validUntil: null };
}

// src/core/mac-address.ts
var hexOnly = /[^0-9A-Fa-f]/g;
function formatAsMacAddress(raw) {
  if (raw == null) return null;
  const hex = raw.replace(hexOnly, "").toUpperCase();
  if (hex.length < 12) return null;
  const body = hex.slice(0, 12);
  if (body === "000000000000" || body === "020000000000") return null;
  const pairs = [];
  for (let index = 0; index < 12; index += 2) {
    pairs.push(body.slice(index, index + 2));
  }
  return pairs.join(":");
}

// src/models/playlist.ts
function isDirectPlaylist(list) {
  return list.playlistType === "url";
}
var reviewListCode = "780435";
var reviewListUser = "reviewtest";
var reviewListPassword = "testpassword976";
function loadsReadyM3u(list) {
  return list.code.trim() === reviewListCode && list.username.trim() === reviewListUser && list.password.trim() === reviewListPassword;
}
function usesM3uCatalog(list) {
  return isDirectPlaylist(list) || loadsReadyM3u(list);
}
function directM3uUrl(list) {
  if (loadsReadyM3u(list)) return list.m3uUrl.trim() || list.dnsUrl.trim();
  return list.m3uUrl.trim();
}
function playlistLoaded(list) {
  if (!list) return false;
  if (isDirectPlaylist(list)) return list.m3uUrl.trim().length > 0;
  return list.dnsUrl.length > 0 && list.username.length > 0 && list.password.length > 0;
}
function playlistFromApi(json) {
  const nested = jMapSafe(json.data);
  const source = nested ?? json;
  return {
    dnsUrl: normalizeDns(
      jString(source.dns_url) ?? jString(source.dns) ?? jString(source.server_url) ?? ""
    ),
    username: jString(source.username) ?? jString(source.user) ?? "",
    password: jString(source.password) ?? jString(source.pass) ?? "",
    name: jString(source.playlist_name) ?? "",
    code: jString(source.partner_code) ?? "",
    playlistType: "",
    m3uUrl: "",
    listId: 0,
    partnerDns: false,
    dnsStatus: null,
    dnsExpiresAt: null,
    expiration: toIso(parseExpiry(source.exp_date ?? source.expiration ?? source.expiry)),
    status: jString(source.status)
  };
}
function playlistFromServer(json) {
  const type = (jString(json.playlist_type) ?? "").toLowerCase();
  const dnsId = json.dns_id;
  const partner = dnsId != null && String(dnsId).trim() !== "";
  const m3u = jString(json.m3u_url) ?? "";
  const name = jString(json.playlist_name) ?? "";
  const code = jString(json.partner_code) ?? "";
  const username = jString(json.username) ?? "";
  const password = jString(json.password) ?? "";
  const listId = jInt(json.id);
  if (partner) {
    return withServerLicense(
      {
        dnsUrl: normalizeDns(jString(json.dns_url) ?? ""),
        username,
        password,
        name,
        code,
        playlistType: "partner",
        m3uUrl: "",
        listId,
        partnerDns: false,
        dnsStatus: null,
        dnsExpiresAt: null,
        expiration: null,
        status: null
      },
      json
    );
  }
  if (type === "url") {
    return withServerLicense(
      openedAsXtream({
        dnsUrl: m3u,
        username,
        password,
        name,
        code,
        playlistType: "url",
        m3uUrl: m3u,
        listId,
        partnerDns: false,
        dnsStatus: null,
        dnsExpiresAt: null,
        expiration: null,
        status: null
      }),
      json
    );
  }
  if (type === "xtream") {
    return withServerLicense(
      {
        dnsUrl: portalBase(m3u),
        username,
        password,
        name,
        code,
        playlistType: "xtream",
        m3uUrl: m3u,
        listId,
        partnerDns: false,
        dnsStatus: null,
        dnsExpiresAt: null,
        expiration: null,
        status: null
      },
      json
    );
  }
  return emptyPlaylist();
}
function playlistsFromPayload(payload) {
  const raw = payload.lists;
  if (!Array.isArray(raw)) return [];
  const items2 = [];
  for (const item of raw) {
    const map = jMapSafe(item);
    if (!map) continue;
    const list = playlistFromServer(map);
    if (playlistLoaded(list)) items2.push(list);
  }
  return items2;
}
function openedAsXtream(list) {
  if (!isDirectPlaylist(list)) return list;
  const source = list.m3uUrl.trim() || list.dnsUrl;
  let uri;
  try {
    uri = new URL(source);
  } catch {
    return list;
  }
  if (!uri.host) return list;
  const user = (uri.searchParams.get("username") ?? uri.searchParams.get("user") ?? list.username).trim();
  const pass = (uri.searchParams.get("password") ?? uri.searchParams.get("pass") ?? list.password).trim();
  if (!user || !pass) return list;
  return {
    ...list,
    dnsUrl: portalBase(source),
    username: user,
    password: pass,
    playlistType: "xtream"
  };
}
function normalizeDns(raw) {
  let value = raw.trim();
  if (value.endsWith("/")) value = value.slice(0, -1);
  value = value.replace(/\/player_api\.php$/, "");
  value = value.replace(/\/get\.php$/, "");
  return value;
}
function portalBase(raw) {
  try {
    const uri = new URL(raw.trim());
    if (!uri.host) return normalizeDns(raw);
    const port = uri.port ? `:${uri.port}` : "";
    return normalizeDns(`${uri.protocol}//${uri.hostname}${port}`);
  } catch {
    return normalizeDns(raw);
  }
}
function withServerLicense(list, json) {
  const status = json.dns_status;
  return {
    ...list,
    partnerDns: json.partner_dns === true,
    dnsStatus: status === true ? true : status === false ? false : null,
    dnsExpiresAt: toIso(parseExpiry(json.dns_expires_at))
  };
}
function emptyPlaylist() {
  return {
    dnsUrl: "",
    username: "",
    password: "",
    name: "",
    code: "",
    playlistType: "",
    m3uUrl: "",
    listId: 0,
    partnerDns: false,
    dnsStatus: null,
    dnsExpiresAt: null,
    expiration: null,
    status: null
  };
}
function jMapSafe(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return null;
}

// src/core/text.ts
var accents = {
  \u00E1: "a",
  \u00E0: "a",
  \u00E2: "a",
  \u00E3: "a",
  \u00E4: "a",
  \u00E9: "e",
  \u00E8: "e",
  \u00EA: "e",
  \u00EB: "e",
  \u00ED: "i",
  \u00EC: "i",
  \u00EE: "i",
  \u00EF: "i",
  \u00F3: "o",
  \u00F2: "o",
  \u00F4: "o",
  \u00F5: "o",
  \u00F6: "o",
  \u00FA: "u",
  \u00F9: "u",
  \u00FB: "u",
  \u00FC: "u",
  \u00E7: "c",
  \u00F1: "n"
};
function foldAscii(value) {
  let folded = "";
  for (const char of value.toLowerCase()) folded += accents[char] ?? char;
  return folded;
}
function slug(raw) {
  const folded = foldAscii(raw).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return folded || "outros";
}

// src/services/catalog-error.ts
var CatalogException = class extends Error {
  constructor(message) {
    super(message);
    this.name = "CatalogException";
  }
};

// src/services/m3u.ts
var cache = /* @__PURE__ */ new Map();
var pending = /* @__PURE__ */ new Map();
async function loadDirectCatalog(credentials, signal) {
  const url = directM3uUrl(credentials);
  if (!/^https?:\/\//i.test(url)) throw new CatalogException("Falha ao baixar o conte\xFAdo");
  const cached = cache.get(url);
  if (cached) return cached;
  let task = pending.get(url);
  if (!task) {
    task = fetchCatalog(url).finally(() => pending.delete(url));
    pending.set(url, task);
  }
  if (!signal) return task;
  return abortable(task, signal);
}
function catalogEntries(catalog, kind, categoryId) {
  if (kind !== "live" && kind !== "movie" && kind !== "series") return [];
  const entries = catalog.entries[kind];
  if (!categoryId) return entries;
  return entries.filter((item) => item.categoryId === categoryId);
}
function parseM3uCatalog(text) {
  const names = {
    live: /* @__PURE__ */ new Map(),
    movie: /* @__PURE__ */ new Map(),
    series: /* @__PURE__ */ new Map()
  };
  const entries = { live: [], movie: [], series: [] };
  let name = null;
  let logo = null;
  let group = null;
  let ordinal = 0;
  for (const raw of text.split(/\r\n|\n|\r/)) {
    let line = raw.trim();
    if (line.startsWith("\uFEFF")) line = line.slice(1).trim();
    if (!line) continue;
    if (line.toUpperCase().startsWith("#EXTINF")) {
      const meta = parseExtInf(line);
      name = meta.name;
      logo = meta.logo;
      group = meta.group;
      continue;
    }
    if (line.startsWith("#")) continue;
    if (!line.startsWith("http://") && !line.startsWith("https://")) continue;
    ordinal += 1;
    const kind = kindFromPlaylistUrl(line, group);
    const categoryName = group ?? "Outros";
    const categoryId = slug(categoryName);
    names[kind].set(categoryId, categoryName);
    entries[kind].push({
      id: `${kind}:src:${ordinal}`,
      sourceId: String(ordinal),
      name: name?.trim() ? name : "Sem nome",
      kind,
      posterUrl: logo,
      categoryId,
      categoryName,
      mediaUrl: line,
      plot: null,
      year: null,
      genre: null,
      addedAt: ordinal
    });
    name = null;
    logo = null;
    group = null;
  }
  return {
    categories: {
      live: foldersOf(names.live),
      movie: foldersOf(names.movie),
      series: foldersOf(names.series)
    },
    entries
  };
}
async function fetchCatalog(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: "*/*" },
      cache: "no-store",
      signal: AbortSignal.timeout(9e4)
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new CatalogException("Falha ao baixar o conte\xFAdo");
  }
  if (response.status < 200 || response.status >= 300) {
    throw new CatalogException("Falha ao baixar o conte\xFAdo");
  }
  const text = await response.text();
  if (!text.includes("#EXTM3U") && !text.includes("#EXTINF")) {
    throw new CatalogException("Falha ao baixar o conte\xFAdo");
  }
  const catalog = parseM3uCatalog(text);
  cache.set(url, catalog);
  return catalog;
}
function abortable(task, signal) {
  if (signal.aborted) return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("The operation was aborted.", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    task.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    );
  });
}
function parseExtInf(line) {
  const comma = line.indexOf(",");
  const name = comma >= 0 ? line.slice(comma + 1).trim() : "Sem nome";
  return {
    name: name || "Sem nome",
    logo: attr(line, "tvg-logo"),
    group: attr(line, "group-title")
  };
}
function attr(line, key) {
  const match = new RegExp(`${key}="([^"]*)"`).exec(line);
  const value = match?.[1]?.trim();
  return value ? value : null;
}
function kindFromPlaylistUrl(url, group) {
  const lower = url.toLowerCase();
  const folder = (group ?? "").toLowerCase();
  if (lower.includes("/series/") || folder.includes("serie")) return "series";
  if (lower.includes("/movie/") || lower.includes("/vod/") || folder.includes("filme") || folder.includes("movie")) {
    return "movie";
  }
  return "live";
}
function foldersOf(names) {
  return [...names.entries()].map(([id, name]) => ({ id, name }));
}
function isAbort(error) {
  return error instanceof DOMException && error.name === "AbortError";
}

// src/services/xtream.ts
async function loadCategories(credentials, kind, signal) {
  if (usesM3uCatalog(credentials)) {
    if (kind !== "live" && kind !== "movie" && kind !== "series") throw new CatalogException("Tipo inv\xE1lido");
    const catalog = await loadDirectCatalog(credentials, signal);
    return catalog.categories[kind];
  }
  const decoded = await getJson(credentials, { action: categoryAction(kind) }, signal);
  if (!Array.isArray(decoded)) throw new CatalogException("Resposta inv\xE1lida do servidor");
  const folders = [];
  for (const item of decoded) {
    const map = asMap(item);
    const id = jString(map?.category_id);
    if (!map || !id) continue;
    folders.push({ id, name: jString(map.category_name) ?? "Sem nome" });
  }
  return folders;
}
async function loadStreams(credentials, kind, categoryId, signal) {
  if (usesM3uCatalog(credentials)) {
    const catalog = await loadDirectCatalog(credentials, signal);
    return catalogEntries(catalog, kind, categoryId);
  }
  const query = { action: streamAction(kind) };
  if (categoryId) query.category_id = categoryId;
  const decoded = await getJson(credentials, query, signal);
  if (asMap(decoded)?.user_info && !Array.isArray(decoded)) {
    throw new CatalogException(AppConfig.invalidAccess);
  }
  if (!Array.isArray(decoded)) throw new CatalogException("Resposta inv\xE1lida do servidor");
  const entries = [];
  for (const item of decoded) {
    const map = asMap(item);
    if (!map) continue;
    const entry = mapCatalogEntry(credentials, kind, map);
    if (entry) entries.push(entry);
  }
  return entries;
}
async function loadSeriesDetail(credentials, seed, signal) {
  if (isDirectPlaylist(credentials) || loadsReadyM3u(credentials)) {
    if (!seed.mediaUrl) throw new CatalogException("S\xE9rie indispon\xEDvel");
    return singleEpisode(seed);
  }
  try {
    const decoded = await getJson(
      credentials,
      { action: "get_series_info", series_id: seed.sourceId },
      signal
    );
    return seriesDetailFromPayload(credentials, seed, decoded);
  } catch (error) {
    if (isAbort2(error)) throw error;
    if (seed.mediaUrl) return singleEpisode(seed);
    throw error;
  }
}
function seriesDetailFromPayload(credentials, seed, decoded) {
  const map = asMap(decoded);
  if (!map) throw new CatalogException("S\xE9rie indispon\xEDvel");
  const info = asMap(map.info) ?? {};
  const series2 = {
    ...seed,
    name: jString(info.name) ?? seed.name,
    plot: jString(info.plot) ?? seed.plot,
    genre: jString(info.genre) ?? seed.genre,
    year: yearOf(info) ?? seed.year,
    posterUrl: jString(info.cover) ?? seed.posterUrl,
    backdropUrl: backdropOf(info) ?? seed.backdropUrl ?? seed.posterUrl,
    trailerUrl: trailerUrl(info.youtube_trailer) ?? seed.trailerUrl
  };
  const seasons = seasonsFrom(credentials, series2, map.episodes);
  if (seasons.length === 0 && seed.mediaUrl) return singleEpisode(seed);
  return { series: series2, seasons };
}
function mapCatalogEntry(credentials, kind, object) {
  if (kind === "live" || kind === "movie") {
    const id = jString(object.stream_id);
    if (!id) return null;
    const extension = jString(object.container_extension) ?? (kind === "live" ? "ts" : "mp4");
    return {
      id: `${kind}:${id}`,
      sourceId: id,
      name: jString(object.name) ?? (kind === "live" ? "Canal" : "Filme"),
      kind,
      posterUrl: jString(object.stream_icon) ?? jString(object.cover) ?? jString(object.movie_image),
      categoryId: jString(object.category_id),
      mediaUrl: mediaUrl(credentials, kind, id, extension),
      plot: jString(object.plot),
      year: jString(object.year),
      genre: jString(object.genre)
    };
  }
  if (kind === "series") {
    const id = jString(object.series_id);
    if (!id) return null;
    return {
      id: `series:${id}`,
      sourceId: id,
      name: jString(object.name) ?? "S\xE9rie",
      kind,
      posterUrl: jString(object.cover) ?? jString(object.stream_icon) ?? jString(object.movie_image),
      backdropUrl: backdropOf(object),
      categoryId: jString(object.category_id),
      mediaUrl: null,
      plot: jString(object.plot),
      year: yearOf(object),
      genre: jString(object.genre),
      trailerUrl: trailerUrl(object.youtube_trailer),
      seriesId: id
    };
  }
  return null;
}
function mediaUrl(credentials, kind, id, extension) {
  const root = normalizeDns(credentials.dnsUrl);
  const user = encodeURIComponent(credentials.username);
  const pass = encodeURIComponent(credentials.password);
  const folder = kind === "live" ? "live" : "movie";
  return `${root}/${folder}/${user}/${pass}/${id}.${extension}`;
}
function categoryAction(kind) {
  if (kind === "live") return "get_live_categories";
  if (kind === "movie") return "get_vod_categories";
  if (kind === "series") return "get_series_categories";
  throw new CatalogException("Tipo inv\xE1lido");
}
function streamAction(kind) {
  if (kind === "live") return "get_live_streams";
  if (kind === "movie") return "get_vod_streams";
  if (kind === "series") return "get_series";
  throw new CatalogException("Tipo inv\xE1lido");
}
async function getJson(credentials, query, signal) {
  const root = normalizeDns(credentials.dnsUrl);
  const url = new URL(`${root}/player_api.php`);
  url.searchParams.set("username", credentials.username);
  url.searchParams.set("password", credentials.password);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: signal ?? AbortSignal.timeout(25e3)
    });
  } catch (error) {
    if (isAbort2(error)) throw error;
    throw new CatalogException("Falha ao falar com o servidor");
  }
  if (response.status < 200 || response.status >= 300) {
    throw new CatalogException("Falha ao falar com o servidor");
  }
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new CatalogException("Resposta inv\xE1lida do servidor");
  }
}
function seasonsFrom(credentials, series2, episodes) {
  if (!episodes || typeof episodes !== "object" || Array.isArray(episodes)) return [];
  const seasons = [];
  for (const [key, rawList] of Object.entries(episodes)) {
    if (!Array.isArray(rawList)) continue;
    const seasonNumber = Number.parseInt(key, 10);
    const number = Number.isNaN(seasonNumber) ? 0 : seasonNumber;
    const items2 = [];
    for (const raw of rawList) {
      const episode = mapEpisode(credentials, raw, series2, number);
      if (episode) items2.push(episode);
    }
    items2.sort((left, right) => (left.episodeNumber ?? 0) - (right.episodeNumber ?? 0));
    if (items2.length > 0) seasons.push({ number, episodes: items2 });
  }
  seasons.sort((left, right) => left.number - right.number);
  return seasons;
}
function mapEpisode(credentials, raw, series2, seasonNumber) {
  const episode = asMap(raw);
  const id = jString(episode?.id);
  if (!episode || !id) return null;
  const info = asMap(episode.info) ?? {};
  const extension = jString(episode.container_extension) ?? "mkv";
  const number = jInt(episode.episode_num);
  return {
    id: `episode:${id}`,
    sourceId: id,
    name: jString(episode.title) ?? `Epis\xF3dio ${number}`,
    kind: "episode",
    posterUrl: episodeStill(episode, info) ?? series2.posterUrl,
    categoryId: series2.categoryId,
    mediaUrl: seriesUrl(credentials, id, extension),
    plot: jString(info.plot),
    year: null,
    genre: null,
    durationSeconds: parseDuration(info.duration_secs ?? info.duration),
    seasonNumber,
    episodeNumber: number,
    seriesId: series2.sourceId,
    seriesName: series2.name,
    seriesPosterUrl: series2.posterUrl,
    categoryName: series2.categoryName,
    containerExtension: extension,
    addedAt: jInt(episode.added)
  };
}
function episodeStill(episode, info) {
  for (const raw of [
    info.movie_image,
    info.cover_big,
    info.still_path,
    episode.stream_icon,
    episode.cover,
    info.cover
  ]) {
    const value = jString(raw);
    if (value) return value;
  }
  return null;
}
function singleEpisode(seed) {
  const episode = {
    ...seed,
    kind: "episode",
    seriesName: seed.seriesName ?? seed.name,
    seasonNumber: seed.seasonNumber ?? 1,
    episodeNumber: seed.episodeNumber ?? 1
  };
  return {
    series: seed,
    seasons: [{ number: episode.seasonNumber ?? 1, episodes: [episode] }]
  };
}
function seriesUrl(credentials, id, extension) {
  const root = normalizeDns(credentials.dnsUrl);
  const user = encodeURIComponent(credentials.username);
  const pass = encodeURIComponent(credentials.password);
  return `${root}/series/${user}/${pass}/${id}.${extension}`;
}
function trailerUrl(raw) {
  const value = jString(raw);
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `https://www.youtube.com/watch?v=${value}`;
}
function backdropOf(info) {
  const path = info.backdrop_path;
  if (Array.isArray(path) && path.length > 0) return jString(path[0]);
  return jString(path) ?? jString(info.cover);
}
function yearOf(object) {
  const release = jString(object.releaseDate) ?? jString(object.releasedate) ?? jString(object.year);
  if (!release) return null;
  return release.match(/\d{4}/)?.[0] ?? release;
}
function asMap(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return null;
}
function isAbort2(error) {
  return error instanceof DOMException && error.name === "AbortError";
}

// src/msx/gateway.ts
var pageSize = AppConfig.pageSize;
var cacheMs = 10 * 60 * 1e3;
var lists = /* @__PURE__ */ new Map();
var catalogs = /* @__PURE__ */ new Map();
async function handleMsx(input) {
  const path = input.path.replace(/\/+$/, "") || "/";
  try {
    if (path === "/msx/start.json") return ok(startObject(input.base));
    if (path === "/msx/launch.json") return ok(launchObject(input.base));
    if (path === "/msx/menu") return ok(await menu(input.base, input.search.get("mac")));
    if (path === "/msx/enter" && input.method === "POST") return ok(await enterCode(input.base, input.body));
    if (path === "/msx/categories") return ok(await categories(input.base, input.search));
    if (path === "/msx/items") return ok(await items(input.base, input.search));
    if (path === "/msx/series") return ok(await series(input.search));
    if (path === "/msx/diag-ping") return ok({ ok: true, test: "D", stage: "api" });
    if (path === "/msx/diag-api") {
      return ok({
        type: "list",
        headline: "TESTE D OK",
        template: { type: "control", layout: "0,0,12,1" },
        items: [{ label: "A API respondeu sem dados do aparelho" }]
      });
    }
    return { status: 404, body: { error: "Endere\xE7o n\xE3o encontrado" } };
  } catch (error) {
    return ok(messagePage(msxFailure(error)));
  }
}
function startObject(base) {
  return {
    name: "SLIM PLAY",
    version: AppConfig.version,
    parameter: "content:{PREFIX}{SERVER}/msx/launch.json",
    launcher: {
      image: `${base}/msx/icon.png`,
      color: "#0F0F12"
    }
  };
}
function launchObject(base) {
  const app = `${base}/msx/app/?v=1.0.7`;
  return {
    type: "pages",
    headline: "SLIM PLAY",
    ready: { action: `video:plugin:${app}` },
    pages: [
      {
        items: [
          {
            layout: "0,0,12,6",
            color: "#0F0F12",
            image: `${base}/msx/icon.png`,
            imageFiller: "center",
            titleFooter: `SLIM PLAY ${AppConfig.version}`,
            action: `video:plugin:${app}`
          }
        ]
      }
    ]
  };
}
async function menu(base, rawMac) {
  const mac = rawMac ? formatAsMacAddress(rawMac) : null;
  if (!mac) {
    return {
      headline: "SLIM PLAY",
      menu: [{ label: "Entrar", data: enterPage(base) }]
    };
  }
  try {
    await deviceList(mac);
  } catch (error) {
    return {
      headline: "SLIM PLAY",
      menu: [{ label: "Entrar", data: messagePage(msxFailure(error)) }]
    };
  }
  const query = `mac=${encodeURIComponent(mac)}`;
  return {
    headline: "SLIM PLAY",
    menu: [
      { icon: "live-tv", label: "TV ao vivo", data: `${base}/msx/categories?${query}&kind=live` },
      { icon: "movie", label: "Filmes", data: `${base}/msx/categories?${query}&kind=movie` },
      { icon: "tv", label: "S\xE9ries", data: `${base}/msx/categories?${query}&kind=series` },
      { icon: "settings", label: "Trocar aparelho", data: enterPage(base) }
    ]
  };
}
function enterPage(base) {
  return {
    type: "pages",
    headline: "Aparelho",
    items: [
      {
        layout: "0,0,8,1",
        label: "Informe o MAC da TV",
        action: `execute:code:${base}/msx/enter`,
        data: {
          headline: "MAC do aparelho",
          placeholder: "AA:BB:CC:DD:EE:FF",
          extension: "O mesmo MAC da tela de ativa\xE7\xE3o do SlimPlay"
        }
      }
    ]
  };
}
async function enterCode(base, body) {
  const map = jMap(body);
  const mac = formatAsMacAddress(jString(map?.code));
  if (!mac) {
    return responseAction("warn:Informe o MAC no formato AA:BB:CC:DD:EE:FF");
  }
  try {
    await deviceList(mac);
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "Aparelho n\xE3o encontrado";
    return responseAction(`warn:${message}`);
  }
  return responseAction(`menu:${base}/msx/menu?mac=${encodeURIComponent(mac)}`);
}
async function categories(base, search) {
  const mac = requiredMac(search);
  const kind = requiredKind(search);
  const list = await deviceList(mac);
  const folders = await loadCategories(list, kind);
  const query = `mac=${encodeURIComponent(mac)}&kind=${kind}`;
  return {
    type: "list",
    headline: kindTitle(kind),
    template: { type: "control", layout: "0,0,12,1", icon: kindIcon(kind) },
    items: [
      { label: "Todos", action: `content:${base}/msx/items?${query}` },
      ...folders.map((folder) => ({
        label: folder.name,
        action: `content:${base}/msx/items?${query}&category=${encodeURIComponent(folder.id)}`
      }))
    ]
  };
}
async function items(base, search) {
  const mac = requiredMac(search);
  const kind = requiredKind(search);
  const list = await deviceList(mac);
  const category = search.get("category");
  const offset = clampOffset(search.get("offset"));
  const catalog = await catalogItems(mac, list, kind, category);
  const slice = catalog.slice(offset, offset + pageSize);
  const query = `mac=${encodeURIComponent(mac)}&kind=${kind}${category ? `&category=${encodeURIComponent(category)}` : ""}`;
  const cards = slice.map(
    (entry) => itemCard(base, mac, entry)
  );
  if (offset + pageSize < catalog.length) {
    cards.push({
      label: "Mais",
      action: `content:${base}/msx/items?${query}&offset=${offset + pageSize}`
    });
  }
  return {
    type: "pages",
    headline: kindTitle(kind),
    template: {
      type: kind === "live" ? "control" : "separate",
      layout: kind === "live" ? "0,0,12,1" : "0,0,2,4",
      color: "msx-glass"
    },
    items: cards.length > 0 ? cards : [{ label: "Nenhum t\xEDtulo nesta pasta." }]
  };
}
async function series(search) {
  const mac = requiredMac(search);
  const id = search.get("id")?.trim() ?? "";
  if (!id) return messagePage("S\xE9rie indispon\xEDvel");
  const list = await deviceList(mac);
  const detail = await loadSeriesDetail(list, {
    id: `series:${id}`,
    sourceId: id,
    name: "S\xE9rie",
    kind: "series",
    posterUrl: null,
    categoryId: null,
    mediaUrl: null,
    plot: null,
    year: null,
    genre: null
  });
  const episodes = detail.seasons.flatMap(
    (season) => season.episodes.map((episode) => ({
      label: episodeLabel(episode),
      playerLabel: `${detail.series.name} ${episodeLabel(episode)}`,
      image: imageOf(episode.posterUrl),
      action: episode.mediaUrl ? `video:${episode.mediaUrl}` : void 0
    }))
  );
  return {
    type: "pages",
    headline: detail.series.name,
    important: true,
    template: { type: "control", layout: "0,0,12,1" },
    items: episodes.length > 0 ? episodes : [{ label: "Nenhum epis\xF3dio nesta s\xE9rie." }]
  };
}
function itemCard(base, mac, entry) {
  if (entry.kind === "series") {
    return {
      label: entry.name,
      title: entry.name,
      image: imageOf(entry.posterUrl),
      action: `content:${base}/msx/series?mac=${encodeURIComponent(mac)}&id=${encodeURIComponent(entry.sourceId)}`
    };
  }
  return {
    label: entry.name,
    title: entry.name,
    playerLabel: entry.name,
    image: imageOf(entry.posterUrl),
    extensionLabel: entry.kind === "live" ? "AO VIVO" : void 0,
    action: entry.mediaUrl ? `video:${entry.mediaUrl}` : void 0
  };
}
function episodeLabel(entry) {
  if (entry.seasonNumber == null && entry.episodeNumber == null) return entry.name;
  return `S${entry.seasonNumber ?? 0} E${entry.episodeNumber ?? 0}  ${entry.name}`;
}
async function catalogItems(mac, list, kind, category) {
  const key = `${mac}|${kind}|${category ?? ""}`;
  const cached = catalogs.get(key);
  if (cached && Date.now() - cached.at < cacheMs) return cached.items;
  const items2 = await loadStreams(list, kind, category);
  catalogs.set(key, { at: Date.now(), items: items2 });
  return items2;
}
async function deviceList(mac) {
  const cached = lists.get(mac);
  if (cached && Date.now() - cached.at < cacheMs) return cached.list;
  const payload = await ping(mac);
  const license = licenseFromPayload(payload);
  if (license?.kind === "expired" || payload.blocked === true) {
    throw new Error("A licen\xE7a deste aparelho expirou");
  }
  const saved = playlistsFromPayload(payload).find((item) => playlistLoaded(item)) ?? null;
  const direct = openedAsXtream(playlistFromApi(payload));
  const list = saved ?? (playlistLoaded(direct) ? direct : null);
  if (!list) throw new Error("Nenhuma lista neste aparelho. Ative o MAC no SlimPlay.");
  lists.set(mac, { at: Date.now(), list });
  return list;
}
async function ping(mac) {
  let response;
  try {
    response = await fetch(`${AppConfig.defaultApiBase}${AppConfig.pingPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ mac, device_key: deviceKeyFromId(mac) }),
      signal: AbortSignal.timeout(2e4)
    });
  } catch {
    throw new Error("N\xE3o foi poss\xEDvel falar com o painel");
  }
  const text = await response.text();
  if (response.status < 200 || response.status >= 300) throw new Error(panelMessage(text));
  const payload = jMap(text ? JSON.parse(text) : null);
  if (!payload || payload.success === false || payload.ok === false) throw new Error(panelMessage(text));
  return payload;
}
function panelMessage(body) {
  try {
    const message = jString(jMap(JSON.parse(body))?.message);
    if (message) return message;
  } catch {
  }
  return "Aparelho n\xE3o encontrado";
}
function requiredMac(search) {
  const mac = formatAsMacAddress(search.get("mac"));
  if (!mac) throw new Error("Informe o MAC do aparelho");
  return mac;
}
function requiredKind(search) {
  const kind = search.get("kind");
  if (kind === "live" || kind === "movie" || kind === "series") return kind;
  throw new Error("Tipo inv\xE1lido");
}
function clampOffset(value) {
  const offset = Number.parseInt(value ?? "0", 10);
  if (!Number.isFinite(offset) || offset < 0) return 0;
  return offset;
}
function kindTitle(kind) {
  if (kind === "live") return "TV ao vivo";
  if (kind === "movie") return "Filmes";
  return "S\xE9ries";
}
function kindIcon(kind) {
  if (kind === "live") return "msx-white:live-tv";
  if (kind === "movie") return "msx-white:movie";
  return "msx-white:tv";
}
function imageOf(url) {
  if (!url) return void 0;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return void 0;
}
function messagePage(message) {
  return {
    type: "pages",
    headline: "SLIM PLAY",
    items: [{ label: message }]
  };
}
function responseAction(action) {
  return { response: { status: 200, data: { action } } };
}
function ok(body) {
  return { status: 200, body };
}
function msxFailure(error) {
  if (error instanceof CatalogException) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "N\xE3o foi poss\xEDvel carregar";
}

// src/msx/http.ts
var config = {
  api: { bodyParser: false }
};
async function handler(request, response) {
  try {
    if (methodOf(request) === "OPTIONS") return send(response, 204, null);
    const url = requestUrl(request);
    const route = url.pathname.split("/").filter(Boolean).pop() ?? "";
    const host = header(request, "x-forwarded-host") ?? header(request, "host") ?? url.host;
    const proto = header(request, "x-forwarded-proto") || "https";
    const result = await handleMsx({
      method: methodOf(request),
      path: `/msx/${route}`,
      search: url.searchParams,
      body: methodOf(request) === "POST" ? await readJson(request) : null,
      base: `${proto}://${host}`
    });
    return send(response, result.status, result.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "N\xE3o foi poss\xEDvel carregar";
    return send(response, 500, { error: message });
  }
}
function methodOf(request) {
  if (request && typeof request === "object" && "method" in request && typeof request.method === "string") {
    return request.method;
  }
  return "GET";
}
function requestUrl(request) {
  const raw = request && typeof request === "object" && "url" in request ? request.url : "/";
  const value = typeof raw === "string" && raw ? raw : "/";
  if (value.startsWith("http://") || value.startsWith("https://")) return new URL(value);
  const host = header(request, "x-forwarded-host") ?? header(request, "host") ?? "slimplay.site";
  return new URL(value, `https://${host}`);
}
function header(request, name) {
  if (!request || typeof request !== "object" || !("headers" in request)) return void 0;
  const headers = request.headers;
  if (!headers || typeof headers !== "object") return void 0;
  if ("get" in headers && typeof headers.get === "function") {
    const value = headers.get(name);
    return typeof value === "string" ? value : void 0;
  }
  if (name in headers) {
    const value = headers[name];
    if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : void 0;
    return typeof value === "string" ? value : void 0;
  }
  return void 0;
}
async function readJson(request) {
  const text = (await readText(request)).trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { code: text };
  }
}
async function readText(request) {
  if (request && typeof request === "object" && "text" in request && typeof request.text === "function") {
    const text = await request.text();
    return typeof text === "string" ? text : "";
  }
  const chunks = [];
  if (request && typeof request === "object" && Symbol.asyncIterator in request) {
    for await (const chunk of request) {
      chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
    }
  }
  const merged = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}
function send(response, status, body) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  };
  if (response && typeof response.setHeader === "function" && typeof response.end === "function") {
    for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
    response.statusCode = status;
    response.end(status === 204 ? void 0 : JSON.stringify(body));
    return;
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}
export {
  config,
  handler as default
};
