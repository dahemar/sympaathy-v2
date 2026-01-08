import { memo } from 'react'
import { useScramble } from '../hooks/useScramble.js'

export const ScrambleText = memo(({ children, delay = 0 }) => {
  const ref = useScramble(children, delay)

  return (
    <span ref={ref} className="scramble">
      {children}
    </span>
  )
})

ScrambleText.displayName = 'ScrambleText'
