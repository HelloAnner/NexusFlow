/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiGet } from '@/lib/api'

export interface Branding {
  product_name: string
  system_name: string
}

interface BrandingContextValue {
  branding: Branding
  reloadBranding: () => Promise<void>
}

const defaultBranding: Branding = {
  product_name: 'NexusFlow',
  system_name: 'NexusFlow',
}

const BrandingContext = createContext<BrandingContextValue | null>(null)

function cleanBranding(value?: Partial<Branding> | null): Branding {
  const productName = value?.product_name?.trim() || defaultBranding.product_name
  return {
    product_name: productName,
    system_name: value?.system_name?.trim() || productName,
  }
}

async function fetchBranding() {
  const res = await apiGet<{ branding?: Branding }>('/system/branding')
  return cleanBranding(res.branding)
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<Branding>(defaultBranding)

  const reloadBranding = useCallback(async () => {
    try {
      setBranding(await fetchBranding())
    } catch {
      setBranding(defaultBranding)
    }
  }, [])

  useEffect(() => {
    let active = true
    fetchBranding()
      .then((next) => {
        if (active) setBranding(next)
      })
      .catch(() => {
        if (active) setBranding(defaultBranding)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    document.title = branding.system_name
  }, [branding.system_name])

  const value = useMemo<BrandingContextValue>(
    () => ({ branding, reloadBranding }),
    [branding, reloadBranding]
  )

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
}

export function useBranding() {
  const value = useContext(BrandingContext)
  if (!value) throw new Error('useBranding must be used inside BrandingProvider')
  return value
}
