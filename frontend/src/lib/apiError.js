const SERVER_UNREACHABLE = 'Could not reach the server. Make sure the backend is running.'

export function friendlyErrorMessage(err) {
  if (err instanceof TypeError) {
    return SERVER_UNREACHABLE
  }
  return err.message
}

// Vite's dev proxy answers with a 502/503/504 HTML error page (not JSON) when the
// backend itself is down, rather than letting fetch() fail outright - so that case
// needs to be detected here rather than as a thrown TypeError in the caller.
export async function parseErrorResponse(res) {
  const body = await res.json().catch(() => null)
  if (!body && [502, 503, 504].includes(res.status)) {
    return SERVER_UNREACHABLE
  }
  // FastAPI's own validation errors give `detail` as a list of Pydantic error objects;
  // the company-lookup endpoint raises HTTPException with a plain string `detail` instead
  // - both shapes need handling here, or a string detail would be silently misread as an
  // array and show a single stray character.
  if (typeof body?.detail === 'string') {
    return body.detail
  }
  return body?.detail?.[0]?.msg || 'Calculation failed. Check your inputs.'
}
