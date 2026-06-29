import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter, useNavigate, useSearchParams } from 'react-router-dom'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import SignupPage from '@/pages/SignupPage'
import LoginPage from '@/pages/LoginPage'
import { backendService } from '@/backend/BackendService'
import { createUserProfile, getUserProfile } from '@/firestore'

// Mock backend service
vi.mock('@/backend/BackendService', () => ({
  backendService: {
    auth: {
      signUp: vi.fn(),
      signIn: vi.fn(),
      signInWithGoogle: vi.fn(),
      getCurrentUser: vi.fn(() => ({ uid: 'mock-user', email: 'mock@example.com', displayName: 'Mock User' })),
      sendPasswordResetEmail: vi.fn(),
      sendEmailVerification: vi.fn(() => Promise.resolve()),
      signOut: vi.fn(() => Promise.resolve()),
    },
    documents: {
      get: vi.fn(async (collection: string, docId?: string) => {
        if (collection === 'users') {
          // Existing users (with keys/terms) should skip the terms dialog
          if (typeof docId === 'string' && docId.includes('existing')) {
            return { emailVerified: true, publicKey: 'existing-key', termsAcceptedAt: '2024-01-01' }
          }
          // New users only have verification flag so terms dialog shows
          return { emailVerified: true }
        }
        return null
      }),
      update: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    },
    utils: {
      serverTimestamp: vi.fn(() => new Date()),
    },
  },
}))

// Mock firestore functions
vi.mock('@/firestore', () => ({
  createUserProfile: vi.fn(),
  getUserProfile: vi.fn(),
}))

// Mock firebase
vi.mock('@/firebase', () => ({
  db: {},
  auth: {
    currentUser: null,
  },
}))

// Mock react-router-dom
const mockNavigate = vi.fn()
const mockSearchParams = new URLSearchParams()
const mockSetSearchParams = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [mockSearchParams, mockSetSearchParams],
  }
})

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaults?: any) => {
      const resolveDefault = () => {
        if (typeof defaults === 'string') return defaults
        if (defaults && typeof defaults === 'object' && 'defaultValue' in defaults) {
          return (defaults as { defaultValue: string }).defaultValue
        }
        return undefined
      }
      const translations: Record<string, string> = {
        'signup.title': 'Create Account',
        'signup.emailAddress': 'Email Address',
        'signup.password': 'Password',
        'signup.confirmPassword': 'Confirm Password',
        'signup.createAccountButton': 'Create Account',
        'signup.signUpWithGoogle': 'Sign up with Google',
        'signup.alreadyHaveAccount': 'Already have an account?',
        'signup.signInHere': 'Sign in here',
        'signup.passwordsDoNotMatch': 'Passwords do not match',
        'signup.passwordTooShort': 'Password must be at least 8 characters',
        'signup.signingUp': 'Creating account...',
        'signup.joinSeraVault': 'Join SeraVault',
        'signup.mustAcceptTerms': 'You must accept the Terms of Service',
        'login.welcomeBack': 'Welcome Back',
        'login.signInToAccount': 'Sign in to your account',
        'login.emailAddress': 'Email Address',
        'login.password': 'Password',
        'login.signIn': 'Sign In',
        'login.signInWithGoogle': 'Sign in with Google',
        'login.dontHaveAccount': "Don't have an account?",
        'login.signUpHere': 'Sign up here',
        'login.showPassword': 'Show password',
        'login.hidePassword': 'Hide password',
        'auth.signingIn': 'Signing in...',
        'auth.forgotPassword': 'Forgot Password?',
        'auth.emailRequired': 'Email is required',
        'auth.resetEmailSent': 'Password reset email sent',
        'auth.enterEmailForReset': 'Enter your email to receive a password reset link',
        'auth.sendResetLink': 'Send Reset Link',
        'auth.sending': 'Sending...',
        'common.cancel': 'Cancel',
      }
      return translations[key] || resolveDefault() || key
    },
    i18n: {
      language: 'en',
      changeLanguage: vi.fn(),
    },
  }),
}))

// Mock components
vi.mock('@/components/PasswordStrengthIndicator', () => ({
  default: () => null,
}))

