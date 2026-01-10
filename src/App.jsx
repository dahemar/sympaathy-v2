import { memo, useMemo, useCallback, useState, useEffect } from 'react'
import { Routes, Route, Link, useParams, useLocation } from 'react-router-dom'
import { ScrambleText } from './components/ScrambleText.jsx'
import { MediaSlider } from './components/MediaSlider.jsx'
import ScrollToTop from './components/ScrollToTop.jsx'

  const CMS_API = import.meta.env.VITE_CMS_API || 'http://localhost:3000'
  const CMS_SITE_ID = import.meta.env.VITE_CMS_SITE_ID ? String(import.meta.env.VITE_CMS_SITE_ID).trim() : ''

const DEBUG_CMS =
  import.meta.env.VITE_DEBUG_CMS != null
    ? String(import.meta.env.VITE_DEBUG_CMS).toLowerCase() === 'true'
    : import.meta.env.DEV

const debugLog = (...args) => {
  if (!DEBUG_CMS) return
  // eslint-disable-next-line no-console
  console.log('[cms]', ...args)
}

const CACHE_TTL = 1 * 60 * 1000 // 1 minute (reduced for faster updates)
const BOOTSTRAP_CACHE_KEY = `cms_bootstrap_v2_${CMS_SITE_ID || 'auto'}`

const getCachedEntry = (key) => {
  try {
    const cached = sessionStorage.getItem(key)
    if (!cached) return null
    const { data, timestamp } = JSON.parse(cached)
    if (typeof timestamp !== 'number') return null
    return { data, timestamp }
  } catch {
    return null
  }
}

const getCachedFresh = (key) => {
  const entry = getCachedEntry(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL) return null
  return entry.data
}

const getCachedAny = (key) => getCachedEntry(key)?.data ?? null

const setCached = (key, data) => {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }))
  } catch {
    // ignore quota errors
  }
}

  const withSiteId = (url) => {
    if (!CMS_SITE_ID) return url
    const u = new URL(url)
    if (!u.searchParams.has('siteId')) u.searchParams.set('siteId', CMS_SITE_ID)
    return u.toString()
  }

  const fetchJson = async (url, options = {}) => {
  debugLog('fetch', url)
    const urlWithSiteId = withSiteId(url)
    // Agregar cache busting para evitar caché del navegador
    const urlObj = new URL(urlWithSiteId)
    if (!urlObj.searchParams.has('_t')) {
      urlObj.searchParams.set('_t', Date.now().toString())
    }
    const res = await fetch(urlObj.toString(), {
      ...options,
      cache: 'no-store', // Forzar no usar caché del navegador
      credentials: 'include', // Incluir cookies para CORS
      mode: 'cors', // Asegurar modo CORS
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        'Cache-Control': 'no-cache'
      }
    })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
}

const isExternalHref = (href) => /^(https?:\/\/|mailto:|tel:)/i.test(String(href || '').trim())

const firstBlockOfType = (blocks, type) => (Array.isArray(blocks) ? blocks.find(b => b?.type === type) : null)

const slideshowUrls = (block) => {
  const images = block?.metadata?.images
  if (!Array.isArray(images)) return []
  return images.map(i => i?.url).filter(Boolean)
}

