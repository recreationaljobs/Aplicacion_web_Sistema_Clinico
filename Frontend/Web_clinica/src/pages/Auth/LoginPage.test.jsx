import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

import {
  MemoryRouter,
} from 'react-router-dom'

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { AuthProvider } from '../../context/AuthContext'
import LoginPage from './LoginPage'

import * as authService from '../../services/authService'


vi.mock('../../services/authService')


const renderPage = () => {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>
  )
}


describe('LoginPage', () => {

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })


  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })


  it(
    'valida credenciales vacías',
    async () => {
      renderPage()

      fireEvent.click(
        screen.getByRole(
          'button',
          {
            name: 'Iniciar sesión',
          }
        )
      )

      expect(
        await screen.findByRole('alert')
      ).toHaveTextContent(
        'Ingresa tu nombre de usuario y contraseña.'
      )
    }
  )


  it(
    'envía usuario y contraseña al backend',
    async () => {
      authService.login.mockResolvedValue({
        access: 'access-token',
        refresh: 'refresh-token',
        user: {
          id: 1,
          username: 'admin',
          email: null,
          first_name: '',
          last_name: '',
          role: 'ADMINISTRADOR',
        },
      })

      renderPage()

      fireEvent.change(
        screen.getByLabelText(
          'Nombre de usuario'
        ),
        {
          target: {
            value: 'admin',
          },
        }
      )

      fireEvent.change(
        screen.getByLabelText(
          'Contraseña'
        ),
        {
          target: {
            value: 'secreto',
          },
        }
      )

      fireEvent.click(
        screen.getByRole(
          'button',
          {
            name: 'Iniciar sesión',
          }
        )
      )

      await waitFor(() => {
        expect(
          authService.login
        ).toHaveBeenCalledWith({
          username: 'admin',
          password: 'secreto',
        })
      })
    }
  )


  it(
    'guarda la sesión recordada en localStorage',
    async () => {
      authService.login.mockResolvedValue({
        access: 'access-token',
        refresh: 'refresh-token',
        user: {
          id: 1,
          username: 'admin',
          email: null,
          first_name: '',
          last_name: '',
          role: 'ADMINISTRADOR',
        },
      })

      renderPage()

      fireEvent.change(
        screen.getByLabelText(
          'Nombre de usuario'
        ),
        {
          target: {
            value: 'admin',
          },
        }
      )

      fireEvent.change(
        screen.getByLabelText(
          'Contraseña'
        ),
        {
          target: {
            value: 'secreto',
          },
        }
      )

      fireEvent.click(
        screen.getByLabelText(
          'Recuérdame'
        )
      )

      fireEvent.click(
        screen.getByRole(
          'button',
          {
            name: 'Iniciar sesión',
          }
        )
      )

      await waitFor(() => {
        expect(
          authService.login
        ).toHaveBeenCalled()
      })

      const stored = localStorage.getItem(
        'dentalclinic_session'
      )

      expect(stored).toContain(
        '"username":"admin"'
      )

      expect(stored).toContain(
        '"role":"ADMINISTRADOR"'
      )
    }
  )

})