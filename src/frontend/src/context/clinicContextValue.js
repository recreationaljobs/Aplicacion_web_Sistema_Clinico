import { createContext, useContext } from 'react'

export const defaultClinicProfile = {
  name: 'DentalClinic', logo_url: '',
  currency: 'NIO', timezone: 'America/Managua', schedule_configured: false,
}

export const ClinicContext = createContext({
  profile: defaultClinicProfile, loading: false, refreshProfile: async () => {}, setProfile: () => {},
})

export const useClinic = () => useContext(ClinicContext)
