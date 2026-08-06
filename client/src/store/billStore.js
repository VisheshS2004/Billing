import { create } from 'zustand';
import { useProductStore } from './productStore';

export const useBillStore = create((set, get) => ({
  billId: null,
  customerName: '',
  priceType: 'retail', // 'retail' or 'wholesale'
  items: [],
  hasPricelessItem: false,

  loadedItemsToVerify: [],
  setLoadedItemsToVerify: (items) => set({ loadedItemsToVerify: items }),

  setCustomerName: (name) => set({ customerName: name }),
  loadBill: (bill, forEditing = false) => {
    if (forEditing) {
      set({
        billId: bill._id,
        customerName: bill.customerName,
        priceType: bill.priceType,
        items: [],
        subtotal: 0,
        grandTotal: 0,
        hasPricelessItem: false,
        loadedItemsToVerify: bill.items
      });
    } else {
      set({
        billId: bill._id,
        customerName: bill.customerName,
        priceType: bill.priceType,
        items: bill.items,
        subtotal: bill.subtotal,
        grandTotal: bill.grandTotal,
        hasPricelessItem: bill.hasPricelessItem,
        loadedItemsToVerify: []
      });
    }
  },

  setPriceType: (type) => {
    set({ priceType: type });
    get().recalculateTotals();
  },

  addItem: (product, qty = 1) => {
    set((state) => {
      // Check if item already in bill
      const existingItem = state.items.find(item => item._id === product._id);
      let newItems;

      if (existingItem) {
        newItems = state.items.map(item =>
          item._id === product._id
            ? { ...item, qty: item.qty + qty }
            : item
        );
      } else {
        newItems = [...state.items, { ...product, qty }];
      }
      return { items: newItems };
    });
    get().recalculateTotals();
  },

  // Add an item that was not found in the database (no price)
  addCustomItem: (name, qty = 1) => {
    const customId = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    set((state) => ({
      items: [
        ...state.items,
        {
          _id: customId,
          name,
          unit: '-',
          priceRetail: null,
          priceWholesale: null,
          qty,
          isCustom: true,
        }
      ]
    }));
    get().recalculateTotals();
  },

  updateQty: (id, qty) => {
    if (qty <= 0) return get().removeItem(id);

    set((state) => ({
      items: state.items.map(item =>
        item._id === id ? { ...item, qty } : item
      )
    }));
    get().recalculateTotals();
  },

  removeItem: (id) => {
    set((state) => ({
      items: state.items.filter(item => item._id !== id)
    }));
    get().recalculateTotals();
  },
  clearBill: () => {
    set({
      billId: null,
      customerName: '',
      items: [],
      subtotal: 0,
      grandTotal: 0,
      hasPricelessItem: false
    });
  },

  updateItemQuality: (id, newQuality) => {
    const products = useProductStore.getState().products;
    set((state) => {
      const updatedItems = state.items.map(item => {
        if (item._id !== id) return item;
        
        // Find other products with the same name
        const candidates = products.filter(p => p.name.toLowerCase() === item.name.toLowerCase());
        // Find matching product with this new quality and the item's current packetSize
        const matched = candidates.find(p => 
          (p.quality || '') === newQuality && 
          (p.packetSize || '') === (item.packetSize || '')
        ) || candidates.find(p => (p.quality || '') === newQuality) || item;

        return {
          ...item,
          _id: matched._id, // Update ID to matched product ID!
          quality: matched.quality || '',
          priceRetail: matched.priceRetail,
          priceWholesale: matched.priceWholesale,
          mrp: matched.mrp
        };
      });

      return { items: updatedItems };
    });
    get().recalculateTotals();
  },

  updateItemPacketSize: (id, newPacketSize) => {
    const products = useProductStore.getState().products;
    set((state) => {
      const updatedItems = state.items.map(item => {
        if (item._id !== id) return item;

        const candidates = products.filter(p => p.name.toLowerCase() === item.name.toLowerCase());
        const matched = candidates.find(p => 
          (p.quality || '') === (item.quality || '') && 
          (p.packetSize || '') === newPacketSize
        ) || candidates.find(p => (p.packetSize || '') === newPacketSize) || item;

        return {
          ...item,
          _id: matched._id,
          packetSize: matched.packetSize || '',
          priceRetail: matched.priceRetail,
          priceWholesale: matched.priceWholesale,
          mrp: matched.mrp
        };
      });

      return { items: updatedItems };
    });
    get().recalculateTotals();
  },
  subtotal: 0,
  grandTotal: 0,

  recalculateTotals: () => {
    set((state) => {
      const isRetail = state.priceType === 'retail';
      let hasPricelessItem = false;
      let total = 0;

      state.items.forEach(item => {
        const price = isRetail ? item.priceRetail : item.priceWholesale;
        if (price == null || price === '') {
          hasPricelessItem = true;
        } else {
          total += price * item.qty;
        }
      });

      return {
        hasPricelessItem,
        subtotal: hasPricelessItem ? null : total,
        grandTotal: hasPricelessItem ? null : total,
      };
    });
  }
}));
