# Documentos clínicos del paciente

Los documentos pertenecen a un paciente y pueden asociarse opcionalmente a una consulta del mismo expediente y a una pieza FDI. El contexto es explícito; no se infiere de fechas ni se modifica el historial existente.

## Permisos y reglas

- `documents.view`: listado, vista previa y descarga autenticada.
- `documents.create`: carga de documentos; requiere paciente activo y cargas habilitadas.
- `documents.delete`: retiro lógico, con motivo obligatorio. Conserva archivo, actor y fecha.
- Administración puede listar retirados con `?retired=true` y restaurarlos. No hay endpoint de purga física.
- Recepción y Odontología conservan los presets configurables. Cada recurso se busca dentro de su paciente; una consulta de otro expediente se rechaza.
- Los pacientes inactivos conservan lectura y descarga; nuevas operaciones están bloqueadas.

## Almacenamiento y validación

Desarrollo/pruebas usan `PRIVATE_MEDIA_ROOT`; producción utiliza `config.storage.PrivateMediaStorage` en un bucket S3-compatible con acceso público bloqueado. El UUID y la ruta física no se exponen. Nunca publiques ese directorio ni el bucket clínico mediante el servidor web.

PDF, JPG/JPEG, PNG y WebP: hasta 10 MB por archivo, 10 archivos y 50 MB por lote. Se contrastan extensión, MIME y contenido. Los PDF se analizan con límites y se rechazan corrupción, cifrado, adjuntos e interactividad; las imágenes se decodifican y recodifican sin metadatos. Esto no equivale a un antivirus; OCR/DICOM y un servicio de cuarentena no forman parte de esta implementación.

El lote se valida antes de persistir y se intenta limpiar lo recién escrito ante un fallo. Una interrupción abrupta todavía requiere reconciliar objetos sin referencia. Configura retención y versionado del proveedor según la política acordada; no borres archivos clínicos al retirar un documento.

## API

Prefijo: `/api/patients/<patient>/documents/`.

| Método/ruta relativa | Contrato |
|---|---|
| `GET ?search=&category=&consultation_id=&page=` | Listado paginado, 25 por defecto y máximo 100. |
| `POST` | Multipart: `files`, `category`, `document_date`, `notes`, `consultation_id` y `tooth_code` opcionales. |
| `PATCH <id>/` | Actualiza clasificación/contexto, con validación del expediente asociado. |
| `GET <id>/content/` | Vista previa autenticada. `?download=true` descarga con nombre original saneado. |
| `DELETE <id>/` | JSON `{"reason":"motivo"}`; retiro lógico. |
| `GET ?retired=true` | Sólo Administración; documentos retirados. |
| `POST <id>/restore/` | Sólo Administración; restaura y registra auditoría. |

`GET /api/patients/document-categories/` proporciona categorías normalizadas. Los metadatos incluyen únicamente una URL relativa autenticada. El contenido lleva `Cache-Control: private, no-store`, `nosniff` y `Content-Disposition` saneado.

La interfaz conserva archivos y metadatos cuando una carga falla. Los blobs de previsualización se revocan al cerrar. Las opciones de consulta recorren páginas compactas de hasta 100 resultados y no desaparecen al superar el primer centenar.

## Verificación

```text
python manage.py test apps.patients --settings=config.settings.test --noinput
npm test -- src/pages/Patients/PatientDocumentsPage.test.jsx src/services/patientService.test.js
```

El smoke y las comprobaciones del almacenamiento definitivo están en [deployment.md](deployment.md).
