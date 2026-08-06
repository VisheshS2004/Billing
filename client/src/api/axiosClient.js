import axios from 'axios';

const axiosClient = axios.create({
  baseURL: 'http://192.168.31.16:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Request: attach JWT token from Zustand persisted store ──────────────
axiosClient.interceptors.request.use(
  (config) => {
    const raw = localStorage.getItem('auth');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const token = parsed?.state?.token;
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch {
        // corrupted storage — ignore
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response: handle 401 (expired/invalid token) → force logout ─────────
axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear persisted auth state
      localStorage.removeItem('auth');
      // Redirect to login page
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

export default axiosClient;
