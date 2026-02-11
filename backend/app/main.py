import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.router import router as api_router
from app.core.config import settings
from app.core.logging import setup_logging
from app.db.base import Base
from app.db.session import engine

setup_logging(settings.log_dir)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Elite Chronicles API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-Id"] = request_id
    return response


def _error_payload(code: str, message: str, details, trace_id: str):
    return {"error": {"code": code, "message": message, "details": details, "trace_id": trace_id}}


@app.exception_handler(StarletteHTTPException)
def http_exception_handler(request: Request, exc: StarletteHTTPException):
    code_map = {
        401: "unauthorized",
        403: "forbidden",
        404: "not_found",
        409: "conflict_version",
        422: "validation_failed",
        429: "rate_limited",
    }
    code = code_map.get(exc.status_code, "error")
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_payload(code, exc.detail, None,
                               request.state.request_id),
    )


@app.exception_handler(RequestValidationError)
def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content=_error_payload(
            "validation_failed", "Invalid request", exc.errors(), request.state.request_id),
    )


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(api_router, prefix="/api")
