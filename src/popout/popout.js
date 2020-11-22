import { displayMessage } from "./messageFunction.js";

// CONFIG PARAMETERS
let JIRA_URL = "";
let JIRA_API_URL = "";
let HOURS_IN_WORKDAY = 8; // set default value
let MINIMUM_TIMELOG_UNIT = 2; // set default value

// USER (peter.pan@someaddress.com)
let currentUser = "";

// CONSTANTS
const TIME_UNIT = "hours";
const TIME_SLIDER_MINIMUM_VALUE = 0;
const MILLISECONDS_IN_DAY = 86400000;
const ANIMATION_TIME_SECS = 1000;
const DAYS_IN_TWO_WEEKS = 14;
const NUMBER_OF_DAYS_TO_DISPLAY = 11;

// DATA STORES

// [dateObject 1, dateObject 2, dateObject 3 ...]
let datesToDisplay = [];

// [ticket key 1, ticket key 2, ...]
let issueKeys = [];

// { ticket key 1: ticket title summary, ticket key 2: ticket title summary, ...}
let issueKeySummary = {};

// {
//  date 1: { ticket key 1: [{work id: time spent}, {work id: time spent}],
//            ticket key 2: [{ work id: time spent }, { work id: time spent }]
//          },
//  date 2: { ticket key 1: [{work id: time spent}, {work id: time spent}],
//            ticket key 2: [{ work id: time spent }, { work id: time spent }]
//          }
// ...
// }
let timeSpentByDateIssue = {};

// Initiate Program
document.addEventListener("DOMContentLoaded", main);

function main() {
  chrome.storage.sync.get(
    {
      jiraUrl: "",
      hoursInDay: "",
      minimumTimeToLog: "",
    },
    function storageResponse(config) {
      if (!config.jiraUrl.length) {
        openOptionsPage();
      } else {
        initaliseProgram(config);
      }
    }
  );
}

function openOptionsPage() {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL("options.html"));
  }
}

async function initaliseProgram(config) {
  setConfigParameters(config);
  currentUser = await setCurrentUser();
  if (currentUser) {
    setDataStores();
  }
}

function setCurrentUser() {
  return new Promise((resolve, reject) => {
    getCurrentUser()
      .then((data) => {
        if (data) {
          resolve(data.name);
        } else {
          reject(data.name);
        }
      })
      .catch((error) =>
        displayMessage(
          "Error: You are not currently logged into Jira. Please log in and then open extension.",
          "messageDisplay"
        )
      );
  });
}

function setConfigParameters(config) {
  HOURS_IN_WORKDAY = config.hoursInDay;
  MINIMUM_TIMELOG_UNIT = config.minimumTimeToLog;
  JIRA_URL = config.jiraUrl;
  JIRA_API_URL = `${config.jiraUrl}/rest/api/2`;
}

function setDataStores() {
  determineDatesToDisplay();
  showDates();
  addDateKeysToTimeSpentByDateIssueObject();
  setInitalTicketTimeLogs();
}

function addDateKeysToTimeSpentByDateIssueObject() {
  datesToDisplay.forEach(function (date) {
    let dateKey = setJiraDateFormat(date).slice(0, 10);
    timeSpentByDateIssue[dateKey] = {};
  });
}

function setInitalTicketTimeLogs() {
  let jiraTickets = getIssuesWithTimeLogged();
  jiraTickets.then(function (jiraTicketResponseData) {
    setIssueKeySummaries(jiraTicketResponseData);
    constructTimeSliders();
    determineTimeLoggedByDates();
  });
}

function setIssueKeySummaries(jiraTicketResponseData) {
  let issues = jiraTicketResponseData.issues;
  issues.forEach(function (issue) {
    issueKeys.push(issue.key);
    issueKeySummary[issue.key] = issue.fields.summary;
  });
}

function refreshTimeLoggedDataStore() {
  timeSpentByDateIssue = {};
  addDateKeysToTimeSpentByDateIssueObject();
  determineTimeLoggedByDates();
}

function setJiraDateFormat(dateObject) {
  // e.g "2019-05-29T16:36:09.182+0000"
  let yearString = String(dateObject.getFullYear());
  let monthString = ("0" + (dateObject.getMonth() + 1)).slice(-2);
  let dayString = ("0" + dateObject.getDate()).slice(-2);
  let jiraDateFormat = `${yearString}-${monthString}-${dayString}T12:00:00.000+0000`;
  return jiraDateFormat;
}

// Pop Up for Work Logged
let content = document.getElementById("content");
let workpopup = createWorkLogPopUp();
content.prepend(workpopup);

