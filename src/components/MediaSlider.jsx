import { memo, useEffect, useMemo, useState, useCallback } from 'react'

// MediaSlider can consume either:
// 1) dataUrl + basePath (legacy: dataUrl returns ["file1.jpg", ...])
// 2) images: an array of absolute or root-relative URLs (new: Google Sheets)
export const MediaSlider = memo(({ dataUrl, basePath = '', images, intervalMs = 6000, alt = '', showNavigation = true }) => {
  const [files, setFiles] = useState([])
  const [index, setIndex] = useState(0)
  const [lastManualNavigation, setLastManualNavigation] = useState(0)
  const [autoPlayPaused, setAutoPlayPaused] = useState(false)
  const [preloadedImages, setPreloadedImages] = useState(new Set())

  // When images are passed directly, prefer them over dataUrl fetch.
  useEffect(() => {
    if (Array.isArray(images) && images.length) {
      setFiles(images.filter(Boolean))
      setIndex(0)
      return
    }
    if (!dataUrl) return

    let isMounted = true
    fetch(dataUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load slider data'))))
      .then((arr) => {
        if (isMounted && Array.isArray(arr)) {
          setFiles(arr.filter(Boolean))
          setIndex(0)
        }
      })
      .catch(() => {})
    return () => {
      isMounted = false
    }
  }, [dataUrl, images])

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[MediaSlider]', { mode: Array.isArray(images) ? 'images' : 'dataUrl', count: files.length, sample: files.slice(0, 3) })
  }, [files, images])

  useEffect(() => {
    if (!intervalMs || files.length <= 1 || autoPlayPaused) return
    
    let timeoutId
    const scheduleNext = () => {
      if (autoPlayPaused) return // Don't schedule if paused
      
      const timeSinceLastNav = Date.now() - lastManualNavigation
      const delay = Math.max(intervalMs, intervalMs - timeSinceLastNav)
      
      timeoutId = setTimeout(() => {
        if (!autoPlayPaused) { // Double check before executing
          setIndex((i) => (i + 1) % files.length)
          scheduleNext() // Schedule next iteration
        }
      }, delay)
    }
    
    scheduleNext() // Start the cycle
    
    return () => {
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [files, intervalMs, lastManualNavigation, autoPlayPaused])
  
  const hasImages = files.length > 0

  // Generate optimized image sources with WebP fallback (must be declared before effects that depend on it)
  const generateImageSources = useCallback((filename) => {
    if (!filename) return { webp: '', original: '' }

    const isAbsolute = /^https?:\/\//i.test(filename) || filename.startsWith('/')
    if (isAbsolute) {
      return {
        // Don't guess a .webp sibling for absolute/root-relative URLs (it can cause extra 404s).
        webp: filename.toLowerCase().endsWith('.webp') ? filename : '',
        original: filename
      }
    }

    const baseName = filename.replace(/\.[^/.]+$/, '') // Remove extension
    const webpPath = `${basePath}${baseName}.webp`
    const originalPath = `${basePath}${filename}`

    return { webp: webpPath, original: originalPath }
  }, [basePath])

  // Preload adjacent images when index changes
  useEffect(() => {
    if (hasImages && files.length > 1) {
      const nextIndex = (index + 1) % files.length
      const prevIndex = (index - 1 + files.length) % files.length
      
      const nextSources = generateImageSources(files[nextIndex])
      const prevSources = generateImageSources(files[prevIndex])
      
      const imagesToPreload = [
        nextSources.webp,
        nextSources.original,
        prevSources.webp,
        prevSources.original
      ]
      
      imagesToPreload.forEach(src => {
        if (src && !preloadedImages.has(src)) {
          const img = new Image()
          img.onload = () => {
            setPreloadedImages(prev => new Set([...prev, src]))
          }
          img.src = src
        }
      })
    }
  }, [index, hasImages, files, generateImageSources, preloadedImages])
  
  // (moved generateImageSources above)
  
  const currentImageSources = useMemo(() => {
    if (!hasImages) return { webp: '', original: '' }
    return generateImageSources(files[index])
  }, [hasImages, files, index, generateImageSources])
  


  const goPrev = useCallback(() => {
    if (!hasImages) return
    setAutoPlayPaused(true) // Pause auto-play immediately
    
    setIndex((i) => (i - 1 + files.length) % files.length)
    setLastManualNavigation(Date.now())
    
    // Resume auto-play after 3 seconds (reduced from 5)
    setTimeout(() => {
      setAutoPlayPaused(false)
    }, 3000)
  }, [files, hasImages])

  const goNext = useCallback(() => {
    if (!hasImages) return
    setAutoPlayPaused(true) // Pause auto-play immediately
    
    setIndex((i) => (i + 1) % files.length)
    setLastManualNavigation(Date.now())
    
    // Resume auto-play after 3 seconds (reduced from 5)
    setTimeout(() => {
      setAutoPlayPaused(false)
    }, 3000)
  }, [files, hasImages])

  if (!hasImages) return null

  return (
    <div className="media-slider">
      {showNavigation && (
        <>
          <button className="slider-btn prev" onClick={goPrev} aria-label="Previous">‹</button>
          <div className="slide">
            <picture>
              <source srcSet={currentImageSources.webp} type="image/webp" />
              <img 
                src={currentImageSources.original} 
                alt={alt || 'slider image'} 
                loading="eager"
                decoding="async"
                fetchpriority={index === 0 ? 'high' : 'auto'}
                onError={(e) => {
                  // eslint-disable-next-line no-console
                  console.warn('[MediaSlider] image failed', e?.currentTarget?.src)
                }}
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'contain',
                  willChange: 'opacity, transform'
                }}
              />
            </picture>
          </div>
          <button className="slider-btn next" onClick={goNext} aria-label="Next">›</button>
        </>
      )}
      {!showNavigation && (
        <div className="slide">
          <picture>
            <source srcSet={currentImageSources.webp} type="image/webp" />
            <img 
              src={currentImageSources.original} 
              alt={alt || 'slider image'} 
              loading="lazy" 
              onError={(e) => {
                // eslint-disable-next-line no-console
                console.warn('[MediaSlider] image failed', e?.currentTarget?.src)
              }}
            />
          </picture>
        </div>
      )}
    </div>
  )
})

MediaSlider.displayName = 'MediaSlider'
