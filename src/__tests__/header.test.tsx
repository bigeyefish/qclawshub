/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Header from '../components/Header'

const getSiteModeMock = vi.fn()
const getSiteNameMock = vi.fn()
const getClawHubSiteUrlMock = vi.fn()
const useAuthStatusMock = vi.fn()
const signInMock = vi.fn()
const signOutMock = vi.fn()
const clearAuthErrorMock = vi.fn()
const setModeMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
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

vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({
    signIn: signInMock,
    signOut: signOutMock,
  }),
}))

vi.mock('../lib/site', () => ({
  getSiteMode: () => getSiteModeMock(),
  getSiteName: (...args: unknown[]) => getSiteNameMock(...args),
  getClawHubSiteUrl: () => getClawHubSiteUrlMock(),
}))

vi.mock('../lib/useAuthStatus', () => ({
  useAuthStatus: () => useAuthStatusMock(),
}))

vi.mock('../lib/theme', () => ({
  useThemeMode: () => ({
    mode: 'system',
    setMode: setModeMock,
  }),
  applyTheme: vi.fn(),
}))

vi.mock('../lib/theme-transition', () => ({
  startThemeTransition: ({
    nextTheme,
    setTheme,
  }: {
    nextTheme: string
    setTheme: (value: string) => void
  }) => setTheme(nextTheme),
}))

vi.mock('../lib/useAuthError', () => ({
  useAuthError: () => ({
    error: null,
    clear: clearAuthErrorMock,
  }),
  setAuthError: vi.fn(),
}))

vi.mock('../lib/gravatar', () => ({
  gravatarUrl: () => undefined,
}))

vi.mock('../lib/roles', () => ({
  isModerator: () => false,
}))

vi.mock('../components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <div />,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('../components/ui/toggle-group', () => ({
  ToggleGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ToggleGroupItem: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}))

describe('Header', () => {
  beforeEach(() => {
    getSiteModeMock.mockReset()
    getSiteNameMock.mockReset()
    getClawHubSiteUrlMock.mockReset()
    useAuthStatusMock.mockReset()
    signInMock.mockReset()
    signOutMock.mockReset()
    clearAuthErrorMock.mockReset()
    setModeMock.mockReset()

    getSiteModeMock.mockReturnValue('skills')
    getSiteNameMock.mockImplementation((mode?: string) =>
      mode === 'souls' ? 'SoulHub' : 'ClawHub',
    )
    getClawHubSiteUrlMock.mockReturnValue('https://clawhub.ai')
    useAuthStatusMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      me: null,
    })
    window.history.replaceState(null, '', '/skills')
  })

  it('shows both skills and souls links in the main navigation', () => {
    render(<Header />)

    expect(screen.getAllByRole('link', { name: 'Skills' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'Souls' }).length).toBeGreaterThan(0)
  })

  it('preserves soul upload context from the current route', () => {
    getSiteModeMock.mockReturnValue('souls')
    window.history.replaceState(null, '', '/souls')

    render(<Header />)

    const uploadLinks = screen.getAllByRole('link', { name: 'Upload' })
    expect(
      uploadLinks.some((link) => JSON.parse(link.getAttribute('data-search') ?? '{}').mode === 'souls'),
    ).toBe(true)
    expect(screen.getAllByRole('link', { name: 'ClawHub' }).length).toBeGreaterThan(0)
  })

  it('defaults upload links to skills when browsing skills routes', () => {
    render(<Header />)

    const uploadLinks = screen.getAllByRole('link', { name: 'Upload' })
    expect(
      uploadLinks.some((link) => JSON.parse(link.getAttribute('data-search') ?? '{}').mode === 'skills'),
    ).toBe(true)
  })
})