vi.mock('@/components/TermsAcceptanceDialog', () => ({
  default: ({ open, onAccept, onDecline }: any) =>
    open ? (
      <div data-testid="terms-dialog">
        <button onClick={onAccept} data-testid="accept-terms">Accept</button>
        <button onClick={onDecline} data-testid="decline-terms">Decline</button>
      </div>
    ) : null,
}))

vi.mock('@/components/PhoneAuth', () => ({
  PhoneAuth: ({ onSuccess, onError, mode }: any) => (
    <div data-testid={`phone-auth-${mode}`}>
      <button onClick={() => onSuccess()}>Verify Phone</button>
      <button onClick={() => onError('Phone verification failed')}>Fail</button>
    </div>
  ),
}))

// Mock firestore functions
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => new Date()),
}))

// Simplify password complexity checks for predictable test output
vi.mock('@/utils/passwordStrength', () => ({
  validatePasswordComplexity: (password: string) => {
    if (password.length < 8) return ['Password must be at least 8 characters']
    return []
  },
  validatePassphraseComplexity: () => [],
}))

// Test wrapper
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

describe('Signup Page - Email Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    mockSearchParams.delete('invite')
    mockSearchParams.delete('plan')
    mockSearchParams.delete('lang')
  })

  it('renders signup form correctly', () => {
    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    )

    expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
  })

  it('validates password match before submission', async () => {
    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    )

    const emailInput = screen.getByLabelText(/email address/i)
    const passwordInput = screen.getByLabelText(/^password/i)
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i)
    const submitButton = screen.getByRole('button', { name: /create account/i })

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'different123' } })

    // Submit button should be disabled when passwords don't match
    expect(submitButton).toBeDisabled()
  })

  it('validates password length (minimum 8 characters)', async () => {
    vi.mocked(backendService.auth.signUp).mockResolvedValue({ uid: 'test-uid' } as any)
    vi.mocked(getUserProfile).mockResolvedValue(null)

    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    )

    const emailInput = screen.getByLabelText(/email address/i)
    const passwordInput = screen.getByLabelText(/^password/i)
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i)

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'short' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'short' } })

    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    })

    expect(backendService.auth.signUp).not.toHaveBeenCalled()
  })

  it('successfully creates new user account and shows terms dialog', async () => {
    const mockUser = { uid: 'new-user-123', email: 'newuser@example.com' }
    vi.mocked(backendService.auth.signUp).mockResolvedValue(mockUser as any)
    vi.mocked(getUserProfile).mockResolvedValue(null) // New user

    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    )

    const emailInput = screen.getByLabelText(/email address/i)
    const passwordInput = screen.getByLabelText(/^password/i)
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i)

    fireEvent.change(emailInput, { target: { value: 'newuser@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'SecurePass123!' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'SecurePass123!' } })

    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(backendService.auth.signUp).toHaveBeenCalledWith('newuser@example.com', 'SecurePass123!')
    })

    // Terms dialog should appear for new users
    await waitFor(() => {
      expect(screen.getByTestId('terms-dialog')).toBeInTheDocument()
    })
  })

  it('skips terms dialog for existing users', async () => {
    const mockUser = { uid: 'existing-user-123', email: 'existing@example.com' }
    const mockProfile = {
      uid: 'existing-user-123',
      email: 'existing@example.com',
      publicKey: 'existing-key',
      termsAcceptedAt: '2024-01-01',
    }

    vi.mocked(backendService.auth.signUp).mockResolvedValue(mockUser as any)
    vi.mocked(getUserProfile).mockResolvedValue(mockProfile as any)

    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    )

    const emailInput = screen.getByLabelText(/email address/i)
    const passwordInput = screen.getByLabelText(/^password/i)
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i)

    fireEvent.change(emailInput, { target: { value: 'existing@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'SecurePass123!' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'SecurePass123!' } })

    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(backendService.auth.signUp).toHaveBeenCalled()
    })

    // Should navigate to home for existing user with keys
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })

    // Terms dialog should NOT appear
    expect(screen.queryByTestId('terms-dialog')).not.toBeInTheDocument()
  })

  it('handles signup errors gracefully', async () => {
    // Suppress expected console errors during this test
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.mocked(backendService.auth.signUp).mockRejectedValue(
      new Error('Email already in use')
    )

    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    )

    const emailInput = screen.getByLabelText(/email address/i)
    const passwordInput = screen.getByLabelText(/^password/i)
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i)

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'SecurePass123!' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'SecurePass123!' } })

    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText('Email already in use')).toBeInTheDocument()
    })

    consoleErrorSpy.mockRestore()
  })

  it('shows password visibility toggle', () => {
    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    )

    const passwordInput = screen.getByLabelText(/^password/i) as HTMLInputElement
    expect(passwordInput.type).toBe('password')

    // Find and click the visibility toggle for password field (uses translation key)
    const toggleButtons = screen.getAllByLabelText(/signup.showPassword/)
    fireEvent.click(toggleButtons[0])

    // Password should now be visible
    expect(passwordInput.type).toBe('text')
  })
})

