/**
 * Login Menu Module
 * Handles all functionality related to the account login dialog
 */

/**
 * Registers event handlers for the account login dialog
 */
export function registerAccountHandlers() {
  const accountDialog = document.getElementById("account-dialog");
  const accountTrigger = document.getElementById("open-account");
  const accountForm = document.getElementById("account-form");
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

  accountForm.addEventListener("submit", (event) => {
    event.preventDefault();
    // Placeholder: authentication handled elsewhere
  });

  accountDialog.addEventListener("close", () => {
    accountForm.reset();
  });
}

