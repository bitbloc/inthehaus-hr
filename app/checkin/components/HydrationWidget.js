"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { sfx } from "../../../utils/soundEffects";

const YUZU_WATER_QUOTES = [
  "อื้มมม... ชื่นใจ! น้ำเย็นเจี๊ยบช่วยให้บาริสต้าสมองแล่น 🧊✨",
  "ยูซุเสิร์ฟน้ำเย็นให้แล้ว ดื่มให้ชื่นใจแล้วลุยงานเลยนะเมี๊ยว~ 🐾",
  "อากาศนครพนมร้อนแบบนี้ อย่าลืมจิบน้ำเรื่อยๆ นะทาส! 💧",
  "กาแฟดี... เริ่มต้นจากบาริสต้าที่ชุ่มชื้นและอารมณ์ดี! ☕🌊",
  "ยูซุเติมน้ำแข็งก้อนใหญ่ให้เป๊าะๆ ชาร์จพลัง 100% พร้อมรับออเดอร์! 🐱⚡",
  "ดื่มน้ำเยอะๆ ผิวใส ยิ้มหวานต้อนรับลูกค้าที่หน้าร้านนะจ๊ะ ☀️"
];

export default function HydrationWidget({ className = "" }) {
  const [glassesToday, setGlassesToday] = useState(0);
  const [isDrinking, setIsDrinking] = useState(false);
  const [quote, setQuote] = useState(YUZU_WATER_QUOTES[0]);
  const [bubbles, setBubbles] = useState([]);

  // Load today's count safely
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      try {
        const todayKey = `haus_water_${new Date().toISOString().slice(0, 10)}`;
        const saved = localStorage.getItem(todayKey);
        if (saved && active) {
          setGlassesToday(parseInt(saved, 10) || 0);
        }
      } catch {
        // storage blocked
      }
    }, 0);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  const handleDrink = () => {
    if (isDrinking) return;
    setIsDrinking(true);

    // Audio & Haptic feedback
    sfx.playWaterDrop();
    sfx.triggerHaptic([15, 40, 15]);

    // Update count
    const nextCount = glassesToday + 1;
    setGlassesToday(nextCount);
    try {
      const todayKey = `haus_water_${new Date().toISOString().slice(0, 10)}`;
      localStorage.setItem(todayKey, nextCount.toString());
    } catch {
      // storage blocked
    }

    // Random quote
    const nextQuote = YUZU_WATER_QUOTES[Math.floor(Math.random() * YUZU_WATER_QUOTES.length)];
    setQuote(nextQuote);

    // Spawn splash bubble particles
    const newBubbles = Array.from({ length: 4 }).map((_, i) => ({
      id: Date.now() + i,
      x: (Math.random() - 0.5) * 60,
      y: -15 - Math.random() * 25,
      emoji: Math.random() > 0.5 ? "💧" : "🧊"
    }));
    setBubbles(newBubbles);

    setTimeout(() => {
      setIsDrinking(false);
    }, 700);

    setTimeout(() => {
      setBubbles([]);
    }, 1200);
  };

  return (
    <div className={`w-full bg-rams-panel border border-rams-rule-light rounded-sm p-3.5 select-none relative overflow-hidden ${className}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-rams-rule-light">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse"></span>
          <span className="text-[10px] font-mono font-extrabold text-rams-ink uppercase tracking-widest">
            HAUS HYDRATION // น้ำเย็นเติมพลัง
          </span>
        </div>
        <div className="flex items-center gap-1 bg-rams-bg px-2 py-0.5 rounded-sm border border-rams-rule-light">
          <span className="text-[10px] font-mono font-extrabold text-sky-600">
            {glassesToday > 0 ? `จิบไปแล้ว ${glassesToday} แก้ว 💧` : "ยังไม่ได้จิบน้ำ"}
          </span>
        </div>
      </div>

      {/* Main interactive area */}
      <div className="flex items-center gap-3.5">
        {/* Animated Glass of Cold Water */}
        <motion.div
          onClick={handleDrink}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.94 }}
          animate={isDrinking ? { y: [0, 4, -4, 0], rotate: [-2, 3, -1, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="relative w-14 h-16 shrink-0 bg-sky-500/10 border-2 border-rams-rule rounded-b-lg rounded-t-xs flex flex-col justify-end p-1 cursor-pointer group shadow-xs tactile-btn-sm"
          title="แตะเพื่อจิบน้ำเย็นเจี๊ยบ!"
        >
          {/* Glass Rim highlight */}
          <div className="absolute top-0 inset-x-0 h-1 bg-white/40 border-b border-rams-rule/30"></div>

          {/* Floating Ice Cubes */}
          <div className="absolute inset-x-1 top-2.5 flex justify-around pointer-events-none">
            <motion.div
              animate={{ y: isDrinking ? [0, 5, -2, 0] : [0, -3, 0], rotate: [0, 12, 0] }}
              transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
              className="w-3.5 h-3.5 bg-white/80 border border-rams-rule/40 rounded-xs shadow-xs"
            />
            <motion.div
              animate={{ y: isDrinking ? [0, 6, -3, 0] : [0, -4, 0], rotate: [15, -8, 15] }}
              transition={{ repeat: Infinity, duration: 2.8, ease: "easeInOut", delay: 0.4 }}
              className="w-3 h-3 bg-white/75 border border-rams-rule/40 rounded-xs shadow-xs"
            />
          </div>

          {/* Animated Water Surface Waves */}
          <motion.div
            animate={{ height: ["65%", "68%", "65%"] }}
            transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
            className="w-full bg-gradient-to-t from-sky-500/35 to-sky-400/20 border-t border-sky-400/60 rounded-b-md relative overflow-hidden"
          >
            {/* Tiny rising bubbles */}
            <motion.div
              animate={{ y: [15, -5], opacity: [0, 0.7, 0] }}
              transition={{ repeat: Infinity, duration: 1.8, ease: "linear" }}
              className="w-1 h-1 rounded-full bg-white/80 absolute left-2"
            />
            <motion.div
              animate={{ y: [15, -5], opacity: [0, 0.8, 0] }}
              transition={{ repeat: Infinity, duration: 2.2, ease: "linear", delay: 0.7 }}
              className="w-1.5 h-1.5 rounded-full bg-white/80 absolute right-2"
            />
          </motion.div>

          {/* Condensation water droplets on glass */}
          <div className="absolute left-0.5 top-5 w-0.5 h-1 bg-white/60 rounded-full"></div>
          <div className="absolute right-0.5 top-7 w-0.5 h-1.5 bg-white/60 rounded-full"></div>

          {/* Splash particles on tap */}
          <AnimatePresence>
            {bubbles.map((b) => (
              <motion.span
                key={b.id}
                initial={{ opacity: 1, scale: 0.5, x: 0, y: 0 }}
                animate={{ opacity: 0, scale: 1.2, x: b.x, y: b.y }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="absolute left-1/2 top-1 pointer-events-none text-xs"
              >
                {b.emoji}
              </motion.span>
            ))}
          </AnimatePresence>
        </motion.div>

        {/* Text & Yuzu quote */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-mono font-bold text-rams-ink">
              แก้วน้ำเย็นเจี๊ยบจากยูซุ 🐾
            </span>
            <button
              onClick={handleDrink}
              disabled={isDrinking}
              className="text-[10px] font-mono font-extrabold text-sky-700 bg-sky-50 hover:bg-sky-100 active:translate-y-[1px] px-2 py-0.5 border border-sky-200 rounded-sm transition-[transform,background-color] tactile-btn-sm"
            >
              {isDrinking ? "กำลังจิบ... 💧" : "แตะเพื่อจิบ 🧊"}
            </button>
          </div>
          <p className="text-[11px] font-sans text-rams-ink-muted leading-relaxed line-clamp-2">
            &ldquo;{quote}&rdquo;
          </p>
        </div>
      </div>
    </div>
  );
}

