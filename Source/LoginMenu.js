/**
 * Login Menu Module
 * Handles all functionality related to the account login dialog
 */

const BACKEND_URL = "https://prompanionce.onrender.com"; // Backend URL unchanged for compatibility

/**
 * Shows status popup with loading state
 */
function showStatusPopup(type) {
  const statusDialog = document.getElementById("status-dialog");
  const loadingEl = document.getElementById("status-loading");

  if (!statusDialog || !loadingEl) return;

  if (type === "loading") {
    loadingEl.hidden = false;
    statusDialog.showModal();
  } else {
    // Close dialog for any other type (success, error, etc.)
    loadingEl.hidden = true;
    statusDialog.close();
  }
}

/**
 * Stores authentication token in Chrome storage
 */
async function storeAuthToken(token) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ authToken: token }, () => {
      resolve();
    });
  });
}

/**
 * Registers a new user account
 */
async function registerUser(name, email, password) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: name || null,
        email: email,
        password: password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.error || "Registration failed");
      error.status = response.status; // Include status code for better error handling
      throw error;
    }

    return data;
  } catch (error) {
    throw error;
  }
}

/**
 * Logs in an existing user
 */
async function loginUser(email, password) {
  console.log("[PromptProfile™ LoginMenu] loginUser called with email:", email?.substring(0, 10));
  try {
    console.log("[PromptProfile™ LoginMenu] Making API call to:", `${BACKEND_URL}/api/auth/login`);
    const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email,
        password: password,
      }),
    });

    console.log("[PromptProfile™ LoginMenu] API response status:", response.status, response.statusText);
    const data = await response.json();
    console.log("[PromptProfile™ LoginMenu] API response data:", { hasToken: !!data.token, hasError: !!data.error });

    if (!response.ok) {
      throw new Error(data.error || "Login failed");
    }

    return data;
  } catch (error) {
    console.error("[PromptProfile™ LoginMenu] loginUser error:", error);
    throw error;
  }
}

/**
 * Gets authentication token from Chrome storage
 */
async function getAuthToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["authToken"], (items) => {
      resolve(items?.authToken || null);
    });
  });
}

/**
 * Requests password reset token for an email
 * @param {string} email - User's email address
 * @returns {Promise<Object>} Response with token or error
 */
async function requestPasswordReset(email) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/forgot-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to request password reset");
    }

    return data;
  } catch (error) {
    throw error;
  }
}

/**
 * Resets password using email and token
 * @param {string} email - User's email address
 * @param {string} token - Password reset token
 * @param {string} newPassword - New password
 * @returns {Promise<Object>} Response with success message or error
 */
async function resetPassword(email, token, newPassword) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/reset-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, token, newPassword }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to reset password");
    }

    return data;
  } catch (error) {
    throw error;
  }
}

/**
 * Fetches user profile from backend
 */