const buildDataFromCms = async () => {
  // 1) Resolve section IDs by slug
  const sectionsUrl = new URL(`${CMS_API}/sections`)
  sectionsUrl.searchParams.set('limit', '200')
  if (CMS_SITE_ID) {
    sectionsUrl.searchParams.set('siteId', CMS_SITE_ID.trim())
  }
  const sections = await fetchJson(sectionsUrl.toString())
  const bySlug = {}
  sections.forEach(s => { if (s?.slug) bySlug[s.slug] = s })

  const requireSection = (slug) => {
    const s = bySlug[slug]
    if (!s) throw new Error(`Missing section: ${slug}`)
    return s
  }

  const landingSection = requireSection('landing')
  const releasesSection = requireSection('releases')
  const liveSection = requireSection('live')
  // Live detail is unified into the same "live" section (one post per slug).
  const bioSection = requireSection('bio')
  const contactSection = requireSection('contact')

  const fetchPosts = async (sectionId) => {
    const url = new URL(`${CMS_API}/posts`)
    url.searchParams.set('sectionId', sectionId)
    url.searchParams.set('page', '1')
    url.searchParams.set('limit', '1000')
    if (CMS_SITE_ID) {
      url.searchParams.set('siteId', CMS_SITE_ID.trim())
    }
    const data = await fetchJson(url.toString())
    return data.posts || []
  }

  // Landing: single post with slideshow block
  const landingPosts = await fetchPosts(landingSection.id)
  const landingPost = landingPosts[0]
  const landingSlideshow = firstBlockOfType(landingPost?.blocks, 'slideshow')
  const landingSlides = landingSlideshow ? slideshowUrls(landingSlideshow) : []

  // Releases: ordered grid with image + link blocks
  const releasePosts = await fetchPosts(releasesSection.id)
  const releases = releasePosts.map(p => {
    const img = firstBlockOfType(p.blocks, 'image')?.content || ''
    const href = firstBlockOfType(p.blocks, 'link')?.content || ''
    return {
      href,
      title: p.title,
      image: img,
      order: p.order ?? 0
    }
  }).filter(r => r.href && r.title).sort((a,b) => (a.order ?? 0) - (b.order ?? 0))

  // Live grid: ordered cards with slug + thumbnail image (image block)
  const livePosts = await fetchPosts(liveSection.id)
  const liveProjects = livePosts.map(p => {
    const img = firstBlockOfType(p.blocks, 'image')?.content || ''
    return {
      slug: p.slug,
      title: p.title,
      image: img,
      order: p.order ?? 0
    }
  }).filter(r => r.slug).sort((a,b) => (a.order ?? 0) - (b.order ?? 0))

  // Live details: map by slug to (title, video, primaryImages, secondaryImages)
  // Built from the SAME live posts (so slug is unique and the grid links to the same entity).
  const liveDetailMap = livePosts.reduce((acc, p) => {
    const slideshows = Array.isArray(p.blocks) ? p.blocks.filter(b => b?.type === 'slideshow') : []
    const primaryImages = slideshows[0] ? slideshowUrls(slideshows[0]) : null
    const secondaryImages = slideshows[1] ? slideshowUrls(slideshows[1]) : null
    const videoBlock = firstBlockOfType(p.blocks, 'video')
    const videoSrc = String(videoBlock?.content || '').trim()
    const video = videoSrc
      ? (/(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)/i.test(videoSrc)
          ? { type: 'iframe', src: videoSrc, title: p.title }
          : { type: 'video', src: videoSrc, title: p.title })
      : null

    acc[p.slug] = { title: p.title || p.slug, video, primaryImages, secondaryImages }
    return acc
  }, {})

  // Bio: ordered sections (title + html)
  const bioPosts = await fetchPosts(bioSection.id)
  const bioSections = bioPosts
    .map(p => {
      const html = firstBlockOfType(p.blocks, 'text')?.content || ''
      return { order: p.order ?? 0, title: p.title, html }
    })
    .filter(s => s.title)
    .sort((a,b) => (a.order ?? 0) - (b.order ?? 0))

  // Contact: ordered links (title + link block)
  const contactPosts = await fetchPosts(contactSection.id)
  const contactLinks = contactPosts
    .map(p => {
      const href = firstBlockOfType(p.blocks, 'link')?.content || ''
      return { order: p.order ?? 0, label: p.title, href, is_external: isExternalHref(href) }
    })
    .filter(l => l.label && l.href)
    .sort((a,b) => (a.order ?? 0) - (b.order ?? 0))

  return { landingSlides, releases, liveProjects, liveDetailMap, bioSections, contactLinks }
}

