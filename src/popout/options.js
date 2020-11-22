import { displayMessage } from "./messageFunction.js";

document.addEventListener("DOMContentLoaded", restoreOptions);
document.getElementById("save").addEventListener("click", saveOptions);

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restoreOptions() {
  // Use default value hoursInDay = 8 and minimumTimeToLog = 2
  chrome.storage.sync.get(
    {
      jiraUrl: "",
      hoursInDay: 8,
      minimumTimeToLog: 2,
    },
    function (items) {
      document.getElementById("jiraUrl").value = items.jiraUrl;
      document.getElementById("hoursInDay").value = items.hoursInDay;
      document.getElementById("minimumTimeToLog").value =
        items.minimumTimeToLog;
    }
  );
}

// Saves options to chrome.storage
function saveOptions() {
  let jiraUrl = document.getElementById("jiraUrl").value;
  let hoursInDay = document.getElementById("hoursInDay").value;
  let minimumTimeToLog = document.getElementById("minimumTimeToLog").value;

  if (validFormInputs(jiraUrl, hoursInDay, minimumTimeToLog)) {
    let loggerOptions = {};
    loggerOptions["jiraUrl"] = extractUrlOrigin(jiraUrl);
    loggerOptions["hoursInDay"] = hoursInDay;
    loggerOptions["minimumTimeToLog"] = minimumTimeToLog;

    chrome.storage.sync.set(loggerOptions, function () {
      // Update status to let user know options were saved.
      displayMessage("Jira options saved successfully.", "status");
    });
  }
}

// Validate Input
function validFormInputs(jiraUrl, hoursInDay, minimumTimeToLog) {
  try {
    validTimeLogIncrement(minimumTimeToLog, hoursInDay);
    validHoursInDay(hoursInDay);
    validURL(jiraUrl);
    return true;
  } catch (err) {
    displayMessage(err, "status");
    return false;
  }
}

// Check for valid hours in day
function validHoursInDay(hours) {
  try {
    if (hours.length === 0)
      throw "Hours is Workday must be a number between 1 and 24.";
    if (!Number.isInteger(+hours))
      throw "Hours in Workday must be a whole number.";
    if (+hours < 0) throw "Hours in Workday must be greater than 0.";
    if (+hours > 25) throw "Hours in Workday must be 24 hours or less.";
  } catch (err) {
    throw err;
  }
}

function validTimeLogIncrement(timeLogIncrementInput, hoursStrInput) {
  let hours = +hoursStrInput;
  let timeIncrement = +timeLogIncrementInput;
  // Criteria
  // 1. Must be number
  // 2. Must be greater than 0
  // 3. Must be smaller than or equal to the hours in a day
  // 4. Must be divisible by 0.5 (half an hour)
  // 5. Must fit within hours in a day with no remainder
  try {
    if (Number.isNaN(timeIncrement)) throw "Time Increment must be a number.";
    if (timeIncrement < 0) throw "Time Increment must be greater than 0.";
    if (timeIncrement > hours)
      throw "Time Increment must be smaller than Hours In Workday.";
    if (timeIncrement % 0.5 !== 0)
      throw "Time Increment must be in half hour units.";
    if (hours % timeIncrement !== 0)
      throw "Hours in Workday must be divisible by Time Increment";
  } catch (err) {
    throw err;
  }
}

// Check for valid URL
function validURL(str) {
  var pattern = new RegExp(
    "^(https?:\\/\\/)?" + // protocol
      "((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|" + // domain name
      "((\\d{1,3}\\.){3}\\d{1,3}))" + // OR ip (v4) address
      "(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*" + // port and path
      "(\\?[;&a-z\\d%_.~+=-]*)?" + // query string
      "(\\#[-a-z\\d_]*)?$",
    "i"
  ); // fragment locator
  try {
    if (!pattern.test(str)) throw "Invalid Jira URL.";
  } catch (err) {
    throw err;
  }
}

function extractUrlOrigin(validUrlStr) {
  let url = new URL(validUrlStr);
  return url.origin;
}

// General function to display app responses
// function displayMessage(message) {
//   let messageDisplay = document.getElementById("status");
//   messageDisplay.classList.remove("text-blur-out"); // remove class so new additional messages display
//   messageDisplay.classList.add("text-focus-in");
//   messageDisplay.textContent = message;
//   setTimeout(() => {
//     messageDisplay.classList.remove("text-focus-in");
//     messageDisplay.classList.add("text-blur-out");
//   }, 4000);
// }
