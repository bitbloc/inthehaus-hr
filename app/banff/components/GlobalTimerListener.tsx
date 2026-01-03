'use client';

import { useEffect, useRef } from 'react';
import { useBanffStore } from '@/store/useBanffStore';

export default function GlobalTimerListener() {
    const { timer, checkTimer } = useBanffStore();
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        // Initialize simple beep sound or load a file
        // For simplicity and no assets needed, we can use a generated beep or a CDN file
        // Or better, just a simple Audio object if we have a file.
        // I will use a simple online beep sound or handle it via AudioContext for "no assets" dependency.
        // Actually, let's try to use a base64 Data URI for a simple bell/chime.
    }, []);

    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (timer.active && timer.endTime) {
            interval = setInterval(() => {
                const now = Date.now();
                if (now >= timer.endTime!) {
                    // Timer finished
                    checkTimer(); // This sets active to false in store
                    playNotificationSound();

                    // Optional: Show browser notification
                    if (Notification.permission === 'granted') {
                        new Notification("Time's up!", {
                            body: `${timer.habitTitle || 'Focus Session'} Complete`
                        });
                    } else if (Notification.permission !== 'denied') {
                        Notification.requestPermission();
                    }
                }
            }, 1000);
        }

        return () => clearInterval(interval);
    }, [timer.active, timer.endTime, checkTimer, timer.habitTitle]);

    const playNotificationSound = () => {
        try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContext) return;

            const ctx = new AudioContext();
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5
            oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5); // Drop to A4

            gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.5);
        } catch (e) {
            console.error("Audio beep failed", e);
        }
    };

    return null; // Invisible component
}
