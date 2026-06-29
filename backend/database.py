import datetime
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# Database URL pointing to a local SQLite database file
DATABASE_URL = "sqlite:///./documents.db"

# Create the database engine
# connect_args={"check_same_thread": False} is required for SQLite in multithreaded environments like FastAPI
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

# Create a SessionLocal class for database sessions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for SQLAlchemy models
Base = declarative_base()

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), default="Untitled Document", nullable=False)
    content = Column(Text, default="", nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "content": self.content,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }

def init_db():
    """Initializes the database and creates all tables."""
    Base.metadata.create_all(bind=engine)

def get_db():
    """Dependency provider for FastAPI route handlers."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Database Helper functions (CRUD operations)
def get_all_documents(db: Session):
    return db.query(Document).order_by(Document.updated_at.desc()).all()

def get_document(db: Session, doc_id: int):
    return db.query(Document).filter(Document.id == doc_id).first()

def create_document(db: Session, title: str = "Untitled Document", content: str = ""):
    db_doc = Document(
        title=title, 
        content=content, 
        created_at=datetime.datetime.utcnow(),
        updated_at=datetime.datetime.utcnow()
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)
    return db_doc

def update_document(db: Session, doc_id: int, title: str = None, content: str = None):
    db_doc = db.query(Document).filter(Document.id == doc_id).first()
    if db_doc:
        if title is not None:
            db_doc.title = title
        if content is not None:
            db_doc.content = content
        db_doc.updated_at = datetime.datetime.utcnow()
        db.commit()
        db.refresh(db_doc)
    return db_doc

def delete_document(db: Session, doc_id: int):
    db_doc = db.query(Document).filter(Document.id == doc_id).first()
    if db_doc:
        db.delete(db_doc)
        db.commit()
        return True
    return False
