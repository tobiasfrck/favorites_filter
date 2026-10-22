if (typeof state !== "undefined") {
  throw new Error("State already defined!");
}
var state = typeof state === "undefined" ? "off" : state;

let globalFilters = [];
let specialElementContainer = null;
let previousItems = [];
let previousItemData = [];
let previousItemContainer = null;
let refreshTimer = null;

// Firefox exposes the WebExtension APIs as `browser`, Chrome as `chrome`.
let extApi = globalThis.browser ?? globalThis.chrome;

// listen for messages from background.js
extApi.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.message === "actionButtonClicked") {
    console.log("action button clicked!");
    document.URL.includes("vinted")
      ? pluginButton()
      : console.log("not vinted");
  }
});

var itemUpdateInterval = setInterval(function () {
  syncExtension();
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

function syncExtension() {
  if (!isFavoriteSite() && !isMemberSite()) {
    specialElementContainer?.remove();
    previousItems = [];
    previousItemData = [];
    previousItemContainer = null;
    return;
  }

  const items = Array.from(getItems());
  // Vinted also fills/reuses existing cards. Node identity alone misses prices,
  // sizes and availability arriving after the initial render.
  const itemData = items.map((item) => JSON.stringify([
    getTitleOfItem(item), getDescriptionOfItem(item), getPriceOfItem(item),
    isItemSold(item), isItemReserved(item),
  ]));
  const itemContainer = getItemContainer()[0] ?? null;
  // A rerender can replace every item without changing the item count.
  const itemsChanged =
    itemContainer !== previousItemContainer ||
    items.length !== previousItems.length ||
    items.some((item, index) =>
      item !== previousItems[index] || itemData[index] !== previousItemData[index]);
  const controlsMissing =
    !specialElementContainer?.isConnected ||
    ["searchContainer", "filterContainer", "sizeContainer", "statusContainer",
      "priceContainer", "sortContainer", "itemCounter"].some((id) =>
      !specialElementContainer.querySelector(`#${id}`));

  if (!itemsChanged && !controlsMissing) return;
  if (!websiteChange(itemsChanged)) return;

  previousItems = items;
  previousItemData = itemData;
  previousItemContainer = itemContainer;
  if (itemsChanged) makeLinksOpenInNewTab();
}

// Observe a stable ancestor: Vinted can replace both the header and the grid.
// Batch mutations and only rebuild filters when items or their metadata change, so
// image loading and slider interaction do not replace active input elements.
const pageObserver = new MutationObserver((records) => {
  // Our own control/counter updates cannot change article metadata.
  if (records.every((record) => specialElementContainer?.contains(record.target))) return;
  if (refreshTimer !== null) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    syncExtension();
  }, 50);
});
pageObserver.observe(document.documentElement, {
  childList: true, subtree: true, characterData: true, attributes: true,
  attributeFilter: ["class", "title", "href", "data-testid"],
});
syncExtension();

