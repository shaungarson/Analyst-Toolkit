from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import dcf, real_estate

app = FastAPI(title="Analyst Toolkit API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(real_estate.router)
app.include_router(dcf.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