describe('Signup Page - Google Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
  })

  it('renders Google sign up button', () => {
    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    )

    expect(screen.getByRole('button', { name: /sign up with google/i })).toBeInTheDocument()
  })

  it('successfully signs up with Google for new users', async () => {
    const mockUser = { uid: 'google-user-123', email: 'googleuser@example.com' }
    vi.mocked(backendService.auth.signInWithGoogle).mockResolvedValue(mockUser as any)
    vi.mocked(getUserProfile).mockResolvedValue(null) // New user

    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    )

    const googleButton = screen.getByRole('button', { name: /sign up with google/i })
    fireEvent.click(googleButton)

    await waitFor(() => {
      expect(backendService.auth.signInWithGoogle).toHaveBeenCalled()
    })

    // Terms dialog should appear for new Google users
    await waitFor(() => {
      expect(screen.getByTestId('terms-dialog')).toBeInTheDocument()
    })
  })

  it('handles Google sign-in errors', async () => {
    // Suppress expected console errors during this test
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.mocked(backendService.auth.signInWithGoogle).mockRejectedValue(
      new Error('Google sign-in failed')
    )

    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    )

    const googleButton = screen.getByRole('button', { name: /sign up with google/i })
    fireEvent.click(googleButton)

    await waitFor(() => {
      expect(screen.getByText('Google sign-in failed')).toBeInTheDocument()
    })

    consoleErrorSpy.mockRestore()
  })
})

describe('Signup Page - Plan Selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
  })

  it('redirects to checkout for paid plan after signup', async () => {
    // Set plan in URL params
    mockSearchParams.set('plan', 'personal')

    const mockUser = { uid: 'new-user-123', email: 'newuser@example.com' }
    vi.mocked(backendService.auth.signUp).mockResolvedValue(mockUser as any)
    vi.mocked(getUserProfile).mockResolvedValue(null)
    vi.mocked(backendService.auth.getCurrentUser).mockReturnValue(mockUser as any)
    vi.mocked(createUserProfile).mockResolvedValue(undefined)

    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    )

    const emailInput = screen.getByLabelText(/email address/i)
    const passwordInput = screen.getByLabelText(/^password/i)
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i)

    fireEvent.change(emailInput, { target: { value: 'newuser@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'SecurePass123!' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'SecurePass123!' } })

    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    // Wait for terms dialog and accept
    await waitFor(() => {
      expect(screen.getByTestId('terms-dialog')).toBeInTheDocument()
    })

    const acceptButton = screen.getByTestId('accept-terms')
    fireEvent.click(acceptButton)

    // Should navigate to checkout with plan parameter
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/checkout?plan=personal')
    })
  })

  it('redirects to profile for free plan', async () => {
    // No plan or free plan in URL
    mockSearchParams.set('plan', 'free')

    const mockUser = { uid: 'new-user-123', email: 'newuser@example.com' }
    vi.mocked(backendService.auth.signUp).mockResolvedValue(mockUser as any)
    vi.mocked(getUserProfile).mockResolvedValue(null)
    vi.mocked(backendService.auth.getCurrentUser).mockReturnValue(mockUser as any)
    vi.mocked(createUserProfile).mockResolvedValue(undefined)

    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    )

    const emailInput = screen.getByLabelText(/email address/i)
    const passwordInput = screen.getByLabelText(/^password/i)
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i)

    fireEvent.change(emailInput, { target: { value: 'newuser@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'SecurePass123!' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'SecurePass123!' } })

    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByTestId('terms-dialog')).toBeInTheDocument()
    })

    const acceptButton = screen.getByTestId('accept-terms')
    fireEvent.click(acceptButton)

    // Should navigate to profile for key generation
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/profile')
    })
  })
})

