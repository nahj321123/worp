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
  const [userId] = useState<string>("user@test.com");

  // ================= PATCH API =================
  const patchApi = async (slotId: number, patch: any) => {
    try {
      await fetch(`/api/${slotId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
      });
    } catch (err) {
      console.error("patchApi error:", err);
    }
  };

  // ================= LOAD FROM FIREBASE =================
  const fetchSlot = async (id: number) => {
    try {
      const res = await fetch(`/api/slot?slotId=${id}`);
      const data = await res.json();

      if (data.ok) {
        return {
          id,
          status: data.status,
          bollardUp: data.bollardUp,
        };
      }
    } catch (err) {
      console.error(err);
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

  // Poll Firebase every 1 sec
  useEffect(() => {
    const interval = setInterval(() => {
      refreshSlots();
    }, 1000);

    return () => clearInterval(interval);
  }, []);

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
    await patchApi(slot.id, {
      bollardUp: false,
    });
  };

  const raiseBollard = async (slot: ParkingSlot) => {
    await patchApi(slot.id, {
      bollardUp: true,
    });
  };

  // ================= UI =================

  const getColor = (status: string) => {
    if (status === "available") return "green";
    if (status === "reserved") return "orange";
    return "gray";
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>🚗 SurePark Dashboard</h1>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {slots.map((slot) => (
          <div
            key={slot.id}
            style={{
              border: "1px solid #ccc",
              borderRadius: 10,
              padding: 15,
              width: 220,
            }}
          >
            <h3>{slot.name}</h3>
            <p>{slot.location}</p>
            <p>₱{slot.price}/hour</p>

            <p>
              Status:{" "}
              <b style={{ color: getColor(slot.status) }}>
                {slot.status.toUpperCase()}
              </b>
            </p>

            <p>
              Bollard:{" "}
              <b>{slot.bollardUp ? "UP" : "DOWN"}</b>
            </p>

            {/* ACTIONS */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <button onClick={() => reserveSlot(slot)}>Reserve</button>
              <button onClick={() => resetSlot(slot)}>Reset</button>
              <button onClick={() => lowerBollard(slot)}>Lower</button>
              <button onClick={() => raiseBollard(slot)}>Raise</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}