function createWorkLogPopUp() {
  let timeLoggedContainer = document.createElement("div");
  timeLoggedContainer.setAttribute("class", "popup-container");
  timeLoggedContainer.setAttribute("id", "popupContainer");
  let workLogPopUp = document.createElement("span");
  workLogPopUp.setAttribute("class", "popuptext");
  workLogPopUp.setAttribute("id", "popuptext");
  let popUpText = document.createTextNode("");
  workLogPopUp.appendChild(popUpText);
  timeLoggedContainer.appendChild(workLogPopUp);
  return timeLoggedContainer;
}

// API GET CALLS AND RELATED CODE

// General function so error is thrown when status code is not 2xx using fetch
function handleErrors(response) {
  if (!response.ok) {
    throw Error(response.statusText);
  }
  return response.json();
}

function getCurrentUser() {
  let url = `${JIRA_API_URL}/myself`;
  return fetch(url).then(handleErrors);
}

function getIssueDetails(issueKey) {
  let url = `${JIRA_API_URL}/issue/${issueKey}?fields=summary`;
  return fetch(url).then(handleErrors);
}

function getIssuesWithTimeLogged() {
  let date = setJiraDateFormat(datesToDisplay[0]).slice(0, 10);
  let url = `${JIRA_API_URL}/search?jql=
  worklogAuthor = currentUser() AND
  worklogDate >= ${date}`;

  return fetch(url)
    .then(handleErrors)
    .then((response) => {
      return response;
    })
    .catch((error) => {
      return error;
    });
}

function getIssueWorkLog(issueKey) {
  let url = `${JIRA_API_URL}/issue/${issueKey}/worklog`;
  return fetch(url).then((response) => response.json());
}

function deleteWorkLogItem(issueKey, workLogId) {
  let url = `${JIRA_API_URL}/issue/${issueKey}/worklog/${workLogId}`;

  // The parameters we are going to pass to the fetch function
  let fetchData = {
    method: "DELETE",
  };

  return fetch(url, fetchData)
    .then((response) => {
      if (!response.ok) {
        throw Error(response.statusText);
      }
      // successful delete will not return any response which causes response.json() to throw an error
      // return response.text() instead
      return response.text();
    })
    .catch((error) => {
      return error;
    });
}

function updateIssueLog(issueKey, timeSpent, date) {
  let url = `${JIRA_API_URL}/issue/${issueKey}/worklog`;

  // The data we are going to send in our request
  let data = {
    comment: "",
    started: date,
    timeSpentSeconds: convertTimeSpentToSeconds(timeSpent),
  };
  // The parameters we are going to pass to the fetch function
  let fetchData = {
    method: "POST",
    body: JSON.stringify(data),
    headers: {
      "Content-Type": "application/json",
    },
  };
  return fetch(url, fetchData).then(handleErrors);
}

function convertTimeSpentToSeconds(unitsToLog) {
  if (TIME_UNIT === "hours") {
    let timeSpentInSeconds = unitsToLog * 60 * 60;
    return timeSpentInSeconds;
  }
}

// SECTION 1
// CONSTRUCT TICKET SLIDERS
let sliderContainer = document.getElementById("slidersContainer");
let inputIssueKey = document.getElementById("manualIssue");

inputIssueKey.addEventListener("keydown", function (e) {
  if (e.code === "Enter") {
    let issueKeyValue = inputIssueKey.value.toUpperCase();
    addIssuetManually(issueKeyValue);
  }
});

let addIcon = document.getElementById("addIcon");
addIcon.addEventListener("click", function () {
  let issueKeyValue = inputIssueKey.value.toUpperCase();
  addIssuetManually(issueKeyValue);
});

function addIssuetManually(issueKeyValue) {
  if (!issueKeys.includes(issueKeyValue)) {
    let issueDetails = getIssueDetails(issueKeyValue);
    issueDetails
      .then(function (data) {
        let issueKey = data.key;
        let issueSummary = data.fields.summary;
        issueKeys.push(issueKey);
        sliderContainer.appendChild(createTicketSlider(issueKey, issueSummary));
        // Clear the search box if valid issue found and added
        inputIssueKey.value = "";
      })
      .catch((error) =>
        displayMessage(
          "Error: Ticket key entered can not be found",
          "messageDisplay"
        )
      );
  } else {
    displayMessage(
      "Ticket number entered is already displayed",
      "messageDisplay"
    );
  }
}

