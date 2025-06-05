/**
 * URL Shortener Web Interface - Main JavaScript Application
 * Handles AJAX interactions, infinite scroll, form validation, and UI updates
 */

// Global application state
const App = {
  state: {
    isLoading: false,
    currentPage: 1,
    hasMoreUrls: true,
    isMobile: window.innerWidth < 768,
    urls: []
  },
  
  // Configuration
  config: {
    apiEndpoints: {
      create: '/api/web/create',
      delete: '/api/web/delete',
      list: '/api/web/urls'
    },
    pagination: {
      limit: 20
    },
    toast: {
      duration: 4000,
      errorDuration: 6000
    }
  }
}

/**
 * Initialize the application when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', function() {
  initializeApp()
})

/**
 * Initialize the main application
 */
function initializeApp() {
  try {
    // Load initial data from page
    loadInitialData()
    
    // Setup event listeners
    setupEventListeners()
    
    // Setup responsive handling
    setupResponsiveHandling()
    
    // Setup infinite scroll
    setupInfiniteScroll()
    
    // Show any initial messages
    showInitialMessages()
    
    console.log('URL Shortener app initialized successfully')
  } catch (error) {
    console.error('Failed to initialize app:', error)
    showErrorToast('Failed to initialize application. Please refresh the page.')
  }
}

/**
 * Load initial data from the page data container
 */
function loadInitialData() {
  const pageData = document.getElementById('page-data')
  if (!pageData) return
  
  try {
    // Parse URLs data
    const urlsData = pageData.getAttribute('data-urls')
    if (urlsData) {
      App.state.urls = JSON.parse(decodeURIComponent(urlsData))
    }
    
    // Parse error message
    const errorData = pageData.getAttribute('data-error')
    if (errorData) {
      const error = JSON.parse(decodeURIComponent(errorData))
      if (error) {
        App.initialError = error
      }
    }
    
    // Parse success message
    const successData = pageData.getAttribute('data-success')
    if (successData) {
      const success = JSON.parse(decodeURIComponent(successData))
      if (success) {
        App.initialSuccess = success
      }
    }
  } catch (error) {
    console.warn('Failed to parse initial page data:', error)
  }
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  // Form submission
  const urlForm = document.getElementById('url-form')
  if (urlForm) {
    urlForm.addEventListener('submit', handleFormSubmit)
  }
  
  // URL input validation
  const urlInput = document.getElementById('url-input')
  if (urlInput) {
    urlInput.addEventListener('input', handleUrlInputChange)
    urlInput.addEventListener('blur', validateUrlInput)
  }
  
  // Window resize for responsive handling
  window.addEventListener('resize', handleWindowResize)
  
  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboardShortcuts)
}

/**
 * Setup responsive design handling
 */
function setupResponsiveHandling() {
  updateMobileState()
  
  // Update layout based on screen size
  const tableView = document.querySelector('.hidden.md\\:block')
  const cardView = document.querySelector('.block.md\\:hidden')
  
  if (App.state.isMobile) {
    if (tableView) tableView.style.display = 'none'
    if (cardView) cardView.style.display = 'block'
  } else {
    if (tableView) tableView.style.display = 'block'
    if (cardView) cardView.style.display = 'none'
  }
}

/**
 * Setup infinite scroll functionality
 */
function setupInfiniteScroll() {
  let isScrolling = false
  
  window.addEventListener('scroll', function() {
    if (isScrolling) return
    
    isScrolling = true
    requestAnimationFrame(() => {
      handleInfiniteScroll()
      isScrolling = false
    })
  })
}

/**
 * Show initial messages from server
 */
function showInitialMessages() {
  if (App.initialError) {
    showErrorToast(App.initialError)
  }
  
  if (App.initialSuccess) {
    showSuccessToast(App.initialSuccess)
  }
}

/**
 * Handle form submission for URL creation
 * @param {Event} event - Form submit event
 */
async function handleFormSubmit(event) {
  event.preventDefault()
  
  if (App.state.isLoading) return
  
  const form = event.target
  const formData = new FormData(form)
  const url = formData.get('url')
  
  // Validate URL
  if (!validateUrl(url)) {
    showUrlError('Please enter a valid URL starting with http:// or https://')
    return
  }
  
  try {
    // Show loading state
    showFormLoading()
    App.state.isLoading = true
    
    // Make AJAX request
    const response = await fetch(App.config.apiEndpoints.create, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ url: url })
    })
    
    const result = await response.json()
    
    if (response.ok && result.success) {
      // Success - add URL to list and show success message
      addUrlToList(result.data)
      showSuccessToast('Short URL created successfully!')
      resetFormAfterSuccess()
    } else {
      // Error from server
      const errorMessage = result.message || 'Failed to create short URL'
      showErrorToast(errorMessage)
      
      if (result.field === 'url') {
        showUrlError(errorMessage)
      }
    }
  } catch (error) {
    console.error('Failed to create URL:', error)
    showErrorToast('Network error. Please check your connection and try again.')
  } finally {
    hideFormLoading()
    App.state.isLoading = false
  }
}

