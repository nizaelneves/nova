.PHONY: setup test lint format

setup:
	uv sync --extra dev --extra framework-comparison --extra server

test:
	uv run pytest tests/ -n auto -q --tb=short -m "not live and not cloud and not hub"

lint:
	uv run ruff check src/ tests/
	uv run ruff format --check src/ tests/

format:
	uv run ruff format src/ tests/
