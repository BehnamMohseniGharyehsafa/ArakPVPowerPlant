"""Public deployment boundaries: isolated sessions, bounded requests and browser protections."""

from contextvars import ContextVar
from collections import OrderedDict, deque
import hashlib
import hmac
import os
import re
import secrets
import threading
import time
from urllib.parse import urlsplit
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from .weather import DATA

PUBLIC = os.getenv("SOLAR_PUBLIC", "0") == "1"
SESSION = ContextVar("solar_session", default="local")
SECRET = os.getenv("SOLAR_SESSION_SECRET", "").encode() or secrets.token_bytes(32)
COOKIE = "solar_session"
LIMIT_LOCK = threading.Lock()
LIMITS: OrderedDict[tuple[str, str], deque] = OrderedDict()


def session_root():
    sid = SESSION.get()
    return DATA if sid == "local" else DATA / "sessions" / sid


def cache_key(run_id):
    return run_id if SESSION.get() == "local" else (SESSION.get(), run_id)


def sign(sid):
    return sid + "." + hmac.new(SECRET, sid.encode(), hashlib.sha256).hexdigest()


def read_session(value):
    sid, separator, signature = (value or "").partition(".")
    if (
        separator
        and re.fullmatch(r"[a-f0-9]{32}", sid)
        and hmac.compare_digest(sign(sid), value)
    ):
        return sid
    return secrets.token_hex(16)


def rate_allowed(client, category, maximum):
    now = time.monotonic()
    with LIMIT_LOCK:
        key = (client, category)
        bucket = LIMITS.setdefault(key, deque())
        while bucket and bucket[0] < now - 60:
            bucket.popleft()
        if len(bucket) >= maximum:
            return False
        bucket.append(now)
        LIMITS.move_to_end(key)
        while len(LIMITS) > 4096:
            LIMITS.popitem(last=False)
    return True


class SecurityBoundary(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        sid = read_session(request.cookies.get(COOKIE)) if PUBLIC else "local"
        token = SESSION.set(sid)
        try:
            if PUBLIC and path.startswith("/api/") and path != "/api/health":
                client = request.client.host if request.client else "unknown"
                if not rate_allowed(client, "read", 600):
                    return JSONResponse(
                        {"detail": "Request limit reached; retry in one minute"},
                        429,
                        headers={"Retry-After": "60"},
                    )
                if request.method in {"POST", "PUT", "DELETE", "PATCH"}:
                    origin = request.headers.get("origin")
                    if origin and urlsplit(origin).netloc != request.headers.get(
                        "host"
                    ):
                        return JSONResponse(
                            {"detail": "Cross-origin changes are not allowed"}, 403
                        )
                    if request.headers.get("x-solar-client") != "1":
                        return JSONResponse(
                            {"detail": "Missing application request header"}, 403
                        )
                    if request.method != "DELETE":
                        # Uploaded weather also occupies disk outside session markers.
                        total = sum(
                            p.stat().st_size
                            for generated in (DATA / "sessions", DATA / "cache")
                            if generated.exists()
                            for p in generated.rglob("*")
                            if p.is_file()
                        )
                        if total > 512 * 1024 * 1024:
                            return JSONResponse(
                                {
                                    "detail": "Temporary online storage is full; export existing results and use the local application for additional studies"
                                },
                                507,
                            )
                    category = (
                        "calculation"
                        if path == "/api/runs" or path.endswith("/analysis")
                        else "mutation"
                    )
                    if not rate_allowed(
                        client, category, 8 if category == "calculation" else 20
                    ):
                        return JSONResponse(
                            {
                                "detail": "Calculation limit reached; retry in one minute"
                            },
                            429,
                            headers={"Retry-After": "60"},
                        )
                    if request.method != "DELETE":
                        length = request.headers.get("content-length")
                        maximum = (
                            8 * 1024 * 1024
                            if path == "/api/weather/upload"
                            else 2 * 1024 * 1024
                        )
                        if length is None:
                            return JSONResponse(
                                {"detail": "Content-Length is required"}, 411
                            )
                        if not length.isdigit() or int(length) > maximum:
                            return JSONResponse(
                                {"detail": "Request exceeds the online size limit"}, 413
                            )
            response = await call_next(request)
            if PUBLIC and path != "/api/health":
                response.set_cookie(
                    COOKIE,
                    sign(sid),
                    max_age=43200,
                    secure=request.url.scheme == "https",
                    httponly=True,
                    samesite="lax",
                )
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
            response.headers["Permissions-Policy"] = (
                "camera=(), microphone=(), geolocation=()"
            )
            response.headers["X-Frame-Options"] = "DENY"
            if PUBLIC or path not in {"/docs", "/redoc"}:
                response.headers["Content-Security-Policy"] = (
                    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.basemaps.cartocdn.com; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
                )
            if PUBLIC:
                response.headers["Strict-Transport-Security"] = "max-age=31536000"
            if path.startswith("/api/"):
                response.headers["Cache-Control"] = "no-store"
            return response
        finally:
            SESSION.reset(token)
