-- Apply AFTER migrations, connected to the production database as its owner.
-- Provision clinic_runtime separately with a secret-manager password.
-- Never give this role ownership, membership of the owner role, or superuser.
-- Change the role name here if your provider requires a different name.
BEGIN;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO clinic_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM clinic_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO clinic_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO clinic_runtime;
REVOKE UPDATE, DELETE ON
  public.patients_clinicalrevision,
  public.patients_consultationamendment,
  public.audit_auditevent,
  public.appointments_appointmentcheckincorrection,
  public.appointments_appointmentrescheduleevent
FROM clinic_runtime;
-- GRANT above intentionally excludes TRUNCATE, REFERENCES and TRIGGER.
-- Re-run this script after every migration that creates tables/sequences.
COMMIT;
