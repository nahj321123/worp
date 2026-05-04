"use client";

import { useEffect, useState } from "react";

type ParkingSlot = {
  id: number;
  name: string;
  location: string;
  price: number;
  status: "available" | "reserved" | "occupied";
  reservedBy?: string;
  paid?: boolean;
  bollardUp?: boolean;
};

const DEFAULT_SLOTS: ParkingSlot[] = [
  { id: 1, name: "Slot 1", location: "Session Road",  price: 50, status: "available", bollardUp: true },
  { id: 2, name: "Slot 2", location: "Harrison Road", price: 45, status: "available", bollardUp: true },
  { id: 3, name: "Slot 3", location: "SM Baguio",     price: 60, status: "available", bollardUp: true },
  { id: 4, name: "Slot 4", location: "Cedar Peak",    price: 40, status: "available", bollardUp: true },
  { id: 5, name: "Slot 5", location: "Mabini",        price: 55, status: "available", bollardUp: true },
];

export default function Page() {
  const [slots, setSlots] = useState<ParkingSlot[]>(DEFAULT_SLOTS);
  const userId = "user@test.com";

  // ================= API =================
  const patchApi = async (slotId: number, patch: any) => {
    await fetch(`/api/${slotId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  };

  const fetchSlot = async (id: number) => {
    const res = await fetch(`/api/slot?slotId=${id}`);
    const data = await res.json();

    if (data.ok) {
      return {
        id,
        status: data.status,
        bollardUp: data.bollardUp,
      };
    }
    return null;
  };

  const refreshSlots = async () => {
    const updated = await Promise.all(
      slots.map(async (s) => {
        const fresh = await fetchSlot(s.id);
        return fresh ? { ...s, ...fresh } : s;
      })
    );
    setSlots(updated);
  };

  useEffect(() => {
    const interval = setInterval(refreshSlots, 1000);
    return () => clearInterval(interval);
  }, [slots]);

  // ================= ACTIONS =================
  const reserveSlot = async (slot: ParkingSlot) => {
    await patchApi(slot.id, {
      status: "reserved",
      reservedBy: userId,
    });
  };

  const resetSlot = async (slot: ParkingSlot) => {
    await patchApi(slot.id, {
      status: "available",
      reservedBy: "",
      paid: false,
      bollardUp: true,
    });
  };

  const lowerBollard = async (slot: ParkingSlot) => {
    await patchApi(slot.id, { bollardUp: false });
  };

  const raiseBollard = async (slot: ParkingSlot) => {
    await patchApi(slot.id, { bollardUp: true });
  };

  // ================= UI =================
  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <h1 className="text-3xl font-bold mb-6">🚗 SurePark Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {slots.map((slot) => (
          <div
            key={slot.id}
            className="bg-gray-800 border border-gray-700 rounded-xl p-4 shadow-lg"
          >
            <h2 className="text-lg font-semibold">{slot.name}</h2>
            <p className="text-sm text-gray-400">{slot.location}</p>
            <p className="mt-1">₱{slot.price}/hour</p>

            <p className="mt-2">
              Status:{" "}
              <span
                className={
                  slot.status === "available"
                    ? "text-green-400"
                    : slot.status === "reserved"
                    ? "text-yellow-400"
                    : "text-gray-400"
                }
              >
                {slot.status.toUpperCase()}
              </span>
            </p>

            <p className="mt-1">
              Bollard:{" "}
              <span className="font-semibold">
                {slot.bollardUp ? "UP" : "DOWN"}
              </span>
            </p>

            <div className="flex flex-col gap-2 mt-3">
              <button
                onClick={() => reserveSlot(slot)}
                className="bg-blue-500 hover:bg-blue-600 p-2 rounded"
              >
                Reserve
              </button>

              <button
                onClick={() => resetSlot(slot)}
                className="bg-gray-500 hover:bg-gray-600 p-2 rounded"
              >
                Reset
              </button>

              <button
                onClick={() => lowerBollard(slot)}
                className="bg-red-500 hover:bg-red-600 p-2 rounded"
              >
                Lower
              </button>

              <button
                onClick={() => raiseBollard(slot)}
                className="bg-green-500 hover:bg-green-600 p-2 rounded"
              >
                Raise
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}