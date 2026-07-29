import { DATA_SOURCE } from '../config/dataSource'
import { supabase as localClient, resetLocalDatabase } from './local/client'

let dataClient = localClient

if (DATA_SOURCE === 'supabase') {
  const module = await import('./supabase/client')
  dataClient = module.supabaseClient
}

export { dataClient, resetLocalDatabase }
