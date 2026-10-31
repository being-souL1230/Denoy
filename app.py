"""app.py: FastAPI REST server for Digital Dark Spot.
Serves the 10-stage analysis engine via clean REST endpoints and dashboard UI.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Optional

from engine import run_analysis

app = FastAPI(title="Digital Dark Spot API", version="1.0.0")

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.staticfiles import StaticFiles
import os

if os.path.exists("public"):
    app.mount("/public", StaticFiles(directory="public"), name="public")
    if os.path.exists("public/images"):
        app.mount("/images", StaticFiles(directory="public/images"), name="images")
    if os.path.exists("public/css"):
        app.mount("/css", StaticFiles(directory="public/css"), name="css")
    if os.path.exists("public/js"):
        app.mount("/js", StaticFiles(directory="public/js"), name="js")


class AnalyzeRequest(BaseModel):
    topic: str
    urls: List[str] = []
    pasted: List[List[str]] = []  # [[label, text, is_official?], ...]
    official_ids: List[str] = []


@app.post("/api/analyze")
@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    try:
        pasted_tuples = [tuple(p) for p in req.pasted]
        result = run_analysis(
            topic=req.topic,
            urls=tuple(req.urls),
            pasted=tuple(pasted_tuples),
            official_ids=tuple(req.official_ids)
        )
        return result
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Internal pipeline failure: {str(e)}"})


@app.get("/")
def home():
    return FileResponse("dashboard.html")


