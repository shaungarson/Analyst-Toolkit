import { useEffect, useRef, useState } from 'react'

// Shows a compact formatted value ($111.59B) when not focused, and the raw editable number
// when focused - the underlying value passed to onChange is always the plain raw string,
// unchanged from a normal number input, so nothing downstream (validation, payload
// building, provenance comparison) needs to know this formatting layer exists. Local
// focus state only; no new dependency, no change to how the value is stored.
function FormattedNumberInput({ value, onChange, formatter, ...inputProps }) {
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)
  const numeric = value === '' ? null : Number(value)
  const showFormatted = !focused && numeric !== null && !Number.isNaN(numeric)

  // Selecting on focus (so a click-to-edit immediately overtypes rather than appending)
  // has to happen after React has already swapped the DOM value from the formatted
  // display to the raw number, not inside the focus handler itself - the input's value
  // and type both change as a result of the same focus, and selecting before that commit
  // selects the about-to-be-replaced formatted text, which the value swap then discards.
  useEffect(() => {
    if (focused) {
      inputRef.current?.select()
    }
  }, [focused])

  return (
    <input
      {...inputProps}
      ref={inputRef}
      type={focused ? 'number' : 'text'}
      value={showFormatted ? formatter(numeric) : value}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export default FormattedNumberInput
