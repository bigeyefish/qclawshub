/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { convexHttpMock, convexReactMocks, resetConvexReactMocks } from './helpers/convexReactMocks'

import { Home } from '../routes/index'

const getSiteModeMock = vi.fn()
const navigateMock = vi.fn()
const ensureSoulSeedsMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (_config: { component: unknown }) => ({
    useNavigate: () => navigateMock,
  }),
  Link: ({
    children,
    to,
    search,
    ...rest
  }: {
    children: ReactNode
    to: string
    search?: unknown
  }) => (
    <a href={to} data-search={JSON.stringify(search ?? null)} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('convex/react', () => ({
  useAction: (...args: unknown[]) => convexReactMocks.useAction(...args),
  useQuery: (...args: unknown[]) => convexReactMocks.useQuery(...args),
}))

vi.mock('../convex/client', () => ({
  convexHttp: {
    query: (...args: unknown[]) => convexHttpMock.query(...args),
  },
}))

vi.mock('../lib/site', () => ({
  getSiteMode: () => getSiteModeMock(),
}))

vi.mock('../components/InstallSwitcher', () => ({
  InstallSwitcher: () => <div>InstallSwitcher</div>,
}))

describe('Home route', () => {
  beforeEach(() => {
    getSiteModeMock.mockReset()
    navigateMock.mockReset()
    ensureSoulSeedsMock.mockReset()
    resetConvexReactMocks()

    convexHttpMock.query.mockResolvedValue({ page: [], hasMore: false, nextCursor: null })
    convexReactMocks.useAction.mockReturnValue(ensureSoulSeedsMock)
    convexReactMocks.useQuery.mockReturnValue([])
    getSiteModeMock.mockReturnValue('skills')
  })

  it('adds a secondary souls entry card on the skills home page', () => {
    render(<Home />)

    expect(screen.getByRole('link', { name: 'Browse souls' })).toBeTruthy()
    const publishSoulLink = screen.getByRole('link', { name: 'Publish a soul' })
    expect(JSON.parse(publishSoulLink.getAttribute('data-search') ?? '{}')).toEqual({
      mode: 'souls',
    })
  })

  it('uses explicit soul upload mode on the soul home page', () => {
    getSiteModeMock.mockReturnValue('souls')

    render(<Home />)

    const publishSoulLink = screen.getByRole('link', { name: 'Publish a soul' })
    expect(JSON.parse(publishSoulLink.getAttribute('data-search') ?? '{}')).toEqual({
      mode: 'souls',
    })
    expect(ensureSoulSeedsMock).toHaveBeenCalledWith({})
  })
})
