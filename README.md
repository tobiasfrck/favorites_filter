# favorites_filter

You can easily filter your favorites on Vinted by size, availability and search term and sort by price with this browser addon.

## Disclaimer: 
This is an unofficial add-on and is not affiliated with, endorsed by, or sponsored by Vinted. It filters and sorts items already loaded in your browser. Vinted’s terms may restrict the use of third-party tools, and using this add-on may result in account restrictions. Compatibility and continued functionality are not guaranteed.

## Requirements

- Firefox or Chrome

Both browsers are served from the same codebase and the same manifest.

## Features

- Filter by size
- Filter by availability
- Filter by search term
- Filter by price
- Sort by price

## Install

**Firefox:** [Add it to Firefox](https://addons.mozilla.org/de/firefox/addon/filter-favorites/)

**Chrome:** not on the Chrome Web Store due to the registration fee. Download `extension.zip` from the [releases](https://github.com/tobiasfrck/favorites_filter/releases), unpack it, then load the folder via `chrome://extensions` with developer mode enabled.

## Screenshots

![Screenshot of User Interface](Screenshot.png)

## Tests

Run `npm install`, then `npx playwright install chromium firefox` and `npm test`.
The browser tests simulate page rerenders, delayed loading, navigation and slider
interaction locally; no Vinted account is needed.

Set `TEST_BROWSER=firefox` to run the same tests in Firefox. `TEST_BROWSER_PATH`
can point to an existing browser executable (a Playwright build is required for Firefox).

## Code-Disclaimer
The code quality may not be the best as I this is my first browser addon and I just wanted to try some stuff.
