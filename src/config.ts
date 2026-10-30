// Supabase dashboard -> Project Settings -> API
export const SUPABASE_URL = 'https://nqvokmrnuxdvmpjxumuf.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_dwrViXdHZDK03j_H86q5gw_afQgUgpD'; // public by design; tables are locked by RLS

// Public web viewer (the web/ folder of this repo, deployed as static files).
// For Android App Links this must be the ROOT of a domain (assetlinks.json is read from /.well-known/ there)
// and the same host must be listed in app.json -> android.intentFilters.
export const WEB_BASE = 'https://clocation-web.vercel.app';
// Where people can get the app if the link opens in a browser
export const DOWNLOAD_URL = 'https://subhaintdead.github.io/cLocation-download';