function constructTimeSliders() {
  for (const [issueKey, issueSummary] of Object.entries(issueKeySummary)) {
    sliderContainer.appendChild(createTicketSlider(issueKey, issueSummary));
  }
}

function createTicketSlider(issueKey, issueName) {
  let sliderContainer = document.createElement("div");
  sliderContainer.setAttribute("class", "ratio-slider");
  let label = createLabel(issueKey, issueName);
  let input = createRangeInput(issueKey, issueName);
  let span = createSliderValueDisplay(issueKey);
  sliderContainer.appendChild(label);
  sliderContainer.appendChild(input);
  sliderContainer.appendChild(span);
  return sliderContainer;
}

function createLabel(issueKey, issueName) {
  let label = document.createElement("label");
  label.setAttribute("for", issueName);
  let labelText = document.createTextNode(issueKey + ": " + issueName);
  label.appendChild(labelText);
  return label;
}

function createRangeInput(issueKey, issueName) {
  let input = document.createElement("input");
  input.setAttribute("type", "range");
  input.setAttribute("min", TIME_SLIDER_MINIMUM_VALUE);
  input.setAttribute("max", HOURS_IN_WORKDAY);
  input.setAttribute("step", MINIMUM_TIMELOG_UNIT);
  input.setAttribute("value", TIME_SLIDER_MINIMUM_VALUE);
  input.setAttribute("id", issueKey);
  input.setAttribute("name", issueName);
  input.addEventListener("change", function () {
    showSliderValue(input, issueKey + "Value");
  });
  return input;
}

function createSliderValueDisplay(issueKey) {
  let span = document.createElement("span");
  span.setAttribute("id", issueKey + "Value");
  let valueText = document.createTextNode(`0 ${TIME_UNIT}`);
  span.appendChild(valueText);
  return span;
}

function showSliderValue(slider, outputElement) {
  let sliderValueDisplay = document.getElementById(outputElement);
  sliderValueDisplay.innerHTML = slider.value + " " + TIME_UNIT;

  slider.oninput = function () {
    sliderValueDisplay = this.value;
  };
}

// SECTION 2
// CONSTRUCT DATE SELECTORS
// Show dates that can be chosen to log time against
// Want to show today, the last 5 working days, and the next 5 working days
function determineDatesToDisplay() {
  let days = 7;
  let todayInMilliseconds = Date.now();

  // Add the last 5 working days (need to iterate over seven days)
  for (let i = days; i > 0; i--) {
    let dayToAdd = new Date(todayInMilliseconds - i * MILLISECONDS_IN_DAY);
    // Only add weekdays
    if (!(dayToAdd.getDay() === 6 || dayToAdd.getDay() === 0)) {
      datesToDisplay.push(dayToAdd);
    }
  }

  // Add today even if Saturday or Sunday
  let dayToAdd = new Date(todayInMilliseconds);
  datesToDisplay.push(dayToAdd);

  // Add the next 5 working days (need to iterate over seven days)
  for (let i = 1; i < days + 1; i++) {
    let dayToAdd = new Date(todayInMilliseconds + i * MILLISECONDS_IN_DAY);
    // Only add weekdays
    if (!(dayToAdd.getDay() === 6 || dayToAdd.getDay() === 0)) {
      datesToDisplay.push(dayToAdd);
    }
  }
}

