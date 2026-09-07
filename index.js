const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

const PORT = Number(process.env.PORT || 10000);

const PLAYLIST_URL =
  process.env.PLAYLIST_URL ||
  "https://raw.githubusercontent.com/blaulley/playlisttt/refs/heads/main/EriFilmesSerie.m3u";


/* =========================================================
   MANIFEST
========================================================= */

const manifest = {
  id: "com.erifilmes.iptv",
  version: "1.2.0",
  name: "EriFilmes",

  description:
    "Filmes da playlist EriFilmes com poster e fundo de tela.",

  logo:
    "https://i.ibb.co/yFc8Ht02/12-anos-de-escr-1.jpg",

  resources: [
    "catalog",
    "meta",
    "stream"
  ],

  types: [
    "movie"
  ],

  idPrefixes: [
    "eri:"
  ],

  catalogs: [
    {
      type: "movie",
      id: "erifilmes",
      name: "EriFilmes",

      extra: [
        {
          name: "search",
          isRequired: false
        },
        {
          name: "skip",
          isRequired: false
        }
      ]
    }
  ]
};


const builder = new addonBuilder(manifest);


/* =========================================================
   CACHE
========================================================= */

let cache = {
  items: [],
  loadedAt: 0
};


/* =========================================================
   LIMPAR TEXTO
========================================================= */

function clean(value) {

  return String(value || "")
    .replace(/^\s*["']|["']\s*$/g, "")
    .trim();

}


/* =========================================================
   ATRIBUTO DA EXTINF
========================================================= */

function getAttribute(line, name) {

  const escapedName =
    name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const patterns = [

    new RegExp(
      `${escapedName}\\s*=\\s*"([^"]+)"`,
      "i"
    ),

    new RegExp(
      `${escapedName}\\s*=\\s*'([^']+)'`,
      "i"
    ),

    new RegExp(
      `${escapedName}\\s*=\\s*([^\\s,]+)`,
      "i"
    )

  ];


  for (const regex of patterns) {

    const match = line.match(regex);

    if (match && match[1]) {

      return clean(match[1]);

    }

  }

  return "";
}


/* =========================================================
   POSTER
========================================================= */

function getPoster(line) {

  let poster =
    getAttribute(line, "tvg-logo");

  if (poster) {

    return poster;

  }


  /*
    Formatos quebrados da playlist
  */

  const broken =
    line.match(
      /tvg-logo\s*=\s*(?:grupo\s*)?"([^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"/i
    );


  if (broken) {

    return clean(broken[1]);

  }


  poster =
    getAttribute(line, "logo");

  if (poster) {

    return poster;

  }


  return "";
}


/* =========================================================
   BACKGROUND / FUNDO
========================================================= */

function getBackground(line, poster) {

  /*
    Primeiro procura:

    background="https://..."
  */

  let background =
    getAttribute(line, "background");

  if (background) {

    return background;

  }


  /*
    Também aceita:

    backdrop="https://..."
  */

  background =
    getAttribute(line, "backdrop");

  if (background) {

    return background;

  }


  /*
    Aceita:

    fanart="https://..."
  */

  background =
    getAttribute(line, "fanart");

  if (background) {

    return background;

  }


  /*
    Aceita:

    tvg-background="https://..."
  */

  background =
    getAttribute(line, "tvg-background");

  if (background) {

    return background;

  }


  /*
    Se não existir imagem de fundo,
    usa o poster como fallback.

    Isso evita deixar o fundo vazio.
  */

  if (poster) {

    return poster;

  }


  return "";
}


/* =========================================================
   GRUPO / CATEGORIA
========================================================= */

function getGroup(line) {

  let group =
    getAttribute(line, "group-title");

  if (group) {

    return group;

  }


  const broken =
    line.match(
      /(?:group[\s-]*title|grupo[\s-]*t[ií]tulo)\s*=\s*"([^"]+)"/i
    );


  if (broken) {

    return clean(broken[1]);

  }


  group =
    getAttribute(line, "group");

  if (group) {

    return group;

  }


  return "EriFilmes";
}


