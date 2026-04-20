"""Telegram ingestion sidecar — FastAPI entrypoint.

Phase 1 PR-B ships the contract surface only. Every endpoint except
`/health` is protected by a shared-secret header; Telethon integration
itself is deliberately stubbed out (`501 Not Implemented`) and lands
in PR-C together with the first sync handler. That split keeps this
PR's blast radius zero: even if someone accidentally deployed this
image today, it could not talk to Telegram.
"""

from __future__ import annotations

import os
from typing import Optional

from fastapi import FastAPI, Header, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel


SHARED_SECRET_ENV = "SIDECAR_SHARED_SECRET"


def _require_token(x_sidecar_token: Optional[str]) -> None:
    expected = os.environ.get(SHARED_SECRET_ENV, "").strip()
    if not expected:
        # Fail closed — refusing to serve protected endpoints without a
        # configured secret is deliberately louder than the alternative.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="sidecar misconfigured: SIDECAR_SHARED_SECRET not set",
        )
    if not x_sidecar_token or x_sidecar_token != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or missing X-Sidecar-Token",
        )


app = FastAPI(
    title="Telegram ingestion sidecar",
    version="1.0.0-phase1",
    # Disable docs by default — this service must not be browsable.
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.get("/health")
def health() -> dict[str, bool]:
    """Unauthenticated liveness probe."""
    return {"ok": True}


# ─── Auth flow (stubs until PR-C) ────────────────────────────────────────────

class AuthStartRequest(BaseModel):
    connection_id: str
    phone_number: str


class AuthVerifyRequest(BaseModel):
    connection_id: str
    code: str


@app.post("/auth/start")
def auth_start(
    _body: AuthStartRequest,
    x_sidecar_token: Optional[str] = Header(default=None),
) -> JSONResponse:
    _require_token(x_sidecar_token)
    return JSONResponse(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        content={"error": "auth.start not implemented in Phase 1 PR-B"},
    )


@app.post("/auth/verify")
def auth_verify(
    _body: AuthVerifyRequest,
    x_sidecar_token: Optional[str] = Header(default=None),
) -> JSONResponse:
    _require_token(x_sidecar_token)
    return JSONResponse(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        content={"error": "auth.verify not implemented in Phase 1 PR-B"},
    )


# ─── Read endpoints (stubs until PR-C) ───────────────────────────────────────

class ChatsRequest(BaseModel):
    connection_id: str
    limit: Optional[int] = None


class MessagesRequest(BaseModel):
    connection_id: str
    tg_chat_id: str
    from_message_id: Optional[str] = None
    limit: int = 100


@app.post("/chats")
def chats(
    _body: ChatsRequest,
    x_sidecar_token: Optional[str] = Header(default=None),
) -> JSONResponse:
    _require_token(x_sidecar_token)
    return JSONResponse(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        content={"error": "chats not implemented in Phase 1 PR-B"},
    )


@app.post("/messages")
def messages(
    _body: MessagesRequest,
    x_sidecar_token: Optional[str] = Header(default=None),
) -> JSONResponse:
    _require_token(x_sidecar_token)
    return JSONResponse(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        content={"error": "messages not implemented in Phase 1 PR-B"},
    )


@app.get("/media/{file_unique_id}")
def media(
    file_unique_id: str,
    x_sidecar_token: Optional[str] = Header(default=None),
) -> JSONResponse:
    _require_token(x_sidecar_token)
    _ = file_unique_id
    return JSONResponse(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        content={"error": "media not implemented in Phase 1 PR-B"},
    )