/**
 * Handle URL input changes for real-time validation
 * @param {Event} event - Input change event
 */
function handleUrlInputChange(event) {
  const input = event.target
  const url = input.value.trim()
  
  // Clear previous errors
  hideUrlError()
  
  // Real-time validation feedback
  if (url.length > 0 && !isValidUrlFormat(url)) {
    input.classList.add('border-yellow-500', 'focus:ring-yellow-500')
    input.classList.remove('border-gray-600', 'focus:ring-blue-500')
  } else {
    input.classList.remove('border-yellow-500', 'focus:ring-yellow-500')
    input.classList.add('border-gray-600', 'focus:ring-blue-500')
  }
}

/**
 * Validate URL input on blur
 * @param {Event} event - Input blur event
 */
function validateUrlInput(event) {
  const input = event.target
  const url = input.value.trim()
  
  if (url.length > 0 && !validateUrl(url)) {
    showUrlError('Please enter a valid URL starting with http:// or https://')
  }
}

/**
 * Handle window resize for responsive updates
 */
function handleWindowResize() {
  const wasMobile = App.state.isMobile
  updateMobileState()
  
  // Update layout if mobile state changed
  if (wasMobile !== App.state.isMobile) {
    setupResponsiveHandling()
  }
}

/**
 * Handle keyboard shortcuts
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleKeyboardShortcuts(event) {
  // Ctrl/Cmd + K to focus URL input
  if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
    event.preventDefault()
    const urlInput = document.getElementById('url-input')
    if (urlInput) {
      // Expand form if collapsed
      const container = document.getElementById('url-form-container')
      if (container && !container.classList.contains('expanded')) {
        toggleUrlForm()
      }
      urlInput.focus()
    }
  }
  
  // Escape to close form
  if (event.key === 'Escape') {
    const container = document.getElementById('url-form-container')
    if (container && container.classList.contains('expanded')) {
      cancelUrlForm()
    }
  }
}

/**
 * Handle infinite scroll
 */
async function handleInfiniteScroll() {
  if (App.state.isLoading || !App.state.hasMoreUrls) return
  
  const scrollPosition = window.innerHeight + window.scrollY
  const documentHeight = document.documentElement.offsetHeight
  const threshold = 200 // Load more when 200px from bottom
  
  if (scrollPosition >= documentHeight - threshold) {
    await loadMoreUrls()
  }
}

/**
 * Load more URLs for infinite scroll
 */
async function loadMoreUrls() {
  if (App.state.isLoading || !App.state.hasMoreUrls) return
  
  try {
    App.state.isLoading = true
    showInfiniteScrollLoading()
    
    const nextPage = App.state.currentPage + 1
    const response = await fetch(`${App.config.apiEndpoints.list}?page=${nextPage}&limit=${App.config.pagination.limit}`)
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const result = await response.json()
    
    if (result.success && result.data && result.data.length > 0) {
      // Add new URLs to the list
      result.data.forEach(url => {
        addUrlToList(url, false) // Don't show toast for infinite scroll
      })
      
      App.state.currentPage = nextPage
      App.state.urls = [...App.state.urls, ...result.data]
      
      // Check if there are more URLs
      if (result.data.length < App.config.pagination.limit) {
        App.state.hasMoreUrls = false
      }
    } else {
      App.state.hasMoreUrls = false
    }
  } catch (error) {
    console.error('Failed to load more URLs:', error)
    showErrorToast('Failed to load more URLs. Please try again.')
  } finally {
    App.state.isLoading = false
    hideInfiniteScrollLoading()
  }
}

/**
 * Delete a URL
 * @param {string} shortCode - Short code of URL to delete
 */
