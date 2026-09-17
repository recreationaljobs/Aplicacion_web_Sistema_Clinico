import { useEffect, useId, useRef, useState } from 'react'

export default function PatientSearchField({
  query, options, selectedPatient, loading, error, inputRef,
  onQueryChange, onSelect, onClear, canCreate, onCreate,
}) {
  const id = useId()
  const [open, setOpen] = useState(true)
  const [activeIndex, setActiveIndex] = useState(-1)
  const focusAfterClear = useRef(false)
  const focusAfterSelection = useRef(false)
  const changeButtonRef = useRef(null)
  const listRef = useRef(null)
  const showResults = open && query.trim().length >= 2 && !loading && !error && options.length > 0
  const activeOption = showResults && activeIndex >= 0 ? options[activeIndex] : null

  useEffect(() => {
    if (!selectedPatient && focusAfterClear.current) {
      inputRef.current?.focus()
      focusAfterClear.current = false
    }
    if (selectedPatient && focusAfterSelection.current) {
      changeButtonRef.current?.focus()
      focusAfterSelection.current = false
    }
  }, [inputRef, selectedPatient])

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [activeIndex, showResults])

  const choose = (patient) => {
    focusAfterSelection.current = true
    setOpen(false)
    setActiveIndex(-1)
    onSelect(patient)
  }
  const keyDown = (event) => {
    if (event.key === 'Escape') {
      if (showResults) event.stopPropagation()
      setOpen(false)
      setActiveIndex(-1)
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      if (!options.length || loading) return
      setActiveIndex((current) => event.key === 'ArrowDown'
        ? (current + 1) % options.length
        : current <= 0 ? options.length - 1 : current - 1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (showResults) choose(activeOption || options[0])
    }
  }

  return <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
    {selectedPatient ? <div role="group" aria-label="Paciente seleccionado">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-700">Paciente</p>
        <button ref={changeButtonRef} type="button" onClick={() => { focusAfterClear.current = true; setOpen(true); onClear() }} className="rounded-md px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-700">Cambiar paciente</button>
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-900">{selectedPatient.full_name}</p>
      <p className="mt-1 text-xs text-slate-500">{selectedPatient.code}{selectedPatient.phone ? ` · ${selectedPatient.phone}` : ''}</p>
      {selectedPatient.profile_complete === false ? <p className="mt-2 text-xs font-semibold text-amber-700">Perfil incompleto</p> : null}
    </div> : <>
      <label htmlFor={id} className="text-sm font-semibold text-slate-700">Paciente</label>
      <div className="relative mt-2">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
        <input ref={inputRef} id={id} role="combobox" type="text" autoComplete="off" value={query}
          aria-autocomplete="list" aria-expanded={Boolean(showResults)} aria-controls={`${id}-results`}
          aria-activedescendant={activeOption ? `${id}-option-${activeOption.id}` : undefined}
          aria-describedby={`${id}-status`} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
          onChange={(event) => { setOpen(true); setActiveIndex(-1); onQueryChange(event.target.value) }} onKeyDown={keyDown}
          placeholder="Nombre, teléfono, cédula o código" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-3 pl-9 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
      </div>
      <div id={`${id}-status`} aria-live="polite" className="mt-2 text-xs text-slate-500">
        {query.trim().length < 2 ? <p>Escribe al menos 2 caracteres.</p> : null}
        {loading ? <p>Buscando pacientes…</p> : null}
        {error ? <p role="alert" className="text-red-700">{error}</p> : null}
        {!loading && !error && query.trim().length >= 2 && !options.length ? <>
          <p>No encontramos pacientes.</p>
          {canCreate ? <button type="button" onClick={onCreate} className="mt-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50">Crear paciente</button> : null}
        </> : null}
      </div>
      {showResults ? <ul ref={listRef} id={`${id}-results`} role="listbox" aria-label="Resultados de pacientes" className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1">
        {options.map((patient, index) => <li key={patient.id} role="presentation">
          <button id={`${id}-option-${patient.id}`} type="button" role="option" aria-selected={index === activeIndex} tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()} onClick={() => choose(patient)}
            onMouseEnter={() => setActiveIndex(index)} className={`block w-full rounded-lg px-3 py-2.5 text-left transition-colors ${index === activeIndex ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
            <span className="block text-sm font-semibold text-slate-900">{patient.full_name}</span>
            <span className="mt-1 block text-xs text-slate-500">{patient.code}{patient.phone ? ` · ${patient.phone}` : ''}</span>
            {patient.profile_complete === false ? <span className="mt-1 block text-xs font-semibold text-amber-700">Perfil incompleto</span> : null}
          </button>
        </li>)}
      </ul> : null}
    </>}
  </div>
}
