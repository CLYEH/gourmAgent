"""FastAPI server exposing the gourmAgent for the TypeScript gateway to call."""

from __future__ import annotations

from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

load_dotenv()

from gourmAgent import agent as agent_module  # noqa: E402
from gourmAgent.memory.store import init_db  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="gourmAgent", version="0.1.0", lifespan=lifespan)


class RunRequest(BaseModel):
    user_id: str
    message: str
    location: str


class RunResponse(BaseModel):
    response: str
    tool_calls: list[dict]


@app.post("/run", response_model=RunResponse)
def run(req: RunRequest) -> RunResponse:
    try:
        result = agent_module.run(
            user_id=req.user_id,
            message=req.message,
            location=req.location,
        )
        return RunResponse(**result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
