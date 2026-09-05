"""
ReconAgent — FastAPI application entry point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import router
from .config import settings

app = FastAPI(
    title       = "ReconAgent API",
    description = "Multi-source settlement reconciliation — Razorpay AI Buildathon Track 4",
    version     = "1.0.0",
    docs_url    = "/docs",
    redoc_url   = "/redoc",
)

# Allow all origins in production (Vercel preview URLs are unpredictable).
# Tighten this to specific domains after the hackathon if needed.
app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],
    allow_credentials = False,   # must be False when allow_origins=["*"]
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

app.include_router(router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ReconAgent"}
