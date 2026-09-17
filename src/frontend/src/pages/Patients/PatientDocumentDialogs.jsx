import { useEffect, useRef, useState } from 'react'
import { deletePatientDocument, getPatientDocumentContent, updatePatientDocument, uploadPatientDocuments } from '../../services/patientService'
import { todayValue } from '../Appointments/appointmentDisplay'
import { formatDocumentDate, formatDocumentSize } from './patientDocumentDisplay'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_BATCH_SIZE = 50 * 1024 * 1024
const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

function CloseButton({ buttonRef, onClick }) {
  return <button ref={buttonRef} type="button" onClick={onClick} aria-label="Cerrar" className="grid h-10 w-10 place-items-center rounded-full text-xl text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">×</button>
}

function useModalBehavior(onClose, initialFocusRef) {
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => {
    const returnFocus = document.activeElement
    initialFocusRef?.current?.focus()
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onCloseRef.current()
      if (event.key !== 'Tab') return
      const dialog = initialFocusRef.current?.closest('[role="dialog"]')
      const focusable = [...(dialog?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]') || [])]
        .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      returnFocus?.focus?.()
    }
  }, [initialFocusRef])
}

function validationMessage(files) {
  if (files.length > 10) return 'Puedes adjuntar como máximo 10 archivos por lote.'
  if (files.some((file) => !ACCEPTED_TYPES.includes(file.type))) return 'Solo se permiten archivos PDF, JPG, PNG o WebP.'
  if (files.some((file) => file.size > MAX_FILE_SIZE)) return 'Cada archivo puede pesar como máximo 10 MB.'
  if (files.reduce((total, file) => total + file.size, 0) > MAX_BATCH_SIZE) return 'El lote puede pesar como máximo 50 MB.'
  return ''
}

