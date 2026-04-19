"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import axiosInstance from "@/lib/axios";

export default function ResetPasswordPage() {
  const router = useRouter();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleResetPassword = async () => {
    // Validation
    if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError("Please fill in all fields.");
      setSuccess("");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setSuccess("");
      return;
    }

    // Basic email validation
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError("Please enter a valid email address.");
      setSuccess("");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      setSuccess("");
      return;
    }

    setIsLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await axiosInstance.post("/reset-password", {
        email: email.trim(),
        password: password,
      });

      if (response.data.success) {
        setSuccess("Password reset successful! Redirecting to login...");
        setTimeout(() => {
          router.push("/login");
        }, 3000);
      } else {
        setError(response.data.message || "Reset failed. Please try again.");
      }
    } catch (err: any) {
      console.error("Reset error:", err);
      
      if (err.response) {
        if (err.response.status === 404) {
          setError("Employee not found with this email.");
        } else if (err.response.status === 422) {
          setError("Please check your input and try again.");
        } else {
          setError(err.response.data?.message || "Reset failed. Please try again.");
        }
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isLoading) {
      handleResetPassword();
    }
  };

  return (
    <div className="relative min-h-screen flex">
      {/* Background with same gradient overlay as login */}
      <div className="absolute inset-0 -z-10">
        <img
          src="/shopping-cart.jpg"
          alt="Background"
          className="w-full h-full object-cover object-bottom"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/5 via-white/50 to-white/90"></div>
      </div>

      <div className="relative z-10 ml-auto w-full lg:w-2/5 flex items-center justify-center p-8">
        <div className="w-full max-w-md bg-white backdrop-blur-sm rounded-3xl shadow-2xl p-10 space-y-6">
          <div className="text-center mb-6">
            <h1 className="text-4xl font-bold text-gray-900 mb-2 tracking-tight">
              Reset Password
            </h1>
            <p className="text-base text-gray-500">
              Enter your details to secure your account
            </p>
          </div>

          <div className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block mb-2 text-sm font-semibold text-gray-700">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isLoading || success !== ""}
                className="w-full px-5 py-3 rounded-xl border-2 border-gray-100 bg-gray-50/50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all disabled:opacity-50"
              />
            </div>

            {/* New Password */}
            <div>
              <label htmlFor="password" className="block mb-2 text-sm font-semibold text-gray-700">
                New Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="Enter new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isLoading || success !== ""}
                className="w-full px-5 py-3 rounded-xl border-2 border-gray-100 bg-gray-50/50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all disabled:opacity-50"
              />
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block mb-2 text-sm font-semibold text-gray-700">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isLoading || success !== ""}
                className="w-full px-5 py-3 rounded-xl border-2 border-gray-100 bg-gray-50/50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all disabled:opacity-50"
              />
            </div>

            {/* Feedback Messages */}
            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
                <p className="text-red-700 text-sm font-medium">{error}</p>
              </div>
            )}
            
            {success && (
              <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-lg">
                <p className="text-emerald-700 text-sm font-medium">{success}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={isLoading || success !== ""}
              className="w-full bg-gray-900 text-white py-4 rounded-xl font-semibold hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 mt-4 disabled:opacity-50 disabled:transform-none"
            >
              {isLoading ? "Processing..." : "Reset Password"}
            </button>
            
            <div className="text-center pt-2">
              <a href="/login" className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors">
                Back to Login
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
