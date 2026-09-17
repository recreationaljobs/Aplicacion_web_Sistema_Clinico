import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PatientDuplicateDialog from './PatientDuplicateDialog'

const matches = [
  {
    id: 12,
    code: 'PAC-00012',
    full_name: 'Ana López',
    date_of_birth: '1990-05-10',
    phone: '8888-1111',
    is_active: true,
    matched_on: ['phone', 'name_and_date_of_birth'],
  },
  {
    id: 13,
    code: 'PAC-00013',
    full_name: 'Ana Inactiva',
    date_of_birth: '1990-05-10',
    phone: '8888-1111',
    is_active: false,
    matched_on: ['phone'],
  },
]

afterEach(cleanup)

describe('PatientDuplicateDialog', () => {
  it('contains keyboard focus, closes with Escape, and restores the opener', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const onBack = vi.fn()
    const { unmount } = render(<PatientDuplicateDialog matches={[matches[0]]} onBack={onBack} onContinue={vi.fn()} />)
    const last = screen.getByRole('button', { name: 'Crear de todos modos' })
    expect(screen.getByRole('button', { name: 'Volver' })).toHaveFocus()
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'Volver' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onBack).toHaveBeenCalledOnce()
    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })
  it('renders nothing without matches', () => {
    const { container } = render(<PatientDuplicateDialog matches={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('shows multiple minimized matches, reasons, and inactive state', () => {
    render(<PatientDuplicateDialog matches={matches} onBack={vi.fn()} onContinue={vi.fn()} />)

    const dialog = screen.getByRole('dialog', { name: 'Posible paciente duplicado' })
    expect(within(dialog).getByText('PAC-00012')).toBeInTheDocument()
    expect(within(dialog).getByText('PAC-00013')).toBeInTheDocument()
    expect(within(dialog).getAllByText('Coincide el teléfono')).toHaveLength(2)
    expect(within(dialog).getByText('Coinciden nombre y fecha de nacimiento')).toBeInTheDocument()
    expect(within(dialog).getByText('Paciente inactivo')).toBeInTheDocument()
    expect(within(dialog).queryByText(/identificación/i)).not.toBeInTheDocument()
  })

  it('supports review, back, and explicit create-anyway actions', () => {
    const onReview = vi.fn()
    const onBack = vi.fn()
    const onContinue = vi.fn()
    render(
      <PatientDuplicateDialog
        matches={[matches[0]]}
        onReview={onReview}
        onBack={onBack}
        onContinue={onContinue}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Revisar paciente' }))
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear de todos modos' }))

    expect(onReview).toHaveBeenCalledWith(matches[0])
    expect(onBack).toHaveBeenCalledOnce()
    expect(onContinue).toHaveBeenCalledOnce()
  })

  it('allows selecting only an active existing patient', () => {
    const onSelect = vi.fn()
    render(
      <PatientDuplicateDialog
        matches={matches}
        onSelect={onSelect}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    const selectButtons = screen.getAllByRole('button', { name: 'Usar paciente existente' })
    expect(selectButtons[0]).toBeEnabled()
    expect(selectButtons[1]).toBeDisabled()
    fireEvent.click(selectButtons[0])

    expect(onSelect).toHaveBeenCalledWith(matches[0])
  })

  it('disables every action while a continuation is pending', () => {
    render(
      <PatientDuplicateDialog
        matches={[matches[0]]}
        onReview={vi.fn()}
        onBack={vi.fn()}
        onContinue={vi.fn()}
        busy
      />,
    )

    expect(screen.getByRole('button', { name: 'Revisar paciente' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Volver' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Creando…' })).toBeDisabled()
  })
})
