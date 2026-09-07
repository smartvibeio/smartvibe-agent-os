export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json({ product: 'smartvibe-coach', instance: process.env.SMARTVIBE_INSTANCE ?? 'manual' });
}
