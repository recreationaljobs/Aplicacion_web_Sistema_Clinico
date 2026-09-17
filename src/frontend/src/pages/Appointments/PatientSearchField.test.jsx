import { createRef } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PatientSearchField from './PatientSearchField'

const patients = [
  { id: 7, full_name: 'Ana Pérez', code: 'PAC-00007', phone: '8888-1111' },
  { id: 8, full_name: 'Ana Pérez', code: 'PAC-00008', phone: '8888-2222' },
]

function setup(overrides = {}) {
  const props = {
    query: 'Ana', options: patients, selectedPatient: null, loading: false, error: '',
    inputRef: createRef(), onQueryChange: vi.fn(), onSelect: vi.fn(), onClear: vi.fn(),
    ...overrides,
  }
  render(<PatientSearchField {...props} />)
  return props
}

describe('PatientSearchField', () => {
  afterEach(cleanup)

  it('distinguishes matching names and selects the highlighted patient with the keyboard', () => {
    const props = setup()
    const input = screen.getByRole('combobox', { name: 'Paciente' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const second = screen.getByRole('option', { name: /PAC-00008.*8888-2222/ })
    expect(second).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', second.id)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(props.onSelect).toHaveBeenCalledWith(patients[1])
  })

  it('closes suggestions with Escape before allowing a second Escape to reach the modal', () => {
    setup()
    const outerEscape = vi.fn()
    window.addEventListener('keydown', outerEscape)
    try {
      const input = screen.getByRole('combobox', { name: 'Paciente' })
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      expect(input).toHaveAttribute('aria-expanded', 'false')
      expect(outerEscape).not.toHaveBeenCalled()
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(outerEscape).toHaveBeenCalledOnce()
    } finally {
      window.removeEventListener('keydown', outerEscape)
    }
  })

  it('allows direct selection with the pointer while keeping focus in the search field', () => {
    const props = setup()
    const input = screen.getByRole('combobox', { name: 'Paciente' })
    act(() => input.focus())
    const result = screen.getByRole('option', { name: /PAC-00007.*8888-1111/ })
    fireEvent.mouseDown(result)
    expect(input).toHaveFocus()
    fireEvent.click(result)
    expect(props.onSelect).toHaveBeenCalledWith(patients[0])
  })
})
