import os
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session

# Import local database and AI engine modules
from .database import (
    init_db, get_db, get_all_documents, get_document, 
    create_document, update_document, delete_document, Document
)
from .ai_engine import calculate_metrics, run_ai_task, extract_keywords

# Initialize database tables
init_db()

app = FastAPI(
    title="Smart Markdown Editor API",
    description="Backend services for markdown file storage, stats analysis, and AI co-writer helpers.",
    version="1.0.0"
)

# Enable CORS for local development when testing frontend separately
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic schemas for data validation
class DocumentCreate(BaseModel):
    title: str = "Untitled Document"
    content: str = ""

class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None

class DocumentResponse(BaseModel):
    id: int
    title: str
    content: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True

class AnalyzeRequest(BaseModel):
    text: str

class TransformRequest(BaseModel):
    text: str
    task: str  # summarize, expand, simplify, grammar, autocomplete, outline
    selected_text: Optional[str] = None

# --- API Routes ---

@app.get("/api/documents")
def list_docs(db: Session = Depends(get_db)):
    docs = get_all_documents(db)
    return [doc.to_dict() for doc in docs]

@app.post("/api/documents", status_code=status.HTTP_201_CREATED)
def create_doc(doc: DocumentCreate, db: Session = Depends(get_db)):
    new_doc = create_document(db, title=doc.title, content=doc.content)
    return new_doc.to_dict()

@app.get("/api/documents/{doc_id}")
def get_doc(doc_id: int, db: Session = Depends(get_db)):
    db_doc = get_document(db, doc_id)
    if not db_doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return db_doc.to_dict()

@app.put("/api/documents/{doc_id}")
def update_doc(doc_id: int, doc: DocumentUpdate, db: Session = Depends(get_db)):
    db_doc = get_document(db, doc_id)
    if not db_doc:
        raise HTTPException(status_code=404, detail="Document not found")
    updated = update_document(db, doc_id, title=doc.title, content=doc.content)
    return updated.to_dict()

@app.delete("/api/documents/{doc_id}")
def delete_doc(doc_id: int, db: Session = Depends(get_db)):
    db_doc = get_document(db, doc_id)
    if not db_doc:
        raise HTTPException(status_code=404, detail="Document not found")
    delete_document(db, doc_id)
    return {"message": "Document deleted successfully", "id": doc_id}

@app.post("/api/ai/analyze")
def analyze_text(payload: AnalyzeRequest):
    metrics = calculate_metrics(payload.text)
    keywords = extract_keywords(payload.text, top_n=6)
    return {
        "metrics": metrics,
        "keywords": keywords
    }

@app.post("/api/ai/transform")
def transform_text(payload: TransformRequest):
    # Dispatch task to local NLP engine or Gemini API
    result = run_ai_task(payload.text, payload.task, payload.selected_text)
    return result

# --- Static File Serving ---

# Ensure directories exist before mounting
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
css_dir = os.path.join(frontend_dir, "css")
js_dir = os.path.join(frontend_dir, "js")

os.makedirs(css_dir, exist_ok=True)
os.makedirs(js_dir, exist_ok=True)

# Mount static stylesheets and JS scripts
app.mount("/css", StaticFiles(directory=css_dir), name="css")
app.mount("/js", StaticFiles(directory=js_dir), name="js")

# Mount any assets/images if they exist
# app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dir, "assets")), name="assets")

@app.get("/")
def serve_index():
    index_path = os.path.join(frontend_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {
        "message": "Welcome to Smart Markdown Editor API. Frontend files not generated yet. Place index.html under frontend/.",
        "api_docs": "/docs"
    }
