import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL     = 'https://nocyrpfxccjvwsarwcav.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vY3lycGZ4Y2NqdndzYXJ3Y2F2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTY2NjksImV4cCI6MjA5MDM3MjY2OX0.zSAQdPyZvbKalq725oFa6oK8hcCjmnoVsogDQdcDvhY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
