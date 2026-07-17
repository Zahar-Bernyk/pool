import { NextResponse } from 'next/server';
import { getRoomAvailability } from '@/lib/room-booking-service';

export const dynamic = 'force-dynamic';

// GET /api/rooms/availability?check_in=YYYY-MM-DD&check_out=YYYY-MM-DD
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const checkIn = searchParams.get('check_in') || '';
  const checkOut = searchParams.get('check_out') || '';
  const result = await getRoomAvailability(checkIn, checkOut);
  return NextResponse.json(result);
}
