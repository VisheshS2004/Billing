import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axiosClient from '../api/axiosClient';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: async (email, password) => {
        const res = await axiosClient.post('/auth/login', { email, password });
        if (res.data.requireOtp) {
          return { requireOtp: true, email: res.data.email };
        }
        set({
          user: res.data.data.user,
          token: res.data.data.token,
          isAuthenticated: true,
        });
        return { success: true, role: res.data.data.user.role };
      },
      verifyOtp: async (email, otp) => {
        const res = await axiosClient.post('/auth/verify-otp', { email, otp });
        set({
          user: res.data.data.user,
          token: res.data.data.token,
          isAuthenticated: true,
        });
        return { success: true };
      },
      logout: () => {
        set({ user: null, token: null, isAuthenticated: false });
      },
    }),
    {
      name: 'auth', // name of item in storage (must be unique)
    }
  )
);
