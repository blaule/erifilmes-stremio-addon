const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

const PORT = process.env.PORT || 7000;
const PLAYLIST_URL =
  process.env.PLAYLIST_URL ||
  "https://raw.githubusercontent.com/blaulley/playlisttt/refs/heads/main/EriFilmesSerie.m3u";

const manifest = {
  id: "com.erifilmes.iptv",
  version: "1.0.0",
  name: "EriFilmes",
  description: "Catálogo da playlist M3U EriFilmesSerie para Stremio.",
  logo: "https://i.ibb.co/yFc8Ht02/12-anos-de-escr-1.jpg",
  resources: ["catalog", "meta", "stream"],
  types: ["movie"],
  idPrefixes: ["eri:"],
  catalogs: [
    {
      type: "movie",
      id: "erifilmes",
      name: "EriFilmes",
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    }
  ],
  behaviorHints: {
    configurable: false,
    configurationRequired: false
  }
};

const builder = new addonBuilder(manifest);

let cache = {
  items: [],
  loadedAt: 0
};

function unquote(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

function attr(line, name) {
  const re = new RegExp(
    name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      '\\s*=\\s*(?:"([^"]*)"|([^\\s,]+))',
    "i"
  );
  const m = line.match(re);
  return m ? unquote(m[1] ?? m[2]) : "";
}

function cleanTitle(s) {
  return String(s || "")
    .replace(/\\r/g, "")
    .replace(/\\n/g, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

function parseExtInf(line) {
  const comma = line.indexOf(",");
  const attrsPart = comma >= 0 ? line.slice(0, comma) : line;
  const title = comma >= 0 ? cleanTitle(line.slice(comma + 1)) : "Sem título";

  let group = attr(attrsPart, "group-title");
  if (!group) group = attr(attrsPart, "group");
  if (!group) group = attr(attrsPart, "grupo");

  const poster = attr(attrsPart, "tvg-logo");
  const yearRaw = attr(attrsPart, "year");
  const genreRaw = attr(attrsPart, "genre");

  return {
    title,
    poster: poster || undefined,
    group: group || "EriFilmes",
    year: yearRaw ? parseInt(yearRaw, 10) : undefined,
    genre: genreRaw || group || "Filmes"
  };
}

function parseM3U(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const items = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line.toUpperCase().startsWith("#EXTINF")) continue;

    const info = parseExtInf(line);
    let url = "";

    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim();
      if (!next) continue;
      if (next.startsWith("#")) continue;
      url = next;
      i = j;
      break;
    }

    if (!url || !/^https?:\/\//i.test(url)) continue;

    const index = items.length;
    items.push({
      id: `eri:${index}`,
      type: "movie",
      name: info.title,
      poster: info.poster,
      group: info.group,
      genre: info.genre,
      year: Number.isFinite(info.year) ? info.year : undefined,
      url
    });
  }

  return items;
}

async function loadPlaylist() {
  const now = Date.now();

  // Cache por 5 minutos para não baixar a M3U em toda chamada do Stremio.
  if (cache.items.length && now - cache.loadedAt < 5 * 60 * 1000) {
    return cache.items;
  }

  const response = await fetch(PLAYLIST_URL, {
    headers: {
      "User-Agent": "EriFilmes-Stremio-Addon/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Falha ao baixar a playlist: HTTP ${response.status}`);
  }

  const text = await response.text();
  const items = parseM3U(text);

  cache = {
    items,
    loadedAt: now
  };

  return items;
}

function toMeta(item) {
  const meta = {
    id: item.id,
    type: "movie",
    name: item.name,
    poster: item.poster,
    description: item.group ? `Categoria: ${item.group}` : undefined,
    genres: item.genre
      ? item.genre.split(",").map(x => x.trim()).filter(Boolean)
      : [],
    releaseInfo: item.year ? String(item.year) : undefined
  };

  return Object.fromEntries(
    Object.entries(meta).filter(([, value]) => value !== undefined && value !== "")
  );
}

builder.defineCatalogHandler(async (args) => {
  try {
    let items = await loadPlaylist();

    const search =
      args?.extra?.search ? String(args.extra.search).trim().toLowerCase() : "";

    if (search) {
      items = items.filter(item =>
        item.name.toLowerCase().includes(search)
      );
    }

    const skip = Math.max(0, parseInt(args?.extra?.skip || "0", 10) || 0);
    const page = items.slice(skip, skip + 100);

    return {
      metas: page.map(toMeta),
      cacheMaxAge: 300
    };
  } catch (error) {
    console.error(error);
    return { metas: [] };
  }
});

builder.defineMetaHandler(async (args) => {
  try {
    const items = await loadPlaylist();
    const item = items.find(x => x.id === args.id);

    if (!item) return { meta: null };

    return {
      meta: {
        ...toMeta(item),
        behaviorHints: {
          defaultVideoId: item.id
        }
      },
      cacheMaxAge: 300
    };
  } catch (error) {
    console.error(error);
    return { meta: null };
  }
});

builder.defineStreamHandler(async (args) => {
  try {
    const items = await loadPlaylist();
    const item = items.find(x => x.id === args.id);

    if (!item) return { streams: [] };

    return {
      streams: [
        {
          name: "EriFilmes",
          title: item.name,
          url: item.url,
          behaviorHints: {
            bingeGroup: "erifilmes"
          }
        }
      ],
      cacheMaxAge: 300
    };
  } catch (error) {
    console.error(error);
    return { streams: [] };
  }
});

serveHTTP(builder.getInterface(), {
  port: PORT
});

console.log(`EriFilmes Stremio Addon iniciado na porta ${PORT}`);
console.log(`Playlist: ${PLAYLIST_URL}`);
