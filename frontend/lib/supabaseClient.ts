import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://eircetcgxjhrtoxluapp.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpcmNldGNneGpocnRveGx1YXBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NjM1MjAsImV4cCI6MjA3MzQzOTUyMH0.jpzR5Cs9we3yWW7tHLmYczqp6AxPkUL0k32GRs8UxQA";

export const supabase = createClient(supabaseUrl, supabaseKey);
