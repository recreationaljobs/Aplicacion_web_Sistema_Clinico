"""Restore only clinic_smoke into a new clinic_smoke_restore, never real data."""
import argparse
import hashlib
import shutil
import subprocess
from pathlib import Path

import psycopg


def file_hashes(root):
    return {
        str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in root.rglob("*") if path.is_file()
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    output = root / ".tmp/production-check/restore"
    output.mkdir(parents=True, exist_ok=True)
    connection_options = {"host": "127.0.0.1", "port": 55439, "user": "clinic_test"}
    with psycopg.connect(dbname="postgres", **connection_options, autocommit=True) as admin:
        if admin.execute("SELECT 1 FROM pg_database WHERE datname = 'clinic_smoke_restore'").fetchone():
            raise SystemExit("Restore target exists; use a new isolated test cluster. Nothing was changed.")
        admin.execute("CREATE DATABASE clinic_smoke_restore")
    pg_options = ["--host=127.0.0.1", "--port=55439", "--username=clinic_test"]
    dump = output / "clinic_smoke.dump"
    subprocess.run([str(args.pg_bin / "pg_dump.exe"), *pg_options, "--format=custom", "--no-owner", "--no-acl", "--file", str(dump), "clinic_smoke"], check=True)
    subprocess.run([str(args.pg_bin / "pg_restore.exe"), *pg_options, "--exit-on-error", "--no-owner", "--no-acl", "--dbname=clinic_smoke_restore", str(dump)], check=True)
    counts = {}
    with psycopg.connect(dbname="clinic_smoke", **connection_options) as source, psycopg.connect(dbname="clinic_smoke_restore", **connection_options) as restored:
        tables = [row[0] for row in source.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")]
        for table in tables:
            query = psycopg.sql.SQL("SELECT row_to_json(t)::text FROM {} t ORDER BY row_to_json(t)::text").format(psycopg.sql.Identifier(table))
            original = source.execute(query).fetchall()
            assert original == restored.execute(query).fetchall(), f"Restore differs: {table}"
            counts[table] = len(original)
        try:
            restored.execute("UPDATE patients_clinicalrevision SET reason='tampered'")
        except psycopg.errors.IntegrityConstraintViolation:
            restored.rollback()
        else:
            raise AssertionError("Restore lost immutable-history protection")
    media = root / ".tmp/production-check/media/private"
    copied_media = output / "private-media"
    shutil.copytree(media, copied_media)
    hashes = file_hashes(media)
    assert hashes and hashes == file_hashes(copied_media)
    print(f"Restore passed: {len(counts)} tables, {sum(counts.values())} rows, {len(hashes)} private files; history trigger retained.")


if __name__ == "__main__":
    main()