async function deleteUrl(shortCode) {
  if (App.state.isLoading) return
  
  // Confirm deletion
  if (!confirm('Are you sure you want to delete this URL? This action cannot be undone.')) {
    return
  }
  
  try {
    App.state.isLoading = true
    
    // Show loading state on delete button
    const deleteBtn = document.querySelector(`button[onclick="deleteUrl('${shortCode}')"]`)
    if (deleteBtn) {
      deleteBtn.disabled = true
      deleteBtn.innerHTML = `
        <div class="w-4 h-4 border-2 border-current border-t-transparent rounded-full spinner mr-1"></div>
        Deleting...
      `
    }
    
    const response = await fetch(`${App.config.apiEndpoints.delete}/${shortCode}`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json'
      }
    })
    
    const result = await response.json()
    
    if (response.ok && result.success) {
      // Remove from UI
      removeUrlFromList(shortCode)
      showSuccessToast('URL deleted successfully')
      
      // Update state
      App.state.urls = App.state.urls.filter(url => url.shortCode !== shortCode)
    } else {
      const errorMessage = result.message || 'Failed to delete URL'
      showErrorToast(errorMessage)
      
      // Restore delete button
      if (deleteBtn) {
        deleteBtn.disabled = false
        deleteBtn.innerHTML = `
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
          </svg>
          Delete
        `
      }
    }
  } catch (error) {
    console.error('Failed to delete URL:', error)
    showErrorToast('Network error. Please check your connection and try again.')
  } finally {
    App.state.isLoading = false
  }
}

/**
 * Add URL to the list (both table and cards)
 * @param {Object} url - URL object to add
 * @param {boolean} showToast - Whether to show success toast
 */
function addUrlToList(url, showToast = true) {
  // Add to table (desktop)
  if (typeof addUrlToTable === 'function') {
    addUrlToTable(url)
  }
  
  // Add to cards (mobile)
  if (typeof addUrlToCards === 'function') {
    addUrlToCards(url)
  }
  
  // Hide empty states
  hideEmptyStates()
  
  // Update state
  App.state.urls.unshift(url)
}

/**
 * Remove URL from the list (both table and cards)
 * @param {string} shortCode - Short code of URL to remove
 */
function removeUrlFromList(shortCode) {
  // Remove from table (desktop)
  if (typeof removeUrlFromTable === 'function') {
    removeUrlFromTable(shortCode)
  }
  
  // Remove from cards (mobile)
  if (typeof removeUrlFromCards === 'function') {
    removeUrlFromCards(shortCode)
  }
  
  // Show empty states if no URLs left
  if (App.state.urls.length <= 1) {
    showEmptyStates()
  }
}

/**
 * Hide empty state elements
 */
function hideEmptyStates() {
  const emptyState = document.getElementById('empty-state')
  const tableEmptyState = document.getElementById('table-empty-state')
  const cardsEmptyState = document.getElementById('cards-empty-state')
  
  if (emptyState) emptyState.classList.add('hidden')
  if (tableEmptyState) tableEmptyState.classList.add('hidden')
  if (cardsEmptyState) cardsEmptyState.classList.add('hidden')
}

/**
 * Show empty state elements
 */
function showEmptyStates() {
  const emptyState = document.getElementById('empty-state')
  const tableEmptyState = document.getElementById('table-empty-state')
  const cardsEmptyState = document.getElementById('cards-empty-state')
  
  if (emptyState) emptyState.classList.remove('hidden')
  if (tableEmptyState) tableEmptyState.classList.remove('hidden')
  if (cardsEmptyState) cardsEmptyState.classList.remove('hidden')
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} Whether URL is valid
 */
function validateUrl(url) {
  if (!url || typeof url !== 'string') return false
  
  const trimmedUrl = url.trim()
  if (trimmedUrl.length === 0) return false
  
  return isValidUrlFormat(trimmedUrl)
}

/**
 * Check if URL has valid format
 * @param {string} url - URL to check
 * @returns {boolean} Whether URL format is valid
 */
function isValidUrlFormat(url) {
  try {
    const urlObj = new URL(url)
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Update mobile state based on window width
 */
function updateMobileState() {
  App.state.isMobile = window.innerWidth < 768
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @param {string} successMessage - Success message to show
 */
async function copyToClipboard(text, successMessage = 'Copied to clipboard!') {
  try {
    await navigator.clipboard.writeText(text)
    showSuccessToast(successMessage)
  } catch (error) {
    console.error('Failed to copy to clipboard:', error)
    
    // Fallback for older browsers
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.left = '-999999px'
    textArea.style.top = '-999999px'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    
    try {
      document.execCommand('copy')
      showSuccessToast(successMessage)
    } catch (fallbackError) {
      showErrorToast('Failed to copy to clipboard')
    }
    
    document.body.removeChild(textArea)
  }
}

/**
 * Format URL for display with truncation
 * @param {string} url - URL to format
 * @param {number} maxLength - Maximum length
 * @returns {string} Formatted URL
 */
function formatUrlForDisplay(url, maxLength = 50) {
  if (!url || url.length <= maxLength) return url
  
  return url.substring(0, maxLength - 3) + '...'
}

/**
 * Debounce function to limit function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

// Make functions globally available for onclick handlers
window.deleteUrl = deleteUrl
window.copyToClipboard = copyToClipboard

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    App,
    validateUrl,
    isValidUrlFormat,
    formatUrlForDisplay,
    debounce
  }
} 