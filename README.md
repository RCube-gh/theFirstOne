# The First One

The First One is a browser extension for checking whether the current page has already been archived.

Instead of opening a lot of archive tabs at once, it aims to show the results in one small popup UI.

## Current Scope

- Scan the current page URL from the extension popup
- Check multiple archive services in one place
- Show whether a preserved copy was found
- Surface a simple "you may be the first one" moment when nothing is found

## Current Services

- Wayback Machine
- archive.is family
- Perma.cc

## Status

This project is still an early prototype.

Right now the focus is:

- building the popup UI
- testing archive lookup behavior
- keeping the first version small before adding more services

## Firefox

To test it in Firefox:

1. Open `about:debugging`
2. Choose `This Firefox`
3. Click `Load Temporary Add-on...`
4. Select [manifest.json](C:\Users\icega\Documents\WorkSpace\theFirstOne\extension\manifest.json)

## Project Structure

- [extension](C:\Users\icega\Documents\WorkSpace\theFirstOne\extension): browser extension files

## Notes

- This repository currently excludes local notes and reference clones from version control
- Archive lookup behavior may differ by service and may need service-specific adjustments over time
