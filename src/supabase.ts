import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://hfhezphmtgtgeuxjpuyc.supabase.co'
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmaGV6cGhtdGd0Z2V1eGpwdXljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MjE5MDYsImV4cCI6MjA4Njk5NzkwNn0.Teh9IkMWkmQXomyZoYn8HdN_vWalGzrIWrLm9PlFxxQ'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
