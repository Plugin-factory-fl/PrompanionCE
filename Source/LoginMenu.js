/**
 * Login Menu Module
 * Handles all functionality related to the account login dialog
 */

const BACKEND_URL = "https://prompanionce.onrender.com";

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
      throw new Error(data.error || "Registration failed");
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
  console.log("[Prompanion LoginMenu] loginUser called with email:", email?.substring(0, 10));
  try {
    console.log("[Prompanion LoginMenu] Making API call to:", `${BACKEND_URL}/api/auth/login`);
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

    console.log("[Prompanion LoginMenu] API response status:", response.status, response.statusText);
    const data = await response.json();
    console.log("[Prompanion LoginMenu] API response data:", { hasToken: !!data.token, hasError: !!data.error });

    if (!response.ok) {
      throw new Error(data.error || "Login failed");
    }

    return data;
  } catch (error) {
    console.error("[Prompanion LoginMenu] loginUser error:", error);
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
 * Fetches user profile from backend
 */
async function getUserProfile() {
  try {
    const token = await getAuthToken();
    console.log("[Prompanion LoginMenu] getAuthToken result:", { hasToken: !!token });
    if (!token) {
      console.log("[Prompanion LoginMenu] No auth token found");
      return null;
    }

    const response = await fetch(`${BACKEND_URL}/api/user/profile`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    console.log("[Prompanion LoginMenu] Profile API response:", { status: response.status, ok: response.ok });

    if (!response.ok) {
      if (response.status === 401) {
        // Token is invalid, clear it
        chrome.storage.local.remove(["authToken"]);
        console.log("[Prompanion LoginMenu] Token invalid, cleared");
      }
      return null;
    }

    const data = await response.json();
    console.log("[Prompanion LoginMenu] Profile API data:", data);
    // Return the user object directly (same structure as sidepanel.js uses)
    const user = data.user || data;
    console.log("[Prompanion LoginMenu] Extracted user:", user);
    return user;
  } catch (error) {
    console.error("[Prompanion LoginMenu] Error fetching user profile:", error);
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
  console.log("[Prompanion LoginMenu] ========== REGISTERING ACCOUNT HANDLERS ==========");
  
  try {
    const accountDialog = document.getElementById("account-dialog");
    const accountTrigger = document.getElementById("open-account");
    const accountForm = document.getElementById("account-form");
    const createAccountLink = document.getElementById("open-create-account");
    const createAccountDialog = document.getElementById("create-account-dialog");
    const createAccountForm = document.getElementById("create-account-form");
    
    console.log("[Prompanion LoginMenu] Registering account handlers:", {
      hasAccountDialog: !!accountDialog,
      hasAccountTrigger: !!accountTrigger,
      hasAccountForm: !!accountForm,
      hasCreateAccountLink: !!createAccountLink,
      hasCreateAccountDialog: !!createAccountDialog,
      hasCreateAccountForm: !!createAccountForm
    });
    
    if (!accountDialog || !accountTrigger || !accountForm) {
      console.error("[Prompanion LoginMenu] Missing required elements:", {
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
    console.log("[Prompanion LoginMenu] ========== ACCOUNT BUTTON CLICKED ==========");
    event.preventDefault();
    
    // Get elements
    const loggedInView = document.getElementById("account-logged-in-view");
    const loginView = document.getElementById("account-form");
    console.log("[Prompanion LoginMenu] Elements found:", { 
      hasLoggedInView: !!loggedInView, 
      hasLoginView: !!loginView 
    });
    
    try {
      // FIRST: Check if user is logged in and show appropriate view BEFORE opening dialog
      const userProfile = await getUserProfile();
      console.log("[Prompanion LoginMenu] User profile check result:", { 
        hasProfile: !!userProfile, 
        profile: userProfile 
      });
      
      if (userProfile && (userProfile.email || userProfile.name)) {
        // User is logged in - show logged-in view, hide login view
        console.log("[Prompanion LoginMenu] User IS logged in, showing logged-in view");
        
        // Force hide login view
        if (loginView) {
          loginView.hidden = true;
          loginView.style.display = "none";
          loginView.style.visibility = "hidden";
          console.log("[Prompanion LoginMenu] Login view hidden");
        }
        
        // Force show logged-in view
        if (loggedInView) {
          loggedInView.hidden = false;
          loggedInView.style.display = "block";
          loggedInView.style.visibility = "visible";
          console.log("[Prompanion LoginMenu] Logged-in view shown");
        }
        
        // Update user info
        const userNameEl = document.getElementById("account-user-name");
        const planNameEl = document.getElementById("account-plan-name");
        const displayName = (userProfile.name && userProfile.name.trim()) 
          ? userProfile.name 
          : (userProfile.email || "User");
        console.log("[Prompanion LoginMenu] Setting display name:", displayName);
        if (userNameEl) {
          userNameEl.textContent = displayName;
        }
        if (planNameEl) {
          planNameEl.textContent = "FREE";
        }
      } else {
        // User is NOT logged in - show login view, hide logged-in view
        console.log("[Prompanion LoginMenu] User is NOT logged in, showing login view");
        
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
      console.log("[Prompanion LoginMenu] Account dialog opened");
      
      // Re-attach login button handler after dialog opens (in case DOM changed)
      setTimeout(() => {
        const loginBtn = accountForm.querySelector('button[value="login"], button.account__submit');
        if (loginBtn) {
          console.log("[Prompanion LoginMenu] Re-attaching login button handler after dialog open");
          loginBtn.type = "button";
          // Handler should already be attached, but ensure it's there
        }
      }, 50);
      
      // Double-check visibility after dialog opens
      setTimeout(() => {
        console.log("[Prompanion LoginMenu] Post-open check:", {
          loggedInViewHidden: loggedInView?.hidden,
          loggedInViewDisplay: loggedInView?.style.display,
          loginViewHidden: loginView?.hidden,
          loginViewDisplay: loginView?.style.display
        });
      }, 100);
      
    } catch (error) {
      console.error("[Prompanion LoginMenu] Error opening account dialog:", error);
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
      console.log("[Prompanion LoginMenu] Switch accounts button clicked");
      
      // Clear auth token
      chrome.storage.local.remove(["authToken"], () => {
        console.log("[Prompanion LoginMenu] Auth token cleared");
        
        // Hide logged-in view
        if (loggedInView) {
          loggedInView.hidden = true;
          loggedInView.style.display = "none";
          loggedInView.style.visibility = "hidden";
          console.log("[Prompanion LoginMenu] Logged-in view hidden");
        }
        
        // Show login view
        if (loginView) {
          loginView.hidden = false;
          loginView.style.display = "block";
          loginView.style.visibility = "visible";
          console.log("[Prompanion LoginMenu] Login view shown");
        }
        
        // Keep dialog open - don't close it
        // The dialog should remain open with the login form now visible
      });
    });
  }

  // Handle "UPGRADE NOW" button
  if (upgradeButton) {
    upgradeButton.addEventListener("click", (event) => {
      event.preventDefault();
      // TODO: Implement upgrade flow (Stripe integration)
      alert("Upgrade functionality coming soon!");
    });
  }

  // Close button handlers
  const closeDialog = (event) => {
    event.preventDefault();
    event.stopPropagation();
    console.log("[Prompanion LoginMenu] Closing account dialog");
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

  // REMOVED - We're handling login via button click handler instead
  // The form submit handler was interfering with the button click
  
  // But we still need to prevent default form submission
  accountForm.addEventListener("submit", (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    console.log("[Prompanion LoginMenu] Form submit prevented - using button handler");
  }, true);
  
  // Handle the "Log In" button click directly - this is the PRIMARY handler
  // Wait a bit to ensure DOM is ready
  setTimeout(() => {
    const loginSubmitButton = accountForm.querySelector('button[value="login"], button.account__submit, button[type="submit"], button[type="button"].account__submit');
    if (loginSubmitButton) {
      console.log("[Prompanion LoginMenu] Found login submit button:", loginSubmitButton);
      console.log("[Prompanion LoginMenu] Button type BEFORE:", loginSubmitButton.type, "Button value:", loginSubmitButton.value);
      
      // Remove type="submit" to prevent form submission
      loginSubmitButton.type = "button";
      console.log("[Prompanion LoginMenu] Button type AFTER:", loginSubmitButton.type);
      
      const handleLogin = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      console.log("[Prompanion LoginMenu] ========== LOG IN BUTTON CLICKED ==========");
      
      const formData = new FormData(accountForm);
      const email = formData.get("email");
      const password = formData.get("password");

      console.log("[Prompanion LoginMenu] Form data:", { hasEmail: !!email, hasPassword: !!password, email: email?.substring(0, 10) });

      if (!email || !password) {
        alert("Please enter both email and password");
        return;
      }

      console.log("[Prompanion LoginMenu] Showing loading popup...");
      const statusDialog = document.getElementById("status-dialog");
      const loadingEl = document.getElementById("status-loading");
      console.log("[Prompanion LoginMenu] Status dialog elements:", { hasDialog: !!statusDialog, hasLoading: !!loadingEl });
      
      if (statusDialog && loadingEl) {
        loadingEl.hidden = false;
        statusDialog.showModal();
        console.log("[Prompanion LoginMenu] Loading popup shown");
      } else {
        console.error("[Prompanion LoginMenu] Status dialog elements not found!");
      }
      
      console.log("[Prompanion LoginMenu] Calling loginUser API...");
      
      try {
        const data = await loginUser(email, password);
        console.log("[Prompanion LoginMenu] Login successful, storing token");
        await storeAuthToken(data.token);
        if (statusDialog) {
          statusDialog.close();
        }
        accountDialog.close();
        console.log("[Prompanion LoginMenu] Reloading page to update UI");
        // Reload to update UI state
        window.location.reload();
      } catch (error) {
        console.error("[Prompanion LoginMenu] Login error:", error);
        if (statusDialog) {
          statusDialog.close();
        }
        const errorMessage = error.message || "Login failed. Check your internet connection. If the issue persists, contact customer support or try again later.";
        alert(errorMessage);
      }
    };
    
      // Set onclick directly as PRIMARY handler (most reliable)
      loginSubmitButton.onclick = handleLogin;
      
      // Also attach event listeners as backup
      loginSubmitButton.addEventListener("click", handleLogin, { capture: true, once: false });
      loginSubmitButton.addEventListener("mousedown", (e) => {
        console.log("[Prompanion LoginMenu] MOUSEDOWN on login button!");
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleLogin(e);
      }, { capture: true });
      
      // Also handle pointerdown for touch devices
      loginSubmitButton.addEventListener("pointerdown", (e) => {
        console.log("[Prompanion LoginMenu] POINTERDOWN on login button!");
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleLogin(e);
      }, { capture: true });
      
      // Also prevent form submission completely
      const preventFormSubmit = (e) => {
        console.log("[Prompanion LoginMenu] Form submit event fired!");
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        console.log("[Prompanion LoginMenu] Form submit prevented, using button handler instead");
        handleLogin(e);
      };
      
      accountForm.addEventListener("submit", preventFormSubmit, { capture: true });
      accountForm._submitHandler = preventFormSubmit; // Store reference for removal
      
      // Test if button is clickable
      console.log("[Prompanion LoginMenu] Button element:", {
        type: loginSubmitButton.type,
        disabled: loginSubmitButton.disabled,
        hidden: loginSubmitButton.hidden,
        display: window.getComputedStyle(loginSubmitButton).display,
        pointerEvents: window.getComputedStyle(loginSubmitButton).pointerEvents,
        hasOnclick: !!loginSubmitButton.onclick
      });
      
      console.log("[Prompanion LoginMenu] Login button handler attached with onclick + multiple listeners");
    } else {
      console.error("[Prompanion LoginMenu] Login submit button NOT FOUND!");
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
      console.log("[Prompanion LoginMenu] Closing create account dialog");
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

      // Validation
      if (!email || !password) {
        alert("Please enter both email and password");
        return;
      }

      if (password !== confirmPassword) {
        alert("Passwords do not match");
        return;
      }

      if (password.length < 8) {
        alert("Password must be at least 8 characters long");
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
        const errorMessage = error.message || "Account Creation Failed. Check your internet connection. If the issue persists, contact customer support or try again later.";
        alert(errorMessage);
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
    console.error("[Prompanion LoginMenu] Error in registerAccountHandlers:", error);
    throw error;
  }
  
  console.log("[Prompanion LoginMenu] Account handlers registered successfully");
}

