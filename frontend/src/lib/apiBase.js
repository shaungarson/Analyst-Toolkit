// Empty in local dev, so requests stay relative and go through Vite's dev proxy
// (see vite.config.js). Set to the deployed backend's URL in production.
export const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