describe('Login Page - Email Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
  })

  it('renders login form correctly', () => {
    render(
      <TestWrapper>
        <LoginPage />
      </TestWrapper>
    )

    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /email address/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument()
  })

  it('successfully logs in with email and password', async () => {
    vi.mocked(backendService.auth.signIn).mockResolvedValue(undefined)

    render(
      <TestWrapper>
        <LoginPage />
      </TestWrapper>
    )

    const emailInput = screen.getByRole('textbox', { name: /email address/i })
    const passwordInput = screen.getByLabelText(/^Password\s*\*/i)

    fireEvent.change(emailInput, { target: { value: 'user@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })

    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => {
      expect(backendService.auth.signIn).toHaveBeenCalledWith('user@example.com', 'password123')
    })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  it('handles login errors gracefully', async () => {
    vi.mocked(backendService.auth.signIn).mockRejectedValue(
      new Error('Invalid email or password')
    )

    render(
      <TestWrapper>
        <LoginPage />
      </TestWrapper>
    )

    const emailInput = screen.getByRole('textbox', { name: /email address/i })
    const passwordInput = screen.getByLabelText(/^Password\s*\*/i)

    fireEvent.change(emailInput, { target: { value: 'user@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } })

    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument()
    })
  })

  it('shows password visibility toggle', () => {
    render(
      <TestWrapper>
        <LoginPage />
      </TestWrapper>
    )

    const passwordInput = screen.getByLabelText(/^Password\s*\*/i) as HTMLInputElement
    expect(passwordInput.type).toBe('password')

    const toggleButton = screen.getByLabelText(/show password/i)
    fireEvent.click(toggleButton)

    expect(passwordInput.type).toBe('text')
  })
})

describe('Login Page - Google Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
  })

  it('renders Google sign in button', () => {
    render(
      <TestWrapper>
        <LoginPage />
      </TestWrapper>
    )

    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument()
  })

  it('successfully logs in with Google', async () => {
    vi.mocked(backendService.auth.signInWithGoogle).mockResolvedValue(undefined)

    render(
      <TestWrapper>
        <LoginPage />
      </TestWrapper>
    )

    const googleButton = screen.getByRole('button', { name: /sign in with google/i })
    fireEvent.click(googleButton)

    await waitFor(() => {
      expect(backendService.auth.signInWithGoogle).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  it('handles Google sign-in errors', async () => {
    vi.mocked(backendService.auth.signInWithGoogle).mockRejectedValue(
      new Error('Google authentication failed')
    )

    render(
      <TestWrapper>
        <LoginPage />
      </TestWrapper>
    )

    const googleButton = screen.getByRole('button', { name: /sign in with google/i })
    fireEvent.click(googleButton)

    await waitFor(() => {
      expect(screen.getByText('Google authentication failed')).toBeInTheDocument()
    })
  })
})

describe('Login Page - Forgot Password', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens forgot password dialog', async () => {
    // Suppress MUI Dialog nesting warning
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <TestWrapper>
        <LoginPage />
      </TestWrapper>
    )

    const forgotPasswordButton = screen.getByRole('button', { name: /forgot password/i })
    fireEvent.click(forgotPasswordButton)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
    expect(screen.getByText(/enter your email/i)).toBeInTheDocument()

    consoleErrorSpy.mockRestore()
  })

  it('sends password reset email', async () => {
    vi.mocked(backendService.auth.sendPasswordResetEmail).mockResolvedValue(undefined)

    render(
      <TestWrapper>
        <LoginPage />
      </TestWrapper>
    )

    // Open dialog
    const forgotPasswordButton = screen.getByRole('button', { name: /forgot password/i })
    fireEvent.click(forgotPasswordButton)

    // Wait for dialog to appear
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Enter email in the dialog
    const emailInputs = screen.getAllByLabelText(/email address/i)
    const dialogEmailInput = emailInputs[emailInputs.length - 1] // Last one is in the dialog
    fireEvent.change(dialogEmailInput, { target: { value: 'user@example.com' } })

    // Submit
    const sendButton = screen.getByRole('button', { name: /send reset link/i })
    fireEvent.click(sendButton)

    await waitFor(() => {
      expect(backendService.auth.sendPasswordResetEmail).toHaveBeenCalledWith('user@example.com')
    })

    await waitFor(() => {
      expect(screen.getByText(/password reset email sent/i)).toBeInTheDocument()
    })
  })

  it('validates email is required for password reset', async () => {
    render(
      <TestWrapper>
        <LoginPage />
      </TestWrapper>
    )

    // Open dialog
    const forgotPasswordButton = screen.getByRole('button', { name: /forgot password/i })
    fireEvent.click(forgotPasswordButton)

    // Try to submit without email
    const sendButton = screen.getByRole('button', { name: /send reset link/i })
    fireEvent.click(sendButton)

    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument()
    })

    expect(backendService.auth.sendPasswordResetEmail).not.toHaveBeenCalled()
  })

  it('closes forgot password dialog on cancel', async () => {
    // Suppress MUI Dialog nesting warning
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <TestWrapper>
        <LoginPage />
      </TestWrapper>
    )

    // Open dialog
    const forgotPasswordButton = screen.getByRole('button', { name: /forgot password/i })
    fireEvent.click(forgotPasswordButton)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Click cancel
    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelButton)

    // Wait for MUI Dialog exit animation (~300ms)
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    }, { timeout: 1000 })

    consoleErrorSpy.mockRestore()
  })
})

