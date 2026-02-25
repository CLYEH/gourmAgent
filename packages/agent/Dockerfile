FROM python:3.12-slim

WORKDIR /app

# Install uv for fast dependency installation
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml ./
RUN uv pip install --system -e .

COPY src/ ./src/

ENV PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["uvicorn", "gourmAgent.server:app", "--host", "0.0.0.0", "--port", "8000"]