export function DocumentUploadDialog({ accessToken, canUseClinicalContext, categories, consultations, patientId, timeZone, onClose, onUploaded }) {
  const closeRef = useRef(null)
  const [files, setFiles] = useState([])
  const [category, setCategory] = useState('')
  const [documentDate, setDocumentDate] = useState(() => todayValue(timeZone))
  const [notes, setNotes] = useState('')
  const [consultationId, setConsultationId] = useState('')
  const [toothCode, setToothCode] = useState('')
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useModalBehavior(onClose, closeRef)

  const addFiles = (incoming) => {
    const next = [...files, ...Array.from(incoming)]
    const nextError = validationMessage(next)
    if (nextError) {
      setError(nextError)
      return
    }
    setFiles(next)
    setError('')
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!files.length) return setError('Selecciona al menos un archivo.')
    if (!category.trim()) return setError('Indica una categoría para los documentos.')
    setSaving(true)
    setError('')
    try {
      await uploadPatientDocuments(accessToken, patientId, {
        files, category, documentDate, notes, consultationId, toothCode,
      })
      await onUploaded()
      onClose()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:p-5">
    <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="document-upload-title" className="h-full w-full overflow-y-auto bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2.5rem)] sm:max-w-2xl sm:rounded-3xl">
      <header className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-5 py-5 sm:px-7">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-700">Archivo clínico</p><h2 id="document-upload-title" className="mt-1 font-sans text-3xl font-semibold text-slate-950">Adjuntar documentos</h2><p className="mt-1 text-sm text-slate-500">Los metadatos se aplicarán a todo el lote.</p></div>
        <CloseButton buttonRef={closeRef} onClick={onClose} />
      </header>
      <div className="space-y-5 p-5 sm:p-7">
        {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <label onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files) }} className={`grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed px-6 py-9 text-center transition-colors ${dragging ? 'border-blue-600 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50'}`}>
          <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-2xl text-blue-700 shadow-sm">↑</span>
          <span className="mt-3 text-sm font-semibold text-slate-800">Arrastra archivos aquí o selecciónalos</span>
          <span className="mt-1 text-xs text-slate-500">PDF, JPG, PNG o WebP · 10 MB por archivo</span>
          <input aria-label="Seleccionar archivos" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => { addFiles(event.target.files); event.target.value = '' }} className="sr-only" />
        </label>
        {files.length ? <ul aria-label="Archivos seleccionados" className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">{files.map((file, index) => <li key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-3 px-4 py-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-[10px] font-bold uppercase text-blue-700">{file.name.split('.').pop()}</span><span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{file.name}</span><button type="button" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Retirar ${file.name}`} className="rounded-lg px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">Retirar</button></li>)}</ul> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Categoría<input required list="document-category-suggestions" value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-xl border border-slate-200 px-3.5 py-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="Ej. Radiografía" /><datalist id="document-category-suggestions">{categories.map((item) => <option key={item} value={item} />)}</datalist></label>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Fecha del documento<input required type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} className="rounded-xl border border-slate-200 px-3.5 py-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
        </div>
        {canUseClinicalContext ? <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Consulta relacionada <span className="font-normal text-slate-400">(opcional)</span><select aria-label="Consulta relacionada" value={consultationId} onChange={(event) => setConsultationId(event.target.value)} className="rounded-xl border border-slate-200 px-3.5 py-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="">Solo paciente</option>{consultations.map((item) => <option key={item.id} value={item.id}>{formatDocumentDate(item.date)}</option>)}</select></label>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Pieza dental FDI <span className="font-normal text-slate-400">(opcional)</span><input aria-label="Pieza dental FDI" inputMode="numeric" maxLength="2" value={toothCode} onChange={(event) => setToothCode(event.target.value)} placeholder="Ej. 16" className="rounded-xl border border-slate-200 px-3.5 py-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
        </div> : null}
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Notas <span className="font-normal text-slate-400">(opcional)</span><textarea rows="3" maxLength="2000" value={notes} onChange={(event) => setNotes(event.target.value)} className="resize-y rounded-xl border border-slate-200 px-3.5 py-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="Contexto clínico del lote" /></label>
      </div>
      <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-7"><button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button><button disabled={saving} className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar documentos'}</button></footer>
    </form>
  </div>
}

export function DocumentDetailDialog({ accessToken, canEdit, canUseClinicalContext, categories, consultations, document, patientActive, canDelete, patientId, onClose, onDeleted, onUpdated }) {
  const closeRef = useRef(null)
  const [objectUrl, setObjectUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [retirementReason, setRetirementReason] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [category, setCategory] = useState(document.category)
  const [consultationId, setConsultationId] = useState(document.consultation?.id ? String(document.consultation.id) : '')
  const [toothCode, setToothCode] = useState(document.tooth_code || '')
  useModalBehavior(onClose, closeRef)

  useEffect(() => {
    let active = true
    let createdUrl = ''
    getPatientDocumentContent(accessToken, patientId, document.id)
      .then((blob) => {
        if (!active) return
        createdUrl = URL.createObjectURL(blob)
        setObjectUrl(createdUrl)
      })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => {
      active = false
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [accessToken, document.id, patientId])

  const download = async () => {
    try {
      const blob = await getPatientDocumentContent(accessToken, patientId, document.id, true)
      const url = URL.createObjectURL(blob)
      const anchor = window.document.createElement('a')
      anchor.href = url
      anchor.download = document.original_name
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const remove = async () => {
    setDeleting(true)
    setError('')
    try {
      await deletePatientDocument(accessToken, patientId, document.id, retirementReason.trim())
      await onDeleted()
      onClose()
    } catch (requestError) {
      setError(requestError.message)
      setDeleting(false)
    }
  }

  const saveMetadata = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const updated = await updatePatientDocument(accessToken, patientId, document.id, {
        category,
        consultation_id: consultationId ? Number(consultationId) : null,
        tooth_code: toothCode.trim() || null,
      })
      await onUpdated(updated)
      setEditing(false)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:p-5">
    <section role="dialog" aria-modal="true" aria-label="Detalle del documento" className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[calc(100dvh-2.5rem)] sm:max-w-5xl sm:rounded-3xl lg:flex-row">
      <div className="flex min-h-[38vh] flex-1 items-center justify-center bg-slate-900 p-4 sm:min-h-[48vh] lg:min-h-0">
        {loading ? <p className="text-sm text-slate-300">Cargando vista previa…</p> : null}
        {error && !objectUrl ? <p role="alert" className="max-w-md rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}
        {objectUrl && document.mime_type.startsWith('image/') ? <img src={objectUrl} alt={`Vista previa de ${document.original_name}`} className="max-h-full max-w-full rounded-lg object-contain" /> : null}
        {objectUrl && document.mime_type === 'application/pdf' ? <iframe title={`Vista previa de ${document.original_name}`} src={objectUrl} className="h-full min-h-[48vh] w-full rounded-lg bg-white lg:min-h-[70vh]" /> : null}
      </div>
      <aside className="w-full overflow-y-auto border-l border-slate-200 p-5 sm:p-7 lg:max-w-sm">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-700">Detalle del documento</p><h2 className="mt-1 break-words font-sans text-2xl font-semibold text-slate-950">{document.original_name}</h2></div><CloseButton buttonRef={closeRef} onClick={onClose} /></div>
        {editing ? <form onSubmit={saveMetadata} className="mt-7 space-y-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-4"><label className="grid gap-1.5 text-sm font-semibold text-slate-700">Categoría<input required list="document-edit-category-suggestions" value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal" /><datalist id="document-edit-category-suggestions">{categories.map((item) => <option key={item} value={item} />)}</datalist></label>{canUseClinicalContext ? <><label className="grid gap-1.5 text-sm font-semibold text-slate-700">Consulta relacionada<select aria-label="Consulta relacionada" value={consultationId} onChange={(event) => setConsultationId(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"><option value="">Solo paciente</option>{consultations.map((item) => <option key={item.id} value={item.id}>{formatDocumentDate(item.date)}</option>)}</select></label><label className="grid gap-1.5 text-sm font-semibold text-slate-700">Pieza dental FDI<input aria-label="Pieza dental FDI" inputMode="numeric" maxLength="2" value={toothCode} onChange={(event) => setToothCode(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal" /></label></> : null}<div className="flex gap-2"><button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Cancelar</button><button disabled={saving} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar metadatos'}</button></div></form> : <dl className="mt-7 grid grid-cols-2 gap-x-4 gap-y-5 text-sm"><div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Categoría</dt><dd className="mt-1 font-medium text-slate-800">{document.category}</dd></div><div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Fecha</dt><dd className="mt-1 font-medium text-slate-800">{formatDocumentDate(document.document_date)}</dd></div><div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tipo</dt><dd className="mt-1 font-medium text-slate-800">{document.mime_type === 'application/pdf' ? 'PDF' : 'Imagen'}</dd></div><div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tamaño</dt><dd className="mt-1 font-medium text-slate-800">{formatDocumentSize(document.size_bytes)}</dd></div>{canUseClinicalContext && document.consultation ? <div className="col-span-2"><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Consulta</dt><dd className="mt-1 font-medium text-slate-800">Consulta · {formatDocumentDate(document.consultation.date)}</dd></div> : null}{canUseClinicalContext && document.tooth_code ? <div className="col-span-2"><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Pieza dental</dt><dd className="mt-1 font-medium text-slate-800">Pieza {document.tooth_code}</dd></div> : null}<div className="col-span-2"><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Adjuntado por</dt><dd className="mt-1 font-medium text-slate-800">{document.uploaded_by_name}</dd></div><div className="col-span-2"><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Notas</dt><dd className="mt-1 leading-6 text-slate-600">{document.notes || 'Sin notas adicionales.'}</dd></div></dl>}
        {error && objectUrl ? <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {confirming ? <div className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-4"><h3 className="font-semibold text-red-900">¿Retirar documento?</h3><p className="mt-1 text-sm leading-5 text-red-700">El documento se ocultará del expediente. Un administrador podrá restaurarlo; el archivo se conserva.</p><label className="mt-3 block text-sm font-medium text-red-900">Motivo del retiro<input value={retirementReason} onChange={(event) => setRetirementReason(event.target.value)} maxLength={1000} className="mt-1 w-full rounded-lg border border-red-200 bg-white p-2" /></label><div className="mt-4 flex gap-2"><button type="button" onClick={() => setConfirming(false)} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Conservar</button><button type="button" disabled={deleting || !retirementReason.trim()} onClick={remove} className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">{deleting ? 'Retirando…' : 'Sí, retirar'}</button></div></div> : <div className="mt-8 flex flex-wrap gap-2 border-t border-slate-200 pt-5"><button type="button" onClick={download} className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Descargar</button>{canEdit && !editing ? <button type="button" onClick={() => setEditing(true)} className="rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50">Editar metadatos</button> : null}{canDelete && patientActive ? <button type="button" onClick={() => setConfirming(true)} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50">Retirar documento</button> : null}</div>}
      </aside>
    </section>
  </div>
}
