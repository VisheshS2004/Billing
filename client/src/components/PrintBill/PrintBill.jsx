import { useEffect } from 'react';
import { useBillStore } from '../../store/billStore';
import './PrintBill.css';

const BILL_UNIT_MAP = {
  piece: 'pc',
  packet: 'pkt',
  patty: 'pati',
};

function formatBillUnit(unit) {
  if (!unit) return '';
  const lower = unit.toLowerCase();
  return BILL_UNIT_MAP[lower] || unit;
}

const PrintBill = () => {
  const { customerName, priceType, items, grandTotal } = useBillStore();

  useEffect(() => {
    const clearTitle = () => { document.title = ''; };
    window.addEventListener('beforeprint', clearTitle);
    window.addEventListener('afterprint', clearTitle);
    return () => {
      window.removeEventListener('beforeprint', clearTitle);
      window.removeEventListener('afterprint', clearTitle);
    };
  }, []);

  const dateTimeStr = new Date().toLocaleString('en-IN', { 
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true 
  });

  return (
    <div id="print-bill-container">
      <div className="print-bill-receipt">
        <div className="receipt-meta">
          <div>
            <span>Customer:</span> {customerName || 'Cash'}
          </div>
          <div>
            <span>Date/Time:</span> {dateTimeStr}
          </div>
        </div>

        <table className="receipt-table">
          <thead>
            <tr>
              <th style={{textAlign:'left'}}>Amount</th>
              <th style={{textAlign:'left'}}>Item</th>
              <th style={{textAlign:'center'}}>MRP</th>
              <th style={{textAlign:'right'}}>Qty</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const rate = priceType === 'retail' ? item.priceRetail : item.priceWholesale;
              const amount = rate * item.qty;

              let mrpDisplay = '-';
              if (item.mrp != null && Number(item.mrp) > 0) {
                mrpDisplay = item.mrp;
              } else if (item.packetSize) {
                mrpDisplay = item.packetSize;
              }

              const itemSub = item.quality ? `Qual: ${item.quality}` : null;
              const formattedUnit = formatBillUnit(item.unit);

              return (
                <tr key={item._id}>
                  <td style={{textAlign:'left', fontWeight: '600'}}>₹{amount}</td>
                  <td style={{textAlign:'left'}}>
                    <div style={{ fontWeight: '500' }}>{item.name}</div>
                    {itemSub && (
                      <div style={{ fontSize: '8.5px', fontStyle: 'italic', color: '#444', marginTop: '1px' }}>
                        {itemSub}
                      </div>
                    )}
                  </td>
                  <td style={{textAlign:'center'}}>{mrpDisplay}</td>
                  <td style={{textAlign:'right'}}>{item.qty} {formattedUnit}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="receipt-footer">
          <div className="total-row">
            <strong>Total:</strong>
            <strong>₹ {grandTotal}</strong>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintBill;
