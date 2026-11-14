'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, ShieldCheck, Clock, Store, Wifi } from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

export default function ShopQRDisplay() {
  const [tokenData, setTokenData] = useState(null);
  const [countdown, setCountdown] = useState(15);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(null);

  const fetchToken = useCallback(async () => {
    try {
      const res = await fetch('/api/checkins/shop-token');
      const json = await res.json();
      if (json.success) {
        setTokenData(json);
        setCountdown(json.expiresInSeconds || 15);
      }
    } catch (e) {
      console.error("Fetch shop token error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setCurrentTime(new Date());
    fetchToken();
    const interval = setInterval(() => {
      setCurrentTime(new Date());
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchToken();
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [fetchToken]);

  const qrUrl = tokenData?.token 
    ? `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(tokenData.token)}&color=25-25-24&bgcolor=255-255-255`
    : '';

  return (
    <div className="min-h-screen bg-rams-bg text-rams-ink flex flex-col items-center justify-center p-6 select-none font-sans">
      {/* Main Braun / Dieter Rams Terminal Container */}
      <div className="w-full max-w-md bg-rams-panel border-2 border-rams-rule rounded-sm p-7 shadow-[0_4px_0_0_var(--color-rams-rule)] flex flex-col items-center text-center space-y-6 relative">
        
        {/* Top Hardware Bezel Header */}
        <div className="w-full flex items-center justify-between border-b border-rams-rule-light pb-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rams-green animate-pulse" />
            <span className="text-[11px] font-mono font-bold tracking-widest uppercase text-rams-ink">
              IN THE HAUS · POS TERMINAL
            </span>
          </div>
          <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 bg-rams-bg border border-rams-rule-light rounded-sm text-rams-ink-muted">
            STATION 01
          </span>
        </div>

        {/* Digital Clock Readout */}
        <div className="w-full bg-rams-bg border border-rams-rule p-4 rounded-sm">
          <div className="text-4xl font-mono font-bold text-rams-ink tracking-tight leading-none">
            {currentTime ? format(currentTime, 'HH:mm:ss') : '--:--:--'}
          </div>
          <div className="text-[11px] font-mono font-bold text-rams-ink-muted uppercase tracking-wider mt-1.5">
            {currentTime ? format(currentTime, 'EEEE d MMMM yyyy', { locale: th }) : 'SYSTEM INITIALIZING'}
          </div>
        </div>

        {/* Title */}
        <div className="space-y-1">
          <h1 className="text-lg font-mono font-bold text-rams-ink uppercase tracking-wide">
            จุดยืนยันพิกัดลงเวลาเข้า-ออกงาน
          </h1>
          <p className="text-xs text-rams-ink-muted">
            สแกนรหัส QR ด้านล่าง หรือแตะแผ่น NFC ที่เคาน์เตอร์บาร์
          </p>
        </div>

        {/* QR Code Frame */}
        <div className="relative p-4 bg-white rounded-sm border-2 border-rams-rule shadow-[0_2px_0_0_var(--color-rams-rule)]">
          {loading ? (
            <div className="w-60 h-60 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-7 h-7 text-rams-orange animate-spin" />
              <span className="text-xs font-mono font-bold text-rams-ink-muted">GENERATING TOKEN...</span>
            </div>
          ) : qrUrl ? (
            <motion.div
              key={tokenData?.token}
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.15 }}
              className="relative"
            >
              <img
                src={qrUrl}
                alt="Shop Dynamic QR"
                className="w-60 h-60 object-contain"
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-11 h-11 bg-rams-panel rounded-sm p-1.5 border-2 border-rams-rule flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-rams-orange" />
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="w-60 h-60 flex items-center justify-center text-rams-ink-muted text-xs font-mono font-bold">
              QR TOKEN UNAVAILABLE
            </div>
          )}
        </div>

        {/* Countdown & Security Token Indicator */}
        <div className="w-full space-y-2.5 bg-rams-bg border border-rams-rule-light p-3.5 rounded-sm">
          <div className="flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-1.5 font-bold text-rams-ink">
              <Clock className="w-3.5 h-3.5 text-rams-orange" />
              <span>AUTO-ROTATE</span>
            </div>
            <div className="font-mono font-bold text-rams-ink bg-rams-panel px-2.5 py-0.5 rounded-sm border border-rams-rule-light">
              {countdown}s
            </div>
          </div>

          <div className="w-full bg-rams-panel h-2 rounded-sm overflow-hidden border border-rams-rule-light">
            <motion.div
              className="h-full bg-rams-orange"
              animate={{ width: `${(countdown / 15) * 100}%` }}
              transition={{ duration: 0.9, ease: 'linear' }}
            />
          </div>

          <div className="pt-1 flex items-center justify-between text-[11px] font-mono text-rams-ink-muted">
            <span>KEY ID:</span>
            <span className="font-bold text-rams-ink tracking-wider">{tokenData?.token || '------'}</span>
          </div>
        </div>

        {/* NFC Hardware Hint */}
        <div className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-rams-orange/10 border border-rams-orange/30 rounded-sm text-[11px] font-mono font-bold text-rams-orange">
          <Wifi className="w-3.5 h-3.5 rotate-90" />
          <span>รองรับการแตะแผ่น NFC (TAP-TO-PUNCH) ที่บาร์</span>
        </div>

        {/* Footer */}
        <div className="text-[10px] text-rams-ink-muted font-mono tracking-widest uppercase border-t border-rams-rule-light pt-3 w-full">
          ONHAUS HARDWARE VERIFICATION · VER 2.6
        </div>
      </div>
    </div>
  );
}
