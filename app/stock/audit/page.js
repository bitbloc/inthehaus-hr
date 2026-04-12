'use client';

import React, { useState, useEffect } from 'react';
import { Package, Save, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import liff from '@line/liff';

export default function StockAuditPage() {
  const [profile, setProfile] = useState(null);
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID;

  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        if (liff.isLoggedIn()) {
          const prof = await liff.getProfile();
          setProfile(prof);
        } else {
          // In local dev, we might not login
          setProfile({ displayName: 'Dev User' });
          liff.login();
        }
        fetchItems();
      } catch (err) {
        console.error('LIFF Init error', err);
        setErrorMsg("Failed to initialize LINE LIFF. Please try opening via LINE.");
        setLoading(false);
      }
    };
    initLiff();
  }, [LIFF_ID]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stock/items');
      const json = await res.json();
      if (json.success) {
        setItems(json.data);
      } else {
        setErrorMsg(json.error || "Failed to fetch stock load.");
      }
    } catch (err) {
      setErrorMsg("Network error fetching items.");
    }
    setLoading(false);
  };

  const handleInputChange = (id, value) => {
    setCounts(prev => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async () => {
    if (!profile) return;
    setSubmitting(true);
    setErrorMsg("");
    
    // Prepare payload
    const payloadCounts = items.map(item => ({
      id: item.id,
      name: item.name,
      expected: item.current_quantity,
      actual: counts[item.id] !== undefined ? counts[item.id] : item.current_quantity
    }));

    try {
      const res = await fetch('/api/stock/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeName: profile.displayName,
          counts: payloadCounts
        })
      });
      
      const json = await res.json();
      if (json.success) {
        setSuccess(true);
        if (liff.isInClient()) {
           setTimeout(() => liff.closeWindow(), 3000);
        }
      } else {
        setErrorMsg(json.error || "Failed to submit audit.");
      }
    } catch (err) {
      setErrorMsg("Network error submitting audit.");
    }
    setSubmitting(false);
  };

  if (success) {
    return (
      <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-6 text-white font-sans">
        <CheckCircle className="w-20 h-20 text-green-500 mb-6 drop-shadow-[0_0_15px_rgba(34,197,94,0.5)]" />
        <h1 className="text-2xl font-bold mb-2">อัปเดตสต็อกเรียบร้อย!</h1>
        <p className="text-neutral-400 text-center mb-8">ขอบคุณที่ช่วยนับสต็อคค่ะ เมี๊ยว~<br/>รายงานถูกส่งเข้ากลุ่ม LINE แล้ว</p>
        <button onClick={() => liff.closeWindow()} className="w-full max-w-xs bg-neutral-800 border border-neutral-700 py-3 rounded-xl font-bold hover:bg-neutral-700 transition">
          ปิดหน้าต่าง
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-white font-sans pb-24">
      {/* Header */}
      <div className="sticky top-0 bg-neutral-900/80 backdrop-blur-md border-b border-white/10 p-4 z-40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-pink-500 to-orange-400 rounded-lg">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">Stock Audit</h1>
            <p className="text-xs text-neutral-400">{profile?.displayName || 'Loading...'}</p>
          </div>
        </div>
        <button onClick={fetchItems} disabled={loading} className="p-2 bg-neutral-800 rounded-full hover:bg-neutral-700 transition">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="p-4">
        {errorMsg && (
          <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex gap-3 text-red-400 items-start">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{errorMsg}</p>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <RefreshCw className="w-8 h-8 animate-spin text-neutral-500" />
            <p className="text-neutral-500 text-sm">กำลังโหลดรายการสินค้า...</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-neutral-400 mb-2 px-1">กรุณากรอกเฉพาะรายการที่ยอดไม่ตรงกับในระบบ (หากตรงแล้วไม่ต้องกรอก)</p>
            {items.filter(i => i.is_active).map(item => (
              <div key={item.id} className="bg-neutral-800/50 backdrop-blur-sm border border-white/5 rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white truncate">{item.name}</h3>
                  <div className="flex gap-2 text-xs text-neutral-400 mt-1">
                    <span className="bg-neutral-700/50 px-2 py-0.5 rounded-md">อิงระบบ: {item.current_quantity}</span>
                    <span>หน่วย: {item.unit}</span>
                  </div>
                </div>
                <div className="w-24 shrink-0 relative">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder={item.current_quantity.toString()}
                    value={counts[item.id] !== undefined ? counts[item.id] : ''}
                    onChange={(e) => handleInputChange(item.id, e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 rounded-xl px-3 py-2.5 text-center font-semibold text-white placeholder-neutral-600 outline-none transition-all"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-neutral-900 via-neutral-900 to-transparent z-50 pointer-events-none">
        <button 
          onClick={handleSubmit}
          disabled={loading || submitting || items.length === 0}
          className="pointer-events-auto w-full bg-gradient-to-r from-pink-500 to-orange-400 hover:from-pink-600 hover:to-orange-500 text-white font-bold py-4 rounded-2xl shadow-[0_0_30px_rgba(236,72,153,0.3)] flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          <span>ยืนยันการนับสต็อก</span>
        </button>
      </div>
    </div>
  );
}
