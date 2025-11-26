/**
 * Login Menu Module
 * Handles all functionality related to the account login dialog
 */

const BACKEND_URL = "https://prompanionce.onrender.com";

/**
 * Shows status popup with loading, success, or error state
 */
function showStatusPopup(type, message = null) {
  const statusDialog = document.getElementById("status-dialog");
  const loadingEl = document.getElementById("status-loading");
  const successEl = document.getElementById("status-success");
  const errorEl = document.getElementById("status-error");
  const errorMessageEl = document.getElementById("status-error-message");

  if (!statusDialog) return;

  // Hide all states
  loadingEl.hidden = true;
  successEl.hidden = true;
  errorEl.hidden = true;

  // Show appropriate state
  if (type === "loading") {
    loadingEl.hidden = false;
    statusDialog.showModal();
  } else if (type === "success") {
    successEl.hidden = false;
    setTimeout(() => {
      statusDialog.close();
    }, 1500);
  } else if (type === "error") {
    errorEl.hidden = false;
    if (message) {
      errorMessageEl.textContent = message;
    }
    setTimeout(() => {
      statusDialog.close();
    }, 4000);
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
  try {
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

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Login failed");
    }

    return data;
  } catch (error) {
    throw error;
  }
}

/**
 * Registers event handlers for the account login dialog
 */
export function registerAccountHandlers() {
  const accountDialog = document.getElementById("account-dialog");
  const accountTrigger = document.getElementById("open-account");
  const accountForm = document.getElementById("account-form");
  const createAccountLink = document.getElementById("open-create-account");
  const createAccountDialog = document.getElementById("create-account-dialog");
  const createAccountForm = document.getElementById("create-account-form");
  
  if (!accountDialog || !accountTrigger || !accountForm) {
    return;
  }

  const cancelButtons = accountDialog.querySelectorAll(".account__cancel");

  accountTrigger.addEventListener("click", () => {
    accountDialog.showModal();
  });

  cancelButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      accountDialog.close("cancel");
    });
  });

  accountForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(accountForm);
    const email = formData.get("email");
    const password = formData.get("password");

    if (!email || !password) {
      alert("Please enter both email and password");
      return;
    }

    showStatusPopup("loading");
    
    try {
      const data = await loginUser(email, password);
      await storeAuthToken(data.token);
      showStatusPopup("success");
      accountDialog.close();
      // Reload to update UI state
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      const errorMessage = error.message || "Login failed. Check your internet connection. If the issue persists, contact customer support or try again later.";
      showStatusPopup("error", errorMessage);
    }
  });

  accountDialog.addEventListener("close", () => {
    accountForm.reset();
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
    createAccountCancelButtons.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        createAccountDialog.close("cancel");
      });
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
        showStatusPopup("success");
        createAccountDialog.close();
        // Auto-login: close login dialog and reload
        if (accountDialog) {
          accountDialog.close();
        }
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } catch (error) {
        const errorMessage = error.message || "Account Creation Failed. Check your internet connection. If the issue persists, contact customer support or try again later.";
        showStatusPopup("error", errorMessage);
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
}

