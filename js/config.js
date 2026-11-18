// Supabase connection. The anon (publishable) key is SAFE to publish:
// what it can do is limited by the Row Level Security policies in database/database.sql.
// NEVER put the service_role key or the database password in this project.
const SUPABASE_URL = "https://sinyfxthsekoqpfjvqna.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpbnlmeHRoc2Vrb3FwZmp2cW5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2NDcwODEsImV4cCI6MjEwNzIyMzA4MX0.bUIMqKGch6SRqyO_CPsqZG-VUJ8LiwRUiLDw3XoucF8";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