/* =========================================================
   TÍTULO
========================================================= */

function getTitle(line) {

  const comma =
    line.indexOf(",");


  if (comma >= 0) {

    return clean(
      line.slice(comma + 1)
    );

  }


  return "Sem titulo";
}


/* =========================================================
   ANO
========================================================= */

function getYear(title, line) {

  const match =

    line.match(/\b(?:19|20)\d{2}\b/) ||

    title.match(/\b(?:19|20)\d{2}\b/);


  if (match) {

    return match[0];

  }


  return undefined;
}


/* =========================================================
   DESCRIÇÃO
========================================================= */

function getDescription(lines, startIndex) {

  for (

    let i = startIndex + 1;

    i < Math.min(
      startIndex + 12,
      lines.length
    );

    i++

  ) {

    const line =
      lines[i].trim();


    if (
      line
        .toUpperCase()
        .startsWith("#EXTDESC:")
    ) {

      return clean(
        line.slice(9)
      );

    }


    if (
      line.startsWith("#EXTINF")
    ) {

      break;

    }

  }


  return "";
}


/* =========================================================
   PARSER M3U
========================================================= */

function parseM3U(text) {

  const lines =
    text
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/);


  const items = [];


  for (
    let i = 0;
    i < lines.length;
    i++
  ) {

    const line =
      lines[i].trim();


    if (
      !line
        .toUpperCase()
        .startsWith("#EXTINF")
    ) {

      continue;

    }


    /*
      Nome
    */

    const title =
      getTitle(line);


    /*
      Poster
    */

    const poster =
      getPoster(line);


    /*
      Fundo
    */

    const background =
      getBackground(
        line,
        poster
      );


    /*
      Categoria
    */

    const group =
      getGroup(line);


    const genres =

      group
        .split(",")
        .map(
          item => item.trim()
        )
        .filter(Boolean);


    /*
      Descrição
    */

    const description =
      getDescription(
        lines,
        i
      );


    /*
      Ano
    */

    const year =
      getYear(
        title,
        line
      );


    /*
      Encontrar vídeo
    */

    let url = "";


    for (
      let j = i + 1;
      j < lines.length;
      j++
    ) {

      const next =
        lines[j].trim();


      if (!next) {

        continue;

      }


      if (
        next.startsWith("#")
      ) {

        continue;

      }


      if (
        /^https?:\/\//i.test(next)
      ) {

        url = next;

        i = j;

        break;

      }

    }


    /*
      Sem vídeo = ignora
    */

    if (!url) {

      continue;

    }


    items.push({

      id:
        `eri:${items.length}`,

      type:
        "movie",

      name:
        title,

      poster:
        poster || undefined,

      /*
        NOVO:
        Fundo horizontal do Stremio
      */

      background:
        background || undefined,

      posterShape:
        "poster",

      group:
        group,

      genres:
        genres,

      description:
        description ||
        `Categoria: ${group}`,

      releaseInfo:
        year,

      url:
        url

    });

  }


  return items;

}


/* =========================================================
   CARREGAR PLAYLIST
========================================================= */

async function loadPlaylist() {

  const now =
    Date.now();


  /*
    Cache de 5 minutos
  */

  if (

    cache.loadedAt &&

    now - cache.loadedAt <
      5 * 60 * 1000

  ) {

    return cache.items;

  }


  console.log(
    "Baixando playlist..."
  );


  const response =

    await fetch(
      PLAYLIST_URL,
      {
        headers: {
          "User-Agent":
            "EriFilmes-Stremio-Addon/1.2"
        }
      }
    );


  if (!response.ok) {

    throw new Error(
      `Playlist HTTP ${response.status}`
    );

  }


  const text =
    await response.text();


  const items =
    parseM3U(text);


  cache = {

    items:
      items,

    loadedAt:
      now

  };


  const posters =
    items.filter(
      item => item.poster
    ).length;


  const backgrounds =
    items.filter(
      item => item.background
    ).length;


  console.log(
    `Playlist carregada: ${items.length} itens`
  );


  console.log(
    `Itens com poster: ${posters}`
  );


  console.log(
    `Itens com background: ${backgrounds}`
  );


  return items;

}


