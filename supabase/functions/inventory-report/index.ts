import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {createSubmitHandler} from '../_shared/report-handlers.js';
const env=(key:string)=>Deno.env.get(key);
const db=createClient(env('SUPABASE_URL')!,env('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createSubmitHandler({db,env}));
