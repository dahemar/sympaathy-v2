import fs from 'node:fs'
import path from 'node:path'

const CMS_API = (process.env.CMS_API || process.env.VITE_CMS_API || 'https://cms-woad-delta.vercel.app').replace(/\/$/, '')
const SITE_ID = String(process.env.CMS_SITE_ID || process.env.VITE_CMS_SITE_ID || '2').trim()

const rootDir = process.cwd()
const outPath = path.join(rootDir, 'public', 'posts_bootstrap.json')
const tmpPath = outPath + '.tmp'

const fetchJson = async (url) => {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`)
  }
  return await res.json()
}

const firstBlockOfType = (blocks, type) => (Array.isArray(blocks) ? blocks.find((b) => b?.type === type) : null)

const slideshowUrls = (block) => {
  const images = block?.metadata?.images
  if (!Array.isArray(images)) return []
  return images.map((i) => i?.url).filter(Boolean)
}

const isExternalHref = (href) => /^(https?:\/\/|mailto:|tel:)/i.test(String(href || '').trim())

const fetchPosts = async (sectionId) => {
  const url = new URL(`${CMS_API}/posts`)
  url.searchParams.set('siteId', SITE_ID)
  url.searchParams.set('sectionId', String(sectionId))
  url.searchParams.set('page', '1')
  url.searchParams.set('limit', '1000')
  url.searchParams.set('includeBlocks', 'true')
  url.searchParams.set('includeTags', 'false')
  url.searchParams.set('includeSection', 'false')

  const data = await fetchJson(url.toString())
  return Array.isArray(data?.posts) ? data.posts : []
}

const buildBootstrap = async () => {
  const sectionsUrl = new URL(`${CMS_API}/sections`)
  sectionsUrl.searchParams.set('siteId', SITE_ID)
  sectionsUrl.searchParams.set('limit', '200')
  const sections = await fetchJson(sectionsUrl.toString())

  const bySlug = {}
  ;(Array.isArray(sections) ? sections : []).forEach((s) => {
    if (s?.slug) bySlug[s.slug] = s
  })

  const requireSectionId = (slug) => {
    const s = bySlug[slug]
    if (!s?.id) throw new Error(`Missing section slug: ${slug}`)
    return s.id
  }

  const landingId = requireSectionId('landing')
  const releasesId = requireSectionId('releases')
  const liveId = requireSectionId('live')
  const bioId = requireSectionId('bio')
  const contactId = requireSectionId('contact')

  const [landingPosts, releasePosts, livePosts, bioPosts, contactPosts] = await Promise.all([
    fetchPosts(landingId),
    fetchPosts(releasesId),
    fetchPosts(liveId),
    fetchPosts(bioId),
    fetchPosts(contactId)
  ])

  const landingSlideshow = firstBlockOfType(landingPosts?.[0]?.blocks, 'slideshow')
  const landingSlides = landingSlideshow ? slideshowUrls(landingSlideshow) : []

  const releases = (releasePosts || [])
    .map((p) => {
      const img = firstBlockOfType(p.blocks, 'image')?.content || ''
      const href = firstBlockOfType(p.blocks, 'link')?.content || ''
      return { href, title: p.title, image: img, order: p.order ?? 0 }
    })
    .filter((r) => r.href && r.title)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const liveProjects = (livePosts || [])
    .map((p) => {
      const img = firstBlockOfType(p.blocks, 'image')?.content || ''
      return { slug: p.slug, title: p.title, image: img, order: p.order ?? 0 }
    })
    .filter((r) => r.slug)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const liveDetailMap = (livePosts || []).reduce((acc, p) => {
    const slideshows = Array.isArray(p.blocks) ? p.blocks.filter((b) => b?.type === 'slideshow') : []
    const primaryImages = slideshows[0] ? slideshowUrls(slideshows[0]) : null
    const secondaryImages = slideshows[1] ? slideshowUrls(slideshows[1]) : null

    const videoBlock = firstBlockOfType(p.blocks, 'video')
    const videoSrc = String(videoBlock?.content || '').trim()
    const video = videoSrc
      ? /(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)/i.test(videoSrc)
          ? { type: 'iframe', src: videoSrc, title: p.title }
          : { type: 'video', src: videoSrc, title: p.title }
      : null

    acc[p.slug] = { title: p.title || p.slug, video, primaryImages, secondaryImages }
    return acc
  }, {})

  const bioSections = (bioPosts || [])
    .map((p) => {
      const html = firstBlockOfType(p.blocks, 'text')?.content || ''
      return { order: p.order ?? 0, title: p.title, html }
    })
    .filter((s) => s.title)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const contactLinks = (contactPosts || [])
    .map((p) => {
      const href = firstBlockOfType(p.blocks, 'link')?.content || ''
      return { order: p.order ?? 0, label: p.title, href, is_external: isExternalHref(href) }
    })
    .filter((l) => l.label && l.href)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  return { landingSlides, releases, liveProjects, liveDetailMap, bioSections, contactLinks }
}

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

const main = async () => {
  ensureDir(path.dirname(outPath))

  const bootstrap = await buildBootstrap()
  const content = JSON.stringify(bootstrap)

  let valid = false
  try {
    const parsed = JSON.parse(content)
    valid = Array.isArray(parsed.landingSlides) && Array.isArray(parsed.releases)
  } catch {
    valid = false
  }

  if (!valid) {
    throw new Error('bootstrap JSON validation failed')
  }

  fs.writeFileSync(tmpPath, content, 'utf8')
  fs.renameSync(tmpPath, outPath)

  // eslint-disable-next-line no-console
  console.log(`✅ wrote ${outPath} (${content.length} bytes) from ${CMS_API} siteId=${SITE_ID}`)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('❌ generate_bootstrap failed:', err?.message || err)
  process.exit(1)
})
