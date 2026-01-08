import { memo, useEffect, useMemo, useState, useCallback } from 'react'

export const CrossfadeGallery = memo(({ dataUrl, basePath, intervalMs = 4000, alt = '', fallbackSrc, showNavigation = false }) => {
  const [files, setFiles] = useState([])
  const [index, setIndex] = useState(0)
  const [previousImageSources, setPreviousImageSources] = useState({ webp: '', original: '' })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastManualNavigation, setLastManualNavigation] = useState(0)
  const [autoPlayPaused, setAutoPlayPaused] = useState(false)
  const [preloadedImages, setPreloadedImages] = useState(new Set())

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    setError(null)

    // Use provided (encoded) URL directly
    const requestUrl = dataUrl
    console.log('CrossfadeGallery: Fetching data from:', requestUrl)

    fetch(requestUrl)
      .then((r) => {
        console.log('CrossfadeGallery: Response status:', r.status)
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}: ${r.statusText}`)
        }
        return r.json()
      })
      .then((arr) => {
        console.log('CrossfadeGallery: Received data:', arr)
        if (isMounted && Array.isArray(arr) && arr.length > 0) {
          const filtered = arr.filter(Boolean)
          console.log('CrossfadeGallery: Filtered files:', filtered)
          setFiles(filtered)
          setIndex(0)
          setPreviousImageSources({ webp: '', original: '' })
          setIsLoading(false)
        } else {
          console.warn('CrossfadeGallery: No valid files found in response')
          setIsLoading(false)
        }
      })
      .catch((error) => {
        console.error('CrossfadeGallery: Error loading data:', error)
        setError(error.message)
        setIsLoading(false)
      })
    return () => { isMounted = false }
  }, [dataUrl])

  // Generate optimized image sources with WebP fallback
  const generateImageSources = useCallback((filename) => {
    if (!filename || !basePath) return { webp: '', original: '' }
    
    const baseName = filename.replace(/\.[^/.]+$/, '') // Remove extension
    const webpPath = `${basePath}${baseName}.webp`
    const originalPath = `${basePath}${filename}`
    
    return { webp: webpPath, original: originalPath }
  }, [basePath])
  
  const currentImageSources = useMemo(() => {
    if (files.length && basePath) {
      return generateImageSources(files[index])
    }
    return { webp: fallbackSrc || '', original: fallbackSrc || '' }
  }, [files, basePath, index, fallbackSrc, generateImageSources])

  // Auto-play functionality (simplified)
  useEffect(() => {
    if (files.length <= 1 || !intervalMs || autoPlayPaused) return
    
    let timeoutId
    const scheduleNext = () => {
      if (autoPlayPaused) return
      
      const timeSinceLastNav = Date.now() - lastManualNavigation
      const delay = Math.max(intervalMs, intervalMs - timeSinceLastNav)
      
      timeoutId = setTimeout(() => {
        if (!autoPlayPaused) {
          const nextIndex = (index + 1) % files.length
          setPreviousImageSources(currentImageSources)
          setIndex(nextIndex)
          scheduleNext()
        }
      }, delay)
    }
    
    scheduleNext()
    
    return () => {
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [files, index, intervalMs, lastManualNavigation, autoPlayPaused, currentImageSources])

  // Preload adjacent images for smooth transitions
  useEffect(() => {
    if (!files.length || files.length <= 1) return
    
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
  }, [index, files, generateImageSources, preloadedImages])
  
  const goPrev = useCallback(() => {
    if (files.length <= 1) return
    setAutoPlayPaused(true) // Pause auto-play immediately
    
    const prevIndex = (index - 1 + files.length) % files.length
    setPreviousImageSources(currentImageSources)
    setIndex(prevIndex)
    setLastManualNavigation(Date.now())
    
    // Resume auto-play after 3 seconds
    setTimeout(() => {
      setAutoPlayPaused(false)
    }, 3000)
  }, [files, index, currentImageSources])

  const goNext = useCallback(() => {
    if (files.length <= 1) return
    setAutoPlayPaused(true) // Pause auto-play immediately
    
    const nextIndex = (index + 1) % files.length
    setPreviousImageSources(currentImageSources)
    setIndex(nextIndex)
    setLastManualNavigation(Date.now())
    
    // Resume auto-play after 3 seconds
    setTimeout(() => {
      setAutoPlayPaused(false)
    }, 3000)
  }, [files, index, currentImageSources])

  if (isLoading) {
    console.log('CrossfadeGallery: Loading data, showing nothing')
    return null
  }

  if (error) {
    console.error('CrossfadeGallery: Error state, showing fallback:', error)
    if (fallbackSrc) {
      return (
        <div className="crossfade-container CrossfadeGallery">
          <img
            src={fallbackSrc}
            alt={alt || 'gallery fallback image'}
            className="crossfade-image visible"
            loading="lazy"
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      )
    }
    return null
  }

  if (!files.length && !fallbackSrc) {
    console.log('CrossfadeGallery: No files and no fallback, returning null')
    return null
  }

  if (!files.length && fallbackSrc) {
    console.log('CrossfadeGallery: Using fallback image:', fallbackSrc)
    return (
      <div className="crossfade-container CrossfadeGallery">
        <img
          src={fallbackSrc}
          alt={alt || 'gallery fallback image'}
          className="crossfade-image visible"
          loading="lazy"
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    )
  }

  console.log('CrossfadeGallery: Rendering with', files.length, 'files, current index:', index)
  return (
    <div className="crossfade-container CrossfadeGallery">
      {previousImageSources.original ? (
        <picture>
          <source srcSet={previousImageSources.webp} type="image/webp" />
          <img
            src={previousImageSources.original}
            alt={alt || 'gallery image previous'}
            className="crossfade-image hidden"
            loading="eager"
          />
        </picture>
      ) : null}
      <picture>
        <source srcSet={currentImageSources.webp} type="image/webp" />
        <img
          key={currentImageSources.original}
          src={currentImageSources.original}
          alt={alt || 'gallery image current'}
          className="crossfade-image visible"
          loading="eager"
        />
      </picture>
      {showNavigation && files.length > 1 && (
        <>
          <button className="crossfade-btn prev" onClick={goPrev} aria-label="Previous">‹</button>
          <button className="crossfade-btn next" onClick={goNext} aria-label="Next">›</button>
        </>
      )}
    </div>
  )
})

CrossfadeGallery.displayName = 'CrossfadeGallery'
