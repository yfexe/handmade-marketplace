// Supabase connection. The anon (publishable) key is SAFE to publish:
// what it can do is limited by the Row Level Security policies in database/database.sql.
// NEVER put the service_role key or the database password in this project.
const SUPABASE_URL = "https://fgmzkimledubsknmnzsg.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnbXpraW1sZWR1YnNrbm1uenNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwMjA4NzEsImV4cCI6MjExMDU5Njg3MX0.HzJ1gFA0x75mdS4D7MNGg7IuQv7hw6N62hPd4VTnqfQ";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