// Prevent multiple quick clicks on date sliders which causes date boxes to not be removed properly
// Returns a function, that, as long as it continues to be invoked, will not
// be triggered. The function will be called after it stops being called for
// N milliseconds. If `immediate` is passed, trigger the function on the
// leading edge, instead of the trailing.
function debounce(func, wait, immediate) {
  var timeout;
  return function () {
    var context = this,
      args = arguments;
    var later = function () {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    var callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}

let forward = function () {
  updateDatesToDisplay(DAYS_IN_TWO_WEEKS);
  updateDatesUi("normal");
  updateSlidesAndTimeLoggedValues();
};

let backward = function () {
  updateDatesToDisplay(-DAYS_IN_TWO_WEEKS);
  updateDatesUi("reverse");
  updateSlidesAndTimeLoggedValues();
};

let goForward = document.getElementById("goForward");
goForward.addEventListener(
  "click",
  debounce(forward, ANIMATION_TIME_SECS, "immediate")
);

let goBackward = document.getElementById("goBackward");
goBackward.addEventListener(
  "click",
  debounce(backward, ANIMATION_TIME_SECS, "immediate")
);

function updateDatesToDisplay(adjustment) {
  for (let i = 0; i < datesToDisplay.length; i++) {
    datesToDisplay[i] = new Date(
      +datesToDisplay[i] + adjustment * MILLISECONDS_IN_DAY
    );
  }
}

function updateDatesUi(direction) {
  showDates(direction);
  let dateOptions = document.getElementById("dateOptions");
  let animation = dateOptions.animate(
    [
      {
        transform: "translateX(0)",
      },
      {
        transform: "translateX(-539px)",
      },
    ],
    {
      duration: ANIMATION_TIME_SECS,
      direction: direction,
      easing: "ease-in-out",
    }
  );

  let dateBoxLabels = document.querySelectorAll(`input[name=date-option]`);
  let dateBoxes = document.querySelectorAll(".date-box");
  animation.onfinish = function () {
    // Only want the last 11 (NUMBER_OF_DAYS_TO_DISPLAY) date boxes/inputs
    if (direction === "normal") {
      for (let i = 0; i < NUMBER_OF_DAYS_TO_DISPLAY; i++) {
        dateBoxLabels[i].parentNode.removeChild(dateBoxLabels[i]);
        dateBoxes[i].parentNode.removeChild(dateBoxes[i]);
      }
    }
    // only want the first 11 (NUMBER_OF_DAYS_TO_DISPLAY) date boxes/inputs
    else if (direction === "reverse") {
      for (
        let i = dateBoxLabels.length - 1;
        i >= NUMBER_OF_DAYS_TO_DISPLAY;
        i--
      ) {
        dateBoxLabels[i].parentNode.removeChild(dateBoxLabels[i]);
        dateBoxes[i].parentNode.removeChild(dateBoxes[i]);
      }
    }
  };
}

function showDates(direction = "normal") {
  if (direction === "normal") {
    datesToDisplay.forEach(function (dateToAdd) {
      addDateOption(dateToAdd, direction);
    });
  } else if (direction === "reverse") {
    for (let i = datesToDisplay.length - 1; i >= 0; i--) {
      addDateOption(datesToDisplay[i], direction);
    }
  }
}

function updateSlidesAndTimeLoggedValues() {
  let jiraTickets = getIssuesWithTimeLogged();
  jiraTickets.then(function (data) {
    let issues = data.issues;
    issues.forEach(function (issue) {
      if (!issueKeys.includes(issue.key)) {
        issueKeys.push(issue.key);
        issueKeySummary[issue.key] = issue.fields.summary;
        sliderContainer.appendChild(
          createTicketSlider(issue.key, issue.fields.summary)
        );
      }
    });
    refreshTimeLoggedDataStore();
  });
}

function addDateOption(dateToAdd, direction = "normal") {
  let dayOfWeek = String(dateToAdd).slice(0, 3);
  let date = dateToAdd.getDate();
  let month = getMonthName(dateToAdd.getMonth());
  let year = dateToAdd.getFullYear();
  let dateOptions = document.getElementById("dateOptions");
  let datebox = createDateBoxLabel(dayOfWeek, date, month, year, dateToAdd);
  let dateboxCheckBox = createDateCheckbox(dateToAdd);
  if (direction === "reverse") {
    dateOptions.prepend(dateboxCheckBox);
    dateOptions.prepend(datebox);
  } else {
    dateOptions.appendChild(dateboxCheckBox);
    dateOptions.appendChild(datebox);
  }
}

function getMonthName(monthIndex) {
  let monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return monthNames[monthIndex];
}

function createDateBoxLabel(dayOfWeek, date, month, year, dateObject) {
  let container = document.createElement("div");
  container.setAttribute("class", "date-box");
  let dateBox = document.createElement("label");
  dateBox.setAttribute("for", dateObject);
  dateBox.setAttribute("class", "date-label");
  // if date box is for today then highlight it so obvious
  let isToday = checkIfDateIsToday(dateObject);
  if (isToday) {
    dateBox.classList.add("today");
    dayOfWeek = "Today";
  }
  let dayValue = createDayOfWeekDiv(dayOfWeek);
  dateBox.appendChild(dayValue);
  let dateValue = createDateValueDiv(date);
  dateBox.appendChild(dateValue);
  let monthValue = createMonthDiv(month);
  let yearValue = createYearDiv(year);
  dateBox.appendChild(monthValue);
  dateBox.appendChild(yearValue);
  dateBox.addEventListener("click", function () {
    dateBox.classList.toggle("to-update");
  });
  container.append(dateBox);
  let timeLogged = createTimeLoggedDiv(dateObject);
  container.appendChild(timeLogged);
  return container;
}

function checkIfDateIsToday(dateObject) {
  let today = new Date();
  // Set time element of date objects to 0 to allow comparison just on the date element
  today.setHours(0, 0, 0, 0);
  // Copy date otherwise original date object is modified
  let copiedDate = new Date(dateObject.getTime());
  copiedDate.setHours(0, 0, 0, 0);
  if (today - copiedDate === 0) {
    return true;
  }
  return false;
}

function createDayOfWeekDiv(day) {
  let dayValue = document.createElement("div");
  dayValue.setAttribute("class", "day-value");
  let dayValueText = document.createTextNode(day);
  dayValue.appendChild(dayValueText);
  return dayValue;
}

function createDateValueDiv(date) {
  let dateValue = document.createElement("div");
  dateValue.setAttribute("class", "date-value");
  let dateValueText = document.createTextNode(date);
  dateValue.appendChild(dateValueText);
  return dateValue;
}

function createMonthDiv(month) {
  let monthValue = document.createElement("div");
  let monthText = document.createTextNode(month);
  monthValue.appendChild(monthText);
  return monthValue;
}

function createYearDiv(year) {
  let yearValue = document.createElement("div");
  let yearText = document.createTextNode(year);
  yearValue.appendChild(yearText);
  return yearValue;
}

// Checkbox will be hidden
function createDateCheckbox(dateObject) {
  let dateCheckBox = document.createElement("input");
  dateCheckBox.setAttribute("type", "checkbox");
  dateCheckBox.setAttribute("id", dateObject);
  dateCheckBox.setAttribute("name", "date-option");
  dateCheckBox.setAttribute("value", setJiraDateFormat(dateObject));
  return dateCheckBox;
}

function createTimeLoggedDiv(date) {
  let dateKey = setJiraDateFormat(date).slice(0, 10);
  let timeLoggedValue = document.createElement("div");
  timeLoggedValue.setAttribute("class", "time-logged-value");
  timeLoggedValue.setAttribute("id", "timeLoggedValue" + dateKey);
  let timeLoggedText = document.createTextNode("0h");
  timeLoggedValue.appendChild(timeLoggedText);
  timeLoggedValue.addEventListener("click", function () {
    showTimeLogPopUp(timeLoggedValue, date);
  });
  return timeLoggedValue;
}

function showTimeLogPopUp(timeLogElement, date) {
  let popUp = document.getElementById("popuptext");
  popUp.classList.toggle("show");
  setWorkLogTextForPopUp(date, popUp);
  determinePopUpPosition(timeLogElement, popUp);
}

// TODO: REMOVE MAGIC NUMBERS
function determinePopUpPosition(element, popUp) {
  let windowWidth = window.innerWidth;
  let popUpWidth = 165;
  let buffer = 30;
  let arrow = document.getElementById("arrowDown");
  if (element.offsetLeft + popUpWidth + buffer > windowWidth) {
    popUp.style.left = element.offsetLeft - 110 + "px";
    arrow.style.left = "117px";
  } else {
    popUp.style.left = element.offsetLeft - 20 + "px";
  }
  // -element.offsetTop places the popup at the bottom of the popup screen
  // 10 is the margin, 45 the height of the 'bottom tray' element
  // 20 (15 + 5) where 15 is the height of the time logged div and 5 is a buffer
  let popUpHeightPosition = -element.offsetTop + 10 + 45 + 22;
  popUp.style.bottom = popUpHeightPosition + "px";
}

function setWorkLogTextForPopUp(dateObject, popUp) {
  popUp.innerText = ""; // clear text initially
  let popUpArrow = document.createElement("span");
  popUpArrow.setAttribute("class", "arrow-down");
  popUpArrow.setAttribute("id", "arrowDown");
  let arrowCharacter = document.createTextNode("▼");
  popUpArrow.appendChild(arrowCharacter);
  popUp.appendChild(popUpArrow);
  let closeButton = _createCloseIcon(popUp);
  popUp.appendChild(closeButton);
  let popUpHeader = _createPopUpHeader(dateObject, popUp);
  popUp.appendChild(popUpHeader);

  let dateKey = setJiraDateFormat(dateObject).slice(0, 10);
  let worklogObjectForDate = timeSpentByDateIssue[dateKey];
  for (let issueKey in worklogObjectForDate) {
    let workLogLine = document.createElement("div");
    workLogLine.setAttribute("class", "popup-worklog-line");
    let issueKeyNode = _createIssueKeyNode(issueKey);
    let workLoggedNode = _createWorkLoggedNode(worklogObjectForDate[issueKey]);
    let deleteIconNode = _createDeleteIconNode(
      workLogLine,
      worklogObjectForDate[issueKey],
      issueKey
    );
    workLogLine.appendChild(issueKeyNode);
    workLogLine.appendChild(deleteIconNode);
    workLogLine.appendChild(workLoggedNode);
    popUp.appendChild(workLogLine);
  }
}

function _createCloseIcon(popUp) {
  let closeButton = document.createElement("a");
  closeButton.setAttribute("class", "closeIcon");
  closeButton.setAttribute("href", "#");
  let closeIcon = document.createTextNode("×");
  closeButton.appendChild(closeIcon);
  closeButton.addEventListener("click", function () {
    popUp.classList.toggle("show");
  });
  return closeButton;
}

function _createPopUpHeader(dateObject, popUp) {
  let popUpHeaderContainer = document.createElement("div");
  popUpHeaderContainer.setAttribute("class", "popup-header-container");
  let date = dateObject.getDate();
  let month = getMonthName(dateObject.getMonth());
  let year = dateObject.getFullYear().toString().substr(-2);
  let popUpHeader = document.createElement("div");
  popUpHeader.setAttribute("class", "popup-header");
  let headerText = document.createTextNode(
    `Work Logged: ${date}/${month}/${year}`
  );
  popUpHeader.appendChild(headerText);
  popUpHeaderContainer.appendChild(popUpHeader);
  return popUpHeaderContainer;
}

function _createIssueKeyNode(issueKey) {
  let issueKeyNode = document.createElement("span");
  issueKeyNode.setAttribute("class", "popup-issuekey");
  let issueKeyValue = document.createTextNode(issueKey);
  issueKeyNode.appendChild(issueKeyValue);
  return issueKeyNode;
}

function _createWorkLoggedNode(workLogged) {
  let workLoggedNode = document.createElement("span");
  workLoggedNode.setAttribute("class", "popup-worklog-value");
  let workLogValue = document.createTextNode(
    formatTimeSpentText(calculateTimeSpentIssueKey(workLogged))
  );
  workLoggedNode.appendChild(workLogValue);
  return workLoggedNode;
}

function _createDeleteIconNode(workLogLine, workLogObjectList, issueKey) {
  let deleteIconNode = document.createElement("img");
  deleteIconNode.setAttribute("class", "dustbin-icon");
  deleteIconNode.addEventListener("click", function () {
    let workLogIds = getWorkLogIdsForTicketDate(workLogObjectList);
    let apiRequestPromises = [];
    workLogIds.forEach(function (workLogId) {
      let deleteRequest = deleteWorkLogItem(issueKey, workLogId);
      apiRequestPromises.push(deleteRequest);
    });
    Promise.all(apiRequestPromises)
      .then(function (values) {})
      .then((response) => {
        displayMessage(
          "Success: Your work log record was successfully deleted",
          "messageDisplay"
        );
        refreshTimeLoggedDataStore();
      })
      .then(function () {
        workLogLine.parentNode.removeChild(workLogLine);
      })
      .catch((error) => {
        displayMessage(
          "Error: Unable to delete work log record.",
          "messageDisplay"
        );
      });
  });
  return deleteIconNode;
}

function getWorkLogIdsForTicketDate(workLogObjectList) {
  let workLogIds = [];
  workLogObjectList.forEach(function (workLog) {
    let workLogKeys = Object.keys(workLog);
    workLogIds.push(workLogKeys[0]);
  });
  return workLogIds;
}

// CONSTRUCT TIME LOGGED BY DATES
function determineTimeLoggedByDates() {
  // for each ticket get the work log list
  // scan the work logs and if author matches put the time spent against the date
  // Construct data structure to populate time spent by date
  //[ {date 1: { ticket key 1: [{work id: time spent}, {work id: time spent}],
  //             ticket key 2: [{work id: time spent}, {work id: time spent}]
  //           },
  //  {date 2: { ticket key 1: [{work id: time spent}, {work id: time spent}],
  //             ticket key 2: [{work id: time spent}, {work id: time spent}]
  //            },
  var itemsProcessed = 0;
  issueKeys.forEach(function (issueKey) {
    let workLogsResponse = getIssueWorkLog(issueKey);
    workLogsResponse.then(function (data) {
      let workLogs = data.worklogs;
      workLogs.forEach(function (workLog) {
        let date = workLog.started.slice(0, 10);
        if (
          (date in timeSpentByDateIssue) &
          (workLog.author.name == currentUser)
        ) {
          // Create ticket { key 1: [], ticket key 2: [] } object
          if (issueKey in timeSpentByDateIssue[date] === false) {
            timeSpentByDateIssue[date][issueKey] = [];
          }
          let workLogObject = {};
          workLogObject[workLog.id] = workLog.timeSpentSeconds;
          timeSpentByDateIssue[date][issueKey].push(workLogObject);
        }
      });
      // Use a counter to ensure all async calls for worklogs are completed before updating time spent values
      itemsProcessed++;
      if (itemsProcessed === issueKeys.length) {
        updateTimeSpentValues(timeSpentByDateIssue);
      }
    });
  });
}

function updateTimeSpentValues(timeSpentByDateIssue) {
  for (const dateKey in timeSpentByDateIssue) {
    let timeSpentValueToUpdate = document.getElementById(
      "timeLoggedValue" + dateKey
    );
    let previousTimeSpentValue = timeSpentValueToUpdate.innerText;
    let timeSpentOnDateSeconds = calculateTimeSpentDate(
      timeSpentByDateIssue[dateKey]
    );
    timeSpentValueToUpdate.setAttribute("value", timeSpentOnDateSeconds);
    timeSpentValueToUpdate.innerText = formatTimeSpentText(
      timeSpentOnDateSeconds
    );
    validateTimeSpentValue(
      timeSpentValueToUpdate,
      timeSpentOnDateSeconds,
      dateKey
    );
    if (previousTimeSpentValue !== timeSpentValueToUpdate.innerText) {
      timeSpentValueToUpdate.classList.add("text-focus-in");
      setTimeout(() => {
        timeSpentValueToUpdate.classList.remove("text-focus-in");
      }, 750);
    }
  }
}

function calculateTimeSpentDate(issueKeyTimeLogObject) {
  // INPUT IS:
  // { ticket key 1: [{work id: time spent}, {work id: time spent}],
  //   ticket key 2: [{work id: time spent}, {work id: time spent}]
  // }
  let totalTimeSpentSeconds = 0;
  for (const issueKey in issueKeyTimeLogObject) {
    let workLogArray = issueKeyTimeLogObject[issueKey];
    let timeSpentIssueKey = calculateTimeSpentIssueKey(workLogArray);
    totalTimeSpentSeconds += timeSpentIssueKey;
  }
  return totalTimeSpentSeconds;
}

function calculateTimeSpentIssueKey(workLogArray) {
  // INPUT IS: [{work id: time spent}, {work id: time spent}],
  let timeSpentIssueKey = 0;
  for (let i = 0; i < workLogArray.length; i++) {
    for (const workLogId in workLogArray[i]) {
      timeSpentIssueKey += workLogArray[i][workLogId];
    }
  }
  return timeSpentIssueKey;
}

function formatTimeSpentText(timeSpentSeconds) {
  let hoursSpent = timeSpentSeconds / 3600;
  return hoursSpent + "h";
}

function validateTimeSpentValue(timeSpentElement, timeSpentSeconds, date) {
  // Clear time related classes initially to handle refreshes when time is logged (otherwise color does not change)
  timeSpentElement.classList.remove("time-correct", "time-logged-inccorect");
  let today = new Date();
  today.setHours(0, 0, 0, 0); // Set time element of object to 0 to allow comparison just on the date element
  // Use constructor Date(year, month, day) to generate date object for the date provided so it can be compared to 'today'
  // month is 0-based, that's why we need dataParts[1] - 1
  let dateParts = date.split("-");
  let dateObject = new Date(+dateParts[0], +dateParts[1] - 1, +dateParts[2]);
  // Only flag days with under 8h logged if they occur before today
  // Flag any day with more than 8h logged against it
  let secondsInWorkday = convertTimeSpentToSeconds(HOURS_IN_WORKDAY);
  if (timeSpentSeconds === secondsInWorkday) {
    timeSpentElement.classList.add("time-correct");
  } else if (timeSpentSeconds > secondsInWorkday) {
    timeSpentElement.classList.add("time-logged-inccorect");
  } else if (timeSpentSeconds < secondsInWorkday && dateObject < today) {
    timeSpentElement.classList.add("time-logged-inccorect");
  }
}

// SECTION 3
// SEND REQUEST TO UPDATE LOGS
function getSelectedDatesToUpdate() {
  let selectedDates = document.querySelectorAll(
    `input[name=date-option]:checked`
  );
  let datesToUpdate = [];
  selectedDates.forEach((element) => {
    datesToUpdate.push(element.value);
  });
  return datesToUpdate;
}

function getTicketsToUpdate() {
  let ticketsToUpdate = {};
  let rangeSliders = document.querySelectorAll(`input[type=range]`);
  rangeSliders.forEach((element) => {
    if (element.valueAsNumber > TIME_SLIDER_MINIMUM_VALUE) {
      ticketsToUpdate[element.id] = element.valueAsNumber;
    }
  });
  return ticketsToUpdate;
}

function validTimeAmountToLog(ticketsToUpdate, datesToUpdate) {
  // Check time selected in range inputs
  // example input {TIME-14: 2, TIME-3: 4}
  let totalTimeToLogPerDay = 0;
  for (let ticketKey in ticketsToUpdate) {
    totalTimeToLogPerDay += ticketsToUpdate[ticketKey];
  }
  let errorMessage = `Error: Unable to log more than ${HOURS_IN_WORKDAY} hours for a day. Please reduce time selected to log.`;
  if (totalTimeToLogPerDay > HOURS_IN_WORKDAY) {
    displayMessage(errorMessage, "messageDisplay");
    throw Error(errorMessage);
  } else {
    // Check existing time on ticket for dates to make sure more than one day is not logged
    // Do not use forEach as the return statement will not break out of loop
    for (let i = 0; i < datesToUpdate.length; i++) {
      let dateKey = datesToUpdate[i].slice(0, 10);
      let timeLoggedElement = document.getElementById(
        "timeLoggedValue" + dateKey
      );
      let timeAlreadySpent = +timeLoggedElement.getAttribute("value");
      let totalTimeOnTicket =
        timeAlreadySpent + convertTimeSpentToSeconds(totalTimeToLogPerDay);
      if (totalTimeOnTicket > convertTimeSpentToSeconds(HOURS_IN_WORKDAY)) {
        displayMessage(errorMessage, "messageDisplay");
        throw Error(errorMessage);
      }
    }
  }
  return true;
}

function _selectionsMade(ticketsToUpdate, datesToUpdate) {
  if (
    (Object.entries(ticketsToUpdate).length === 0 &&
      ticketsToUpdate.constructor === Object) ||
    datesToUpdate.length === 0
  ) {
    displayMessage(
      "Error: Please set time to log and select dates",
      "messageDisplay"
    );
    // Throw error to prevent api calls being made
    throw Error("Error: Please set time to log and select dates");
  }
  return true;
}

// Log time for tickets and dates selected
let logTimeButton = document.getElementById("logTime");
logTimeButton.addEventListener("click", function () {
  let datesToUpdate = getSelectedDatesToUpdate();
  let ticketsToUpdate = getTicketsToUpdate();
  let ticketDateSelected = _selectionsMade(ticketsToUpdate, datesToUpdate);
  let validTime = validTimeAmountToLog(ticketsToUpdate, datesToUpdate);

  if (validTime && ticketDateSelected) {
    let apiPostPromises = [];
    for (const issueKey in ticketsToUpdate) {
      let timeSpent = ticketsToUpdate[issueKey];
      datesToUpdate.forEach(function (dateSelected) {
        console.log("UPDATING: " + issueKey, timeSpent, dateSelected);
        let postRequest = updateIssueLog(issueKey, timeSpent, dateSelected);
        apiPostPromises.push(postRequest);
      });
    }
    Promise.all(apiPostPromises)
      .then((response) => {
        displayMessage(
          "Success: Your time has been logged successfully",
          "messageDisplay"
        ),
          clearSelectedDates(),
          clearRangeValues(),
          refreshTimeLoggedDataStore();
      })
      .catch((error) =>
        displayMessage(
          _determineErrorMessage(apiPostPromises.length),
          "messageDisplay"
        )
      );
  }
});

function _determineErrorMessage(requestNumber) {
  if (requestNumber > 1) {
    return "Error: Some of your time may not have been logged, please check.";
  }
  return "Error: Your time failed to be logged.";
}

// SECTION 4
// CLEAR SCREEN

function clearSelectedDates() {
  // clear actual checkboxes
  let selectedDates = document.querySelectorAll(
    `input[name=date-option]:checked`
  );
  selectedDates.forEach((element) => {
    element.checked = false;
  });

  // clear the styled labels
  let selectedDatesLabels = document.querySelectorAll(".to-update");
  selectedDatesLabels.forEach((element) => {
    element.classList.toggle("to-update");
  });
}

function clearRangeValues() {
  let rangeSliders = document.querySelectorAll(`input[type=range]`);
  rangeSliders.forEach((element) => {
    if (element.valueAsNumber > 0) {
      element.value = "0";
      showSliderValue(element, element.id + "Value");
    }
  });
}