async function getUserProfile() {
  try {
    const token = await getAuthToken();
    console.log("[PromptProfile™ LoginMenu] getAuthToken result:", { hasToken: !!token });
    if (!token) {
      console.log("[PromptProfile™ LoginMenu] No auth token found");
      return null;
    }

    const response = await fetch(`${BACKEND_URL}/api/user/profile`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    console.log("[PromptProfile™ LoginMenu] Profile API response:", { status: response.status, ok: response.ok });

    if (!response.ok) {
      if (response.status === 401) {
        // Token is invalid, clear it
        chrome.storage.local.remove(["authToken"]);
        console.log("[PromptProfile™ LoginMenu] Token invalid, cleared");
      }
      return null;
    }

    const data = await response.json();
    console.log("[PromptProfile™ LoginMenu] Profile API data:", data);
    // Return the user object directly (same structure as sidepanel.js uses)
    const user = data.user || data;
    console.log("[PromptProfile™ LoginMenu] Extracted user:", user);
    return user;
  } catch (error) {
    console.error("[PromptProfile™ LoginMenu] Error fetching user profile:", error);
    return null;
  }
}

/**
 * Updates the logged-in view with user information
 */
async function updateLoggedInView() {
  const loggedInView = document.getElementById("account-logged-in-view");
  const loginView = document.getElementById("account-form");
  const userNameEl = document.getElementById("account-user-name");
  const planNameEl = document.getElementById("account-plan-name");

  if (!loggedInView || !loginView) return;

  const userProfile = await getUserProfile();
  
  if (userProfile) {
    // Show logged-in view, hide login view completely
    loggedInView.hidden = false;
    loggedInView.style.display = "block";
    loginView.hidden = true;
    loginView.style.display = "none";
    
    // Update user name/email - handle both { user: {...} } and direct user object
    const user = userProfile.user || userProfile;
    const displayName = (user.name && user.name.trim()) 
      ? user.name 
      : (user.email || "User");
    if (userNameEl) {
      userNameEl.textContent = displayName;
    }
    
    // Update plan (for now, always show FREE)
    if (planNameEl) {
      planNameEl.textContent = "FREE";
    }
  } else {
    // Show login view, hide logged-in view completely
    loggedInView.hidden = true;
    loggedInView.style.display = "none";
    loginView.hidden = false;
    loginView.style.display = "block";
  }
}

/**
 * Registers event handlers for the account login dialog
 */
export function registerAccountHandlers() {
  console.log("[PromptProfile™ LoginMenu] ========== REGISTERING ACCOUNT HANDLERS ==========");
  
  try {
    const accountDialog = document.getElementById("account-dialog");
    const accountTrigger = document.getElementById("open-account");
    const accountForm = document.getElementById("account-form");
    const createAccountLink = document.getElementById("open-create-account");
    const createAccountDialog = document.getElementById("create-account-dialog");
    const createAccountForm = document.getElementById("create-account-form");
    
    console.log("[PromptProfile™ LoginMenu] Registering account handlers:", {
      hasAccountDialog: !!accountDialog,
      hasAccountTrigger: !!accountTrigger,
      hasAccountForm: !!accountForm,
      hasCreateAccountLink: !!createAccountLink,
      hasCreateAccountDialog: !!createAccountDialog,
      hasCreateAccountForm: !!createAccountForm
    });
    
    if (!accountDialog || !accountTrigger || !accountForm) {
      console.error("[PromptProfile™ LoginMenu] Missing required elements:", {
        accountDialog: !!accountDialog,
        accountTrigger: !!accountTrigger,
        accountForm: !!accountForm
      });
      return;
    }

  const cancelButtons = accountDialog.querySelectorAll(".account__cancel");
  const closeButton = accountDialog.querySelector(".modal__close");
  const loggedInView = document.getElementById("account-logged-in-view");
  const loginView = document.getElementById("account-form");
  const switchAccountButton = document.getElementById("switch-account");
  const upgradeButton = document.getElementById("upgrade-button");

  accountTrigger.addEventListener("click", async (event) => {
    console.log("[PromptProfile™ LoginMenu] ========== ACCOUNT BUTTON CLICKED ==========");
    event.preventDefault();
    
    // Get elements
    const loggedInView = document.getElementById("account-logged-in-view");
    const loginView = document.getElementById("account-form");
    console.log("[PromptProfile™ LoginMenu] Elements found:", { 
      hasLoggedInView: !!loggedInView, 
      hasLoginView: !!loginView 
    });
    
    try {
      // FIRST: Check if user is logged in and show appropriate view BEFORE opening dialog
      const userProfile = await getUserProfile();
      console.log("[PromptProfile™ LoginMenu] User profile check result:", { 
        hasProfile: !!userProfile, 
        profile: userProfile 
      });
      
      if (userProfile && (userProfile.email || userProfile.name)) {
        // User is logged in - show logged-in view, hide login view
        console.log("[PromptProfile™ LoginMenu] User IS logged in, showing logged-in view");
        
        // Force hide login view
        if (loginView) {
          loginView.hidden = true;
          loginView.style.display = "none";
          loginView.style.visibility = "hidden";
          console.log("[PromptProfile™ LoginMenu] Login view hidden");
        }
        
        // Force show logged-in view
        if (loggedInView) {
          loggedInView.hidden = false;
          loggedInView.style.display = "block";
          loggedInView.style.visibility = "visible";
          console.log("[PromptProfile™ LoginMenu] Logged-in view shown");
        }
        
        // Update user info
        const userNameEl = document.getElementById("account-user-name");
        const planNameEl = document.getElementById("account-plan-name");
        const displayName = (userProfile.name && userProfile.name.trim()) 
          ? userProfile.name 
          : (userProfile.email || "User");
        console.log("[PromptProfile™ LoginMenu] Setting display name:", displayName);
        if (userNameEl) {
          userNameEl.textContent = displayName;
        }
        if (planNameEl) {
          planNameEl.textContent = "FREE";
        }
      } else {
        // User is NOT logged in - show login view, hide logged-in view
        console.log("[PromptProfile™ LoginMenu] User is NOT logged in, showing login view");
        
        // Force hide logged-in view
        if (loggedInView) {
          loggedInView.hidden = true;
          loggedInView.style.display = "none";
          loggedInView.style.visibility = "hidden";
        }
        
        // Force show login view
        if (loginView) {
          loginView.hidden = false;
          loginView.style.display = "block";
          loginView.style.visibility = "visible";
        }
      }
      
      // NOW open the dialog with the correct view already set
      accountDialog.showModal();
      console.log("[PromptProfile™ LoginMenu] Account dialog opened");
      
      // Re-attach login button handler after dialog opens (in case DOM changed)
      setTimeout(() => {
        const loginBtn = accountForm.querySelector('button[value="login"], button.account__submit');
        if (loginBtn) {
          console.log("[PromptProfile™ LoginMenu] Re-attaching login button handler after dialog open");
          loginBtn.type = "button";
          // Handler should already be attached, but ensure it's there
        }
      }, 50);
      
      // Double-check visibility after dialog opens
      setTimeout(() => {
        console.log("[PromptProfile™ LoginMenu] Post-open check:", {
          loggedInViewHidden: loggedInView?.hidden,
          loggedInViewDisplay: loggedInView?.style.display,
          loginViewHidden: loginView?.hidden,
          loginViewDisplay: loginView?.style.display
        });
      }, 100);
      
    } catch (error) {
      console.error("[PromptProfile™ LoginMenu] Error opening account dialog:", error);
      // On error, default to login view
      if (loggedInView) {
        loggedInView.hidden = true;
        loggedInView.style.display = "none";
      }
      if (loginView) {
        loginView.hidden = false;
        loginView.style.display = "block";
      }
      accountDialog.showModal();
    }
  });

  // Handle "Switch accounts?" button
  if (switchAccountButton) {
    switchAccountButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      console.log("[PromptProfile™ LoginMenu] Switch accounts button clicked");
      
      // Clear auth token
      chrome.storage.local.remove(["authToken"], () => {
        console.log("[PromptProfile™ LoginMenu] Auth token cleared");
        
        // Hide logged-in view
        if (loggedInView) {
          loggedInView.hidden = true;
          loggedInView.style.display = "none";
          loggedInView.style.visibility = "hidden";
          console.log("[PromptProfile™ LoginMenu] Logged-in view hidden");
        }
        
        // Show login view
        if (loginView) {
          loginView.hidden = false;
          loginView.style.display = "block";
          loginView.style.visibility = "visible";
          console.log("[PromptProfile™ LoginMenu] Login view shown");
        }
        
        // Keep dialog open - don't close it
        // The dialog should remain open with the login form now visible
      });
    });
  }

  // Handle "UPGRADE NOW" button - triggers Stripe checkout
  if (upgradeButton) {
    upgradeButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      
      const BACKEND_URL = "https://prompanionce.onrender.com";
      
      // Disable button to prevent double-clicks
      upgradeButton.disabled = true;
      const originalText = upgradeButton.textContent;
      upgradeButton.textContent = "Loading...";

      try {
        // Get auth token
        const authToken = await chrome.storage.local.get("authToken");
        const token = authToken.authToken;

        if (!token) {
          alert("Please log in to upgrade your plan.");
          upgradeButton.disabled = false;
          upgradeButton.textContent = originalText;
          return;
        }

        // Create checkout session
        const response = await fetch(`${BACKEND_URL}/api/checkout/create-session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          }
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(error.error || "Failed to create checkout session");
        }

        const data = await response.json();

        // Redirect to Stripe Checkout
        if (data.url) {
          // Open in new tab
          chrome.tabs.create({ url: data.url });
          // Reset button after successful checkout session creation
          upgradeButton.disabled = false;
          upgradeButton.textContent = "Get PromptProfile Pro";
          // Close the account dialog
          accountDialog.close();
        } else {
          throw new Error("No checkout URL received");
        }
      } catch (error) {
        console.error("[PromptProfile™ LoginMenu] Checkout error:", error);
        alert("Failed to start checkout: " + error.message + "\n\nPlease try again or contact support.");
        upgradeButton.disabled = false;
        upgradeButton.textContent = "Get PromptProfile Pro";
      }
    });
  }

  // Close button handlers
  const closeDialog = (event) => {
    event.preventDefault();
    event.stopPropagation();
    console.log("[PromptProfile™ LoginMenu] Closing account dialog");
    accountDialog.close("cancel");
  };

  cancelButtons.forEach((button) => {
    button.addEventListener("click", closeDialog);
  });

  if (closeButton) {
    closeButton.addEventListener("click", closeDialog);
  }

  // Also handle backdrop clicks
  accountDialog.addEventListener("click", (event) => {
    if (event.target === accountDialog) {
      accountDialog.close("cancel");
    }
  });

  // Handle Escape key
  accountDialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      accountDialog.close("cancel");
    }
  });

  // Handle form submission (Enter key) and button clicks with the same handler
  // Wait a bit to ensure DOM is ready
  setTimeout(() => {
    const loginSubmitButton = accountForm.querySelector('button[value="login"], button.account__submit, button[type="submit"], button[type="button"].account__submit');
    if (loginSubmitButton) {
      console.log("[PromptProfile™ LoginMenu] Found login submit button:", loginSubmitButton);
      console.log("[PromptProfile™ LoginMenu] Button type BEFORE:", loginSubmitButton.type, "Button value:", loginSubmitButton.value);
      
      // Remove type="submit" to prevent form submission from button click
      loginSubmitButton.type = "button";
      console.log("[PromptProfile™ LoginMenu] Button type AFTER:", loginSubmitButton.type);
      
      const handleLogin = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      console.log("[PromptProfile™ LoginMenu] ========== LOG IN BUTTON CLICKED ==========");
      
      // Store references to ensure we can restore them on error
      const accountDialogRef = accountDialog;
      const loginViewRef = loginView;
      const loggedInViewRef = loggedInView;
      
      // Clear any existing error message when starting a new login attempt
      const existingErrorEl = document.getElementById("login-error-message");
      if (existingErrorEl) {
        existingErrorEl.hidden = true;
        existingErrorEl.textContent = "";
      }
      
      const formData = new FormData(accountForm);
      const email = formData.get("email");
      const password = formData.get("password");

      console.log("[PromptProfile™ LoginMenu] Form data:", { hasEmail: !!email, hasPassword: !!password, email: email?.substring(0, 10) });

      // Clear any existing error message when attempting login
      const errorMessageElValidation = document.getElementById("login-error-message");
      if (errorMessageElValidation) {
        errorMessageElValidation.hidden = true;
        errorMessageElValidation.textContent = "";
      }

      if (!email || !password) {
        shouldPreventClose = false; // Allow dialog to close if user cancels or closes manually
        if (errorMessageElValidation) {
          errorMessageElValidation.textContent = "Please enter both email and password";
          errorMessageElValidation.hidden = false;
        } else {
          alert("Please enter both email and password");
        }
        return;
      }

      console.log("[PromptProfile™ LoginMenu] Showing loading popup...");
      const statusDialog = document.getElementById("status-dialog");
      const loadingEl = document.getElementById("status-loading");
      console.log("[PromptProfile™ LoginMenu] Status dialog elements:", { hasDialog: !!statusDialog, hasLoading: !!loadingEl });
      
      if (statusDialog && loadingEl) {
        loadingEl.hidden = false;
        statusDialog.showModal();
        console.log("[PromptProfile™ LoginMenu] Loading popup shown");
      } else {
        console.error("[PromptProfile™ LoginMenu] Status dialog elements not found!");
      }
      
      console.log("[PromptProfile™ LoginMenu] Calling loginUser API...");
      
      try {
        const data = await loginUser(email, password);
        console.log("[PromptProfile™ LoginMenu] Login successful, storing token");
        await storeAuthToken(data.token);
        if (statusDialog) {
          statusDialog.close();
        }
        accountDialog.close();
        console.log("[PromptProfile™ LoginMenu] Reloading page to update UI");
        // Reload to update UI state
        window.location.reload();
      } catch (error) {
        console.error("[PromptProfile™ LoginMenu] Login error:", error);
        
        // Close status dialog only
        if (statusDialog) {
          statusDialog.close();
        }
        
        // CRITICAL: Do NOT close account dialog on error - keep it open for retry
        // Ensure login view is visible (not logged-in view)
        if (loginViewRef) {
          loginViewRef.hidden = false;
          loginViewRef.style.display = "block";
          loginViewRef.style.visibility = "visible";
        }
        if (loggedInViewRef) {
          loggedInViewRef.hidden = true;
          loggedInViewRef.style.display = "none";
          loggedInViewRef.style.visibility = "hidden";
        }
        
        // Display error message in the login form instead of alert
        const errorMessageEl = document.getElementById("login-error-message");
        if (errorMessageEl) {
          // Extract error message - prefer "Invalid email or password" message from backend
          let displayMessage = error.message || "Login failed. Check your internet connection. If the issue persists, contact customer support or try again later.";
          
          // If it's a password/email error, show simpler message
          if (displayMessage.includes("Invalid email or password") || displayMessage.includes("invalid")) {
            displayMessage = "Incorrect password";
          }
          
          errorMessageEl.textContent = displayMessage;
          errorMessageEl.hidden = false;
        }
        
        // CRITICAL: Ensure dialog stays open - explicitly keep it open
        if (accountDialogRef) {
          if (!accountDialogRef.open) {
            console.warn("[PromptProfile™ LoginMenu] Account dialog was closed, reopening it");
            accountDialogRef.showModal();
          }
        }
        
        console.log("[PromptProfile™ LoginMenu] Login failed, keeping dialog open for retry");
        // DO NOT close the dialog - let user retry
      }
    };
    
      // Set onclick directly as PRIMARY handler (most reliable)
      loginSubmitButton.onclick = handleLogin;
      
      // Also attach event listeners as backup
      loginSubmitButton.addEventListener("click", handleLogin, { capture: true, once: false });
      loginSubmitButton.addEventListener("mousedown", (e) => {
        console.log("[PromptProfile™ LoginMenu] MOUSEDOWN on login button!");
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleLogin(e);
      }, { capture: true });
      
      // Also handle pointerdown for touch devices
      loginSubmitButton.addEventListener("pointerdown", (e) => {
        console.log("[PromptProfile™ LoginMenu] POINTERDOWN on login button!");
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleLogin(e);
      }, { capture: true });
      
      // Clear error message when user starts typing in email or password fields
      const emailInput = accountForm.querySelector('input[name="email"]');
      const passwordInput = accountForm.querySelector('input[name="password"]');
      const errorMessageElForClear = document.getElementById("login-error-message");
      
      const clearError = () => {
        if (errorMessageElForClear && !errorMessageElForClear.hidden) {
          errorMessageElForClear.hidden = true;
          errorMessageElForClear.textContent = "";
        }
      };
      
      if (emailInput) {
        emailInput.addEventListener("input", clearError);
        emailInput.addEventListener("focus", clearError);
        // Handle Enter key in email field
        emailInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            handleLogin(e);
          }
        });
      }
      if (passwordInput) {
        passwordInput.addEventListener("input", clearError);
        passwordInput.addEventListener("focus", clearError);
        // Handle Enter key in password field
        passwordInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            handleLogin(e);
          }
        });
      }
      
      // Handle form submission (Enter key) - call the same login handler
      const handleFormSubmit = (e) => {
        console.log("[PromptProfile™ LoginMenu] Form submit event fired (Enter key pressed)");
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        // Call the same login handler that button clicks use
        handleLogin(e);
      };
      
      // Add form submit handler to handle Enter key
      accountForm.addEventListener("submit", handleFormSubmit, { capture: true });
      accountForm._submitHandler = handleFormSubmit; // Store reference for removal
      
      // Test if button is clickable
      console.log("[PromptProfile™ LoginMenu] Button element:", {
        type: loginSubmitButton.type,
        disabled: loginSubmitButton.disabled,
        hidden: loginSubmitButton.hidden,
        display: window.getComputedStyle(loginSubmitButton).display,
        pointerEvents: window.getComputedStyle(loginSubmitButton).pointerEvents,
        hasOnclick: !!loginSubmitButton.onclick
      });
      
      console.log("[PromptProfile™ LoginMenu] Login button handler attached with onclick + multiple listeners");
    } else {
      console.error("[PromptProfile™ LoginMenu] Login submit button NOT FOUND!");
    }
  }, 100); // Small delay to ensure DOM is ready

  accountDialog.addEventListener("close", () => {
    accountForm.reset();
    // Reset views when dialog closes - show login view by default
    if (loggedInView) {
      loggedInView.hidden = true;
      loggedInView.style.display = "none";
    }
    if (loginView) {
      loginView.hidden = false;
      loginView.style.display = "block";
    }
    
    // Clear error message when dialog closes
    const errorMessageEl = document.getElementById("login-error-message");
    if (errorMessageEl) {
      errorMessageEl.hidden = true;
      errorMessageEl.textContent = "";
    }
  });

  // Create Account Dialog Handlers
  if (createAccountLink && createAccountDialog && createAccountForm) {
    createAccountLink.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      // Open create account dialog on top of login dialog
      createAccountDialog.showModal();
    });

    const createAccountCancelButtons = createAccountDialog.querySelectorAll(".create-account__cancel");
    const createAccountCloseButton = createAccountDialog.querySelector(".modal__close");
    
    const closeCreateDialog = (event) => {
      event.preventDefault();
      event.stopPropagation();
      console.log("[PromptProfile™ LoginMenu] Closing create account dialog");
      createAccountDialog.close("cancel");
    };

    createAccountCancelButtons.forEach((button) => {
      button.addEventListener("click", closeCreateDialog);
    });

    if (createAccountCloseButton) {
      createAccountCloseButton.addEventListener("click", closeCreateDialog);
    }

    // Handle backdrop clicks for create account dialog
    createAccountDialog.addEventListener("click", (event) => {
      if (event.target === createAccountDialog) {
        createAccountDialog.close("cancel");
      }
    });

    // Handle Escape key for create account dialog
    createAccountDialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        createAccountDialog.close("cancel");
      }
    });

    createAccountForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(createAccountForm);
      const name = formData.get("name");
      const email = formData.get("email");
      const password = formData.get("password");
      const confirmPassword = formData.get("confirmPassword");

      // Clear any existing error message
      const errorMessageEl = document.getElementById("create-account-error-message");
      if (errorMessageEl) {
        errorMessageEl.hidden = true;
        errorMessageEl.textContent = "";
      }

      // Validation
      if (!email || !password) {
        if (errorMessageEl) {
          errorMessageEl.textContent = "Please enter both email and password";
          errorMessageEl.hidden = false;
        } else {
          alert("Please enter both email and password");
        }
        return;
      }

      if (password !== confirmPassword) {
        if (errorMessageEl) {
          errorMessageEl.textContent = "Passwords do not match";
          errorMessageEl.hidden = false;
        } else {
          alert("Passwords do not match");
        }
        return;
      }

      if (password.length < 8) {
        if (errorMessageEl) {
          errorMessageEl.textContent = "Password must be at least 8 characters long";
          errorMessageEl.hidden = false;
        } else {
          alert("Password must be at least 8 characters long");
        }
        return;
      }

      showStatusPopup("loading");

      try {
        const data = await registerUser(name, email, password);
        await storeAuthToken(data.token);
        showStatusPopup("close");
        createAccountDialog.close();
        // Auto-login: close login dialog and reload
        if (accountDialog) {
          accountDialog.close();
        }
        window.location.reload();
      } catch (error) {
        showStatusPopup("close");
        
        // Check if this is an "email already exists" error (409 status or error message)
        const errorMessage = error.message || "Account Creation Failed. Check your internet connection. If the issue persists, contact customer support or try again later.";
        let displayMessage = errorMessage;
        
        // Check for email already exists errors (409 conflict status or "already exists" in message)
        if (error.status === 409 || errorMessage.includes("already exists") || errorMessage.includes("User already exists")) {
          displayMessage = "An account with this email already exists. Please log in with your password or use a different email.";
        }
        
        // Display error message in the form instead of alert
        if (errorMessageEl) {
          errorMessageEl.textContent = displayMessage;
          errorMessageEl.hidden = false;
        } else {
          alert(displayMessage);
        }
        
        // Keep the dialog open so user can retry or go to login
        // Do NOT close the dialog
      }
    });

    createAccountDialog.addEventListener("close", () => {
      createAccountForm.reset();
      // Reset password visibility when dialog closes
      const passwordInputs = createAccountDialog.querySelectorAll(".account__input--password");
      passwordInputs.forEach((input) => {
        input.type = "password";
        const toggle = createAccountDialog.querySelector(`[data-target="${input.id}"]`);
        if (toggle) {
          toggle.textContent = "Show";
        }
      });
      
      // Clear error message when dialog closes
      const errorMessageEl = document.getElementById("create-account-error-message");
      if (errorMessageEl) {
        errorMessageEl.hidden = true;
        errorMessageEl.textContent = "";
      }
    });
    
    // Add event listeners to clear error message when user types
    const createAccountEmailInput = createAccountForm.querySelector('input[name="email"]');
    const createAccountPasswordInput = createAccountForm.querySelector('input[name="password"]');
    const createAccountConfirmPasswordInput = createAccountForm.querySelector('input[name="confirmPassword"]');
    const createAccountNameInput = createAccountForm.querySelector('input[name="name"]');
    
    const clearCreateAccountError = () => {
      const errorMessageElForClear = document.getElementById("create-account-error-message");
      if (errorMessageElForClear && !errorMessageElForClear.hidden) {
        errorMessageElForClear.hidden = true;
        errorMessageElForClear.textContent = "";
      }
    };
    
    if (createAccountEmailInput) {
      createAccountEmailInput.addEventListener("input", clearCreateAccountError);
      createAccountEmailInput.addEventListener("focus", clearCreateAccountError);
    }
    if (createAccountPasswordInput) {
      createAccountPasswordInput.addEventListener("input", clearCreateAccountError);
      createAccountPasswordInput.addEventListener("focus", clearCreateAccountError);
    }
    if (createAccountConfirmPasswordInput) {
      createAccountConfirmPasswordInput.addEventListener("input", clearCreateAccountError);
      createAccountConfirmPasswordInput.addEventListener("focus", clearCreateAccountError);
    }
    if (createAccountNameInput) {
      createAccountNameInput.addEventListener("input", clearCreateAccountError);
      createAccountNameInput.addEventListener("focus", clearCreateAccountError);
    }
    
    // Handle "Forgot Password?" button click in create account form
    const forgotPasswordInCreateAccount = document.getElementById("create-account-forgot-password");
    if (forgotPasswordInCreateAccount) {
      forgotPasswordInCreateAccount.addEventListener("click", () => {
        // Close create account dialog
        createAccountDialog.close();
        // Open forgot password email dialog
        const forgotPasswordEmailDialog = document.getElementById("forgot-password-email-dialog");
        if (forgotPasswordEmailDialog) {
          forgotPasswordEmailDialog.showModal();
        }
      });
    }
  }

  // Password Reset Handlers
  const forgotPasswordButton = document.getElementById("forgot-password");
  const forgotPasswordEmailDialog = document.getElementById("forgot-password-email-dialog");
  const forgotPasswordEmailForm = document.getElementById("forgot-password-email-form");
  const forgotPasswordResetDialog = document.getElementById("forgot-password-reset-dialog");
  const forgotPasswordResetForm = document.getElementById("forgot-password-reset-form");

  // Store email and token for password reset flow
  let passwordResetEmail = null;
  let passwordResetToken = null;

  // Handle "Forgot Password?" button in login form
  if (forgotPasswordButton) {
    forgotPasswordButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      console.log("[PromptProfile™ LoginMenu] Forgot Password button clicked");

      // Hide user email in logged-in view if visible
      const userNameEl = document.getElementById("account-user-name");
      if (userNameEl && userNameEl.textContent && userNameEl.textContent !== "Loading..." && userNameEl.textContent !== "User") {
        // Store email temporarily (though we'll ask for it again for security)
        passwordResetEmail = null; // Clear any previous value
        userNameEl.textContent = "User"; // Hide the actual email
      }

      // Close account dialog
      if (accountDialog) {
        accountDialog.close();
      }

      // Open forgot password email dialog
      if (forgotPasswordEmailDialog) {
        forgotPasswordEmailDialog.showModal();
      }
    });
  }

  // Forgot Password Email Dialog Handlers
  if (forgotPasswordEmailDialog && forgotPasswordEmailForm) {
    const emailCancelButtons = forgotPasswordEmailDialog.querySelectorAll(".forgot-password-email__cancel");
    const emailCloseButton = forgotPasswordEmailDialog.querySelector(".modal__close");
    const emailSubmitButton = forgotPasswordEmailForm.querySelector(".forgot-password-email__submit");

    const closeEmailDialog = (event) => {
      event.preventDefault();
      event.stopPropagation();
      forgotPasswordEmailDialog.close("cancel");
    };

    emailCancelButtons.forEach((button) => {
      button.addEventListener("click", closeEmailDialog);
    });

    if (emailCloseButton) {
      emailCloseButton.addEventListener("click", closeEmailDialog);
    }

    // Handle backdrop clicks
    forgotPasswordEmailDialog.addEventListener("click", (event) => {
      if (event.target === forgotPasswordEmailDialog) {
        forgotPasswordEmailDialog.close("cancel");
      }
    });

    // Handle Escape key
    forgotPasswordEmailDialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        forgotPasswordEmailDialog.close("cancel");
      }
    });

    // Handle email form submission
    if (emailSubmitButton) {
      emailSubmitButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const emailInput = document.getElementById("forgot-password-email");
        const errorMessageEl = document.getElementById("forgot-password-email-error-message");

        // Clear any existing error message
        if (errorMessageEl) {
          errorMessageEl.hidden = true;
          errorMessageEl.textContent = "";
        }

        if (!emailInput || !emailInput.value) {
          if (errorMessageEl) {
            errorMessageEl.textContent = "Please enter your email address";
            errorMessageEl.hidden = false;
          } else {
            alert("Please enter your email address");
          }
          return;
        }

        const email = emailInput.value.trim();

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          if (errorMessageEl) {
            errorMessageEl.textContent = "Please enter a valid email address";
            errorMessageEl.hidden = false;
          } else {
            alert("Please enter a valid email address");
          }
          return;
        }

        // Disable submit button
        emailSubmitButton.disabled = true;
        const originalText = emailSubmitButton.textContent;
        emailSubmitButton.textContent = "Loading...";

        try {
          showStatusPopup("loading");
          const data = await requestPasswordReset(email);

          showStatusPopup("close");

          // Check if token was returned (email exists)
          if (data.token) {
            // Store email and token for next step
            passwordResetEmail = email;
            passwordResetToken = data.token;

            // Close email dialog and open reset dialog
            forgotPasswordEmailDialog.close();
            if (forgotPasswordResetDialog) {
              forgotPasswordResetDialog.showModal();
            }
          } else {
            // Email doesn't exist, but we show a generic message for security
            if (errorMessageEl) {
              errorMessageEl.textContent = "No account found with this email address";
              errorMessageEl.hidden = false;
            } else {
              alert("No account found with this email address");
            }
          }
        } catch (error) {
          showStatusPopup("close");
          console.error("[PromptProfile™ LoginMenu] Password reset request error:", error);
          
          let displayMessage = error.message || "Failed to request password reset. Please check your connection and try again.";
          
          if (error.message && error.message.includes("No account found")) {
            displayMessage = "No account found with this email address";
          }

          if (errorMessageEl) {
            errorMessageEl.textContent = displayMessage;
            errorMessageEl.hidden = false;
          } else {
            alert(displayMessage);
          }
        } finally {
          emailSubmitButton.disabled = false;
          emailSubmitButton.textContent = originalText;
        }
      });
    }

    // Clear error message when user types
    const emailInput = document.getElementById("forgot-password-email");
    if (emailInput) {
      emailInput.addEventListener("input", () => {
        const errorMessageEl = document.getElementById("forgot-password-email-error-message");
        if (errorMessageEl && !errorMessageEl.hidden) {
          errorMessageEl.hidden = true;
          errorMessageEl.textContent = "";
        }
      });
    }

    // Reset form when dialog closes
    forgotPasswordEmailDialog.addEventListener("close", () => {
      if (forgotPasswordEmailForm) {
        forgotPasswordEmailForm.reset();
      }
      const errorMessageEl = document.getElementById("forgot-password-email-error-message");
      if (errorMessageEl) {
        errorMessageEl.hidden = true;
        errorMessageEl.textContent = "";
      }
    });
  }

  // Forgot Password Reset Dialog Handlers
  if (forgotPasswordResetDialog && forgotPasswordResetForm) {
    const resetCancelButtons = forgotPasswordResetDialog.querySelectorAll(".forgot-password-reset__cancel");
    const resetCloseButton = forgotPasswordResetDialog.querySelector(".modal__close");
    const resetSubmitButton = forgotPasswordResetForm.querySelector(".forgot-password-reset__submit");

    const closeResetDialog = (event) => {
      event.preventDefault();
      event.stopPropagation();
      forgotPasswordResetDialog.close("cancel");
      // Clear stored email and token
      passwordResetEmail = null;
      passwordResetToken = null;
    };

    resetCancelButtons.forEach((button) => {
      button.addEventListener("click", closeResetDialog);
    });

    if (resetCloseButton) {
      resetCloseButton.addEventListener("click", closeResetDialog);
    }

    // Handle backdrop clicks
    forgotPasswordResetDialog.addEventListener("click", (event) => {
      if (event.target === forgotPasswordResetDialog) {
        closeResetDialog(event);
      }
    });

    // Handle Escape key
    forgotPasswordResetDialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeResetDialog(event);
      }
    });

    // Handle reset form submission
    if (resetSubmitButton) {
      resetSubmitButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const newPasswordInput = document.getElementById("forgot-password-new-password");
        const confirmPasswordInput = document.getElementById("forgot-password-confirm-password");
        const errorMessageEl = document.getElementById("forgot-password-reset-error-message");

        // Clear any existing error message
        if (errorMessageEl) {
          errorMessageEl.hidden = true;
          errorMessageEl.textContent = "";
        }

        if (!newPasswordInput || !confirmPasswordInput) {
          if (errorMessageEl) {
            errorMessageEl.textContent = "Please enter both password fields";
            errorMessageEl.hidden = false;
          }
          return;
        }

        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        // Validation
        if (!newPassword || !confirmPassword) {
          if (errorMessageEl) {
            errorMessageEl.textContent = "Please enter both password fields";
            errorMessageEl.hidden = false;
          } else {
            alert("Please enter both password fields");
          }
          return;
        }

        if (newPassword !== confirmPassword) {
          if (errorMessageEl) {
            errorMessageEl.textContent = "Passwords do not match";
            errorMessageEl.hidden = false;
          } else {
            alert("Passwords do not match");
          }
          return;
        }

        if (newPassword.length < 8) {
          if (errorMessageEl) {
            errorMessageEl.textContent = "Password must be at least 8 characters long";
            errorMessageEl.hidden = false;
          } else {
            alert("Password must be at least 8 characters long");
          }
          return;
        }

        if (!passwordResetEmail || !passwordResetToken) {
          if (errorMessageEl) {
            errorMessageEl.textContent = "Session expired. Please request a new password reset.";
            errorMessageEl.hidden = false;
          } else {
            alert("Session expired. Please request a new password reset.");
          }
          // Close reset dialog and open email dialog
          forgotPasswordResetDialog.close();
          if (forgotPasswordEmailDialog) {
            forgotPasswordEmailDialog.showModal();
          }
          return;
        }

        // Disable submit button
        resetSubmitButton.disabled = true;
        const originalText = resetSubmitButton.textContent;
        resetSubmitButton.textContent = "Loading...";

        try {
          showStatusPopup("loading");
          await resetPassword(passwordResetEmail, passwordResetToken, newPassword);
          showStatusPopup("close");

          // Success - close dialog and show success message
          forgotPasswordResetDialog.close();
          
          // Clear stored email and token
          passwordResetEmail = null;
          passwordResetToken = null;

          // Show success message and open login dialog
          alert("Password reset successful! You can now log in with your new password.");
        if (accountDialog) {
          accountDialog.showModal();
          }
        } catch (error) {
          showStatusPopup("close");
          console.error("[PromptProfile™ LoginMenu] Password reset error:", error);
          
          let displayMessage = error.message || "Failed to reset password. Please check your connection and try again.";
          
          if (error.message && (error.message.includes("Invalid") || error.message.includes("expired"))) {
            displayMessage = "Invalid or expired reset token. Please request a new password reset.";
            // Clear stored values and close reset dialog
            passwordResetEmail = null;
            passwordResetToken = null;
            forgotPasswordResetDialog.close();
            if (forgotPasswordEmailDialog) {
              forgotPasswordEmailDialog.showModal();
            }
          }

          if (errorMessageEl) {
            errorMessageEl.textContent = displayMessage;
            errorMessageEl.hidden = false;
          } else {
            alert(displayMessage);
          }
        } finally {
          resetSubmitButton.disabled = false;
          resetSubmitButton.textContent = originalText;
        }
      });
    }

    // Clear error message when user types
    const newPasswordInput = document.getElementById("forgot-password-new-password");
    const confirmPasswordInput = document.getElementById("forgot-password-confirm-password");
    
    if (newPasswordInput) {
      newPasswordInput.addEventListener("input", () => {
        const errorMessageEl = document.getElementById("forgot-password-reset-error-message");
        if (errorMessageEl && !errorMessageEl.hidden) {
          errorMessageEl.hidden = true;
          errorMessageEl.textContent = "";
        }
      });
    }
    
    if (confirmPasswordInput) {
      confirmPasswordInput.addEventListener("input", () => {
        const errorMessageEl = document.getElementById("forgot-password-reset-error-message");
        if (errorMessageEl && !errorMessageEl.hidden) {
          errorMessageEl.hidden = true;
          errorMessageEl.textContent = "";
        }
      });
    }

    // Reset form when dialog closes
    forgotPasswordResetDialog.addEventListener("close", () => {
      if (forgotPasswordResetForm) {
        forgotPasswordResetForm.reset();
        // Reset password visibility
        const passwordInputs = forgotPasswordResetDialog.querySelectorAll(".account__input--password");
        passwordInputs.forEach((input) => {
          input.type = "password";
          const toggle = forgotPasswordResetDialog.querySelector(`[data-target="${input.id}"]`);
          if (toggle) {
            toggle.textContent = "Show";
          }
        });
      }
      const errorMessageEl = document.getElementById("forgot-password-reset-error-message");
      if (errorMessageEl) {
        errorMessageEl.hidden = true;
        errorMessageEl.textContent = "";
      }
      // Clear stored email and token when dialog closes
      passwordResetEmail = null;
      passwordResetToken = null;
    });
  }

  // Password Toggle Handlers
  const passwordToggles = document.querySelectorAll(".account__password-toggle");
  passwordToggles.forEach((toggle) => {
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      const targetId = toggle.getAttribute("data-target");
      const passwordInput = document.getElementById(targetId);
      if (passwordInput) {
        if (passwordInput.type === "password") {
          passwordInput.type = "text";
          toggle.textContent = "Hide";
        } else {
          passwordInput.type = "password";
          toggle.textContent = "Show";
        }
      }
    });
  });
  
  } catch (error) {
    console.error("[PromptProfile™ LoginMenu] Error in registerAccountHandlers:", error);
    throw error;
  }
  
  console.log("[PromptProfile™ LoginMenu] Account handlers registered successfully");
}

