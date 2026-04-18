import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "data", "vcp.db")
print(f"vcp.db size: {os.path.getsize(db_path) / 1024 / 1024:.2f} MB")

conn = sqlite3.connect(db_path)
cur = conn.cursor()

tables = cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
print(f"\nTables: {[t[0] for t in tables]}")

for t in tables:
    count = cur.execute(f"SELECT COUNT(*) FROM {t[0]}").fetchone()[0]
    print(f"  {t[0]}: {count:,} rows")

conn.close()