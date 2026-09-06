# EriFilmes Stremio Addon

Addon Stremio que lê a playlist M3U:

https://raw.githubusercontent.com/blaulley/playlisttt/refs/heads/main/EriFilmesSerie.m3u

## Deploy no Render

1. Envie estes arquivos para um repositório GitHub.
2. No Render, crie um Web Service e conecte o repositório.
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Após o deploy, abra:

`https://SEU-ENDERECO.onrender.com/manifest.json`

6. Cole essa URL no Stremio > Add-ons > Add-on Repository URL.

## Variável opcional

Você pode alterar a playlist sem modificar o código usando:

`PLAYLIST_URL=https://.../sua-playlist.m3u`

## Observação

O addon apenas entrega ao Stremio as URLs já existentes na playlist. Use somente conteúdo e links para os quais você possui autorização.
