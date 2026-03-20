import { useAction, useMutation, useQuery } from 'convex/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
import { SoulStatsTripletLine } from './SoulStats'
import type { PublicSoul, PublicUser } from '../lib/publicUser'
import { isModerator } from '../lib/roles'
import { getRuntimeEnv } from '../lib/runtimeEnv'
import { useAuthStatus } from '../lib/useAuthStatus'
import { formatBytes, stripFrontmatter } from './skillDetailUtils'

type SoulDetailPageProps = {
  slug: string
}

type PublicSoulVersion = Pick<
  Doc<'soulVersions'>,
  | '_id'
  | '_creationTime'
  | 'soulId'
  | 'version'
  | 'fingerprint'
  | 'changelog'
  | 'changelogSource'
  | 'createdBy'
  | 'createdAt'
  | 'softDeletedAt'
> & {
  files: Array<{
    path: string
    size: number
    sha256: string
    contentType?: string
  }>
  parsed?: {
    clawdis?: Doc<'soulVersions'>['parsed']['clawdis']
  }
}

type SoulBySlugResult = {
  soul: PublicSoul
  latestVersion: PublicSoulVersion | null
  owner: PublicUser | null
} | null

export function SoulDetailPage({ slug }: SoulDetailPageProps) {
  const { isAuthenticated, me } = useAuthStatus()
  const result = useQuery(api.souls.getBySlug, { slug }) as SoulBySlugResult | undefined
  const toggleStar = useMutation(api.soulStars.toggle)
  const addComment = useMutation(api.soulComments.add)
  const removeComment = useMutation(api.soulComments.remove)
  const getReadme = useAction(api.souls.getReadme)
  const getFileText = useAction(api.souls.getFileText)
  const ensureSoulSeeds = useAction(api.seed.ensureSoulSeeds)
  const seedEnsuredRef = useRef(false)
  const previewMountedRef = useRef(true)
  const fileRequestRef = useRef(0)
  const fileCacheRef = useRef(new Map<string, { text: string; size: number; sha256: string }>())
  const [readme, setReadme] = useState<string | null>(null)
  const [readmeError, setReadmeError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedFileContent, setSelectedFileContent] = useState<string | null>(null)
  const [selectedFileMeta, setSelectedFileMeta] = useState<{ size: number; sha256: string } | null>(
    null,
  )
  const [selectedFileError, setSelectedFileError] = useState<string | null>(null)
  const [isLoadingSelectedFile, setIsLoadingSelectedFile] = useState(false)
  const [comment, setComment] = useState('')

  const isLoadingSoul = result === undefined
  const soul = result?.soul
  const owner = result?.owner
  const latestVersion = result?.latestVersion
  const versions = useQuery(
    api.souls.listVersions,
    soul ? { soulId: soul._id, limit: 50 } : 'skip',
  ) as PublicSoulVersion[] | undefined

  const isStarred = useQuery(
    api.soulStars.isStarred,
    isAuthenticated && soul ? { soulId: soul._id } : 'skip',
  )

  const comments = useQuery(
    api.soulComments.listBySoul,
    soul ? { soulId: soul._id, limit: 50 } : 'skip',
  ) as Array<{ comment: Doc<'soulComments'>; user: PublicUser | null }> | undefined

  const latestFiles = useMemo(() => {
    const files = [...(latestVersion?.files ?? [])]
    files.sort((a, b) => {
      const aIsReadme = a.path.toLowerCase() === 'soul.md'
      const bIsReadme = b.path.toLowerCase() === 'soul.md'
      if (aIsReadme && !bIsReadme) return -1
      if (!aIsReadme && bIsReadme) return 1
      return a.path.localeCompare(b.path)
    })
    return files
  }, [latestVersion])

  const readmeContent = useMemo(() => {
    if (!readme) return null
    return stripFrontmatter(readme)
  }, [readme])

  useEffect(() => {
    previewMountedRef.current = true
    return () => {
      previewMountedRef.current = false
      fileRequestRef.current += 1
    }
  }, [])

  useEffect(() => {
    if (seedEnsuredRef.current) return
    seedEnsuredRef.current = true
    void ensureSoulSeeds({})
  }, [ensureSoulSeeds])

  useEffect(() => {
    if (!latestVersion) return
    setReadme(null)
    setReadmeError(null)
    let cancelled = false
    void getReadme({ versionId: latestVersion._id })
      .then((data) => {
        if (cancelled) return
        setReadme(data.text)
      })
      .catch((error) => {
        if (cancelled) return
        setReadmeError(error instanceof Error ? error.message : 'Failed to load SOUL.md')
        setReadme(null)
      })
    return () => {
      cancelled = true
    }
  }, [latestVersion, getReadme])

  useEffect(() => {
    fileRequestRef.current += 1
    setSelectedPath(null)
    setSelectedFileContent(null)
    setSelectedFileMeta(null)
    setSelectedFileError(null)
    setIsLoadingSelectedFile(false)
  }, [latestVersion?._id])

  if (isLoadingSoul) {
    return (
      <main className="section">
        <div className="card">
          <div className="loading-indicator">Loading soul…</div>
        </div>
      </main>
    )
  }

  if (result === null || !soul) {
    return (
      <main className="section">
        <div className="card">Soul not found.</div>
      </main>
    )
  }

  const ownerHandle = owner?.handle ?? owner?.name ?? null
  const convexSiteUrl = getRuntimeEnv('VITE_CONVEX_SITE_URL') ?? 'https://clawhub.ai'
  const fileDownloadBase = `${convexSiteUrl}/api/v1/souls/${soul.slug}/file`
  const zipDownloadBase = `${convexSiteUrl}/api/v1/souls/${soul.slug}/download`
  const selectedFileDownloadHref = selectedPath
    ? `${fileDownloadBase}?path=${encodeURIComponent(selectedPath)}`
    : null

  function handleSelectFile(path: string) {
    if (!latestVersion) return

    const cacheKey = `${latestVersion._id}:${path}`
    const cached = fileCacheRef.current.get(cacheKey)

    fileRequestRef.current += 1
    const requestId = fileRequestRef.current

    setSelectedPath(path)
    setSelectedFileError(null)

    if (cached) {
      setSelectedFileContent(cached.text)
      setSelectedFileMeta({ size: cached.size, sha256: cached.sha256 })
      setIsLoadingSelectedFile(false)
      return
    }

    setSelectedFileContent(null)
    setSelectedFileMeta(null)
    setIsLoadingSelectedFile(true)

    void getFileText({ versionId: latestVersion._id, path })
      .then((data) => {
        if (!previewMountedRef.current || fileRequestRef.current !== requestId) return
        fileCacheRef.current.set(cacheKey, data)
        setSelectedFileContent(data.text)
        setSelectedFileMeta({ size: data.size, sha256: data.sha256 })
        setIsLoadingSelectedFile(false)
      })
      .catch((error) => {
        if (!previewMountedRef.current || fileRequestRef.current !== requestId) return
        setSelectedFileError(error instanceof Error ? error.message : 'Failed to load file')
        setIsLoadingSelectedFile(false)
      })
  }

  return (
    <main className="section">
      <div className="skill-detail-stack">
        <div className="card skill-hero">
          <div className="skill-hero-header">
            <div className="skill-hero-title">
              <h1 className="section-title" style={{ margin: 0 }}>
                {soul.displayName}
              </h1>
              <p className="section-subtitle">{soul.summary ?? 'No summary provided.'}</p>
              <div className="stat">
                <SoulStatsTripletLine stats={soul.stats} versionSuffix="versions" />
              </div>
              {ownerHandle ? (
                <div className="stat">
                  by <a href={`/u/${ownerHandle}`}>@{ownerHandle}</a>
                </div>
              ) : null}
              <div className="skill-actions">
                {isAuthenticated ? (
                  <button
                    className={`star-toggle${isStarred ? ' is-active' : ''}`}
                    type="button"
                    onClick={() => void toggleStar({ soulId: soul._id })}
                    aria-label={isStarred ? 'Unstar soul' : 'Star soul'}
                  >
                    <span aria-hidden="true">★</span>
                  </button>
                ) : null}
              </div>
            </div>
            <div className="skill-hero-cta">
              <div className="skill-version-pill">
                <span className="skill-version-label">Current version</span>
                <strong>v{latestVersion?.version ?? '—'}</strong>
              </div>
              <a
                className="btn btn-primary"
                href={zipDownloadBase}
                aria-label="Download zip"
              >
                Download zip
              </a>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="skill-readme markdown">
            {readmeContent ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{readmeContent}</ReactMarkdown>
            ) : readmeError ? (
              <div className="stat">Failed to load SOUL.md: {readmeError}</div>
            ) : (
              <div className="loading-indicator">Loading SOUL.md…</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="file-browser">
            <div className="file-list">
              <div className="file-list-header">
                <h2 className="section-title" style={{ fontSize: '1.2rem', margin: 0 }}>
                  Files
                </h2>
                <span className="section-subtitle" style={{ margin: 0 }}>
                  {latestFiles.length} total
                </span>
              </div>
              <div className="file-list-body">
                {latestFiles.length === 0 ? (
                  <div className="stat">No files available.</div>
                ) : (
                  latestFiles.map((file) => (
                    <button
                      key={file.path}
                      className={`file-row file-row-button${
                        selectedPath === file.path ? ' is-active' : ''
                      }`}
                      type="button"
                      onClick={() => handleSelectFile(file.path)}
                      aria-current={selectedPath === file.path ? 'true' : undefined}
                    >
                      <span className="file-path">{file.path}</span>
                      <span className="file-meta">{formatBytes(file.size)}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="file-viewer">
              <div className="file-viewer-header">
                <div className="file-path">{selectedPath ?? 'Select a file'}</div>
                {selectedFileMeta ? (
                  <span className="file-meta">
                    {formatBytes(selectedFileMeta.size)} | {selectedFileMeta.sha256.slice(0, 12)}...
                  </span>
                ) : null}
              </div>
              <div className="file-viewer-body">
                {isLoadingSelectedFile ? (
                  <div className="stat">Loading file...</div>
                ) : selectedFileError ? (
                  <div className="stat">Failed to load file: {selectedFileError}</div>
                ) : selectedFileContent ? (
                  <>
                    {selectedFileDownloadHref ? (
                      <div className="stat" style={{ marginBottom: 12 }}>
                        <a className="upload-link" href={selectedFileDownloadHref}>
                          Download {selectedPath}
                        </a>
                      </div>
                    ) : null}
                    <pre className="file-viewer-code">{selectedFileContent}</pre>
                  </>
                ) : (
                  <div className="stat">
                    SOUL.md is rendered above. Select any file to preview its raw text.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="section-title" style={{ fontSize: '1.2rem', marginBottom: 8 }}>
            Versions
          </h2>
          <div className="version-scroll">
            <div className="version-list">
              {(versions ?? []).map((version) => (
                <div key={version._id} className="version-row">
                  <div className="version-info">
                    <div>
                      v{version.version} · {new Date(version.createdAt).toLocaleDateString()}
                      {version.changelogSource === 'auto' ? (
                        <span style={{ color: 'var(--ink-soft)' }}> · auto</span>
                      ) : null}
                    </div>
                    <div style={{ color: '#5c554e', whiteSpace: 'pre-wrap' }}>
                      {version.changelog}
                    </div>
                  </div>
                  <div className="version-actions">
                    <a
                      className="btn version-zip"
                      href={`${zipDownloadBase}?version=${encodeURIComponent(version.version)}`}
                    >
                      Zip
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="section-title" style={{ fontSize: '1.2rem', margin: 0 }}>
            Comments
          </h2>
          {isAuthenticated ? (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (!comment.trim()) return
                void addComment({ soulId: soul._id, body: comment.trim() }).then(() =>
                  setComment(''),
                )
              }}
              className="comment-form"
            >
              <textarea
                className="comment-input"
                rows={4}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Leave a note…"
              />
              <button className="btn comment-submit" type="submit">
                Post comment
              </button>
            </form>
          ) : (
            <p className="section-subtitle">Sign in to comment.</p>
          )}
          <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            {(comments ?? []).length === 0 ? (
              <div className="stat">No comments yet.</div>
            ) : (
              (comments ?? []).map((entry) => (
                <div key={entry.comment._id} className="comment-item">
                  <div className="comment-body">
                    <strong>@{entry.user?.handle ?? entry.user?.name ?? 'user'}</strong>
                    <div className="comment-body-text">{entry.comment.body}</div>
                  </div>
                  {isAuthenticated && me && (me._id === entry.comment.userId || isModerator(me)) ? (
                    <button
                      className="btn comment-delete"
                      type="button"
                      onClick={() => void removeComment({ commentId: entry.comment._id })}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
