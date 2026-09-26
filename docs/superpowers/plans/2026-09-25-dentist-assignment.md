# Dentist assignment and appointment attendance implementation plan

> Execute inline in this session, as requested by the user, with test-first verification.

**Goal:** Restrict dentists to appointment-related patients and their own clinical work; start new consultations only within the booked interval.

**Architecture:** Reuse Appointment.patient, Appointment.dentist (User) and Appointment.consultation (OneToOne). Keep HasCapability and role presets; intersect dentist access with ownership. Preserve administrative behavior and existing clinical records.

**Tech Stack:** Django/DRF, PostgreSQL, React/Vite, Django tests, Vitest.

## Constraints and decisions

- No model changes or migrations. All historical/current appointments confer patient visibility, including cancelled appointments; they never permit starting cancelled attendance.
- Dentist role is always restricted, even with view_all. For other roles preserve existing endpoint scope.
- Legacy consultations remain stored; dentists can access their own legacy consultations once the patient is assigned. New dentist consultations must start from appointments.
- ClinicalRecord remains shared patient information. Consultation-specific versions, amendments, treatments and documents are scoped; general patient documents remain shared.
- ClinicProfile.timezone is authoritative for wall-clock booking times. Start window is [start, start + duration). Existing attendance remains accessible afterwards.
- Existing scheduled_range uses Django's default UTC zone for overlap enforcement. Do not reinterpret stored ranges in this change; compute attendance instants from local date/time and clinic timezone.
- Leave unrelated deployment files untouched.

## Task 1: Backend regression coverage

Files: create `src/backend/apps/patients/test_assignment_access.py`; extend appointment/PostgreSQL tests.

- [x] Reproduce unassigned patient access, cross-dentist nested access and early/late starts.
- [x] Test both roles, shared patient, historical assignment, view_all restriction, capability removal, duplicate starts, timezone boundary and annotation query counts.
- [x] Run `.venv/Scripts/python.exe manage.py test apps.patients.test_assignment_access --settings=config.settings.test --noinput` and confirm expected failures.

Example boundary fixture: 2026-09-26 10:00 Managua = 16:00 UTC, 30 minutes; 15:59:59 UTC rejected, 16:00 accepted, 16:30 rejected when no consultation exists.

## Task 2: Centralized access and attendance

Create `patients/access.py` with `patients_visible_to(user, queryset=None)`, `consultations_visible_to(user, queryset=None)`, `odontograms_visible_to`, `documents_visible_to`, `treatments_visible_to`, and annotated dentist summaries. Create `appointments/access.py` with `can_view_all_appointments` and `scope_appointments_for_user`. Create `appointments/attendance.py` with a pure interval decision using an explicitly supplied aware `now` and clinic timezone.

```python
# Patient membership uses an EXISTS subquery, avoiding duplicate rows.
queryset.filter(Exists(Appointment.objects.filter(patient_id=OuterRef('pk'), dentist=user)))
```

- [x] Wire patients/views.py, serializers.py, duplicates.py, traceability_api.py and clinical_record_pdf.py to these scopes, including downloads and nested IDs.
- [x] Scope odontogram inheritance and treatment result snapshots without changing immutable history or global version numbering.
- [x] Wire appointments/views.py, serializers.py and services.py; use one decision for response metadata and the locked start operation.
- [x] Reject dentist POST to patient consultations with 409 and guidance to start-attendance. Preserve non-dentist behavior.
- [x] Test and adjust existing fixtures whose old assumptions intentionally conflict with the new contract.

## Task 3: Existing UI

Files: PatientsPage.jsx, Sidebar.jsx, PatientConsultationsPanel.jsx, ConsultationRecordPage.jsx, AppointmentsPage.jsx, AppointmentDetailsPanel.jsx and their tests.

- [x] Test dentist heading and own appointment summary returned by API; test server-disabled start and updated availability.
- [x] Show Mis pacientes and annotated next date/time/status and last consultation. Do not fetch one request per patient.
- [x] Direct dentist consultation creation routes show a link to Citas.
- [x] Poll selected appointment through existing getAppointment service, refresh on focus, stop on unmount; trust server availability, fail closed on refresh errors.
- [x] Run `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`.

## Task 4: Verification and documentation

- [x] Run full Django SQLite suite and PostgreSQL concurrency suite against isolated test database; run makemigrations --check --dry-run.
- [x] Document verified behavior and limitations in `docs/user-stories/HU-44-start-attendance-from-appointment.md` and `docs/user-stories/HU-19-professional-daily-agenda.md`; update README summary.
- [x] Review diff for security paths, compatibility and unrelated modifications.
- Commit verified work with HU-44 identifier; the resulting Git commit is the delivery record.