document.addEventListener("keydown", function (event) {
  if (!isVinted() || document.readyState !== "complete") {
    return;
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
    extApi.storage.local.set({ items: itemData }, function () {
      console.log(itemData.length + " Items saved. Identifier: data-testid.");
    });
  }

  // save new item elements to chrome persistent storage.local with key k and avoid duplicates and remove items marked as sold
  if (event.code === "KeyK") {
    console.log("Saving new items.");
    let items = getItems();
    extApi.storage.local.get(["items"], function (result) {
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
      extApi.storage.local.set({ items: itemData }, function () {
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
    extApi.storage.local.get(["items"], function (result) {
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

    let label = document.createElement("label");
    if (size === "") {
      label.setAttribute("for", "size" + i);
      label.innerText = "No size";
    } else {
      label.setAttribute("for", "size" + i);
      label.innerText = size;
    }

    if (
      oldCheckedSizes.includes(size) &&
      globalFilters.filter((f) => f.name === size).length === 1
    ) {
      checkbox.checked = true;
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
  let oldCheckedStatuses = [];

  if (statusContainer !== null) {
    let tempCheckboxes = statusContainer.getElementsByTagName("input");
    for (let i = 0; i < tempCheckboxes.length; i++) {
      if (tempCheckboxes[i].checked) {
        oldCheckedStatuses.push(tempCheckboxes[i].value);
      }
    }
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

    let label = document.createElement("label");
    label.setAttribute("for", "status" + i);
    label.innerText = statusLabels[i];

    if (
      oldCheckedStatuses.includes(statusLabels[i]) &&
      globalFilters.filter((f) => f.name === "status" + i).length === 1
    ) {
      checkbox.checked = true;
    }

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

function addPriceFilter() {
  let filterCont = document.getElementById("filterContainer");

  // if priceContainer already exists, remove it
  let priceContainer = document.getElementById("priceContainer");
  let previousMin = null;
  let previousMax = null;
  if (priceContainer !== null) {
    let sliderMin = document.getElementById("slider-min");
    let sliderMax = document.getElementById("slider-max");
    if (sliderMin.value != sliderMin.min || sliderMax.value != sliderMax.max) {
      previousMin = parseInt(sliderMin.value);
      previousMax = parseInt(sliderMax.value);
    }
    priceContainer.remove();
  }
  priceContainer = document.createElement("div");
  priceContainer.setAttribute("id", "priceContainer");
  priceContainer.classList.add("price-filter");

  // Create the main div element with class "price-slider"
  priceSliderDiv = document.createElement("div");
  priceSliderDiv.className = "price-slider";

  // Create the first input (slider-min)
  sliderMinInput = document.createElement("input");
  sliderMinInput.type = "range";
  sliderMinInput.id = "slider-min";
  sliderMinInput.min = "0";
  sliderMinInput.max = "1000";
  sliderMinInput.value = "100";
  sliderMinInput.step = "1";

  // Create the second input (slider-max)
  sliderMaxInput = document.createElement("input");
  sliderMaxInput.type = "range";
  sliderMaxInput.id = "slider-max";
  sliderMaxInput.min = "0";
  sliderMaxInput.max = "1000";
  sliderMaxInput.value = "900";
  sliderMaxInput.step = "1";

  // Create the div for slider values with class "slider-values"
  sliderValuesDiv = document.createElement("div");
  sliderValuesDiv.className = "slider-values";

  // Create the span for min-value
  minValueSpan = document.createElement("span");
  minValueSpan.id = "min-value";
  minValueSpan.textContent = "$100";

  // Create the text node " - " for between the min and max values
  separatorText = document.createTextNode(" - ");

  // Create the span for max-value
  maxValueSpan = document.createElement("span");
  maxValueSpan.id = "max-value";
  maxValueSpan.textContent = "$900";

  // Append the min-value span, separator text, and max-value span to the slider-values div
  sliderValuesDiv.appendChild(minValueSpan);
  sliderValuesDiv.appendChild(separatorText);
  sliderValuesDiv.appendChild(maxValueSpan);

  // Create the div for slider track
  sliderTrackDiv = document.createElement("div");
  sliderTrackDiv.className = "slider-track";

  // Append all created elements to the main div
  priceSliderDiv.appendChild(sliderMinInput);
  priceSliderDiv.appendChild(sliderMaxInput);
  priceSliderDiv.appendChild(sliderValuesDiv);
  priceSliderDiv.appendChild(sliderTrackDiv);

  priceContainer.appendChild(priceSliderDiv);
  filterCont.appendChild(priceContainer);

  let sliderMin = document.getElementById("slider-min");
  let sliderMax = document.getElementById("slider-max");

  sliderMax.max = Math.ceil(getMaxPrice());
  sliderMin.max = sliderMax.max;

  sliderMin.min = Math.floor(getMinPrice());
  sliderMax.min = sliderMin.min;

  if (
    previousMin !== null &&
    previousMax !== null &&
    previousMin < previousMax
  ) {
    sliderMin.value = previousMin;
    sliderMax.value = previousMax;
  } else {
    sliderMin.value = sliderMin.min;
    sliderMax.value = sliderMax.max;
  }

  // if values are out of bounds, set them to the bounds
  if (parseInt(sliderMin.value) < parseInt(sliderMin.min)) {
    sliderMin.value = sliderMin.min;
  }
  if (parseInt(sliderMax.value) > parseInt(sliderMax.max)) {
    sliderMax.value = sliderMax.max;
  }

  updateSliderTrack();
  // A rebuild may clamp the selected range to new price bounds. Replace the
  // active predicate as well; it must not retain values from detached inputs.
  if (globalFilters.some((filter) => filter.name === "price")) {
    setPriceFilter(Number(sliderMin.value), Number(sliderMax.value));
  }

  const maxDistanceBetweenValues = 1;

  sliderMin.addEventListener("input", function () {
    if (
      parseInt(sliderMin.value) >
      parseInt(sliderMax.value) - maxDistanceBetweenValues
    ) {
      sliderMin.value = parseInt(sliderMax.value) - maxDistanceBetweenValues;
    }
    updateSliderTrack();
  });

  sliderMax.addEventListener("input", function () {
    if (
      parseInt(sliderMax.value) <
      parseInt(sliderMin.value) + maxDistanceBetweenValues
    ) {
      sliderMax.value = parseInt(sliderMin.value) + maxDistanceBetweenValues;
    }
    updateSliderTrack();
  });

  const applyPriceFilter = () => {
    setPriceFilter(Number(sliderMin.value), Number(sliderMax.value));
    applyFilters(getItems(), globalFilters, hideItem);
  };
  for (const slider of [sliderMin, sliderMax]) {
    slider.addEventListener("mouseup", applyPriceFilter);
    slider.addEventListener("change", applyPriceFilter);
  }
}

function setPriceFilter(min, max) {
  globalFilters = globalFilters.filter((filter) => filter.name !== "price");
  globalFilters.push({
    name: "price",
    conditionType: "exclusive",
    condition: (item) => {
      const price = getPriceOfItem(item);
      return price >= min && price <= max;
    },
    action: showItem,
  });
}

function updateSliderTrack() {
  let sliderMin = document.getElementById("slider-min");
  let sliderMax = document.getElementById("slider-max");
  let minValueDisplay = document.getElementById("min-value");
  let maxValueDisplay = document.getElementById("max-value");
  let sliderTrack = document.querySelector("#priceContainer .slider-track");

  const min = parseInt(sliderMin.value);
  const max = parseInt(sliderMax.value);

  // Update display values
  minValueDisplay.textContent = min;
  maxValueDisplay.textContent = max;

  // Update track fill
  const rangeMin = parseInt(sliderMin.min);
  const rangeMax = parseInt(sliderMin.max);
  const range = rangeMax - rangeMin;
  const leftPercent = range > 0 ? ((min - rangeMin) / range) * 100 : 0;
  const rightPercent = range > 0 ? ((max - rangeMin) / range) * 100 : 100;
  sliderTrack.style.setProperty("--left", leftPercent + "%");
  sliderTrack.style.setProperty("--right", rightPercent + "%");
  sliderTrack.style.background = `linear-gradient(to right, rgb(221, 221, 221) ${leftPercent}%, rgb(0, 119, 130) ${leftPercent}%, rgb(175, 76, 118) ${rightPercent}%, rgb(221, 221, 221) ${rightPercent}%)`;
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
      sortButton.innerText = "Sort by price (low to High)";
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
    if (!sizes.includes(description)) {
      sizes.push(description);
    }
  }
  return sizes;
}

function addSpecialElementContainer() {
  if (specialElementContainer?.isConnected) return true;

  const header = document.querySelector(".l-header,.js-header");
  if (!header) return false;

  if (!specialElementContainer) {
    specialElementContainer = document.createElement("div");
    specialElementContainer.id = "specialContainer";
  }
  // Keep our UI outside the header's managed children. Reattach the same DOM
  // if an ancestor is replaced, preserving input values and event listeners.
  header.after(specialElementContainer);
  return true;
}

function addFilterContainer() {
  let filterContainer = document.createElement("div");
  filterContainer.setAttribute("id", "filterContainer");

  let itemcontainer = document.getElementById("specialContainer");
  itemcontainer.appendChild(filterContainer);
}

function addSearchBar() {
  let searchField = document.createElement("input");
  searchField.setAttribute("type", "text");
  searchField.setAttribute("id", "searchField");
  searchField.setAttribute("placeholder", "Search for a term");

  let searchButton = document.createElement("button");
  searchButton.setAttribute("id", "searchButton");
  searchButton.innerText = "Search";

  // clear button
  let clearButton = document.createElement("button");
  clearButton.setAttribute("id", "clearButton");
  clearButton.innerText = "Clear";

  let searchContainer = document.createElement("div");
  searchContainer.setAttribute("id", "searchContainer");

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
  let itemcontainer = getItemContainer();
  if (itemcontainer.length === 0) {
    return [];
  }
  // Vinted exposes a semantic marker on the outer card. Keep a class fallback
  // for older layouts, excluding the similarly named inner content wrapper.
  let items = itemcontainer[0].querySelectorAll(
    ":scope > [data-testid='grid-item'], :scope > [class*='grid__item']:not([class*='grid__item-content'])"
  );
  return items;
}
function getItemContainer() {
  // CSS-module prefixes have changed from e.g. "feed__" to "HmDNda_".
  // Match the component suffix, without assuming the hash separator.
  let itemcontainer = document.querySelectorAll("[class*='feed-grid--compact'], .feed-grid");
  return itemcontainer;
}

function updateItemCounter() {
  if (!specialElementContainer?.isConnected) return;
  let items = getItems();
  let itemCounter = document.getElementById("itemCounter");
  if (!itemCounter) {
    itemCounter = document.createElement("div");
    itemCounter.id = "itemCounter";
    itemCounter.setAttribute("role", "status");
    specialElementContainer.appendChild(itemCounter);
  }
  // Only count items that are visible.
  let amount = 0;
  let totalVisibleCost = 0;
  let totalCost = 0;
  let currency = "";
  let soldItems = 0;
  let reservedItems = 0;
  for (let i = 0; i < items.length; i++) {
    if (items[i].style.display !== "none") {
      amount++;
      totalVisibleCost += getPriceOfItem(items[i]);
      if (isItemSold(items[i])) {
        soldItems++;
      }
      if (isItemReserved(items[i])) {
        reservedItems++;
      }
    }
    totalCost += getPriceOfItem(items[i]);
    if (currency === "") {
      currency = getPriceCurrencyOfItem(items[i]);
    }
  }

  console.log(
    amount + " Items " + soldItems + " Sold " + reservedItems + " Reserved"
  );

  const counterText =
    amount +
    "/" +
    items.length +
    " items (sold: " +
    soldItems +
    "; reserved: " +
    reservedItems +
    ")"+
    " | visible cost: " +
    totalVisibleCost.toFixed(2) +
    " " +
    currency +
    " | total cost: " +
    totalCost.toFixed(2) +
    " " +
    currency;
  if (itemCounter.textContent !== counterText) itemCounter.textContent = counterText;
}

// Size and Condition
function getDescriptionOfItem(item) {
  const subtitle = item.querySelector("[data-testid$='--description-subtitle']");
  let description = subtitle?.textContent.trim() ?? item.querySelectorAll(
    "[class*='-item-box__description'] > p"
  )[1]?.textContent.trim() ?? "";

  if (description.includes("·")) {
    description = description.split("·")[0].trim();
  } else if (subtitle) {
    // In the current layout, products without a size only show their condition.
    return "";
  }
  return description;
}

function getTitleOfItem(item) {
  const link = item.querySelector("[data-testid$='--overlay-link']") ?? item.querySelector("a");
  return link?.getAttribute("title") ?? link?.textContent.trim() ?? "";
}

function getPriceOfItem(item) {
  // Read the product price, not the separate fee-inclusive total. The old
  // ItemBoxPricing component is absent from Vinted's current cards.
  const priceElement = item.querySelector("[data-testid$='--price-text']") ??
    item.querySelector("[class*='ItemBoxPricing-']");
  let priceText = priceElement?.textContent;
  if (priceText === undefined || priceText === null) {
    return 0;
  }
  return parseFloat(priceText.replace(/[^0-9.,]/g, "").replace(",", ".")); // remove all non-numeric characters and replace comma with dot
}

function getPriceCurrencyOfItem(item) {
  const priceElement = item.querySelector("[data-testid$='--price-text']") ??
    item.querySelector("[class*='ItemBoxPricing-']");
  let priceText = priceElement?.textContent;
  if (priceText === undefined || priceText === null) {
    return "";
  }
  return priceText.replace(/[0-9.,]/g, "").trim(); // remove all numeric characters and return the rest
}

function isItemSoldOrReserved(item) {
  return isItemSold(item) || isItemReserved(item);
}

function isItemReserved(item) {
  return (
    item.querySelector(".web_ui__Cell__amplified") !== null ||
    item.textContent.includes("Reserviert")
  );
}

// function getHeartElementOfItem(item) { // Heart is identified by the path tag
//   let heart = item.querySelector("path");
//   if (heart === null) {
//     return null;
//   }
//   return heart;
// }

function isItemSold(item) {
  return (
    item.querySelector(".web_ui__Cell__success") !== null ||
    item.textContent.includes("Verkauft")
  );
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

function isItemVisible(item) {
  return item.style.display !== "none";
}

function clearSearch() {
  globalFilters = globalFilters.filter((f) => f.name !== "search"); // remove search filter
  applyFilters(getItems(), globalFilters, hideItem);
  document.getElementById("searchField").value = "";
}

function getMaxPrice() {
  let items = getItems();
  let maxPrice = 0;
  for (let i = 0; i < items.length; i++) {
    let price = getPriceOfItem(items[i]);
    if (price > maxPrice) {
      maxPrice = price;
    }
  }
  return maxPrice;
}

function getMinPrice() {
  let items = getItems();
  let minPrice = Infinity;
  for (let i = 0; i < items.length; i++) {
    let price = getPriceOfItem(items[i]);
    if (price < minPrice) {
      minPrice = price;
    }
  }
  return Number.isFinite(minPrice) ? minPrice : 0;
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
        .toLowerCase()
        .includes(searchTerm.toLowerCase()),
    action: showItem,
  });
  console.log(globalFilters);
  applyFilters(getItems(), globalFilters, hideItem);
}

function hasItemClothingSize(item, size) {
  let description = getDescriptionOfItem(item);
  return description === size;
}

function doesItemTitleContainSimilarSearchTerm(item, searchTerm) {
  const maxDistance = 1;

  let splitTitle = getTitleOfItem(item).toLowerCase().split(" ");

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

  for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
    let item = items[itemIdx];
    showItem(item);
    let accepted = true;

    // if an item meets all exclusive filters, it is exclusively filtered
    // this allows to combine exclusive filters e.g. search and availability
    for (
      let xfilterIdx = 0;
      xfilterIdx < exclusiveFilters.length;
      xfilterIdx++
    ) {
      if (exclusiveFilters[xfilterIdx].condition(item) === false) {
        accepted = false;
        break;
      }
    }

    let orFiltered = false;
    if (accepted) {
      for (let filterIdx = 0; filterIdx < filters.length; filterIdx++) {
        if (filters[filterIdx].condition(item) === true) {
          orFiltered = true;
          filters[filterIdx].action(item);
        }
      }
      if (!orFiltered && filters.length !== 0) {
        action(item);
      }
    } else {
      action(item);
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

function websiteChange(itemsChanged = true) {
  if ((!isFavoriteSite() && !isMemberSite()) || !addSpecialElementContainer()) {
    return false;
  }
  if (!document.getElementById("searchContainer")) addSearchBar();
  if (!document.getElementById("filterContainer")) addFilterContainer();

  if (itemsChanged || !document.getElementById("sizeContainer")) addSizeFilters();
  if (itemsChanged || !document.getElementById("statusContainer")) addStatusFilters();
  if (itemsChanged || !document.getElementById("priceContainer")) addPriceFilter();
  if (itemsChanged || !document.getElementById("sortContainer")) addSortByPriceButton();
  if (itemsChanged) {
    console.log("Website changed");
    applyFilters(getItems(), globalFilters, hideItem);
  } else {
    updateItemCounter();
  }
  return true;
}

function sortByPrice(sortOrder) {
  let itemcontainer = getItemContainer();
  if (itemcontainer.length === 0) {
    console.log("No item container found, not sorting.");
    return;
  }

  // Read the price once per item and sort the elements themselves, so that
  // items with identical prices keep their own position instead of the first
  // matching element being moved repeatedly.
  let entries = [];
  let items = getItems();
  for (let i = 0; i < items.length; i++) {
    let price = getPriceOfItem(items[i]);
    entries.push({
      element: items[i],
      price: price,
      hasPrice: !isNaN(price),
    });
  }

  entries.sort((a, b) => {
    // Items without a parsable price go to the end instead of being dropped
    if (a.hasPrice !== b.hasPrice) {
      return a.hasPrice ? -1 : 1;
    }
    if (!a.hasPrice) {
      return 0;
    }
    return sortOrder === "lowToHigh" ? a.price - b.price : b.price - a.price;
  });

  console.log("Sorting by price: " + sortOrder);
  console.log(entries.length + " items found");
  console.log("Sorted prices: " + entries.map((e) => e.price));

  let fragment = document.createDocumentFragment();
  for (let i = 0; i < entries.length; i++) {
    fragment.appendChild(entries[i].element);
  }
  itemcontainer[0].appendChild(fragment);

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
