# Alma Letter Editor Plus

This tool adds powerful editing features to Ex Libris Alma’s Letter Editor, including:

- A modern XSL editor with syntax highlighting
- One-click preview updates
- Detachable preview window for easier testing
- Visual Condition Builder using the XML structure of the letter

---

## Who is this for?

This script is designed for **library staff and Alma administrators** who require a more efficient way to manage Alma letter customizations.

> ⚠️ You must already have permission to use the Alma Letters Editor to use this tool.

A ChatGPT model has been created to also assist with Letter editing that is separate from this repo, but could still be useful: https://chatgpt.com/g/g-6841acfe24b081918431d9fd494de367-pascal-alma-letters-assistant

---

## What do I need to install?

Before using the tool, you need to install **Tampermonkey**, a browser extension that allows this tool to run in your browser.

### Step 1: Install Tampermonkey

Install Tampermonkey by clicking one of the links below:

- [Chrome / Edge](https://www.tampermonkey.net/?ext=dhdg&browser=chrome)
- [Firefox](https://www.tampermonkey.net/?ext=dhdg&browser=firefox)
- [Safari](https://www.tampermonkey.net/?ext=dhdg&browser=safari)

---

## Step 2: Install the Alma Letter Toolbelt Script

Once Tampermonkey is installed:

1. Click this link to install the script:  
   **[Install Script](https://github.com/PASCAL-SC/alma-letter-editor-plus/raw/refs/heads/main/alma-letter-toolbelt.user.js)**

2. Tampermonkey will prompt you to confirm the install. Click **Install**.

3. Open or refresh the Alma Letters Editor in your browser.

---

## How to Use It

- Open the **Alma Letters Editor**
- After a few seconds, the editor will change to a new editor that allows better coding control
- Look for the new toolbar with:
  - `Update Preview` – apply XSL changes and update the letter preview window.
  - `Detach Preview` – open the letter preview in a separate window and extend code boxes to fill the page. Makes editing easier.
  - `Condition Builder` – Helps with crafting the XSL-specific coding for adding information from the XML to your letter.

 ![Preview of Condition Builder](https://github.com/PASCAL-SC/alma-letter-editor-plus/blob/main/.github/assets/navBar.png)

The script replaces Alma’s old editor with a modern, user-friendly version and adds visual tools to help build advanced logic with ease.

---

## Troubleshooting

If nothing happens:

- Make sure Tampermonkey is installed and **enabled**
- Make sure the script is **installed** and **enabled**
- Refresh the Alma Letters Editor page. Sometimes, due to how Alma loads, Tampermonkey doesn't know that you are on the proper page.

  ![Refresh Page](https://github.com/PASCAL-SC/alma-letter-editor-plus/blob/main/.github/assets/refreshPage.gif)

If the issue continues, [open an issue](https://github.com/PASCAL-SC/alma-letter-editor-plus/issues).

---

## Privacy & Safety

This script:

- Does **not** access personal or private data
- Only runs on Alma's letter editor URLs
- It only adds changes to the letters page that are not permanent and the tampermonkey script can be disabled to show the normal Alma letter editor.

---

## Maintained by

**PASCAL** – Partnership Among South Carolina Academic Libraries  
[https://pascalsc.org](https://pascalsc.org)
