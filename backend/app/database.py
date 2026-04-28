from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./app.db")

# For deployed version with persistent volume
if os.path.exists("/data"):
    DATABASE_URL = "sqlite+aiosqlite:////data/app.db"

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Migrate existing tables: add new columns if they don't exist
        from sqlalchemy import text, inspect as sa_inspect

        def _migrate(connection):
            inspector = sa_inspect(connection)
            tables = inspector.get_table_names()
            if "messages" in tables:
                existing_cols = {c["name"] for c in inspector.get_columns("messages")}
                if "is_forwarded" not in existing_cols:
                    connection.execute(text("ALTER TABLE messages ADD COLUMN is_forwarded BOOLEAN DEFAULT 0"))
                if "forwarded_from_name" not in existing_cols:
                    connection.execute(text("ALTER TABLE messages ADD COLUMN forwarded_from_name VARCHAR(100)"))
                if "is_delivered" not in existing_cols:
                    connection.execute(text("ALTER TABLE messages ADD COLUMN is_delivered BOOLEAN DEFAULT 0"))
            if "users" in tables:
                user_cols = {c["name"] for c in inspector.get_columns("users")}
                if "role" not in user_cols:
                    connection.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user'"))
                if "notification_sound" not in user_cols:
                    connection.execute(text("ALTER TABLE users ADD COLUMN notification_sound BOOLEAN DEFAULT 1"))
            if "call_sessions" in tables:
                call_cols = {c["name"] for c in inspector.get_columns("call_sessions")}
                if "caller_peer_id" not in call_cols:
                    connection.execute(text("ALTER TABLE call_sessions ADD COLUMN caller_peer_id VARCHAR(100)"))
                if "callee_peer_id" not in call_cols:
                    connection.execute(text("ALTER TABLE call_sessions ADD COLUMN callee_peer_id VARCHAR(100)"))
                if "provider" not in call_cols:
                    connection.execute(text("ALTER TABLE call_sessions ADD COLUMN provider VARCHAR(20) DEFAULT 'peerjs'"))
                if "answered_at" not in call_cols:
                    connection.execute(text("ALTER TABLE call_sessions ADD COLUMN answered_at DATETIME"))
                if "duration_seconds" not in call_cols:
                    connection.execute(text("ALTER TABLE call_sessions ADD COLUMN duration_seconds FLOAT"))
                if "end_reason" not in call_cols:
                    connection.execute(text("ALTER TABLE call_sessions ADD COLUMN end_reason VARCHAR(50)"))

        await conn.run_sync(_migrate)
