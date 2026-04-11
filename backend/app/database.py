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
            if "messages" in inspector.get_table_names():
                existing_cols = {c["name"] for c in inspector.get_columns("messages")}
                if "is_forwarded" not in existing_cols:
                    connection.execute(text("ALTER TABLE messages ADD COLUMN is_forwarded BOOLEAN DEFAULT 0"))
                if "forwarded_from_name" not in existing_cols:
                    connection.execute(text("ALTER TABLE messages ADD COLUMN forwarded_from_name VARCHAR(100)"))

        await conn.run_sync(_migrate)
