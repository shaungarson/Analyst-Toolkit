import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import company, dcf, real_estate

# Loads backend/.env for local dev (ALPHA_VANTAGE_API_KEY, etc.) - in production the
# platform (Render) injects environment variables directly, so this is a no-op there.
load_dotenv()

app = FastAPI(title="Analyst Toolkit API")

allowed_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(real_estate.router)
app.include_router(dcf.router)
app.include_router(company.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
