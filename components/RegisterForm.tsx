// components/RegisterForm.tsx
"use client"

import { register } from "@/app/actions/auth";
import { useActionState } from "react";

const initialState = { error: "" };

export default function RegisterForm() {
  const [state, formAction] = useActionState(register, initialState);

  return (
    <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md">
      <h2 className="text-2xl font-semibold mb-6 text-gray-800">Create an Account</h2>
      <form action={formAction}>
        <div className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-gray-700 text-sm font-bold mb-2">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              placeholder="Your email address"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-gray-700 text-sm font-bold mb-2">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              placeholder="Your password"
            />
          </div>
          {state.error && (
            <p className="text-red-500 text-sm italic">{state.error}</p>
          )}
          <button
            type="submit"
            className=" bg-white border border-blue-500 hover:bg-blue-100 text-blue-500  py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full"
          >
            Register
          </button>
        </div>
      </form>
    </div>
  );
}