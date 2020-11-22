// General function to display app responses
export function displayMessage(message, displayElementId) {
  let messageDisplay = document.getElementById(displayElementId);
  messageDisplay.classList.remove("text-blur-out"); // remove class so new additional messages display
  messageDisplay.classList.add("text-focus-in");
  messageDisplay.textContent = message;
  setTimeout(() => {
    messageDisplay.classList.remove("text-focus-in");
    messageDisplay.classList.add("text-blur-out");
  }, 4000);
}
