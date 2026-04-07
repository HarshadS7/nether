"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

const data = [
    { time: "00:00", incidents: 0, latency: 120 },
    { time: "04:00", incidents: 1, latency: 135 },
    { time: "08:00", incidents: 0, latency: 180 },
    { time: "12:00", incidents: 4, latency: 450 }, // Spike representing INC-142
    { time: "16:00", incidents: 2, latency: 200 },
    { time: "20:00", incidents: 0, latency: 150 },
    { time: "24:00", incidents: 0, latency: 130 },
];

export function MetricsChart() {
    return (
        <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <XAxis
                    dataKey="time"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                />
                <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}ms`}
                />
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Line
                    type="monotone"
                    dataKey="latency"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 4, fill: "hsl(var(--primary))" }}
                    activeDot={{ r: 6, fill: "hsl(var(--primary-foreground))", stroke: "hsl(var(--primary))" }}
                />
            </LineChart>
        </ResponsiveContainer>
    );
}
