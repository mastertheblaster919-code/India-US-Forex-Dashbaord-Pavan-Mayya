import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "data", "vcp.db")
print(f"Checking database at: {db_path}")
print(f"Exists: {os.path.exists(db_path)}")

if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    print("\nTables in SQLite database:")
    for t in tables:
        print(f"  - {t[0]}")
        cursor.execute(f"SELECT COUNT(*) FROM {t[0]}")
        count = cursor.fetchone()[0]
        print(f"    Rows: {count}")
    conn.close()
else:
    print("Database file does not exist!")