describe('Terms Acceptance Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
  })

  it('requires terms acceptance for new users', async () => {
    const mockUser = { uid: 'new-user-123', email: 'newuser@example.com' }
    vi.mocked(backendService.auth.signUp).mockResolvedValue(mockUser as any)
    vi.mocked(getUserProfile).mockResolvedValue(null)

    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    )

    const emailInput = screen.getByLabelText(/email address/i)
    const passwordInput = screen.getByLabelText(/^password/i)
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i)

    fireEvent.change(emailInput, { target: { value: 'newuser@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'SecurePass123!' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'SecurePass123!' } })

    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    // Terms dialog should appear
    await waitFor(() => {
      expect(screen.getByTestId('terms-dialog')).toBeInTheDocument()
    })
  })

  it('shows error when terms are declined', async () => {
    const mockUser = { uid: 'new-user-123', email: 'newuser@example.com' }
    vi.mocked(backendService.auth.signUp).mockResolvedValue(mockUser as any)
    vi.mocked(getUserProfile).mockResolvedValue(null)

    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    )

    const emailInput = screen.getByLabelText(/email address/i)
    const passwordInput = screen.getByLabelText(/^password/i)
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i)

    fireEvent.change(emailInput, { target: { value: 'newuser@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'SecurePass123!' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'SecurePass123!' } })

    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByTestId('terms-dialog')).toBeInTheDocument()
    })

    // Decline terms
    const declineButton = screen.getByTestId('decline-terms')
    fireEvent.click(declineButton)

    await waitFor(() => {
      expect(screen.getByText(/must accept the terms/i)).toBeInTheDocument()
    })
  })

  it('completes signup after accepting terms', async () => {
    const mockUser = { uid: 'new-user-123', email: 'newuser@example.com' }
    vi.mocked(backendService.auth.signUp).mockResolvedValue(mockUser as any)
    vi.mocked(getUserProfile).mockResolvedValue(null)
    vi.mocked(backendService.auth.getCurrentUser).mockReturnValue(mockUser as any)
    vi.mocked(createUserProfile).mockResolvedValue(undefined)

    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    )

    const emailInput = screen.getByLabelText(/email address/i)
    const passwordInput = screen.getByLabelText(/^password/i)
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i)

    fireEvent.change(emailInput, { target: { value: 'newuser@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'SecurePass123!' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'SecurePass123!' } })

    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByTestId('terms-dialog')).toBeInTheDocument()
    })

    // Accept terms
    const acceptButton = screen.getByTestId('accept-terms')
    fireEvent.click(acceptButton)

    await waitFor(() => {
      expect(createUserProfile).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/profile')
    })
  })
})

describe('Navigation Links', () => {
  it('signup page has link to login', () => {
    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    )

    expect(screen.getByText(/already have an account/i)).toBeInTheDocument()
    expect(screen.getByText(/sign in here/i)).toBeInTheDocument()
  })

  it('login page has link to signup', () => {
    render(
      <TestWrapper>
        <LoginPage />
      </TestWrapper>
    )

    expect(screen.getByText(/don't have an account/i)).toBeInTheDocument()
    expect(screen.getByText(/sign up here/i)).toBeInTheDocument()
  })
})
