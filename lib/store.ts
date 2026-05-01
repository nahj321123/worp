/**
 * lib/store.ts
 * -----------
 * Singleton in-memory slot store shared across all Next.js API route handlers.
 * In production replace this with a real database (Supabase, PostgreSQL, etc.).
 *
 * The `global` trick prevents the store from being re-initialised on every
 * hot-reload in development while Next.js keeps re-importing modules.
 */

export interface ParkingSlot {
  id: number
  name: string
  location: string
  price: number
  status: "available" | "reserved" | "occupied"
  reservedBy?: string
  reservedAt?: number
  paid?: boolean
  activeQrToken?: string
  checkedIn?: boolean
  bollardUp?: boolean
  activated?: boolean  // true = app has authorized entry (replaces physical buttons)
  reserved?: boolean   // true = slot has been reserved — tells ESP32 to turn blue LED on
}

const DEFAULT_SLOTS: ParkingSlot[] = [
  { id: 1, name: "Slot 1", location: "Session Road",  price: 50, status: "available", bollardUp: false },
  { id: 2, name: "Slot 2", location: "Harrison Road", price: 45, status: "available", bollardUp: false },
  { id: 3, name: "Slot 3", location: "SM Baguio",     price: 60, status: "available", bollardUp: false },
  { id: 4, name: "Slot 4", location: "Cedar Peak",    price: 40, status: "available", bollardUp: false },
  { id: 5, name: "Slot 5", location: "Mabini",        price: 55, status: "available", bollardUp: false },
]

// Attach to global so dev hot-reloads don't wipe the state
const g = globalThis as any

if (!g.__sureparkSlots) {
  g.__sureparkSlots = DEFAULT_SLOTS.map((s) => ({ ...s }))
}

export const slotStore = {
  getAll(): ParkingSlot[] {
    return g.__sureparkSlots as ParkingSlot[]
  },

  getById(id: number): ParkingSlot | undefined {
    return (g.__sureparkSlots as ParkingSlot[]).find((s) => s.id === id)
  },

  update(id: number, patch: Partial<ParkingSlot>): ParkingSlot | null {
    const slots = g.__sureparkSlots as ParkingSlot[]
    const idx   = slots.findIndex((s) => s.id === id)
    if (idx === -1) return null
    slots[idx] = { ...slots[idx], ...patch }
    return slots[idx]
  },

  reset(): ParkingSlot[] {
    g.__sureparkSlots = DEFAULT_SLOTS.map((s) => ({ ...s }))
    return g.__sureparkSlots
  },
}
