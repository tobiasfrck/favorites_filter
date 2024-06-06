if (typeof state !== "undefined") {
  throw new Error("State already defined!");
}
var state = typeof state === "undefined" ? "off" : state;

let globalFilters = [];
let itemCount = 0;

// listen for messages from background.js
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.message === "actionButtonClicked") {
    console.log("action button clicked!");
    document.URL.includes("vinted")
      ? pluginButton()
      : console.log("not vinted");
  }
});

var itemUpdateInterval = setInterval(function () {
  updateInternalItemCounter();
}, 500);

function pluginButton() {
  if (document.URL.includes("catalog") || !document.URL.includes("vinted")) {
    console.log("Not sorting on catalog page or non vinted page.");
    return;
  }

  if (state === "off") {
    sortByPrice("lowToHigh");
    state = "on";
    return;
  }

  if (state === "on") {
    sortByPrice("highToLow");
    state = "off";
    return;
  }
}

async function Retry(action, retryInterval = 5000, maxAttemptCount = 3) {
  const exceptions = [];
  for (let attempted = 0; attempted < maxAttemptCount; attempted++) {
    try {
      if (attempted > 0) await sleep(retryInterval);
      return action();
    } catch (e) {
      exceptions.push(e);
    }
  }

  return exceptions;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

var observeDOM = (function () {
  var MutationObserver =
    window.MutationObserver || window.WebKitMutationObserver;

  return function (obj, callback) {
    if (!obj || obj.nodeType !== 1) return;

    if (MutationObserver) {
      // define a new observer
      var mutationObserver = new MutationObserver(callback);

      // have the observer observe for changes in children
      mutationObserver.observe(obj, { childList: true, subtree: true });
      return mutationObserver;
    }

    // browser support fallback
    else if (window.addEventListener) {
      obj.addEventListener("DOMNodeInserted", callback, false);
      obj.addEventListener("DOMNodeRemoved", callback, false);
    }
  };
})();

function updateInternalItemCounter() {
  if (getItems().length !== itemCount) {
    itemCount = getItems().length;
    websiteChange();
    updateItemCounter();
  }
}

document.addEventListener("readystatechange", function (event) {
  if (document.URL.includes("vinted") && document.readyState === "complete") {
    Retry(websiteChange, 500, 5)
      .then(() => {
        console.log("AddedPadding successfully");
        addPaddingTopToAllItems();
      })
      .catch((exceptions) => console.log("AddedPadding items.", exceptions));
    let listElm = document.querySelector(".feed-grid");
    observeDOM(listElm, function (m) {
      var addedNodes = [];

      m.forEach(
        (record) =>
          record.addedNodes.length & addedNodes.push(...record.addedNodes)
      );

      if (document.URL.includes("catalog")) {
        return;
      }

      makeSizeOfItemsEqual();
      websiteChange();
      addPaddingTopToAllItems();
      makeLinksOpenInNewTab();
    });
  }
});

if (isFavoriteSite() || isMemberSite()) {
  addSpecialElementContainer();
  addSearchBar();
  addFilterContainer();
  websiteChange();
}

document.addEventListener("keydown", function (event) {
  if (!isVinted() || document.readyState !== "complete") {
    return;
  }

  let itemcontainer = document.getElementsByClassName("feed-grid");

  if (itemcontainer === undefined || itemcontainer.length === 0) {
    console.log("No itemcontainer found");
    return;
  }

  let items = itemcontainer[0].getElementsByClassName("feed-grid__item");

  if (items === undefined || items.length === 0) {
    console.log("No items found");
    return;
  }

  if (event.code === "NumpadAdd") {
    changeItemSize(true);
  }

  if (event.code === "NumpadSubtract") {
    changeItemSize(false);
  }

  // TODOs:
  // - Change assignment to innerHTML to a safer method

  // TODO: maybe activate saving items to local storage again
  /*   // save item elements to chrome persistent storage.local with ctrl+z
  if (event.code === "KeyZ" && event.ctrlKey) {
    console.log("Replacing items in storage with current items.");
    let items = getItems();
    let itemData = [];
    for (let i = 0; i < items.length; i++) {
      if (isItemSold(items[i])) {
        // let heart = getHeartElementOfItem(items[i]);
        // if (heart !== null) {
        //   heart.style.fill = "blue";
        // }
        continue;
      }
      let innrTxt = getTitleOfItem(items[i]).getAttribute("data-testid");
      itemData.push({ html: items[i].outerHTML, idText: innrTxt });
      // let heart = getHeartElementOfItem(items[i]);
      // if (heart !== null) {
      //   heart.style.fill = "red";
      // }
    }
    browser.storage.local.set({ items: itemData }, function () {
      console.log(itemData.length + " Items saved. Identifier: data-testid.");
    });
  }

  // save new item elements to chrome persistent storage.local with key k and avoid duplicates and remove items marked as sold
  if (event.code === "KeyK") {
    console.log("Saving new items.");
    let items = getItems();
    browser.storage.local.get(["items"], function (result) {
      let itemData = result.items;

      let soldItemCounter = 0;
      let newItemsCounter = 0;

      for (let i = 0; i < items.length; i++) {
        let innrTxt = getTitleOfItem(items[i]).getAttribute("data-testid");

        let isSold = isItemSold(items[i]);

        // If the title is not in itemData and the item is not sold, add it to itemData
        if (!itemData.some((item) => item.idText === innrTxt) && !isSold) {
          // if itemData does not contain an item with the same title and the item is not sold
          itemData.push({ html: items[i].outerHTML, idText: innrTxt });
          newItemsCounter++;
          // let heart = getHeartElementOfItem(items[i]);
          // if (heart !== null) {
          //   heart.style.fill = "red";
          // }
        }

        // TODO: If the item is in itemData check if the price has changed and update the price in itemData

        //if the item was not saved then change the heart color to blue

        // If the title is already in itemData and the item is sold, remove it from itemData
        if (itemData.some((item) => item.idText === innrTxt) && isSold) {
          itemData = itemData.filter((item) => item.idText !== innrTxt);
          soldItemCounter++;
          // let heart = getHeartElementOfItem(items[i]);
          // if (heart !== null) {
          //   heart.style.fill = "blue";
          // }
        }
      }
      browser.storage.local.set({ items: itemData }, function () {
        console.log(
          itemData.length +
            " Items in storage. " +
            newItemsCounter +
            " new items added, " +
            soldItemCounter +
            " sold items removed."
        );
      });
    });
  }

  // load item elements from chrome persistent storage.local and append them to the itemcontainer, then check for duplicates and remove them
  if (event.code === "Period") {
    let itemcontainer = document.getElementsByClassName("feed-grid");
    browser.storage.local.get(["items"], function (result) {
      let itemData = result.items;
      let items = itemcontainer[0].getElementsByClassName("feed-grid__item");
      let itemTxts = [];

      // Get all titles of the current items so that we don't add them again
      for (let i = 0; i < items.length; i++) {
        let innrtxt = getTitleOfItem(items[i]).getAttribute("data-testid");
        if (!itemTxts.includes(innrtxt)) {
          itemTxts.push(innrtxt);
          // let heart = getHeartElementOfItem(items[i]);
          // if (heart !== null) {
          //   heart.style.fill = "blue";
          // }
        } else {
          items[i].remove();
        }
      }

      let duplicateCounter = 0;

      for (let i = 0; i < itemData.length; i++) {
        if (!itemTxts.includes(itemData[i].idText)) {
          itemTxts.push(itemData[i].idText);
          let tempDiv = document.createElement("div");
          tempDiv.innerHTML = itemData[i].html; // TODO: This is "Unsafe assignment to innerHTML" according to Mozilla
          // let heart = getHeartElementOfItem(items[i]);
          // if (heart !== null) {
          //   heart.style.fill = "red";
          // }
          itemcontainer[0].appendChild(tempDiv.firstChild);
        } else {
          duplicateCounter++;
        }
      }
      let addedCounter = itemData.length - duplicateCounter;
      console.log(
        addedCounter +
          " Items added, " +
          duplicateCounter +
          " duplicates skipped. Total: " +
          getItems().length +
          " items."
      );
    });
  } */
});

function isVinted() {
  return document.URL.includes("vinted");
}

function isFavoriteSite() {
  return (
    document.URL.includes("vinted") && document.URL.includes("favourite_list")
  );
}

function isMemberSite() {
  return document.URL.includes("vinted") && document.URL.includes("member");
}

// This function should add checkboxes for each size to the end of the searchContainer
// Each checkbox should have an event listener that adds a filter to the globalFilters array if it is checked
// If the checkbox is unchecked, the filter should be removed from the globalFilters array
function addSizeFilters() {
  let sizes = sortSizes(getAllPossibleSizes());
  let filterCont = document.getElementById("filterContainer");

  // if sizecontainer already exists, remove it
  let sizeContainer = document.getElementById("sizeContainer");
  let oldCheckedSizes = [];
  if (sizeContainer !== null) {
    let tempCheckboxes = sizeContainer.getElementsByTagName("input");
    for (let i = 0; i < tempCheckboxes.length; i++) {
      if (tempCheckboxes[i].checked) {
        oldCheckedSizes.push(tempCheckboxes[i].value);
      }
    }
    sizeContainer.remove();
  }
  sizeContainer = document.createElement("div");
  sizeContainer.setAttribute("id", "sizeContainer");

  let neededCollums = Math.ceil(sizes.length / 3);
  sizeContainer.style.columnCount = neededCollums;

  for (let i = 0; i < sizes.length; i++) {
    let size = sizes[i];
    let sizeLabelContainer = document.createElement("div");
    sizeLabelContainer.setAttribute("id", "sizeLabelContainer" + i);
    let checkbox = document.createElement("input");
    checkbox.setAttribute("type", "checkbox");
    checkbox.setAttribute("id", "size" + i);
    checkbox.setAttribute("value", size);
    checkbox.style.marginLeft = "10px";

    let label = document.createElement("label");
    if (size === "") {
      label.setAttribute("for", "size" + i);
      label.innerText = "No size";
    } else {
      label.setAttribute("for", "size" + i);
      label.innerText = size;
    }

    // TODO: optimize this; this is ugly
    if (oldCheckedSizes.includes(size)) {
      checkbox.checked = true;
      let filter = {
        name: size,
        condition: (item) => hasItemClothingSize(item, size),
        action: showItem,
      };
      if (checkbox.checked) {
        globalFilters.push(filter);
      } else {
        globalFilters = globalFilters.filter((f) => f.name !== filter.name);
      }

      applyFilters(getItems(), globalFilters, hideItem);
    }

    sizeLabelContainer.appendChild(checkbox);
    sizeLabelContainer.appendChild(label);
    sizeContainer.appendChild(sizeLabelContainer);

    checkbox.addEventListener("change", function () {
      let filter = {
        name: size,
        condition: (item) => hasItemClothingSize(item, size),
        action: showItem,
      };
      if (checkbox.checked) {
        globalFilters.push(filter);
      } else {
        globalFilters = globalFilters.filter((f) => f.name !== filter.name);
      }

      applyFilters(getItems(), globalFilters, hideItem);
    });
  }
  filterCont.appendChild(sizeContainer);
  console.log("Sizes added");
}

// Let the user filter items by their status (sold, reserved, available)
function addStatusFilters() {
  let filterCont = document.getElementById("filterContainer");

  // if statusContainer already exists, remove it
  let statusContainer = document.getElementById("statusContainer");
  if (statusContainer !== null) {
    statusContainer.remove();
  }
  statusContainer = document.createElement("div");
  statusContainer.setAttribute("id", "statusContainer");

  let statusLabels = ["Available", "Reserved", "Sold"];

  for (let i = 0; i < statusLabels.length; i++) {
    let statusLabelContainer = document.createElement("div");
    statusLabelContainer.setAttribute("id", "statusLabelContainer" + i);
    let checkbox = document.createElement("input");
    checkbox.setAttribute("type", "checkbox");
    checkbox.setAttribute("id", "status" + i);
    checkbox.setAttribute("value", statusLabels[i]);
    checkbox.style.marginLeft = "10px";

    let label = document.createElement("label");
    label.setAttribute("for", "status" + i);
    label.innerText = statusLabels[i];

    statusLabelContainer.appendChild(checkbox);
    statusLabelContainer.appendChild(label);
    statusContainer.appendChild(statusLabelContainer);

    checkbox.addEventListener("change", function () {
      let filter = {
        name: "status" + i,
        conditionType: "inclusive",
        condition: (item) => {
          if (statusLabels[i] === "Sold") {
            return isItemSold(item);
          } else if (statusLabels[i] === "Reserved") {
            return isItemSoldOrReserved(item) && !isItemSold(item);
          } else {
            return !isItemSoldOrReserved(item);
          }
        },
        action: showItem,
      };

      if (checkbox.checked) {
        // if globalFilters contains no status filter, no exclusive filter and other filters make the status filter exclusive
        let statusFilter = globalFilters.filter((f) =>
          f.name.includes("status")
        );
        let otherFilters = globalFilters.filter(
          (f) => !f.name.includes("status") && f.conditionType !== "exclusive"
        );
        if (statusFilter.length === 0 && otherFilters.length !== 0) {
          filter.conditionType = "exclusive";
        }
        // This should make it possible to combine size filters with status filters

        globalFilters.push(filter);
      } else {
        globalFilters = globalFilters.filter((f) => f.name !== filter.name);
      }

      applyFilters(getItems(), globalFilters, hideItem);
    });
  }

  filterCont.appendChild(statusContainer);
}

function addSortByPriceButton() {
  let filterCont = document.getElementById("filterContainer");

  // if sortContainer already exists, move it to the end of the filterContainer
  let sortContainer = document.getElementById("sortContainer");
  if (sortContainer !== null) {
    if (sortContainer.nextSibling !== null) {
      sortContainer.remove();
    }

    filterCont.appendChild(sortContainer);
    return;
  }

  sortContainer = document.createElement("div");
  sortContainer.setAttribute("id", "sortContainer");

  let sortButton = document.createElement("button");
  sortButton.style.padding = "2px";
  sortButton.style.backgroundColor = "gray";
  sortButton.style.color = "white";
  sortButton.setAttribute("id", "sortButton");
  sortButton.setAttribute("lowtohigh", 1);
  sortButton.innerText = "Sort by price (low to high)";

  sortButton.addEventListener("click", function () {
    sortButton = document.getElementById("sortButton");
    if (sortButton.getAttribute("lowtohigh") == 1) {
      sortButton.innerText = "Sort by price (high to low)";
      sortButton.setAttribute("lowtohigh", 0);
      sortByPrice("lowToHigh");
    } else {
      sortButton.innerText = "Sort by price (low toHigh)";
      sortButton.setAttribute("lowtohigh", 1);
      sortByPrice("highToLow");
    }
  });

  sortContainer.appendChild(sortButton);
  filterCont.appendChild(sortContainer);
}

// Sort the sizes in the sizes array in ascending order
// First Shoe Sizes without the "/" and only numerical symbols plus "." and "," and maybe "2/3" , then sort clothing sizes with the "/" in ascending order and then sort the rest of the sizes which may contain alphabetical characters in ascending order
function sortSizes(sizes) {
  let shoeSizes = [];
  let clothingSizes = [];
  let otherSizes = [];

  for (let i = 0; i < sizes.length; i++) {
    if (sizes[i].includes("/")) {
      clothingSizes.push(sizes[i]);
    } else if (
      sizes[i].match(/^[0-9.,]+$/) !== null ||
      sizes[i].includes("2/3")
    ) {
      shoeSizes.push(sizes[i]);
    } else {
      otherSizes.push(sizes[i]);
    }
  }

  shoeSizes.sort();
  clothingSizes.sort();
  otherSizes.sort();

  return shoeSizes.concat(clothingSizes).concat(otherSizes);
}

function getAllPossibleSizes() {
  let items = getItems();
  let sizes = [];
  for (let i = 0; i < items.length; i++) {
    let description = getDescriptionOfItem(items[i]);
    if (!sizes.includes(description.innerText)) {
      sizes.push(description.innerText);
    }
  }
  return sizes;
}

function addSpecialElementContainer() {
  let itemcontainer = document.querySelectorAll(".l-header,.js-header")[0];
  let specialContainer = document.createElement("div");
  specialContainer.setAttribute("id", "specialContainer");
  specialContainer.style.display = "flex";
  specialContainer.style.flexDirection = "column";
  itemcontainer.appendChild(specialContainer);
}

function addFilterContainer() {
  let filterContainer = document.createElement("div");
  filterContainer.setAttribute("id", "filterContainer");
  filterContainer.style.display = "flex";
  filterContainer.style.flexDirection = "row";

  let itemcontainer = document.getElementById("specialContainer");
  itemcontainer.appendChild(filterContainer);
}

function addSearchBar() {
  let searchField = document.createElement("input");
  searchField.setAttribute("type", "text");
  searchField.setAttribute("id", "searchField");
  searchField.style.width = "100%";
  searchField.style.fontSize = "20px";
  searchField.setAttribute("placeholder", "Search for a term");

  let searchButton = document.createElement("button");
  searchButton.setAttribute("id", "searchButton");
  searchButton.style.paddingLeft = "10px";
  searchButton.style.paddingRight = "10px";
  searchButton.innerText = "Search";

  // clear button
  let clearButton = document.createElement("button");
  clearButton.setAttribute("id", "clearButton");
  clearButton.style.paddingLeft = "10px";
  clearButton.style.paddingRight = "10px";
  clearButton.innerText = "Clear";

  let searchContainer = document.createElement("div");
  searchContainer.setAttribute("id", "searchContainer");
  searchContainer.style.display = "flex";
  searchContainer.style.height = "50px";
  searchContainer.style.fontSize = "20px";
  searchContainer.style.border = "1px solid red";

  searchContainer.appendChild(searchField);
  searchContainer.appendChild(searchButton);
  searchContainer.appendChild(clearButton);

  let itemcontainer = document.getElementById("specialContainer");
  itemcontainer.appendChild(searchContainer);

  document
    .getElementById("searchButton")
    .addEventListener("click", function () {
      searchForTerm();
    });
  document
    .getElementById("searchField")
    .addEventListener("keyup", function (event) {
      if (event.code === "Enter") {
        searchForTerm();
      }
    });

  console.log("Searchbar added");
  document.getElementById("clearButton").addEventListener("click", function () {
    clearSearch();
  });
}

function getItems() {
  let itemcontainer = document.getElementsByClassName("feed-grid");
  let items = itemcontainer[0].getElementsByClassName("feed-grid__item");
  return items;
}

function updateItemCounter() {
  let items = getItems();
  let itemCounterAtTop = document.querySelector(".web_ui__Text__parent");
  if (itemCounterAtTop) {
    // only count items that are visible
    let amount = 0;
    let soldItems = 0;
    let reservedItems = 0;
    for (let i = 0; i < items.length; i++) {
      if (items[i].style.display !== "none") {
        amount++;
        if (isItemSold(items[i])) {
          soldItems++;
        }
        if (isItemReserved(items[i])) {
          reservedItems++;
        }
      }
    }

    console.log(
      amount + " Items " + soldItems + " Sold " + reservedItems + " Reserved"
    );

    itemCounterAtTop.innerText =
      amount +
      "/" +
      items.length +
      " Items " +
      soldItems +
      " Sold " +
      reservedItems +
      " Reserved";
  }
}

function getDescriptionOfItem(item) {
  return item.querySelector(
    ".u-flexbox+ .new-item-box__description .web_ui__Text__left"
  );
}

function getTitleOfItem(item) {
  return item.querySelectorAll(
    ".new-item-box__overlay,.new-item-box__overlay--clickable"
  )[0];
}

function getPriceOfItem(item) {
  let priceText = item.querySelector(".web_ui__Text__muted").innerText;
  return parseFloat(priceText.replace(/[^0-9.,]/g, "").replace(",", ".")); // remove all non-numeric characters and replace comma with dot
}

function isItemSoldOrReserved(item) {
  return (
    item.innerText.includes("Verkauft") || item.innerText.includes("Reserviert")
  );
}

function isItemReserved(item) {
  return item.innerText.includes("Reserviert");
}

// function getHeartElementOfItem(item) { // Heart is identified by the path tag
//   let heart = item.querySelector("path");
//   if (heart === null) {
//     return null;
//   }
//   return heart;
// }

function isItemSold(item) {
  return item.innerText.includes("Verkauft");
}

function hideItem(item) {
  item.style.display = "none";
}

function hideItems(items) {
  items.forEach((item) => hideItem(item));
}

function showItem(item) {
  item.style.display = "block";
}

function showItems(items) {
  for (let i = 0; i < items.length; i++) {
    showItem(items[i]);
  }
}

function clearSearch() {
  globalFilters = globalFilters.filter((f) => f.name !== "search"); // remove search filter
  applyFilters(getItems(), globalFilters, hideItem);
  document.getElementById("searchField").value = "";
}

function searchForTerm() {
  let searchTerm = document.getElementById("searchField").value;

  if (searchTerm === "") {
    clearSearch();
    return;
  }

  globalFilters = globalFilters.filter((f) => f.name !== "search"); // remove search filter
  console.log("Searching for: " + searchTerm);

  globalFilters.push({
    name: "search",
    conditionType: "exclusive",
    searchTerm: searchTerm,
    condition: (item) =>
      doesItemTitleContainSimilarSearchTerm(item, searchTerm.toLowerCase()) ||
      getDescriptionOfItem(item)
        .innerText.toLowerCase()
        .includes(searchTerm.toLowerCase()),
    action: showItem,
  });
  console.log(globalFilters);
  applyFilters(getItems(), globalFilters, hideItem);
}

function changeItemSize(increment) {
  let items = getItems();
  // increment is a boolean
  let itemWidth = items[0].style.width;
  let match = itemWidth.match(/\d+(\.\d+)?/);
  let number = match ? match[0] : 25;
  let newWidth = 100 / number;
  newWidth = Math.round(newWidth);
  newWidth = increment ? newWidth + 1 : newWidth - 1;
  for (let i = 0; i < items.length; i++) {
    // Get 100/number
    items[i].style.width = 100 / newWidth + "%";
  }
}

function makeSizeOfItemsEqual() {
  let items = getItems();
  if (items.length !== 0) {
    let itemWidth = items[0].style.width;
    let match = itemWidth.match(/\d+(\.\d+)?/);
    let number = match ? match[0] : 25;
    let newWidth = 100 / number;
    newWidth = Math.round(newWidth);
    for (let i = 0; i < items.length; i++) {
      items[i].style.width = 100 / newWidth + "%";
    }
  }
}

function hasItemClothingSize(item, size) {
  let description = getDescriptionOfItem(item);
  return description.innerText === size;
}

function doesItemTitleContainSimilarSearchTerm(item, searchTerm) {
  const maxDistance = 1;

  let splitTitle = getTitleOfItem(item).title.toLowerCase().split(" ");

  for (let i = 0; i < splitTitle.length; i++) {
    if (damerauLevenshteinDistance(splitTitle[i], searchTerm) <= maxDistance) {
      return true;
    }
  }

  return false;
}

function doNothing(element) {
  return;
}

function doNothing() {
  return;
}

function setBackgroundGreen(element) {
  element.style.backgroundColor = "#90EE90";
}

function setBackgroundYellow(element) {
  element.style.backgroundColor = "yellow";
}

function setBackgroundColor(element, color) {
  element.style.backgroundColor = color;
}

function applyFilters(items, filters, action) {
  if (filters.length === 0) {
    showItems(items);
    updateItemCounter();
    return;
  }

  let exclusiveFilters = filters.filter((f) => f.conditionType === "exclusive");
  filters = filters.filter((f) => f.conditionType !== "exclusive");

  // TODO: This may be better than the current implementation but it is not tested
  /*
  for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
    let item = items[itemIdx];
    let filtered = true;

    // if an item meets all exclusive filters, it is exclusively filtered
    // this allows to combine exclusive filters e.g. search and availability
    for (let xfilterIdx = 0; xfilterIdx < exclusiveFilters.length; xfilterIdx++) {
      if(exclusiveFilters[xfilterIdx].condition(item) === false) {
        filtered = false;
        break;
      }
    }

    let orFiltered = false;
    if (filtered) {
      for (let filterIdx = 0; filterIdx < filters.length; filterIdx++) {
        if (filters[filterIdx].condition(item) === true) {
          orFiltered = true;
          filters[filterIdx].action(item);
        }
      }
    } 

    // if an item is not exclusively filtered and not orFiltered, apply the action
    if (!filtered || !orFiltered) {
      action(item);
    }
  }
  */

  // apply exclusive filters
  for (let i = 0; i < exclusiveFilters.length; i++) {
    let filter = exclusiveFilters[i];
    for (let j = 0; j < items.length; j++) {
      if (filter.condition(items[j])) {
        // if exlusively filtered
        if (filters.length === 0) {
          filter.action(items[j]);
        }

        for (let k = 0; k < filters.length; k++) {
          // filter by other filters
          if (filters[k].condition(items[j])) {
            filters[k].action(items[j]);
            break;
          } else {
            action(items[j]);
          }
        }
      } else {
        // if not exlusively filtered
        action(items[j]);
      }
    }
  }

  // do nothing if there are no filters left
  if (exclusiveFilters.length != 0) {
    return;
  }

  for (let i = 0; i < items.length; i++) {
    let filtered = false;
    for (let j = 0; j < filters.length; j++) {
      if (filters[j].condition(items[i])) {
        filters[j].action(items[i]);
        filtered = true;
        break;
      }
    }

    if (!filtered) {
      action(items[i]);
    }
  }

  updateItemCounter();
}

function makeLinksOpenInNewTab() {
  // make all links in the feed-grid open in a new tab
  let items = getItems();
  for (let i = 0; i < items.length; i++) {
    let title = items[i].querySelectorAll("a");
    for (let j = 0; j < title.length; j++) {
      title[j].setAttribute("target", "_blank");
    }
  }
}

function addPaddingTopToAllItems() {
  let itemcontainer = document.getElementsByClassName("feed-grid");
  let items = itemcontainer[0].getElementsByClassName("feed-grid__item");

  for (let i = 0; i < items.length; i++) {
    if (items[i].style.paddingTop === "10px") {
      continue;
    }
    items[i].style.paddingTop = "10px";
  }
}

function websiteChange() {
  addSizeFilters();
  addStatusFilters();
  addSortByPriceButton();
  console.log("Website changed");
  applyFilters(getItems(), globalFilters, hideItem);
}

function sortByPrice(sortOrder) {
  let itemcontainer = document.getElementsByClassName("feed-grid");
  let items = itemcontainer[0].getElementsByClassName("feed-grid__item");

  let prices = [];
  for (let i = 0; i < items.length; i++) {
    let price = getPriceOfItem(items[i])
    prices.push(price);
  }

  let sortedPrices =
    sortOrder === "lowToHigh"
      ? prices.sort((a, b) => a - b)
      : prices.sort((a, b) => b - a);

  console.log("Sorting by price: " + sortOrder);

  console.log(itemcontainer[0].childNodes.length + " items found");

  for (let i = 0; i < sortedPrices.length; i++) {
    for (let j = 0; j < items.length; j++) {
      let price = getPriceOfItem(items[j]);
      if (price === sortedPrices[i]) {
        itemcontainer[0].appendChild(items[j]);
        break;
      }
    }
  }

  console.log(itemcontainer[0].childNodes.length + " items found");

  console.log("Sorting done");
}

// Calculate the Damerau-Levenshtein distance between two strings
function damerauLevenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const d = [];

  // Initialize the first row and column
  for (let i = 0; i <= m; i++) {
    d[i] = [i];
  }
  for (let j = 0; j <= n; j++) {
    d[0][j] = j;
  }

  // Calculate the edit distance
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // Deletion
        d[i][j - 1] + 1, // Insertion
        d[i - 1][j - 1] + cost // Substitution
      );

      // Check for transposition
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
      }
    }
  }

  return d[m][n];
}
