"use client"

import { useEffect, useState } from "react"
import ParkingMap from "@/components/ParkingMap"
import { ref, onValue } from "firebase/database"
import { db } from "@/lib/firebase"

interface ParkingSlot {
  id: number
  name: string
  location: string
  price: number
  status: "available" | "reserved" | "occupied"
  reservedBy?: string
  reservedAt?: number
  paid?: boolean
  bollardUp?: boolean
}

export default function DashboardPage() {
  const [slots, setSlots] = useState<ParkingSlot[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string>("")

  // ✅ REALTIME FIREBASE LISTENER
  useEffect(() => {
    const slotsRef = ref(db, "slots")

    const unsubscribe = onValue(slotsRef, (snapshot) => {
      const data = snapshot.val()

      if (!data) return

      const slotsArray: ParkingSlot[] = Object.keys(data).map((key) => {
        const slot = data[key]

        return {
          id: Number(key),
          name: `Slot ${key}`,
          location: getLocationName(Number(key)),
          price: 50,
          status: slot.status || "available",
          reservedBy: slot.reservedBy,
          reservedAt: slot.reservedAt,
          paid: slot.paid,
          bollardUp: slot.bollardUp,
        }
      })

      setSlots(slotsArray)
    })

    return () => unsubscribe()
  }, [])

  // 🔧 Map slot number → location name (adjust if needed)
  function getLocationName(id: number) {
    const locations = [
      "Session Road",
      "Harrison Road",
      "SM Baguio",
      "Cedar Peak",
      "Mabini",
    ]
    return locations[id - 1] || "Unknown"
  }

  return (
    <div className="p-4">
      <h1 className="text-white text-xl font-bold mb-4">
        SurePark Dashboard
      </h1>

      <ParkingMap
        slots={slots}
        selectedLocation={selectedLocation}
        onLocationClick={(loc) => setSelectedLocation(loc)}
      />
    </div>
  )
}