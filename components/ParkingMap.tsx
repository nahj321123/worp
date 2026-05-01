"use client"

import { useEffect, useRef, useState } from "react"
import { Navigation, X, Clock, Route } from "lucide-react"

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
  activated?: boolean
}

interface LocationMeta {
  name: string
  lat: number
  lng: number
}

const LOCATION_COORDS: LocationMeta[] = [
  { name: "Session Road",  lat: 16.4122, lng: 120.5930 },
  { name: "Harrison Road", lat: 16.4098, lng: 120.5960 },
  { name: "SM Baguio",     lat: 16.4063, lng: 120.5993 },
  { name: "Cedar Peak",    lat: 16.4145, lng: 120.5880 },
  { name: "Mabini",        lat: 16.4081, lng: 120.5910 },
]

interface RouteInfo {
  destination: string
  distanceKm: string
  durationMin: string
}

interface ParkingMapProps {
  slots: ParkingSlot[]
  onLocationClick: (location: string) => void
  selectedLocation: string
}

export default function ParkingMap({ slots, onLocationClick, selectedLocation }: ParkingMapProps) {
  const mapRef        = useRef<HTMLDivElement>(null)
  const leafletMapRef = useRef<any>(null)
  const markersRef    = useRef<any[]>([])
  const routeLayerRef = useRef<any>(null)
  const userMarkerRef = useRef<any>(null)

  const [routeInfo, setRouteInfo]       = useState<RouteInfo | null>(null)
  const [routeError, setRouteError]     = useState<string | null>(null)
  const [loadingRoute, setLoadingRoute] = useState(false)
  const [userPos, setUserPos]           = useState<{ lat: number; lng: number } | null>(null)

  // ── helpers ──────────────────────────────────────────────────────────────
  const getStatusColor = (status: string) =>
    status === "available" ? "#22c55e" : status === "reserved" ? "#eab308" : "#ef4444"

  const buildIconHtml = (color: string, isSelected: boolean) => {
    const size    = isSelected ? 64 : 52
    const outline = isSelected ? "#fff" : "#1e293b"
    const stroke  = isSelected ? 3 : 2
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
        <circle cx="16" cy="13" r="10" fill="${color}" stroke="${outline}" stroke-width="${stroke}"/>
        <polygon points="16,29 9,18 23,18" fill="${color}" stroke="${outline}" stroke-width="${stroke}" stroke-linejoin="round"/>
        <circle cx="16" cy="13" r="5.5" fill="white" opacity="0.95"/>
        <text x="16" y="17" text-anchor="middle" font-size="7.5" font-weight="bold" fill="${color}">P</text>
      </svg>`
  }

  const userIconHtml = () => `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r="12" fill="#3b82f6" stroke="#fff" stroke-width="2.5"/>
      <circle cx="14" cy="14" r="5" fill="white"/>
      <circle cx="14" cy="14" r="13" fill="none" stroke="#3b82f6" stroke-width="1" opacity="0.4"/>
    </svg>`

  // ── fetch OSRM route (no API key needed) ─────────────────────────────────
  const fetchRoute = async (
    L: any,
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    destName: string,
  ) => {
    setLoadingRoute(true)
    setRouteError(null)
    setRouteInfo(null)

    // Clear previous route
    if (routeLayerRef.current) {
      leafletMapRef.current?.removeLayer(routeLayerRef.current)
      routeLayerRef.current = null
    }

    try {
      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${fromLng},${fromLat};${toLng},${toLat}` +
        `?overview=full&geometries=geojson&steps=false`

      const res  = await fetch(url)
      const data = await res.json()

      if (data.code !== "Ok" || !data.routes?.length) {
        throw new Error("No route found between these points.")
      }

      const route    = data.routes[0]
      const coords   = route.geometry.coordinates.map(([lng, lat]: number[]) => [lat, lng])
      const distKm   = (route.distance / 1000).toFixed(1)
      const durMin   = Math.ceil(route.duration / 60)

      // Draw animated route polyline
      const polyline = L.polyline(coords, {
        color:     "#3b82f6",
        weight:    5,
        opacity:   0.85,
        lineJoin:  "round",
        lineCap:   "round",
        dashArray: "1, 8",
      }).addTo(leafletMapRef.current)

      routeLayerRef.current = polyline

      // Fit map to show full route
      leafletMapRef.current.fitBounds(polyline.getBounds(), { padding: [40, 40] })

      setRouteInfo({ destination: destName, distanceKm: distKm, durationMin: String(durMin) })
    } catch (err: any) {
      setRouteError(err.message ?? "Failed to fetch route. Check your connection.")
    } finally {
      setLoadingRoute(false)
    }
  }

  // ── clear route ───────────────────────────────────────────────────────────
  const clearRoute = () => {
    if (routeLayerRef.current && leafletMapRef.current) {
      leafletMapRef.current.removeLayer(routeLayerRef.current)
      routeLayerRef.current = null
    }
    setRouteInfo(null)
    setRouteError(null)
  }

  // ── get user GPS then fetch route ─────────────────────────────────────────
  const handleGetDirections = (locName: string) => {
    const dest = LOCATION_COORDS.find((l) => l.name === locName)
    if (!dest) return

    import("leaflet").then((L) => {
      if (!navigator.geolocation) {
        setRouteError("Geolocation is not supported by your browser.")
        return
      }

      setLoadingRoute(true)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords
          setUserPos({ lat: latitude, lng: longitude })

          // Place / move user marker
          const uIcon = L.divIcon({
            className:  "",
            html:       userIconHtml(),
            iconSize:   [28, 28],
            iconAnchor: [14, 14],
          })

          if (userMarkerRef.current) {
            userMarkerRef.current.setLatLng([latitude, longitude])
          } else {
            userMarkerRef.current = L.marker([latitude, longitude], { icon: uIcon })
              .addTo(leafletMapRef.current)
              .bindTooltip("You are here", { direction: "top", permanent: false })
          }

          fetchRoute(L, latitude, longitude, dest.lat, dest.lng, locName)
        },
        (err) => {
          setLoadingRoute(false)
          // Geolocation denied — use a simulated position in central Baguio for demo
          const demoLat = 16.4120
          const demoLng = 120.5948
          setUserPos({ lat: demoLat, lng: demoLng })

          const uIcon = L.divIcon({
            className:  "",
            html:       userIconHtml(),
            iconSize:   [28, 28],
            iconAnchor: [14, 14],
          })

          if (userMarkerRef.current) {
            userMarkerRef.current.setLatLng([demoLat, demoLng])
          } else {
            userMarkerRef.current = L.marker([demoLat, demoLng], { icon: uIcon })
              .addTo(leafletMapRef.current)
              .bindTooltip("Demo position (GPS denied)", { direction: "top", permanent: false })
          }

          fetchRoute(L, demoLat, demoLng, dest.lat, dest.lng, locName)
        },
        { timeout: 8000, enableHighAccuracy: true },
      )
    })
  }

  // ── expose handleGetDirections globally so popup button can call it ────────
  useEffect(() => {
    ;(window as any).__sureparkDirections = handleGetDirections
    return () => { delete (window as any).__sureparkDirections }
  })

  // ── init map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return

    // Destroy any existing map instance on this DOM node before reinitializing.
    // React StrictMode double-invokes effects; without this the second call
    // throws "Map container is already initialized."
    if (leafletMapRef.current) {
      leafletMapRef.current.remove()
      leafletMapRef.current = null
      markersRef.current    = []
      routeLayerRef.current = null
      userMarkerRef.current = null
    }

    // Remove Leaflet's internal id from the container so it treats it as fresh
    if ((mapRef.current as any)._leaflet_id) {
      delete (mapRef.current as any)._leaflet_id
    }

    // Inject Leaflet CSS once into <head> — most reliable method for Next.js
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link")
      link.id    = "leaflet-css"
      link.rel   = "stylesheet"
      link.href  = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      document.head.appendChild(link)
    }

    import("leaflet").then((L) => {
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      })

      const map = L.map(mapRef.current!, {
        center:          [16.4095, 120.5945],
        zoom:            15,
        zoomControl:     true,
        scrollWheelZoom: true,
      })

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      leafletMapRef.current = map

      // Force Leaflet to recalculate its container size after mount
      setTimeout(() => map.invalidateSize(), 100)

      LOCATION_COORDS.forEach((loc) => {
        const slot       = slots.find((s) => s.location === loc.name)
        const status     = slot?.status ?? "available"
        const color      = getStatusColor(status)
        const isSelected = selectedLocation === loc.name

        const icon = L.divIcon({
          className:   "",
          html:        buildIconHtml(color, isSelected),
          iconSize:    [isSelected ? 64 : 52, isSelected ? 64 : 52],
          iconAnchor:  [isSelected ? 32 : 26, isSelected ? 64 : 52],
          popupAnchor: [0, isSelected ? -64 : -52],
        })

        const marker = L.marker([loc.lat, loc.lng], { icon })
          .addTo(map)
          .bindPopup(buildPopup(loc.name, slot), {
            className:   "surepark-popup",
            maxWidth:    240,
            closeButton: true,
          })

        marker.on("click", () => onLocationClick(loc.name))
        markersRef.current.push({ name: loc.name, marker })
      })
    })

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove()
        leafletMapRef.current = null
        markersRef.current    = []
        routeLayerRef.current = null
        userMarkerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── invalidate size when container resizes (handles show/hide toggle) ────
  useEffect(() => {
    if (!mapRef.current) return
    const observer = new ResizeObserver(() => {
      if (leafletMapRef.current) leafletMapRef.current.invalidateSize()
    })
    observer.observe(mapRef.current)
    return () => observer.disconnect()
  }, [])

  // ── update markers on slot/selection change ───────────────────────────────
  useEffect(() => {
    if (!leafletMapRef.current) return

    import("leaflet").then((L) => {
      markersRef.current.forEach(({ name, marker }) => {
        const slot       = slots.find((s) => s.location === name)
        const status     = slot?.status ?? "available"
        const color      = getStatusColor(status)
        const isSelected = selectedLocation === name

        const icon = L.divIcon({
          className:   "",
          html:        buildIconHtml(color, isSelected),
          iconSize:    [isSelected ? 64 : 52, isSelected ? 64 : 52],
          iconAnchor:  [isSelected ? 32 : 26, isSelected ? 64 : 52],
          popupAnchor: [0, isSelected ? -64 : -52],
        })

        marker.setIcon(icon)
        marker.setPopupContent(buildPopup(name, slot))

        if (isSelected) marker.openPopup()
        else marker.closePopup()
      })
    })
  }, [slots, selectedLocation])

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="relative w-full rounded-xl border border-slate-700 shadow-xl"
      style={{ zIndex: 0 }}
    >
      {/* Route info bar */}
      {(routeInfo || routeError || loadingRoute) && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[999] min-w-[260px] max-w-[90%]">
          <div className="bg-slate-900/95 backdrop-blur-sm border border-slate-600 rounded-xl px-4 py-3 shadow-2xl">
            {loadingRoute && (
              <div className="flex items-center gap-2 text-blue-400 text-sm">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <span>Calculating route...</span>
              </div>
            )}
            {routeError && !loadingRoute && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-red-400 text-sm">{routeError}</p>
                <button onClick={() => setRouteError(null)} className="text-slate-500 hover:text-slate-300">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            {routeInfo && !loadingRoute && (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Route className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <div>
                    <p className="text-white font-semibold text-sm leading-tight">{routeInfo.destination}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-blue-400 text-xs font-medium">{routeInfo.distanceKm} km</span>
                      <span className="text-slate-600 text-xs">•</span>
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span className="text-slate-400 text-xs">~{routeInfo.durationMin} min</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={clearRoute}
                  className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white transition-colors flex-shrink-0"
                  title="Clear route"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute top-3 right-3 z-[998] bg-slate-900/90 backdrop-blur-sm border border-slate-700 rounded-lg p-3 text-xs space-y-1.5">
        <p className="text-slate-300 font-semibold mb-1.5 text-xs uppercase tracking-wide">Legend</p>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />
          <span className="text-slate-300">Available</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-yellow-500 flex-shrink-0" />
          <span className="text-slate-300">Reserved</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" />
          <span className="text-slate-300">Occupied</span>
        </div>
        <div className="flex items-center gap-2 pt-1 border-t border-slate-700">
          <span className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0" />
          <span className="text-slate-300">You</span>
        </div>
      </div>

      {/* Minimal custom overrides only — real Leaflet CSS loaded via <link> in useEffect */}
      <style>{`
        .leaflet-container { background: #0f172a !important; }
        .surepark-popup .leaflet-popup-content-wrapper {
          background: #1e293b !important; color: #f8fafc !important;
          border: 1px solid #334155 !important; border-radius: 12px !important;
          box-shadow: 0 4px 24px rgba(0,0,0,0.5) !important; padding: 0 !important;
        }
        .surepark-popup .leaflet-popup-content { margin: 0 !important; padding: 0 !important; }
        .surepark-popup .leaflet-popup-tip-container .leaflet-popup-tip { background: #1e293b !important; }
        .surepark-popup .leaflet-popup-close-button { color: #94a3b8 !important; font-size: 16px !important; top: 8px !important; right: 8px !important; }
        .leaflet-control-zoom a { background: #1e293b !important; color: #f8fafc !important; border-color: #334155 !important; }
        .leaflet-control-zoom a:hover { background: #334155 !important; }
        .leaflet-control-attribution { background: rgba(15,23,42,0.85) !important; color: #64748b !important; }
        .leaflet-control-attribution a { color: #94a3b8 !important; }
        .leaflet-tooltip { background: #1e293b !important; border: 1px solid #334155 !important; color: #f8fafc !important; }
        @keyframes dash-move { to { stroke-dashoffset: -20; } }
        .leaflet-overlay-pane path { animation: dash-move 0.6s linear infinite; }
      `}</style>

      <div
        ref={mapRef}
        style={{ height: "440px", width: "100%", borderRadius: "0.75rem", overflow: "hidden", display: "block" }}
      />
    </div>
  )
}

// ── popup HTML builder ────────────────────────────────────────────────────────
function buildPopup(locationName: string, slot: ParkingSlot | undefined): string {
  if (!slot) {
    return `
      <div style="padding:14px 16px;min-width:180px;">
        <div style="font-weight:700;font-size:15px;color:#f8fafc;margin-bottom:4px;">${locationName}</div>
        <div style="color:#94a3b8;font-size:12px;">No slot data</div>
      </div>`
  }

  const statusColor  = slot.status === "available" ? "#22c55e" : slot.status === "reserved" ? "#eab308" : "#ef4444"
  const statusBg     = slot.status === "available" ? "rgba(34,197,94,0.15)" : slot.status === "reserved" ? "rgba(234,179,8,0.15)" : "rgba(239,68,68,0.15)"
  const statusBorder = slot.status === "available" ? "rgba(34,197,94,0.4)"  : slot.status === "reserved" ? "rgba(234,179,8,0.4)"  : "rgba(239,68,68,0.4)"
  const statusLabel  = slot.status === "available" ? "Available" : slot.status === "reserved" ? "Reserved" : "Occupied"

  return `
    <div style="padding:14px 16px;min-width:220px;">
      <div style="margin-bottom:10px;">
        <div style="font-weight:700;font-size:15px;color:#f8fafc;">${slot.name}</div>
        <div style="color:#94a3b8;font-size:12px;margin-top:2px;">&#x1F4CD; ${locationName}</div>
      </div>

      <div style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:600;
        color:${statusColor};background:${statusBg};border:1px solid ${statusBorder};margin-bottom:10px;">
        ${statusLabel.toUpperCase()}
      </div>

      <div style="background:#0f172a;border-radius:8px;padding:10px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="color:#94a3b8;font-size:12px;">Price</span>
          <span style="color:#f8fafc;font-weight:700;font-size:15px;">
            &#x20B1;${slot.price}<span style="font-size:11px;font-weight:400;color:#64748b;">/hr</span>
          </span>
        </div>
        ${slot.reservedBy ? `
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid #1e293b;">
          <div style="color:#94a3b8;font-size:11px;margin-bottom:2px;">Reserved by</div>
          <div style="color:#e2e8f0;font-size:12px;word-break:break-all;">${slot.reservedBy}</div>
        </div>` : ""}
      </div>

      <button
        onclick="window.__sureparkDirections && window.__sureparkDirections('${locationName}')"
        style="
          width:100%;
          display:flex;
          align-items:center;
          justify-content:center;
          gap:6px;
          padding:9px 0;
          background:#2563eb;
          color:#fff;
          border:none;
          border-radius:8px;
          font-size:13px;
          font-weight:600;
          cursor:pointer;
          transition:background 0.15s;
        "
        onmouseover="this.style.background='#1d4ed8'"
        onmouseout="this.style.background='#2563eb'"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="3 11 22 2 13 21 11 13 3 11"/>
        </svg>
        Get Directions
      </button>
    </div>`
}
