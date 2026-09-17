import { useState } from 'react'
import Dialog from '../../components/Dialog'
import {
  FINDING_LABELS,
  SURFACE_LABELS,
  toothSurfaces,
} from './odontogramSchema'

const surfaceFindings = ['CARIES', 'RESTORATION', 'SEALANT', 'FRACTURE']
const wholeFindings = ['MISSING', 'UNERUPTED', 'CROWN', 'IMPLANT', 'ROOT_CANAL']
const currentFindings = [...surfaceFindings, ...wholeFindings]

const displaySurface = (surface) => {
  const label = SURFACE_LABELS[surface] || surface.toLowerCase()
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`
}

export default function TreatmentResultDialog({ item, pending, requestError, onCancel, onConfirm }) {
  const [choice, setChoice] = useState('')
  const [finding, setFinding] = useState('')
  const [surfaces, setSurfaces] = useState([])
  const [validationError, setValidationError] = useState('')
  const availableSurfaces = item.tooth_code ? toothSurfaces(item.tooth_code) : []
  const plannedSuggestion = currentFindings.includes(item.planned_finding)
    ? FINDING_LABELS[item.planned_finding]
    : ''

  const selectFinding = ({ target }) => {
    setFinding(target.value)
    setSurfaces([])
    setValidationError('')
  }
  const toggleSurface = ({ target }) => setSurfaces((current) => (
    target.checked
      ? [...current, target.value]
      : current.filter((surface) => surface !== target.value)
  ))
  const confirm = () => {
    if (!choice) {
      setValidationError('Selecciona cómo registrar la realización.')
      return
    }
    if (choice === 'without-result') {
      onConfirm(null)
      return
    }
    if (!finding) {
      setValidationError('Selecciona el hallazgo actual confirmado.')
      return
    }
    if (surfaceFindings.includes(finding) && !surfaces.length) {
      setValidationError('Selecciona al menos una superficie para este hallazgo.')
      return
    }
    setValidationError('')
    onConfirm({
      tooth_code: item.tooth_code,
      surfaces: surfaceFindings.includes(finding) ? surfaces : [],
      finding,
    })
  }

  return <Dialog onClose={pending ? undefined : onCancel} aria-labelledby="treatment-result-title" className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
      <h2 id="treatment-result-title" className="font-sans text-2xl font-semibold text-slate-900">Realizar tratamiento</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">Confirma cómo quedará documentado “{item.description}”.</p>
      <fieldset className="mt-5 space-y-3">
        <legend className="text-xs font-bold uppercase tracking-wide text-slate-500">Registro clínico</legend>
        <label className="flex gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
          <input aria-label="Realizar sin registrar resultado en odontograma" type="radio" name="treatment-result-choice" checked={choice === 'without-result'} onChange={() => { setChoice('without-result'); setValidationError('') }} />
          <span><strong className="block text-slate-900">Realizar sin registrar resultado en odontograma</strong>El tratamiento se cerrará y el odontograma no cambiará.</span>
        </label>
        {item.tooth_code ? <label className="flex gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
          <input aria-label="Registrar resultado en odontograma" type="radio" name="treatment-result-choice" checked={choice === 'with-result'} onChange={() => { setChoice('with-result'); setValidationError('') }} />
          <span><strong className="block text-slate-900">Registrar resultado en odontograma</strong>Se creará una nueva versión inmutable.</span>
        </label> : <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Este tratamiento no tiene una pieza dental asociada; sólo puede realizarse sin modificar el odontograma.</p>}
      </fieldset>

      {choice === 'with-result' ? <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-700">Pieza del resultado
          <input aria-label="Pieza del resultado" readOnly value={item.tooth_code} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700" />
        </label>
        <label className="text-xs font-semibold text-slate-700">Hallazgo actual confirmado
          <select aria-label="Hallazgo actual confirmado" value={finding} onChange={selectFinding} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
            <option value="">Selecciona un hallazgo</option>
            {currentFindings.map((value) => <option key={value} value={value}>{FINDING_LABELS[value]}</option>)}
          </select>
        </label>
        {plannedSuggestion ? <p className="text-sm text-cyan-800 sm:col-span-2">La planificación sugería {plannedSuggestion}; confirma el hallazgo real sin copiarlo automáticamente.</p> : null}
        {surfaceFindings.includes(finding) ? <fieldset aria-label="Superficies del resultado" className="sm:col-span-2">
          <legend className="text-xs font-semibold text-slate-700">Superficies confirmadas</legend>
          <div className="mt-2 flex flex-wrap gap-2">{availableSurfaces.map((surface) => <label key={surface} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700"><input type="checkbox" value={surface} checked={surfaces.includes(surface)} onChange={toggleSurface} />{displaySurface(surface)}</label>)}</div>
        </fieldset> : null}
      </div> : null}

      {validationError || requestError ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{validationError || requestError}</p> : null}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={pending} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">Volver</button>
        <button type="button" onClick={confirm} disabled={pending} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60">{pending ? 'Realizando…' : 'Confirmar realización'}</button>
      </div>
  </Dialog>
}
