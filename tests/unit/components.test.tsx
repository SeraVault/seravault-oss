import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import FileTable from '@/components/FileTable'
import FormBuilder from '@/components/FormBuilder'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import ThemeSwitcher from '@/components/ThemeSwitcher'

// Mock dependencies
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'test-user', email: 'test@example.com' },
  }),
}))

vi.mock('@/theme/ThemeContext', () => ({
  useThemeContext: () => ({
    mode: 'light',
    toggleTheme: vi.fn(),
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

// Test wrapper component
const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const theme = createTheme()
  return (
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        {children}
      </ThemeProvider>
    </BrowserRouter>
  )
}

describe('FileTable Component', () => {
  const mockFiles = [
    {
      id: '1',
      name: 'document.pdf',
      size: '2.1 MB',
      owner: 'test-user',
      createdAt: new Date('2024-01-01'),
      parent: null,
      storagePath: '/files/doc.pdf',
      encryptedKeys: { 'test-user': 'encrypted-key' },
      sharedWith: ['test-user'],
    },
    {
      id: '2',
      name: 'image.jpg',
      size: '1.5 MB',
      owner: 'test-user',
      createdAt: new Date('2024-01-02'),
      parent: null,
      storagePath: '/files/img.jpg',
      encryptedKeys: { 'test-user': 'encrypted-key-2' },
      sharedWith: ['test-user'],
    }
  ]

  const mockFolders = [
    {
      id: 'folder-1',
      name: 'Documents',
      owner: 'test-user',
      parent: null,
      createdAt: new Date('2024-01-01'),
      encryptedKeys: { 'test-user': 'folder-key' },
    }
  ]

  const defaultProps = {
    files: mockFiles,
    folders: mockFolders,
    selectedFiles: new Set<string>(),
    loading: false,
    onFileSelect: vi.fn(),
    onFileClick: vi.fn(),
    onFileDoubleClick: vi.fn(),
    onContextMenu: vi.fn(),
    sortBy: 'name' as const,
    sortOrder: 'asc' as const,
    onSort: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders file list correctly', () => {
    render(
      <TestWrapper>
        <FileTable {...defaultProps} />
      </TestWrapper>
    )

    expect(screen.getByText('document.pdf')).toBeInTheDocument()
    expect(screen.getByText('image.jpg')).toBeInTheDocument()
    expect(screen.getByText('2.1 MB')).toBeInTheDocument()
    expect(screen.getByText('1.5 MB')).toBeInTheDocument()
  })

  it('renders folders correctly', () => {
    render(
      <TestWrapper>
        <FileTable {...defaultProps} />
      </TestWrapper>
    )

    expect(screen.getByText('Documents')).toBeInTheDocument()
  })

  it('handles file selection', () => {
    const onFileSelect = vi.fn()
    render(
      <TestWrapper>
        <FileTable {...defaultProps} onFileSelect={onFileSelect} />
      </TestWrapper>
    )

    const firstFileCheckbox = screen.getAllByRole('checkbox')[1] // Skip header checkbox
    fireEvent.click(firstFileCheckbox)

    expect(onFileSelect).toHaveBeenCalledWith('1', true)
  })

  it('handles file click', () => {
    const onFileClick = vi.fn()
    render(
      <TestWrapper>
        <FileTable {...defaultProps} onFileClick={onFileClick} />
      </TestWrapper>
    )

    const fileRow = screen.getByText('document.pdf').closest('tr')
    if (fileRow) {
      fireEvent.click(fileRow)
    }

    expect(onFileClick).toHaveBeenCalledWith(mockFiles[0])
  })

  it('shows loading state', () => {
    render(
      <TestWrapper>
        <FileTable {...defaultProps} loading={true} />
      </TestWrapper>
    )

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('shows empty state when no files', () => {
    render(
      <TestWrapper>
        <FileTable {...defaultProps} files={[]} folders={[]} />
      </TestWrapper>
    )

    expect(screen.getByText(/no files or folders/i)).toBeInTheDocument()
  })

  it('handles sorting', () => {
    const onSort = vi.fn()
    render(
      <TestWrapper>
        <FileTable {...defaultProps} onSort={onSort} />
      </TestWrapper>
    )

    const nameHeader = screen.getByText('Name')
    fireEvent.click(nameHeader)

    expect(onSort).toHaveBeenCalledWith('name')
  })
})

describe('FormBuilder Component', () => {
  const mockTemplates = [
    {
      id: 'template-1',
      name: 'Contact Form',
      description: 'Basic contact information form',
      category: 'personal',
      fields: [
        { id: 'name', label: 'Full Name', type: 'text', required: true },
        { id: 'email', label: 'Email', type: 'email', required: true },
      ]
    },
    {
      id: 'template-2',
      name: 'Survey Form',
      description: 'Customer satisfaction survey',
      category: 'business',
      fields: [
        { id: 'rating', label: 'Rating', type: 'number', required: true },
        { id: 'comments', label: 'Comments', type: 'textarea', required: false },
      ]
    }
  ]

  const defaultProps = {
    templates: mockTemplates,
    onFormCreate: vi.fn(),
    onTemplateSelect: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders template categories', () => {
    render(
      <TestWrapper>
        <FormBuilder {...defaultProps} />
      </TestWrapper>
    )

    expect(screen.getByText('personal')).toBeInTheDocument()
    expect(screen.getByText('business')).toBeInTheDocument()
  })

  it('renders template cards', () => {
    render(
      <TestWrapper>
        <FormBuilder {...defaultProps} />
      </TestWrapper>
    )

    expect(screen.getByText('Contact Form')).toBeInTheDocument()
    expect(screen.getByText('Survey Form')).toBeInTheDocument()
    expect(screen.getByText('Basic contact information form')).toBeInTheDocument()
  })

  it('handles template selection', () => {
    const onTemplateSelect = vi.fn()
    render(
      <TestWrapper>
        <FormBuilder {...defaultProps} onTemplateSelect={onTemplateSelect} />
      </TestWrapper>
    )

    const templateCard = screen.getByText('Contact Form').closest('div')
    if (templateCard) {
      fireEvent.click(templateCard)
    }

    expect(onTemplateSelect).toHaveBeenCalledWith(mockTemplates[0])
  })

  it('filters templates by category', () => {
    render(
      <TestWrapper>
        <FormBuilder {...defaultProps} />
      </TestWrapper>
    )

    const personalTab = screen.getByText('personal')
    fireEvent.click(personalTab)

    expect(screen.getByText('Contact Form')).toBeInTheDocument()
    expect(screen.queryByText('Survey Form')).not.toBeInTheDocument()
  })

  it('shows create custom form option', () => {
    render(
      <TestWrapper>
        <FormBuilder {...defaultProps} />
      </TestWrapper>
    )

    expect(screen.getByText(/create custom form/i)).toBeInTheDocument()
  })
})

describe('LanguageSwitcher Component', () => {
  const mockChangeLanguage = vi.fn()
  
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(require('react-i18next').useTranslation).mockReturnValue({
      t: (key: string) => key,
      i18n: { 
        language: 'en',
        changeLanguage: mockChangeLanguage,
      },
    })
  })

  it('renders language selector', () => {
    render(
      <TestWrapper>
        <LanguageSwitcher />
      </TestWrapper>
    )

    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('shows current language flag', () => {
    render(
      <TestWrapper>
        <LanguageSwitcher />
      </TestWrapper>
    )

    const flagEmoji = screen.getByText('🇺🇸') // US flag for English
    expect(flagEmoji).toBeInTheDocument()
  })

  it('opens language menu on click', async () => {
    render(
      <TestWrapper>
        <LanguageSwitcher />
      </TestWrapper>
    )

    const button = screen.getByRole('button')
    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByText(/english/i)).toBeInTheDocument()
      expect(screen.getByText(/español/i)).toBeInTheDocument()
      expect(screen.getByText(/français/i)).toBeInTheDocument()
    })
  })

  it('changes language when option selected', async () => {
    render(
      <TestWrapper>
        <LanguageSwitcher />
      </TestWrapper>
    )

    const button = screen.getByRole('button')
    fireEvent.click(button)

    await waitFor(() => {
      const spanishOption = screen.getByText(/español/i)
      fireEvent.click(spanishOption)
    })

    expect(mockChangeLanguage).toHaveBeenCalledWith('es')
  })
})

describe('ThemeSwitcher Component', () => {
  const mockToggleTheme = vi.fn()
  
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(require('@/theme/ThemeContext').useThemeContext).mockReturnValue({
      mode: 'light',
      toggleTheme: mockToggleTheme,
    })
  })

  it('renders theme toggle button', () => {
    render(
      <TestWrapper>
        <ThemeSwitcher />
      </TestWrapper>
    )

    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('shows light mode icon when in light theme', () => {
    render(
      <TestWrapper>
        <ThemeSwitcher />
      </TestWrapper>
    )

    // Should show moon icon (dark mode icon) to switch TO dark mode
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-label', expect.stringContaining('dark'))
  })

  it('shows dark mode icon when in dark theme', () => {
    vi.mocked(require('@/theme/ThemeContext').useThemeContext).mockReturnValue({
      mode: 'dark',
      toggleTheme: mockToggleTheme,
    })

    render(
      <TestWrapper>
        <ThemeSwitcher />
      </TestWrapper>
    )

    // Should show sun icon (light mode icon) to switch TO light mode
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-label', expect.stringContaining('light'))
  })

  it('toggles theme when clicked', () => {
    render(
      <TestWrapper>
        <ThemeSwitcher />
      </TestWrapper>
    )

    const button = screen.getByRole('button')
    fireEvent.click(button)

    expect(mockToggleTheme).toHaveBeenCalled()
  })
})

describe('Component Integration', () => {
  it('components work together without errors', () => {
    render(
      <TestWrapper>
        <div>
          <ThemeSwitcher />
          <LanguageSwitcher />
          <FileTable 
            files={[]}
            folders={[]}
            selectedFiles={new Set()}
            loading={false}
            onFileSelect={vi.fn()}
            onFileClick={vi.fn()}
            onFileDoubleClick={vi.fn()}
            onContextMenu={vi.fn()}
            sortBy="name"
            sortOrder="asc"
            onSort={vi.fn()}
          />
        </div>
      </TestWrapper>
    )

    // Should render without throwing errors
    expect(screen.getByRole('button')).toBeInTheDocument()
  })
})