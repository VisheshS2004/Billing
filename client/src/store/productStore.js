import { create } from 'zustand';
import axiosClient from '../api/axiosClient';

export const useProductStore = create((set) => ({
  products: [],
  loading: false,
  error: null,
  fetchProducts: async () => {
    set({ loading: true });
    try {
      const res = await axiosClient.get('/products');
      set({ products: res.data.data, loading: false, error: null });
    } catch (err) {
      set({ error: err.response?.data?.message || err.message, loading: false });
    }
  },
  addProduct: async (productData) => {
    const res = await axiosClient.post('/products', productData);
    set((state) => ({ products: [...state.products, res.data.data] }));
  },
  updateProduct: async (id, productData) => {
    const res = await axiosClient.put(`/products/${id}`, productData);
    set((state) => ({
      products: state.products.map(p => p._id === id ? res.data.data : p)
    }));
  },
  deleteProduct: async (id) => {
    await axiosClient.delete(`/products/${id}`);
    set((state) => ({
      products: state.products.filter(p => p._id !== id)
    }));
  }
}));
