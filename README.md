# Nova

Nova is a personal AI assistant: a work copilot and mentor that runs locally on your
own machine, with local-first models, voice, tasks, finances and a knowledge base.

> Status: early development. Nova is being shaped from a fork of OpenJarvis;
> see [NOTICE](NOTICE) for attribution.

## Quick start

```bash
uv sync --extra server          # install dependencies
uv run nova serve               # start the backend (default: http://127.0.0.1:8000)
uv run nova chat                # chat from the terminal
```

Nova talks to a local [Ollama](https://ollama.com) by default. Pull a model first, for
example `ollama pull qwen3.5:2b`.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

## Layout

- `src/nova/` — backend (agents, engines, tools, memory, speech, server, CLI)
- `frontend/` — web UI and the Tauri desktop shell (`frontend/src-tauri/`)
- `configs/nova/` — presets and persona prompts
- `deploy/` — Docker, systemd, launchd and Windows service files
- `tests/` — test suite (`uv run pytest tests -m "not live and not cloud"`)

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