/* =========================================================
   META
========================================================= */

function makeMeta(item) {

  const meta = {

    id:
      item.id,

    type:
      "movie",

    name:
      item.name,

    /*
      CAPA VERTICAL
    */

    poster:
      item.poster,

    /*
      FUNDO HORIZONTAL
    */

    background:
      item.background,

    posterShape:
      "poster",

    description:
      item.description,

    genres:
      item.genres,

    releaseInfo:
      item.releaseInfo

  };


  return Object.fromEntries(

    Object.entries(meta)

      .filter(
        ([, value]) =>

          value !== undefined &&

          value !== null &&

          value !== "" &&

          !(
            Array.isArray(value) &&
            value.length === 0
          )
      )

  );

}


/* =========================================================
   CATÁLOGO
========================================================= */

builder.defineCatalogHandler(

  async function(args) {

    try {

      let items =
        await loadPlaylist();


      /*
        BUSCA
      */

      const search =

        String(
          args?.extra?.search || ""
        )
          .trim()
          .toLowerCase();


      if (search) {

        items =
          items.filter(
            item =>

              `${item.name} ${item.group} ${item.genres.join(" ")}`
                .toLowerCase()
                .includes(search)

          );

      }


      /*
        PAGINAÇÃO
      */

      const skip =

        Math.max(

          0,

          parseInt(
            args?.extra?.skip || "0",
            10
          ) || 0

        );


      const page =

        items.slice(
          skip,
          skip + 100
        );


      return {

        metas:
          page.map(makeMeta),

        cacheMaxAge:
          300

      };

    }

    catch (error) {

      console.error(
        "Erro no catalogo:",
        error
      );


      return {

        metas: []

      };

    }

  }

);


/* =========================================================
   DETALHES DO FILME
========================================================= */

builder.defineMetaHandler(

  async function(args) {

    try {

      const items =
        await loadPlaylist();


      const item =
        items.find(
          x => x.id === args.id
        );


      if (!item) {

        return {

          meta: {}

        };

      }


      return {

        meta:
          makeMeta(item),

        cacheMaxAge:
          300

      };

    }

    catch (error) {

      console.error(
        "Erro no metadata:",
        error
      );


      return {

        meta: {}

      };

    }

  }

);


/* =========================================================
   STREAM
========================================================= */

builder.defineStreamHandler(

  async function(args) {

    try {

      const items =
        await loadPlaylist();


      const item =
        items.find(
          x => x.id === args.id
        );


      if (!item) {

        return {

          streams: []

        };

      }


      return {

        streams: [

          {

            name:
              "EriFilmes",

            title:
              item.name,

            url:
              item.url,

            behaviorHints: {

              bingeGroup:
                "erifilmes"

            }

          }

        ],

        cacheMaxAge:
          300

      };

    }

    catch (error) {

      console.error(
        "Erro no stream:",
        error
      );


      return {

        streams: []

      };

    }

  }

);


/* =========================================================
   SERVIDOR
========================================================= */

serveHTTP(

  builder.getInterface(),

  {

    port:
      PORT,

    host:
      "0.0.0.0"

  }

);


console.log(
  "======================================"
);

console.log(
  "EriFilmes Stremio Addon"
);

console.log(
  "Versão: 1.2.0"
);

console.log(
  `Porta: ${PORT}`
);

console.log(
  `Playlist: ${PLAYLIST_URL}`
);

console.log(
  "Poster: ATIVADO"
);

console.log(
  "Background: ATIVADO"
);

console.log(
  "======================================"
);
