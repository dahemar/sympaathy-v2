import { useEffect, useRef, useCallback, useMemo } from 'react'

class TextScramble {
  constructor(el) {
    this.el = el
    this.chars = '░▒▓│┌┐└┘╭╮╯╰'
    this.update = this.update.bind(this)
    this.isAnimating = false
  }

  setText(newText) {
    if (this.isAnimating) return
    
    const oldText = this.el.innerText
    const length = Math.max(oldText.length, newText.length)
    const promise = new Promise((resolve) => this.resolve = resolve)
    
    this.queue = []
    
    for (let i = 0; i < length; i++) {
      const from = oldText[i] || ''
      const to = newText[i] || ''
      const start = Math.floor(Math.random() * 30)
      const end = start + Math.floor(Math.random() * 20)
      this.queue.push({ from, to, start, end })
    }
    
    cancelAnimationFrame(this.frameRequest)
    this.frame = 0
    this.update()
    return promise
  }

  update() {
    let output = ''
    let complete = 0
    
    for (let i = 0, n = this.queue.length; i < n; i++) {
      let { from, to, start, end, char } = this.queue[i]
      
      if (this.frame >= end) {
        complete++
        output += to
      } else if (this.frame >= start) {
        if (!char || Math.random() < 0.15) {
          char = this.randomChar()
          this.queue[i].char = char
        }
        output += `<span class="glitching">${char}</span>`
      } else {
        output += from
      }
    }
    
    this.el.innerHTML = output
    
    if (complete === this.queue.length) {
      this.resolve()
      this.isAnimating = false
    } else {
      this.frameRequest = requestAnimationFrame(this.update)
      this.frame++
    }
  }

  randomChar() {
    return this.chars[Math.floor(Math.random() * this.chars.length)]
  }
}

export const useScramble = (text, delay = 0) => {
  const elRef = useRef(null)
  const scramblerRef = useRef(null)
  const observerRef = useRef(null)
  const isVisibleRef = useRef(false)

  const startAnimation = useCallback(() => {
    if (!scramblerRef.current || isVisibleRef.current) return
    
    isVisibleRef.current = true
    
    // Set initial text immediately and make visible
    if (elRef.current) {
      elRef.current.innerText = text
      elRef.current.classList.add('visible')
    }
    
    // Start scramble animation after delay
    setTimeout(() => {
      if (scramblerRef.current && elRef.current) {
        scramblerRef.current.setText(text)
      }
    }, delay)
  }, [text, delay])

  const observerCallback = useCallback((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && !isVisibleRef.current) {
        startAnimation()
      }
    })
  }, [startAnimation])

  useEffect(() => {
    if (!elRef.current) return

    // Initialize scrambler
    scramblerRef.current = new TextScramble(elRef.current)
    
    // Set up intersection observer
    observerRef.current = new IntersectionObserver(observerCallback, {
      threshold: 0.1,
      rootMargin: '50px'
    })
    
    observerRef.current.observe(elRef.current)

    return () => {
      if (observerRef.current && elRef.current) {
        try {
          observerRef.current.unobserve(elRef.current)
        } catch (e) {
          // Element might have been removed
        }
      }
      if (scramblerRef.current) {
        scramblerRef.current.isAnimating = false
      }
    }
  }, [observerCallback])

  // Memoize the ref to prevent unnecessary re-renders
  const memoizedRef = useMemo(() => elRef, [])

  return memoizedRef
}