const parseNumber = (val, fallback = 0) => {
  const n = Number(val)
  return Number.isFinite(n) ? n : fallback
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const inferVideo = (row) => {
  const videoSrc = String(row.video_src || '').trim()
  if (!videoSrc) return null

  // Backward compatible: if video_type exists, respect it.
  const explicitType = String(row.video_type || '').trim().toLowerCase()
  if (explicitType && explicitType !== 'none') {
    return { type: explicitType, src: videoSrc, title: row.video_title || row.title }
  }

  // Infer type from URL / extension
  const lower = videoSrc.toLowerCase()
  const isLocalVideo = /\.(mp4|mov|webm|ogg)(\?.*)?$/.test(lower) || lower.startsWith('/images/') || lower.startsWith('/videos/') || lower.startsWith('/')
  const isIframe = /youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com/.test(lower)

  if (isIframe) return { type: 'iframe', src: videoSrc, title: row.video_title || row.title }
  if (isLocalVideo) return { type: 'video', src: videoSrc, title: row.video_title || row.title }

  return null
}

const Layout = memo(({ children }) => {
  const [showBackToTop, setShowBackToTop] = useState(false)
  const location = useLocation()
  const isLanding = location?.pathname === '/'

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        setShowBackToTop(window.scrollY > 120)
      } else {
        setShowBackToTop(false)
      }
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    // Landing page: lock scroll and avoid horizontal overflow in iOS
    const html = document.documentElement
    const body = document.body
    if (isLanding) {
      html.classList.add('page-landing')
      body.classList.add('page-landing')
    } else {
      html.classList.remove('page-landing')
      body.classList.remove('page-landing')
    }
  }, [isLanding])

  useEffect(() => {
    const scrollHandler = () => {
      const isMobile = window.innerWidth <= 768
      const hasScrolled = window.scrollY > 120

      if (isMobile) {
        setShowBackToTop(hasScrolled)
      } else {
        setShowBackToTop(false)
      }
    }

    scrollHandler()

    window.addEventListener('scroll', scrollHandler, { passive: true })

    return () => {
      window.removeEventListener('scroll', scrollHandler)
    }
  }, [])

  useEffect(() => {
    if (window.innerWidth <= 768) {
      document.documentElement.style.scrollBehavior = 'smooth'
    } else {
      document.documentElement.style.scrollBehavior = 'auto'
    }

    return () => {
      document.documentElement.style.scrollBehavior = 'auto'
    }
  }, [])

  const scrollToTop = useCallback(() => {
    if (window.innerWidth <= 768) {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'smooth'
      })
    } else {
      window.scrollTo(0, 0)
    }
  }, [])

  return (
    <>
      <nav className="main-nav">
        <div className="main-nav-left">
          <Link to="/" className="scramble"></Link>
      </div>
        <div className="main-nav-right">
          <Link to="/releases">
            <ScrambleText delay={0}>releases</ScrambleText>
          </Link>
          <Link to="/live">
            <ScrambleText delay={100}>live</ScrambleText>
          </Link>
          <Link to="/bio">
            <ScrambleText delay={200}>bio</ScrambleText>
          </Link>
          <Link to="/contact">
            <ScrambleText delay={300}>contact</ScrambleText>
          </Link>
      </div>
      </nav>
      <div className={`page-content${isLanding ? ' is-landing' : ''}`}>
        {children}
      </div>
      {showBackToTop && (
        <button id="backToTop" onClick={scrollToTop}>
          ↑ back to top
        </button>
      )}
    </>
  )
})

Layout.displayName = 'Layout'

const parseRichText = (paragraph) => {
  // Supports link tokens: [[Text|https://...]] and line breaks via [BR]
  const tokens = paragraph.split(/(\[\[.+?\|https?:\/\/[^\]]+\]\]|\[BR\])/g)
  return tokens.map((token, idx) => {
    if (token === '[BR]') {
      return <br key={`br-${idx}`} />
    }
    const linkMatch = token.match(/^\[\[(.+?)\|(https?:\/\/[^\]]+)\]\]$/)
    if (linkMatch) {
      const [, text, href] = linkMatch
      return (
        <a
          key={`ln-${idx}`}
          href={href}
          className="contact-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          {text}
        </a>
      )
    }
    return <span key={`t-${idx}`}>{token}</span>
  })
}

const splitLines = (text = '') => {
  // Split on real newlines or escaped \n from Sheets/CSV
  return text.split(/(?:\r?\n|\\n)/)
}

const Landing = memo(({ slides }) => {
  const hasSlides = slides && slides.length > 0
  useEffect(() => {
    debugLog('Landing slides', { count: slides?.length || 0, slides })
  }, [slides])
  return (
    <div className="landing-hero">
      {hasSlides ? (
        <MediaSlider images={slides} intervalMs={6000} alt="landing slideshow" showNavigation />
      ) : null}
    </div>
  )
})

Landing.displayName = 'Landing'

