import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Support dynamic DATABASE_URL environment variable (e.g. Postgres on Vercel), defaulting to local SQLite
default_db = "sqlite:////tmp/app.db" if os.getenv("VERCEL") else "sqlite:///./app.db"
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", default_db)

# Only SQLite requires connect_args={"check_same_thread": False}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    print("DATABASE CONNECTION: Using local/ephemeral SQLite database.")
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False},
        pool_pre_ping=True
    )
else:
    # Ensure postgres scheme compatibility (SQLAlchemy 2.0 requires postgresql:// instead of postgres://)
    if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
        SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)
    print("DATABASE CONNECTION: Using hosted PostgreSQL database.")
    
    # Optimize connection configuration for serverless (Vercel) environments
    if os.getenv("VERCEL") == "1":
        from sqlalchemy.pool import NullPool
        engine = create_engine(
            SQLALCHEMY_DATABASE_URL,
            poolclass=NullPool
        )
    else:
        engine = create_engine(
            SQLALCHEMY_DATABASE_URL,
            pool_pre_ping=True,
            pool_recycle=300
        )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

