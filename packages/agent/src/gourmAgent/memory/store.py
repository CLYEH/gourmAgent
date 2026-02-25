"""SQLAlchemy models and database setup for user preference persistence."""

from __future__ import annotations

import os
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    String,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./gourmAgent.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    preferences: Mapped[list[Preference]] = relationship(
        "Preference", back_populates="user", cascade="all, delete-orphan"
    )


class Preference(Base):
    """Stores a single user preference record (upserted on every save_preference call)."""

    __tablename__ = "preferences"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), index=True)
    cuisines_liked: Mapped[list | None] = mapped_column(JSON, default=list)
    cuisines_disliked: Mapped[list | None] = mapped_column(JSON, default=list)
    dietary_restrictions: Mapped[list | None] = mapped_column(JSON, default=list)
    price_range: Mapped[str | None] = mapped_column(String, nullable=True)  # "$" | "$$" | "$$$" | "$$$$"
    liked_place_ids: Mapped[list | None] = mapped_column(JSON, default=list)
    disliked_place_ids: Mapped[list | None] = mapped_column(JSON, default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped[User] = relationship("User", back_populates="preferences")


def init_db() -> None:
    """Create all tables if they don't exist."""
    Base.metadata.create_all(bind=engine)


def get_session() -> Session:
    return Session(engine)
