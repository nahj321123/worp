"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import {
  Car,
  LogOut,
  MapPin,
  Clock,
  CreditCard,
  QrCode,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Info,
  Search,
  CalendarCheck,
  Wallet,
  ScanLine,
  ArrowUp,
  ArrowDown,
  Radio,
  ShieldCheck,
  Zap,
} from "lucide-react"

const ParkingMap = dynamic(() => import("@/components/ParkingMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[440px] rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Loading map...</p>
      </div>
    </div>
  ),
})

interface ParkingSlot {
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
  bollardUp?: boolean   // true = raised (blocking), false = lowered (car can enter/exit)
  activated?: boolean
}

const LOCATIONS = ["Session Road", "Harrison Road", "SM Baguio", "Cedar Peak", "Mabini"]

const DEFAULT_SLOTS: ParkingSlot[] = [
  { id: 1, name: "Slot 1", location: "Session Road", price: 50, status: "available" },
  { id: 2, name: "Slot 2", location: "Harrison Road", price: 45, status: "available" },
  { id: 3, name: "Slot 3", location: "SM Baguio", price: 60, status: "available" },
  { id: 4, name: "Slot 4", location: "Cedar Peak", price: 40, status: "available" },
  { id: 5, name: "Slot 5", location: "Mabini", price: 55, status: "available" },
]

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [slots, setSlots] = useState<ParkingSlot[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string>("All")
  const [selectedSlot, setSelectedSlot] = useState<ParkingSlot | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<string>("GCash")
  const [qrInput, setQrInput] = useState("")
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string } | null>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [showMap, setShowMap] = useState(true)
  const [showTips, setShowTips] = useState(true)

  // ── helpers ──────────────────────────────────────────────────────────────
  // Write to both localStorage (offline fallback) AND the API (ESP32 source of truth)
  const syncSlots = (updated: ParkingSlot[]) => {
    setSlots(updated)
    localStorage.setItem("surepark_slots", JSON.stringify(updated))
  }

  const patchApi = async (slotId: number, patch: Partial<ParkingSlot>) => {
    try {
      console.log(`Sending PATCH to /api/slots/${slotId} with:`, patch);
      const response = await fetch(`/api/slots/${slotId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(patch),
      })
      if (!response.ok) {
        console.error("Failed to update Firebase API");
      }
    } catch (err) {
      console.error("API unavailable — fallback active", err);
    }
  }

  // ── auth + initial load ───────────────────────────────────────────────────
  useEffect(() => {
    const userData = localStorage.getItem("surepark_user")
    if (!userData) { router.push("/login"); return }
    setUser(JSON.parse(userData))

    // Try API first, fall back to localStorage
    fetch("/api/slots")
      .then((r) => r.json())
      .then((apiSlots: ParkingSlot[]) => {
        if(Array.isArray(apiSlots)) {
            setSlots(apiSlots)
            localStorage.setItem("surepark_slots", JSON.stringify(apiSlots))
        }
      })
      .catch(() => {
        const saved = localStorage.getItem("surepark_slots")
        setSlots(saved ? JSON.parse(saved) : DEFAULT_SLOTS)
      })
  }, [router])

  // ── poll API every 500 ms so ESP32 sensor changes appear in the UI fast ────
  const selectedSlotRef = useRef<ParkingSlot | null>(null)
  selectedSlotRef.current = selectedSlot

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res   = await fetch("/api/slots", { cache: "no-store" })
        if(!res.ok) return;
        const fresh = (await res.json()) as ParkingSlot[]
        
        if(!Array.isArray(fresh)) return;

        setSlots((prev) => {
          if (JSON.stringify(fresh) === JSON.stringify(prev)) return prev
          localStorage.setItem("surepark_slots", JSON.stringify(fresh))
          // keep selectedSlot in sync without resetting the interval
          const sel = selectedSlotRef.current
          if (sel) {
            const updated = fresh.find((s) => s.id === sel.id)
            if (updated) setSelectedSlot(updated)
          }
          return fresh
        })
      } catch {
        // server unreachable — stay with local state
      }
    }, 500)
    return () => clearInterval(poll)
  }, [])

  // ── reservation expiry timer ──────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      setSlots((prev) => {
        const now  = Date.now()
        const next = prev.map((s) => {
          if (s.status === "reserved" && !s.checkedIn && s.reservedAt && now - s.reservedAt > 15 * 60 * 1000) {
            const reset: ParkingSlot = { id: s.id, name: s.name, location: s.location, price: s.price, status: "available" }
            patchApi(s.id, reset)
            return reset
          }
          return s
        })
        if (JSON.stringify(next) !== JSON.stringify(prev)) {
          localStorage.setItem("surepark_slots", JSON.stringify(next))
          return next
        }
        return prev
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const handleLogout = () => {
    localStorage.removeItem("surepark_user")
    router.push("/login")
  }

  // 🔥 RESERVATION LOGIC
  const handleReserve = async (slot: ParkingSlot) => {
    if (slot.status !== "available") return
    
    // bollardUp: true = bollard is RAISED/CLOSED on reservation — car cannot enter yet
    const patch = { status: "reserved" as const, reservedBy: user.email, reservedAt: Date.now(), bollardUp: true }
    
    const updated = slots.map((s) => s.id === slot.id ? { ...s, ...patch } : s)
    syncSlots(updated)
    setSelectedSlot(updated.find((s) => s.id === slot.id) || null)
    
    await patchApi(slot.id, patch)
  }

  const handlePayment = async (slot: ParkingSlot) => {
    if (!slot.reservedBy || slot.reservedBy !== user.email) return
    const qrToken = `SP-${slot.id}-${Date.now().toString(36).toUpperCase()}`
    const patch   = { paid: true, activeQrToken: qrToken }
    const updated = slots.map((s) => s.id === slot.id ? { ...s, ...patch } : s)
    syncSlots(updated)
    setSelectedSlot(updated.find((s) => s.id === slot.id) || null)
    await patchApi(slot.id, patch)
  }

  const handleScanQr = async () => {
    setScanResult(null)
    if (!qrInput.trim()) { setScanResult({ success: false, message: "Please enter a QR token" }); return }
    const slot = slots.find((s) => s.activeQrToken === qrInput.trim())
    if (!slot)               { setScanResult({ success: false, message: "Invalid QR token" }); return }
    if (slot.status !== "reserved") { setScanResult({ success: false, message: "Slot is not reserved" }); return }
    if (!slot.paid)          { setScanResult({ success: false, message: "Payment not completed" }); return }
    if (slot.reservedAt && Date.now() - slot.reservedAt > 15 * 60 * 1000) { setScanResult({ success: false, message: "Reservation expired" }); return }

    const patch   = { status: "occupied" as const, checkedIn: true }
    const updated = slots.map((s) => s.id === slot.id ? { ...s, ...patch } : s)
    syncSlots(updated)
    setScanResult({ success: true, message: `Check-in successful! ${slot.name} is now occupied.` })
    setQrInput("")
    await patchApi(slot.id, patch)
  }

  const handleReset = async () => {
    try { await fetch("/api/slots/reset", { method: "POST" }) } catch { /* offline */ }
    setSlots(DEFAULT_SLOTS)
    localStorage.setItem("surepark_slots", JSON.stringify(DEFAULT_SLOTS))
    setSelectedSlot(null)
    setScanResult(null)
  }

  // 🔥 BOLLARD CONTROL LOGIC
  const handleBollardToggle = async (slot: ParkingSlot) => {
    // Must be paid before bollard can be lowered
    if (!slot.paid || slot.status !== "reserved") return
    
    const newBollardUp = !slot.bollardUp
    const patch = { bollardUp: newBollardUp }
    const updated = slots.map((s) => s.id === slot.id ? { ...s, ...patch } : s)
    syncSlots(updated)
    setSelectedSlot(updated.find((s) => s.id === slot.id) || null)
    
    try {
      console.log(`Sending POST to /api/bollard to set bollardUp: ${newBollardUp}`);
      await fetch("/api/bollard", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ slotId: slot.id, bollardUp: newBollardUp }),
      })
    } catch (err) { 
      console.error("Error toggling bollard", err)
    }
  }

  const filteredSlots =
    selectedLocation === "All"
      ? slots
      : slots.filter((s) => s.location === selectedLocation)

  const stats = {
    available: filteredSlots.filter((s) => s.status === "available").length,
    reserved: filteredSlots.filter((s) => s.status === "reserved").length,
    occupied: filteredSlots.filter((s) => s.status === "occupied").length,
  }

  const myReservations = slots.filter(
    (s) => s.reservedBy === user?.email && s.status === "reserved"
  )

  const getTimeRemaining = (reservedAt: number) => {
    const elapsed = Date.now() - reservedAt
    const remaining = 15 * 60 * 1000 - elapsed
    if (remaining <= 0) return "Expired"
    const minutes = Math.floor(remaining / 60000)
    const seconds = Math.floor((remaining % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center">
              <Car className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">SurePark Baguio</h1>
              <p className="text-slate-400 text-sm">Welcome, {user.name || user.email}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowScanner(!showScanner)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              <QrCode className="w-4 h-4" />
              Scanner
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Reset
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>

        {/* QR Scanner Panel */}
        {showScanner && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <QrCode className="w-5 h-5 text-green-500" />
              <h2 className="text-xl font-bold text-white">QR Code Scanner</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Paste QR Token
                </label>
                <input
                  type="text"
                  value={qrInput}
                  onChange={(e) => setQrInput(e.target.value)}
                  placeholder="e.g., SP-3-ABC123"
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <button
                onClick={handleScanQr}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
              >
                Validate & Check In
              </button>
              {scanResult && (
                <div
                  className={`flex items-start gap-3 p-4 rounded-lg ${
                    scanResult.success
                      ? "bg-green-900/50 border border-green-700"
                      : "bg-red-900/50 border border-red-700"
                  }`}
                >
                  {scanResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  )}
                  <p
                    className={`text-sm ${
                      scanResult.success ? "text-green-200" : "text-red-200"
                    }`}
                  >
                    {scanResult.message}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* How to Use Tips */}
        <div className="mb-6 rounded-xl border border-blue-800/60 bg-blue-950/40 overflow-hidden">
          <button
            onClick={() => setShowTips((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-blue-900/20 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <span className="text-blue-300 font-semibold text-sm tracking-wide uppercase">How to Use SurePark</span>
            </div>
            {showTips
              ? <ChevronUp className="w-4 h-4 text-blue-400" />
              : <ChevronDown className="w-4 h-4 text-blue-400" />
            }
          </button>

          {showTips && (
            <div className="px-5 pb-5 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  {
                    step: "1",
                    color: "bg-blue-600/30 border-blue-500/40",
                    numColor: "text-blue-300",
                    icon: <Search className="w-4 h-4 text-blue-400" />,
                    title: "Find a Slot",
                    desc: "Use the Filter by Location dropdown or click a map pin below to browse parking slots. Green pins mean the slot is available.",
                  },
                  {
                    step: "2",
                    color: "bg-green-600/20 border-green-500/40",
                    numColor: "text-green-300",
                    icon: <CalendarCheck className="w-4 h-4 text-green-400" />,
                    title: "Reserve the Slot",
                    desc: "Click View on any Available (green) slot card, then press Reserve. The slot turns yellow (Reserved). You have 15 minutes to complete payment before it auto-releases.",
                  },
                  {
                    step: "3",
                    color: "bg-yellow-600/20 border-yellow-500/40",
                    numColor: "text-yellow-300",
                    icon: <Wallet className="w-4 h-4 text-yellow-400" />,
                    title: "Pay the Ticket",
                    desc: "Inside the slot details, select your payment method — GCash, Maya, or Card — then press Pay Now. A unique QR token is generated and the slot stays Reserved.",
                  },
                  {
                    step: "4",
                    color: "bg-orange-600/20 border-orange-500/40",
                    numColor: "text-orange-300",
                    icon: <Zap className="w-4 h-4 text-orange-400" />,
                    title: "Control the Bollard",
                    desc: "After payment, the Bollard Control panel unlocks. Press Lower Bollard to allow your vehicle to enter the slot. The bollard blocks entry when raised and opens it when lowered.",
                  },
                  {
                    step: "5",
                    color: "bg-purple-600/20 border-purple-500/40",
                    numColor: "text-purple-300",
                    icon: <Radio className="w-4 h-4 text-purple-400" />,
                    title: "Car Detected — Occupied",
                    desc: "Once your vehicle enters the slot, the HC-SR04 ultrasonic sensor on the ESP32 detects it and automatically updates the slot status from Reserved to Occupied (red) on this dashboard.",
                  },
                  {
                    step: "6",
                    color: "bg-slate-600/30 border-slate-500/40",
                    numColor: "text-slate-300",
                    icon: <Car className="w-4 h-4 text-slate-400" />,
                    title: "Exit & Free the Slot",
                    desc: "When your vehicle leaves, the sensor detects the empty space and automatically resets the slot back to Available so the next driver can reserve it.",
                  },
                ].map(({ step, color, numColor, icon, title, desc }) => (
                  <div key={step} className="flex gap-3 bg-slate-800/60 rounded-lg p-4 border border-slate-700/50">
                    <div className={`flex-shrink-0 w-7 h-7 rounded-full border flex items-center justify-center ${color}`}>
                      <span className={`text-xs font-bold ${numColor}`}>{step}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        {icon}
                        <span className="text-white text-sm font-semibold">{title}</span>
                      </div>
                      <p className="text-slate-400 text-xs leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Status legend */}
              <div className="mt-4 pt-3 border-t border-slate-700/60">
                <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-2">Slot Status Colors</p>
                <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                    Green — Available, ready to reserve
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 flex-shrink-0" />
                    Yellow — Reserved, awaiting vehicle or payment
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
                    Red — Occupied, vehicle is parked
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Location Filter */}
        <div className="mb-6">
          <label htmlFor="location-select" className="block text-sm font-medium text-slate-300 mb-2">
            Filter by Location
          </label>
          <div className="relative w-full sm:w-72">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 pointer-events-none" />
            <select
              id="location-select"
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="w-full appearance-none bg-slate-800 border border-slate-600 text-white rounded-xl pl-9 pr-10 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-slate-500 transition-colors cursor-pointer"
            >
              <option value="All">All Locations</option>
              {LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-green-900/30 border border-green-700 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-400 text-sm font-medium">Available</p>
                <p className="text-3xl font-bold text-white mt-1">{stats.available}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
          </div>
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-yellow-400 text-sm font-medium">Reserved</p>
                <p className="text-3xl font-bold text-white mt-1">{stats.reserved}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-500" />
            </div>
          </div>
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-red-400 text-sm font-medium">Occupied</p>
                <p className="text-3xl font-bold text-white mt-1">{stats.occupied}</p>
              </div>
              <Car className="w-8 h-8 text-red-500" />
            </div>
          </div>
        </div>

        {/* My Active Reservations */}
        {myReservations.length > 0 && (
          <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-6 mb-8">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-bold text-white">Your Active Reservations</h2>
            </div>
            <div className="space-y-3">
              {myReservations.map((slot) => (
                <div
                  key={slot.id}
                  className="bg-slate-800 rounded-lg p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="text-white font-medium">
                      {slot.name} - {slot.location}
                    </p>
                    <p className="text-sm text-slate-400">
                      Time remaining:{" "}
                      <span className="text-yellow-400 font-mono">
                        {getTimeRemaining(slot.reservedAt!)}
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedSlot(slot)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
                  >
                    {slot.paid ? "View QR" : "Pay Now"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Parking Slots Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSlots.map((slot) => (
            <div
              key={slot.id}
              className={`rounded-lg p-6 transition-colors border ${
                slot.status === "available"
                  ? "bg-slate-800 border-green-700/60 hover:border-green-600"
                  : slot.status === "reserved"
                  ? "bg-slate-800 border-yellow-700/60 hover:border-yellow-600"
                  : "bg-red-950/30 border-red-700/60 hover:border-red-600"
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-white">{slot.name}</h3>
                  <div className="flex items-center gap-1 text-slate-400 text-sm mt-1">
                    <MapPin className="w-4 h-4" />
                    {slot.location}
                  </div>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    slot.status === "available"
                      ? "bg-green-900/50 text-green-400 border border-green-700"
                      : slot.status === "reserved"
                      ? "bg-yellow-900/50 text-yellow-400 border border-yellow-700"
                      : "bg-red-900/50 text-red-400 border border-red-700"
                  }`}
                >
                  {slot.status.toUpperCase()}
                </span>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl font-bold text-white">₱{slot.price}</span>
                <span className="text-slate-400 text-sm">/hour</span>
              </div>

              {slot.reservedBy && (
                <div className="bg-slate-900 rounded-lg p-3 mb-4">
                  <p className="text-xs text-slate-400 mb-1">Reserved by</p>
                  <p className="text-sm text-white font-medium">{slot.reservedBy}</p>
                  {slot.reservedAt && (
                    <p className="text-xs text-yellow-400 mt-1">
                      Time left: {getTimeRemaining(slot.reservedAt)}
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setSelectedSlot(slot)}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
                >
                  View
                </button>
                {slot.status === "available" && (
                  <button
                    onClick={() => handleReserve(slot)}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
                  >
                    Reserve
                  </button>
                )}
                {slot.status === "occupied" && (
                  <div className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-red-900/30 border border-red-800 text-red-400 rounded-lg text-sm font-medium">
                    <Car className="w-3.5 h-3.5" />
                    Occupied
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Map — below the slots grid */}
        <div className="mt-10 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-bold text-white">Parking Locations Map</h2>
              {showMap && (
                <span className="text-slate-400 text-sm hidden sm:inline">— click a pin to filter slots above</span>
              )}
            </div>
            <button
              onClick={() => setShowMap((v) => !v)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg text-sm font-medium transition-colors"
            >
              <MapPin className="w-4 h-4" />
              {showMap ? "Hide Map" : "Show Map"}
            </button>
          </div>
          {showMap && (
            <ParkingMap
              slots={slots}
              onLocationClick={(loc) => setSelectedLocation(loc)}
              selectedLocation={selectedLocation}
            />
          )}
        </div>

        {/* Slot Detail Modal */}
        {selectedSlot && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4" style={{ zIndex: 2000 }}>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md w-full">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-2xl font-bold text-white">{selectedSlot.name}</h3>
                  <p className="text-slate-400">{selectedSlot.location}</p>
                </div>
                <button
                  onClick={() => setSelectedSlot(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-slate-900 rounded-lg p-4">
                  <p className="text-slate-400 text-sm mb-1">Status</p>
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                      selectedSlot.status === "available"
                        ? "bg-green-900/50 text-green-400 border border-green-700"
                        : selectedSlot.status === "reserved"
                        ? "bg-yellow-900/50 text-yellow-400 border border-yellow-700"
                        : "bg-red-900/50 text-red-400 border border-red-700"
                    }`}
                  >
                    {selectedSlot.status.toUpperCase()}
                  </span>
                </div>

                <div className="bg-slate-900 rounded-lg p-4">
                  <p className="text-slate-400 text-sm mb-1">Price</p>
                  <p className="text-2xl font-bold text-white">₱{selectedSlot.price}/hour</p>
                </div>

                {selectedSlot.reservedBy === user.email && !selectedSlot.paid && (
                  <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <CreditCard className="w-5 h-5 text-blue-400" />
                      <h4 className="text-white font-medium">Payment</h4>
                    </div>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="GCash">GCash</option>
                      <option value="Maya">Maya</option>
                      <option value="Card">Credit/Debit Card</option>
                    </select>
                    <button
                      onClick={() => handlePayment(selectedSlot)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                    >
                      Pay ₱{selectedSlot.price} via {paymentMethod}
                    </button>
                  </div>
                )}

                {selectedSlot.paid && selectedSlot.activeQrToken && (
                  <div className="space-y-3">
                    {/* QR Token */}
                    <div className="bg-green-900/30 border border-green-700 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle2 className="w-5 h-5 text-green-400" />
                        <h4 className="text-white font-medium">Payment Complete — Slot Reserved</h4>
                      </div>
                      <div className="bg-slate-900 rounded-lg p-4 mb-2">
                        <p className="text-slate-400 text-sm mb-1">Your QR Token</p>
                        <p className="text-lg font-mono font-bold text-white break-all">
                          {selectedSlot.activeQrToken}
                        </p>
                      </div>
                      {selectedSlot.reservedAt && selectedSlot.status === "reserved" && (
                        <p className="text-sm text-yellow-400">
                          Time remaining: {getTimeRemaining(selectedSlot.reservedAt)}
                        </p>
                      )}
                      {selectedSlot.status === "occupied" && (
                        <div className="mt-2 space-y-2">
                          <p className="text-sm text-green-400 flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4" /> Car detected by sensor — slot is Occupied
                          </p>
                          <p className="text-xs text-slate-400 bg-slate-800/60 border border-slate-700 rounded px-3 py-2">
                            The slot will automatically return to Available when the sensor detects the car has left.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Bollard Control — visible only after payment */}
                    {selectedSlot.reservedBy === user.email && (
                      <div className="bg-slate-900/80 border border-slate-600 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Zap className="w-4 h-4 text-yellow-400" />
                          <h4 className="text-white font-semibold text-sm">Bollard Control</h4>
                          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
                            selectedSlot.bollardUp
                              ? "bg-red-900/50 text-red-400 border border-red-700"
                              : "bg-green-900/50 text-green-400 border border-green-700"
                          }`}>
                            {selectedSlot.bollardUp ? "RAISED" : "LOWERED"}
                          </span>
                        </div>

                        {/* Instruction — user must lower bollard to enter */}
                        {selectedSlot.paid && selectedSlot.status === "reserved" && selectedSlot.bollardUp && (
                          <p className="text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-800 rounded px-3 py-2 mb-3 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse inline-block" />
                            Bollard is raised. Press Lower Bollard to open the gate and enter.
                          </p>
                        )}
                        {selectedSlot.paid && selectedSlot.status === "reserved" && !selectedSlot.bollardUp && (
                          <p className="text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-800 rounded px-3 py-2 mb-3 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
                            Gate is open — drive in now. Sensor will detect your vehicle.
                          </p>
                        )}

                        {/* Bollard visual */}
                        <div className="flex justify-center mb-4">
                          <div className="relative flex flex-col items-center">
                            <div className={`w-8 rounded-t-full transition-all duration-500 ${
                              selectedSlot.bollardUp
                                ? "h-16 bg-gradient-to-b from-red-500 to-red-700"
                                : "h-4 bg-gradient-to-b from-green-500 to-green-700"
                            }`} />
                            <div className="w-12 h-3 bg-slate-600 rounded" />
                            <p className="text-slate-500 text-xs mt-1">
                              {selectedSlot.bollardUp ? "Blocking entry" : "Entry open"}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => handleBollardToggle(selectedSlot)}
                          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-colors ${
                            selectedSlot.bollardUp
                              ? "bg-green-600 hover:bg-green-700 text-white"
                              : "bg-red-600 hover:bg-red-700 text-white"
                          }`}
                        >
                          {selectedSlot.bollardUp ? (
                            <><ArrowDown className="w-4 h-4" /> Lower Bollard</>
                          ) : (
                            <><ArrowUp className="w-4 h-4" /> Raise Bollard</>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {selectedSlot.status === "available" && (
                  <button
                    onClick={() => {
                      handleReserve(selectedSlot)
                      setSelectedSlot(null) // Close modal so user sees main dashboard update
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                  >
                    Reserve This Slot
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}