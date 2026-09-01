// DaygleVE is a client-rendered control panel: it talks to the node-local API
// with a token held in the browser. Disable SSR so pages run entirely client
// side (no server round-trip needs the user's bearer token).
export const ssr = false;
export const prerender = false;
