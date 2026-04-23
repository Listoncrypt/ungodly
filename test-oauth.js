const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://ivxljrkrglwulihytzjl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2eGxqcmtyZ2x3dWxpaHl0empsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NDY1MDAsImV4cCI6MjA5MjUyMjUwMH0.9THLeX7qBaUZUO520xGvBl46lftRZ3ibd0t2yez9O-w'
);

async function run() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'twitter',
    options: {
      redirectTo: 'http://localhost:4200/auth/twitter/callback'
    }
  });
  console.log('DATA:', data);
  console.log('ERROR:', error);
}
run();
