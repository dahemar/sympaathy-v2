import { useRef, useEffect } from 'react'

export const useImageLoader = () => {
  const imgRef = useRef(null)

  useEffect(() => {
    const img = imgRef.current
    if (!img) return

    const handleLoad = () => {
      img.classList.add('loaded')
    }

    const handleError = () => {
      img.classList.add('error')
    }

    // Check if image is already loaded
    if (img.complete) {
      handleLoad()
    } else {
      img.addEventListener('load', handleLoad, { once: true })
      img.addEventListener('error', handleError, { once: true })
    }

    return () => {
      img.removeEventListener('load', handleLoad)
      img.removeEventListener('error', handleError)
    }
  }, [])

  return imgRef
}

