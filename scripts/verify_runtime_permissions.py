"""Verify production-style grants ONLY in the disposable local smoke database."""
from pathlib import Path

import psycopg


def main():
    options = {"host": "127.0.0.1", "port": 55439, "dbname": "clinic_smoke"}
    root = Path(__file__).resolve().parents[1]
    with psycopg.connect(user="clinic_test", **options, autocommit=True) as owner:
        if owner.execute("SELECT 1 FROM pg_roles WHERE rolname='clinic_runtime'").fetchone():
            raise SystemExit("Runtime test role already exists; use a new isolated cluster. Nothing was changed.")
        owner.execute("CREATE ROLE clinic_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT")
        owner.execute("GRANT CONNECT ON DATABASE clinic_smoke TO clinic_runtime")
        owner.execute((root / "deployment/postgres-runtime-grants.sql").read_text(encoding="utf-8"))
    with psycopg.connect(user="clinic_runtime", **options) as runtime:
        assert runtime.execute("SELECT count(*) FROM patients_patient").fetchone()[0] > 0
        runtime.execute("UPDATE patients_patient SET phone=phone")
        runtime.rollback()
        tables = (
            "patients_clinicalrevision", "patients_consultationamendment", "audit_auditevent",
            "appointments_appointmentcheckincorrection", "appointments_appointmentrescheduleevent",
        )
        blocked = 0
        for table in tables:
            identifier = psycopg.sql.Identifier(table)
            for query in ("UPDATE {} SET id=id", "DELETE FROM {}", "TRUNCATE {}"):
                try:
                    runtime.execute(psycopg.sql.SQL(query).format(identifier))
                except psycopg.errors.InsufficientPrivilege:
                    runtime.rollback()
                    blocked += 1
                else:
                    runtime.rollback()
                    raise AssertionError(f"Runtime must not modify immutable table: {table}")
        for query in ("ALTER TABLE patients_patient ADD COLUMN unauthorized text", "CREATE TABLE public.unauthorized(id integer)", "TRUNCATE patients_patient"):
            try:
                runtime.execute(query)
            except psycopg.errors.InsufficientPrivilege:
                runtime.rollback()
                blocked += 1
            else:
                runtime.rollback()
                raise AssertionError("Runtime must not own schema or truncate data")
    print(f"Runtime permission check passed: regular reads/updates allowed, {blocked} history/DDL/TRUNCATE operations denied.")


if __name__ == "__main__":
    main()
