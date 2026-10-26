import { createContext, useContext } from 'react'

/** Refreshes the admin sidebar badges (pending members, content in review, new requests). */
export const AdminCountsContext = createContext<() => void>(() => {})
export const useRefreshAdminCounts = () => useContext(AdminCountsContext)
