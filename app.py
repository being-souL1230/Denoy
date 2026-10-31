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

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
public_dir = os.path.join(BASE_DIR, "public")

if os.path.exists(public_dir):
    app.mount("/public", StaticFiles(directory=public_dir), name="public")
    images_dir = os.path.join(public_dir, "images")
    if os.path.exists(images_dir):
        app.mount("/images", StaticFiles(directory=images_dir), name="images")
    css_dir = os.path.join(public_dir, "css")
    if os.path.exists(css_dir):
        app.mount("/css", StaticFiles(directory=css_dir), name="css")
    js_dir = os.path.join(public_dir, "js")
    if os.path.exists(js_dir):
        app.mount("/js", StaticFiles(directory=js_dir), name="js")


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
    html_path = os.path.join(BASE_DIR, "dashboard.html")
    return FileResponse(html_path)


