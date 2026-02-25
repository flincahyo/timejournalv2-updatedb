import { NextResponse } from "next/server";

export const revalidate = 3600; // Cache for 1 hour

export async function GET() {
    try {
        const res = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
            headers: { "User-Agent": "Mozilla/5.0" },
            next: { revalidate: 3600 }
        });

        if (!res.ok) {
            throw new Error("Failed to fetch news feed");
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("News fetch error:", error);
        return NextResponse.json({ error: "Failed to fetch news" }, { status: 500 });
    }
}