const Releases = memo(({ releases }) => {
  const [loadedByKey, setLoadedByKey] = useState(() => ({}))

  const markLoaded = useCallback((key) => {
    if (!key) return
    setLoadedByKey((prev) => (prev[key] ? prev : { ...prev, [key]: true }))
  }, [])

  return (
    <div className="releases-page">
      <div className="projects-grid releases-grid">
        {releases.map(({ href, title, image }, index) => (
          // Render caption only after the image has loaded (prevents text-before-image flashes on mobile)
          <a
            key={href || `${title}-${index}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="release-card"
          >
            <picture>
              <img 
                src={image} 
                alt={title} 
                loading={index < 4 ? "eager" : "lazy"}
                fetchpriority={index < 2 ? "high" : "auto"}
                onLoad={() => markLoaded(href)}
                onError={() => markLoaded(href)}
              />
            </picture>
            {loadedByKey[href] ? <div className="project-caption">{title}</div> : null}
          </a>
        ))}
      </div>
    </div>
  )
})

Releases.displayName = 'Releases'

const Live = memo(({ liveProjects }) => {
  const [loadedByKey, setLoadedByKey] = useState(() => ({}))

  const markLoaded = useCallback((key) => {
    if (!key) return
    setLoadedByKey((prev) => (prev[key] ? prev : { ...prev, [key]: true }))
  }, [])

  const resolveClass = useCallback((slug) => {
    if (!slug) return 'project-link live-card'
    if (slug.includes('licitir')) return 'project-link project-licitir live-card'
    if (slug.includes('pastoral')) return 'project-link project-pastoral live-card'
    if (slug.includes('diamantista')) return 'project-link project-live live-card'
    return 'project-link live-card'
  }, [])

  return (
    <div className="projects-grid live-grid">
        {liveProjects.map(({ slug, title, image }) => (
        <Link
          key={slug}
          to={`/${slug}`}
          className={resolveClass(slug)}
        >
          <picture>
            <img
              src={image}
              alt={title}
              loading="lazy"
              onLoad={() => markLoaded(slug)}
              onError={() => markLoaded(slug)}
            />
          </picture>
          {loadedByKey[slug] ? <div className="project-caption">{title}</div> : null}
        </Link>
      ))}
    </div>
  )
})

Live.displayName = 'Live'

// Normalizar HTML para reducir espacio excesivo de saltos de línea
const normalizeBioHtml = (html) => {
  if (!html) return html
  // Reducir <p><br></p> a <p><br></p> con clase especial para menos margen
  // O mejor: convertir <p><br></p> a solo <br> con un wrapper
  return html
    .replace(/<p><br\s*\/?><\/p>/gi, '<br class="bio-line-break" />')
    .replace(/<p>\s*<br\s*\/?>\s*<\/p>/gi, '<br class="bio-line-break" />')
}

const Bio = memo(({ sections }) => {
  return (
    <div className="container bio-container">
      {sections.map((section, index) => (
        <div key={index} className="element data">
          <h2><ScrambleText delay={section.delay || 0}>{section.title}</ScrambleText></h2>
          {section.html ? (
            <div dangerouslySetInnerHTML={{ __html: normalizeBioHtml(section.html) }} />
          ) : (
            splitLines(section.text).map((paragraph, idx) => (
              <p key={idx}>
                {parseRichText(paragraph)}
              </p>
            ))
          )}
        </div>
      ))}
    </div>
  )
})

Bio.displayName = 'Bio'

const Contact = memo(({ links }) => {
  return (
    <div className="container contact-container">
      <div className="writings-grid">
        <div className="writing-category">
          <div className="element data">
            <h2></h2>
          </div>
          {links.map(link => (
            <div className="writing-item" key={link.href || link.label}>
              <a
                href={link.href}
                className="contact-link"
                target={link.is_external ? '_blank' : undefined}
                rel={link.is_external ? 'noopener noreferrer' : undefined}
              >
                {link.label}
              </a>
            </div>
          ))}
          <div className="element data instagram-widget">
            <iframe 
              src="https://www.instagram.com/prenatal_amygdala/embed/"
              title="Instagram @prenatal_amygdala"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
              className="instagram-embed"
            />
          </div>
        </div>
      </div>
    </div>
  )
})

Contact.displayName = 'Contact'

const LiveDetail = memo(({ primaryImages, secondaryImages, video }) => {
  const renderSliderOrPlaceholder = (slider, placeholder) => {
    if (!slider || slider.length === 0) {
      return (
        <div className="slider-placeholder">
          <strong>{placeholder}</strong>
        </div>
      )
    }

    return (
      <MediaSlider
        images={slider}
        intervalMs={5000}
        alt={placeholder}
        showNavigation={true}
      />
    )
  }

  const renderVideoSection = () => {
    // eslint-disable-next-line no-console
    console.log('[LiveDetail] video', video)
    if (!video) {
      return (
        <div className="slider-placeholder">
          <strong>Live video coming soon</strong>
          <small>waiting on footage</small>
        </div>
      )
    }

    if (video.type === 'iframe') {
      return (
        <iframe
          className="project-video"
          src={video.src}
          title={video.title}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      )
    }

    if (video.type === 'video') {
      return (
        <video
          className="project-video"
          src={video.src}
          controls
          preload="metadata"
          playsInline
          onError={(e) => {
            // eslint-disable-next-line no-console
            console.warn('[LiveDetail] video failed', e?.currentTarget?.src, e?.currentTarget?.error)
          }}
        />
      )
    }

    return null
  }

  return (
    <div className="project-container project-live-detail">
      <div className="project-detail-content">
        <div className="element data">
          <div className="performance-gallery">
            {renderSliderOrPlaceholder(primaryImages, 'slideshow 1')}
          </div>
        </div>
        <div className="media-container">
          <div className="image-section">
            {renderSliderOrPlaceholder(secondaryImages, 'slideshow 2')}
          </div>
          <div className="video-section">
            {renderVideoSection()}
          </div>
        </div>
      </div>
    </div>
  )
})

LiveDetail.displayName = 'LiveDetail'

const Project = memo(({ liveDetailMap, dataLoaded }) => {
  const { projectSlug } = useParams()
  const projectData = liveDetailMap[projectSlug]

  useEffect(() => {
    // Only redirect if data has finished loading AND project is not found
    if (dataLoaded && projectSlug && !projectData) {
      window.location.href = '/#/live'
    }
  }, [projectSlug, projectData, dataLoaded])

  // Show loading state while data is being fetched
  if (!dataLoaded) {
    return <div className="project-container" style={{ minHeight: '100vh' }} />
  }

  if (!projectData) return null

  return (
    <div className={`project-container project-${projectSlug}`}>
      <h2 className="project-title">
        <ScrambleText delay={0}>{projectData.title}</ScrambleText>
      </h2>
      <LiveDetail
        primaryImages={projectData.primaryImages}
        secondaryImages={projectData.secondaryImages}
        video={projectData.video}
      />
    </div>
  )
})

Project.displayName = 'Project'

export default function App() {
  const [releases, setReleases] = useState([])
  const [liveProjects, setLiveProjects] = useState([])
  const [liveDetailMap, setLiveDetailMap] = useState({})
  const [bioSections, setBioSections] = useState([])
  const [contactLinks, setContactLinks] = useState([])
  const [landingSlides, setLandingSlides] = useState([])
  const [dataLoaded, setDataLoaded] = useState(false)

  useEffect(() => {
    const load = async () => {
      debugLog('load start')

      // 1) Instant render from cache (only if fresh, < 1 minute old)
      const cached = getCachedFresh(BOOTSTRAP_CACHE_KEY)
      if (cached) {
        debugLog('cache bootstrap (fresh)')
        setLandingSlides(cached.landingSlides || [])
        setReleases(cached.releases || [])
        setLiveProjects(cached.liveProjects || [])
        setLiveDetailMap(cached.liveDetailMap || {})
        setBioSections(cached.bioSections || [])
        setContactLinks(cached.contactLinks || [])
        setDataLoaded(true)
      }

      // 2) Always fetch fresh data (with cache busting)
      try {
        const data = await buildDataFromCms()
        setCached(BOOTSTRAP_CACHE_KEY, data)

        setLandingSlides(data.landingSlides || [])
        setReleases(data.releases || [])
        setLiveProjects(data.liveProjects || [])
        setLiveDetailMap(data.liveDetailMap || {})
        setBioSections(data.bioSections || [])
        setContactLinks(data.contactLinks || [])
        setDataLoaded(true)
        debugLog('load done')
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('CMS fetch error:', err?.message)
        if (!cached) setDataLoaded(false)
      }
    }

    load()
  }, [])

  return (
    <Layout>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing slides={landingSlides} />} />
        <Route path="/releases" element={<Releases releases={releases} />} />
        <Route path="/live" element={<Live liveProjects={liveProjects} />} />
        <Route path="/bio" element={<Bio sections={bioSections} />} />
        <Route path="/contact" element={<Contact links={contactLinks} />} />
        <Route path="/:projectSlug" element={<Project liveDetailMap={liveDetailMap} dataLoaded={dataLoaded} />} />
      </Routes>
    </Layout>
  )
}
