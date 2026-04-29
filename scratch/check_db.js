
import { createClient } from '@supabase/supabase-js';

async function checkColumns() {
  const supabaseUrl = 'https://ivxljrkrglwulihytzjl.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2eGxqcmtyZ2x3dWxpaHl0empsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NDY1MDAsImV4cCI6MjA5MjUyMjUwMH0.9THLeX7qBaUZUO520xGvBl46lftRZ3ibd0t2yez9O-w';
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('Checking profiles table columns...');
  const { data, error } = await supabase.from('profiles').select('*').limit(1);

  if (error) {
    console.error('Error fetching profile:', error);
    return;
  }

  if (data && data.length > 0) {
    console.log('Existing columns in profiles table:', Object.keys(data[0]));
  } else {
    console.log('No data found in profiles table, trying to insert a dummy to see errors...');
    const { error: insertError } = await supabase.from('profiles').insert([{ id: 'test', email: 'test@example.com' }]);
    console.log('Insert error (might show missing columns):', insertError);
  }
}

checkColumns();
