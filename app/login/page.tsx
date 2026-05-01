"use client"

import React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { LogIn, UserPlus, Car } from "lucide-react"

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const router = useRouter()

  useEffect(() => {
    // Check if already logged in
    const user = localStorage.getItem("surepark_user")
    if (user) {
      router.push("/dashboard")
    }
  }, [router])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!email || !password) {
      setError("Please fill in all fields")
      return
    }

    if (!isLogin && !name) {
      setError("Please enter your name")
      return
    }

    // Simple email validation
    if (!email.includes("@")) {
      setError("Please enter a valid email")
      return
    }

    if (isLogin) {
      // Login logic - check if user exists
      const users = JSON.parse(localStorage.getItem("surepark_users") || "[]")
      const user = users.find((u: any) => u.email === email && u.password === password)

      if (user) {
        localStorage.setItem("surepark_user", JSON.stringify(user))
        router.push("/dashboard")
      } else {
        setError("Invalid email or password")
      }
    } else {
      // Signup logic
      const users = JSON.parse(localStorage.getItem("surepark_users") || "[]")
      
      // Check if user already exists
      if (users.find((u: any) => u.email === email)) {
        setError("User already exists. Please login.")
        return
      }

      const newUser = { email, password, name }
      users.push(newUser)
      localStorage.setItem("surepark_users", JSON.stringify(users))
      localStorage.setItem("surepark_user", JSON.stringify(newUser))
      router.push("/dashboard")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-600 mb-4">
            <Car className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">SurePark Baguio</h1>
          <p className="text-slate-400">Smart Parking Management System</p>
        </div>

        {/* Auth Card */}
        <div className="bg-slate-800 rounded-lg shadow-xl p-8 border border-slate-700">
          {/* Tab Switcher */}
          <div className="flex gap-2 mb-6 bg-slate-900 rounded-lg p-1">
            <button
              onClick={() => {
                setIsLogin(true)
                setError("")
              }}
              className={`flex-1 py-2 px-4 rounded-md font-medium transition-all ${
                isLogin
                  ? "bg-blue-600 text-white shadow-lg"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <LogIn className="w-4 h-4 inline mr-2" />
              Login
            </button>
            <button
              onClick={() => {
                setIsLogin(false)
                setError("")
              }}
              className={`flex-1 py-2 px-4 rounded-md font-medium transition-all ${
                !isLogin
                  ? "bg-blue-600 text-white shadow-lg"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <UserPlus className="w-4 h-4 inline mr-2" />
              Sign Up
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
                  Full Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200 shadow-lg hover:shadow-xl"
            >
              {isLogin ? "Login" : "Create Account"}
            </button>
          </form>

          {/* Demo Info */}
          <div className="mt-6 pt-6 border-t border-slate-700">
            <p className="text-xs text-slate-400 text-center">
              Demo Mode - Data stored locally in browser
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
