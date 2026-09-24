from app.config import settings
from app.services.memory.base import MemoryStore, MerchantContext
from app.services.memory.sql_memory import SqlMemory

__all__ = ["MemoryStore", "MerchantContext", "get_memory"]


def get_memory() -> MemoryStore:
    return SqlMemory()
