/**
 * Toast Notification Utility
 * Handles toast notifications for the Side Chat section
 */

/**
 * Shows a toast notification in the SideChat section
 * @param {string} message - Message to display
 * @param {string} type - Type of notification: 'loading', 'success', 'error'
 * @param {number} duration - Duration in milliseconds (default: 3000)
 * @returns {HTMLElement|null} Toast element or null if chat section not found
 */
export function showSideChatToast(message, type = 'success', duration = 3000) {
  // Try multiple selectors to find the chat section
  let chatSection = document.querySelector(".panel__section--chat .section-content");
  if (!chatSection) {
    // Try alternative selector
    chatSection = document.querySelector("#chat-window")?.closest(".section-content");
  }
  if (!chatSection) {
    // Last resort: find by section class
    const chatSectionElement = document.querySelector(".panel__section--chat");
    chatSection = chatSectionElement?.querySelector(".section-content");
  }
  
  if (!chatSection) {
    console.warn("[Prompanion] Could not find chat section for toast");
    return null;
  }

  // Remove existing toast if any
  const existingToast = chatSection.querySelector(".sidechat-toast");
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement("div");
  toast.className = `sidechat-toast sidechat-toast--${type}`;
  
  const icon = document.createElement("div");
  icon.className = "sidechat-toast__icon";
  
  if (type === 'loading') {
    icon.innerHTML = `
      <svg class="sidechat-toast__spinner" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="32" stroke-dashoffset="32">
          <animate attributeName="stroke-dasharray" dur="2s" values="0 32;16 16;0 32;0 32" repeatCount="indefinite"/>
          <animate attributeName="stroke-dashoffset" dur="2s" values="0;-16;-32;-32" repeatCount="indefinite"/>
        </circle>
      </svg>
    `;
  } else if (type === 'success') {
    icon.innerHTML = `
      <svg class="sidechat-toast__checkmark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  const text = document.createElement("div");
  text.className = "sidechat-toast__text";
  text.textContent = message;

  toast.append(icon, text);
  chatSection.append(toast);

  // Force a reflow to ensure styles are applied
  void toast.offsetHeight;

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add("is-visible");
  });

  // Auto-remove after duration
  if (duration > 0) {
    setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => {
        if (toast.parentElement) {
          toast.remove();
        }
      }, 300); // Wait for fade-out animation
    }, duration);
  }

  console.log("[Prompanion] Toast shown:", message, "Type:", type);
  return toast;
}

/**
 * Updates toast from loading to success state
 * @param {HTMLElement} toast - Toast element to update
 */
export function updateToastToSuccess(toast) {
  if (!toast) return;
  
  const icon = toast.querySelector(".sidechat-toast__icon");
  if (icon) {
    icon.innerHTML = `
      <svg class="sidechat-toast__checkmark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }
  
  toast.classList.remove("sidechat-toast--loading");
  toast.classList.add("sidechat-toast--success");
}

