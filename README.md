# Sistema de Propuesta Democratica

Web estatica que lee GitHub Discussions ya pre-procesadas en `Data/`.

## Flujo

1. Alguien crea/comenta/reacciona en una Discussion abierta del repo.
2. El workflow `.github/workflows/sync-propuestas.yml` corre (por el evento, por cron diario a las 06:17 UTC, o manual desde la pestana Actions con "Run workflow").
3. `.github/scripts/gen-data.js` consulta la API GraphQL con el `GITHUB_TOKEN` del workflow, arma un archivo por discusion abierta en `Data/<numero>-<slug>.json` y un `Data/index.json` con el resumen liviano para la grilla.
4. Discusiones cerradas: su archivo se borra automaticamente en la siguiente corrida.
5. `index.html` hace fetch directo a esos JSON estaticos. Ningun visitante llama a la API de GitHub, asi se evita el rate limit por IP.

## Requisitos

- Categoria de Discussions habilitada en el repo (Settings > General > Features > Discussions).
- Ninguna dependencia npm: el script usa `fetch` nativo de Node (disponible por defecto en el runner `ubuntu-latest`).

## Ejecutar el workflow manualmente

Pestana **Actions** del repo > **Sync Propuestas** > **Run workflow**.
