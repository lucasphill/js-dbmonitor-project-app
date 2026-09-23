"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function DatabaseChart({ data }: { data: DatabaseStat[] }) {
  return <div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}><CartesianGrid stroke="#e5eaf0" vertical={false} /><XAxis dataKey="name" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="connections" name="Conexões" fill="#2b68c8" radius={[5, 5, 0, 0]} maxBarSize={70} /></BarChart></ResponsiveContainer></div>;
}
