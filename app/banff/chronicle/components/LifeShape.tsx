'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import * as d3 from 'd3-shape';

type LifestyleData = {
    id?: string;
    name: string;
    normalized_score: number; // 0-100
    color?: string;
};

interface LifeShapeProps {
    data: LifestyleData[];
    width?: number;
    height?: number;
}

export default function LifeShape({ data, width = 300, height = 300 }: LifeShapeProps) {
    const radius = Math.min(width, height) / 2;

    // Generate the path data
    const pathData = useMemo(() => {
        if (!data || data.length < 3) return ''; // Need at least 3 points for a shape

        const lineGenerator = d3.lineRadial<LifestyleData>()
            .angle((d, i) => (i / data.length) * 2 * Math.PI) // Angle based on index
            .radius((d) => (d.normalized_score / 100) * radius) // Radius based on score
            .curve(d3.curveCatmullRomClosed); // Organic curve

        return lineGenerator(data) || '';
    }, [data, radius]);

    if (!data || data.length === 0) {
        return <div className="text-zinc-500 text-sm">No lifestyle data yet.</div>;
    }

    return (
        <div className="relative flex flex-col items-center justify-center">
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                <g transform={`translate(${width / 2}, ${height / 2})`}>
                    {/* Background Guide Circles */}
                    <circle r={radius} fill="none" stroke="#27272a" strokeWidth={1} strokeDasharray="4 4" />
                    <circle r={radius * 0.5} fill="none" stroke="#27272a" strokeWidth={1} strokeDasharray="2 2" />

                    {/* The Blob */}
                    <motion.path
                        d={pathData}
                        fill="url(#blobGradient)"
                        stroke="#10B981"
                        strokeWidth={2}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{
                            scale: [0.95, 1.05, 0.95], // Breathing effect
                            opacity: 1,
                            d: pathData
                        }}
                        transition={{
                            scale: {
                                duration: 4,
                                repeat: Infinity,
                                ease: "easeInOut"
                            },
                            opacity: { duration: 1 },
                            d: { duration: 1.5 }
                        }}
                    />

                    {/* Gradient Definition */}
                    <defs>
                        <radialGradient id="blobGradient" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform={`scale(${radius})`}>
                            <stop offset="0%" stopColor="#10B981" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="#059669" stopOpacity="0.1" />
                        </radialGradient>
                    </defs>

                    {/* Labels */}
                    {data.map((d, i) => {
                        const angle = (i / data.length) * 2 * Math.PI - Math.PI / 2; // -PI/2 to start from top
                        const labelRadius = radius + 20;
                        const x = Math.cos(angle) * labelRadius;
                        const y = Math.sin(angle) * labelRadius;

                        return (
                            <text
                                key={d.name}
                                x={x}
                                y={y}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill="#a1a1aa"
                                fontSize={10}
                                className="uppercase tracking-widest"
                            >
                                {d.name}
                            </text>
                        );
                    })}
                </g>
            </svg>

            <div className="mt-4 text-center">
                <p className="text-zinc-400 text-xs italic">
                    "Your shape is leaning towards <strong className="text-emerald-400">{getDominantLifestyle(data)}</strong> this month."
                </p>
            </div>
        </div>
    );
}

function getDominantLifestyle(data: LifestyleData[]) {
    if (!data.length) return "";
    const max = data.reduce((prev, current) => (prev.normalized_score > current.normalized_score) ? prev : current);
    return max.name;
}
