"""Browser/API smoke against the disposable local release fixture only."""
import argparse
import os
import re
from pathlib import Path
from uuid import uuid4

from io import BytesIO
from pypdf import PdfReader
from playwright.sync_api import expect, sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--patient", type=int, required=True)
    parser.add_argument("--consultation", type=int, required=True)
    args = parser.parse_args()
    password = os.environ["RELEASE_SMOKE_PASSWORD"]
    origin = "http://127.0.0.1:5190"
    output = Path(__file__).resolve().parents[1] / ".tmp/production-check/browser"
    output.mkdir(parents=True, exist_ok=True)
    errors = []
    run_id = uuid4().hex[:8]
    addendum = f"Synthetic immutable addendum {run_id}"
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            for role in ("reception", "dentist", "admin"):
                context = browser.new_context(viewport={"width": 1280, "height": 900})
                page = context.new_page()
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto(origin)
                page.wait_for_load_state("networkidle")
                page.get_by_label("Correo electrónico", exact=True).fill(f"{role}@release.example.test")
                page.get_by_label("Contraseña", exact=True).fill(password)
                with page.expect_response(lambda response: response.url.endswith("/api/auth/login/")) as response:
                    page.get_by_role("button", name="Iniciar sesión", exact=True).click()
                session = response.value.json()
                token = session["access"]
                headers = {"Authorization": f"Bearer {token}"}
                page.wait_for_url("**/bienvenida")
                refresh = next(cookie for cookie in context.cookies() if cookie["httpOnly"])
                assert refresh["sameSite"] == "Lax"
                assert not any("eyJ" in value for value in page.evaluate("[...Object.values(localStorage), ...Object.values(sessionStorage)]"))
                patient_url = f"{origin}/pacientes/{args.patient}"
                consultation_url = f"{patient_url}/consultas/{args.consultation}"
                page.goto(patient_url)
                page.wait_for_load_state("networkidle")
                expect(page.get_by_role("region", name="Trazabilidad clínica")).to_be_visible()
                if role == "reception":
                    page.get_by_label("Alergias", exact=True).fill(f"Synthetic clarified allergy {run_id}")
                    reason = page.get_by_label("Motivo del cambio clínico", exact=True)
                    expect(reason).to_be_visible()
                    assert not reason.evaluate("element => element.checkValidity()")
                    reason.fill("Synthetic patient clarification")
                    with page.expect_response(lambda response: response.request.method == "PATCH" and response.url.endswith(f"/api/patients/{args.patient}/")) as saved:
                        page.get_by_role("button", name="Guardar cambios", exact=True).click()
                    assert saved.value.status == 200
                    page.get_by_role("button", name="Ver revisiones", exact=True).click()
                    expect(page.get_by_role("region", name="Trazabilidad clínica")).to_contain_text("Synthetic patient clarification")
                    denied = context.request.post(
                        f"{origin}/api/patients/{args.patient}/consultations/{args.consultation}/amendments/",
                        headers=headers, data={"reason": "Synthetic", "content": "Synthetic"},
                    )
                    assert denied.status == 403
                else:
                    page.goto(consultation_url)
                    page.wait_for_load_state("networkidle")
                    expect(page.get_by_label("Motivo de la adenda", exact=True)).to_be_visible()
                    if role == "dentist":
                        page.get_by_label("Motivo de la adenda", exact=True).fill("Synthetic correction")
                        page.get_by_label("Contenido de la adenda", exact=True).fill(addendum)
                        page.get_by_role("button", name="Guardar adenda", exact=True).click()
                        expect(page.get_by_text(addendum, exact=True)).to_be_visible()
                        page.reload()
                        page.wait_for_load_state("networkidle")
                        page.get_by_role("button", name="Ver adendas", exact=True).click()
                        expect(page.get_by_text(addendum, exact=True)).to_be_visible()
                        original = context.request.get(
                            f"{origin}/api/patients/{args.patient}/consultations/{args.consultation}/", headers=headers,
                        ).json()
                        assert original["summary"] == "Synthetic original summary"
                        pdf_response = context.request.get(
                            f"{origin}/api/patients/{args.patient}/clinical-record/export/", headers=headers,
                        )
                        assert pdf_response.status == 200
                        pdf = PdfReader(BytesIO(pdf_response.body()))
                        text = "\n".join(pdf_page.extract_text() for pdf_page in pdf.pages)
                        assert "Synthetic original summary" in text
                        assert addendum in text
                    page.screenshot(path=str(output / f"{role}-consultation.png"), full_page=True)
                documents = context.request.get(
                    f"{origin}/api/patients/{args.patient}/documents/", headers=headers,
                )
                assert documents.status == 200
                document = documents.json()["results"][0]
                content_url = f"{origin}/api/patients/{args.patient}/documents/{document['id']}/content/"
                authorized = context.request.get(content_url, headers=headers)
                assert authorized.status == 200
                assert "no-store" in authorized.headers["cache-control"]
                assert context.request.get(content_url).status == 401
                page.set_viewport_size({"width": 390, "height": 844})
                page.goto(patient_url)
                page.wait_for_load_state("networkidle")
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                page.screenshot(path=str(output / f"{role}-mobile.png"), full_page=True)
                assert context.request.get(f"{origin}/health/ready/").status == 200
                page.reload()
                page.wait_for_load_state("networkidle")
                expect(page.get_by_role("region", name="Trazabilidad clínica")).to_be_visible()
                page.get_by_role("button", name=re.compile("Abrir menú de")).click()
                with page.expect_response(lambda response: response.url.endswith("/api/auth/logout/") and response.request.method == "POST") as logged_out:
                    page.get_by_role("menuitem", name="Cerrar sesión", exact=True).click()
                assert logged_out.value.status in (200, 204), f"Logout returned {logged_out.value.status}"
                page.wait_for_url("**/login")
                assert context.request.get(f"{origin}/api/auth/me/", headers=headers).status == 401
                page.reload()
                page.wait_for_load_state("networkidle")
                expect(page.get_by_role("button", name="Iniciar sesión", exact=True)).to_be_visible()
                context.close()
        finally:
            browser.close()
    assert not errors, errors
    print("Release smoke: 3 roles, clinical reason/revisions, addendum persistence/PDF, private files and mobile passed.")


if __name__ == "__main__":
    main()
