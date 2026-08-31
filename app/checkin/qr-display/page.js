'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { QrCode, Sparkles, RefreshCw, ShieldCheck, Clock, Store } from 'lucide-react';

export default function ShopQRDisplay() {
  const [tokenData, setTokenData] = useState(null);
  const [countdown, setCountdown] = useState(15);
  const [loading, setLoading] = useState(true);

  const fetchToken = async () => {
    try {
      const res = await fetch('/api/checkins/shop-token');
      const json = await res.json();
      if (json.success) {
        setTokenData(json);
        setCountdown(json.expiresInSeconds || 15);
      }
    } catch (e) {
      console.error("Fetch shop token error:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchToken();
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchToken();
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const qrUrl = tokenData?.token 
    ? `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(tokenData.token)}&color=0-0-0&bgcolor=255-255-255`
    : '';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 select-none font-sans relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Display Container */}
      <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-indigo-900/40 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center space-y-6 relative z-10">
        
        {/* Header */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-black tracking-widest uppercase text-indigo-400 bg-indigo-500/10 px-3.5 py-1 rounded-full border border-indigo-500/20">
            <Store className="w-3.5 h-3.5" />
            In The Haus (Nakhon Phanom)
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            จุดลงเวลาเข้า-ออกงาน
          </h1>
          <p className="text-xs text-slate-400 font-medium">
            เปิดกล้องหรือแอป Check-in ใน LINE แล้วสแกนเพื่อยืนยันตัวตน
          </p>
        </div>

        {/* QR Code Frame */}
        <div className="relative p-4 bg-white rounded-3xl shadow-xl border-4 border-indigo-500/30">
          {loading ? (
            <div className="w-64 h-64 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
              <span className="text-xs font-bold text-slate-700">กำลังสร้างรหัสความปลอดภัย...</span>
            </div>
          ) : qrUrl ? (
            <motion.div
              key={tokenData?.token}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="relative"
            >
              <img
                src={qrUrl}
                alt="Shop Dynamic QR"
                className="w-64 h-64 object-contain rounded-xl"
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-12 h-12 bg-white/95 rounded-xl p-1.5 shadow-lg border border-slate-200 flex items-center justify-center">
                  <ShieldCheck className="w-7 h-7 text-indigo-600" />
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="w-64 h-64 flex items-center justify-center text-slate-400 text-xs font-bold">
              ไม่สามารถโหลด QR Code ได้
            </div>
          )}
        </div>

        {/* Countdown & Security Token Indicator */}
        <div className="w-full space-y-3">
          <div className="flex items-center justify-between px-2 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-slate-300">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>รหัสหมุนเวียนอัตโนมัติ</span>
            </div>
            <div className="font-mono font-black text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-lg border border-amber-500/20">
              {countdown} วินาที
            </div>
          </div>

          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-700">
            <motion.div
              className="h-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-emerald-400"
              animate={{ width: `${(countdown / 15) * 100}%` }}
              transition={{ duration: 1, ease: 'linear' }}
            />
          </div>

          <div className="pt-2 text-[11px] font-mono text-slate-400">
            Token: <span className="font-bold text-indigo-300">{tokenData?.token || '------'}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="text-[10px] text-slate-500 font-mono tracking-wider uppercase border-t border-indigo-900/30 pt-4 w-full">
          ONHAUS DYNAMIC VERIFICATION ENGINE © 2026
        </div>
      </div>
    </div>
  );
}
