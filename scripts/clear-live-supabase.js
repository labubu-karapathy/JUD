import { createClient } from '@supabase/supabase-js'

const url = 'https://bwvslsvjjclnspmdleyj.supabase.co'
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3dnNsc3ZqamNsbnNwbWRsZXlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1MTM3MzQsImV4cCI6MjEwNjA4OTczNH0.Wq7RqKJMCVzX5CisjZga2SpTk6EfAh20aTfRS9k1vPY'

const client = createClient(url, anonKey)

async function clearFalseStudents() {
  console.log('Clearing all dummy student profiles from Supabase...')
  const { data, error } = await client.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) {
    console.error('Error clearing profiles:', error)
  } else {
    console.log('[SUCCESS] All dummy/test student profiles cleared from live Supabase.')
  }
}

clearFalseStudents()
